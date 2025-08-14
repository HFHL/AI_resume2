from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
import shutil
import time as _time

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from . import UPLOAD_DIRS, build_r2_public_url, build_supabase_public_url
from .db import get_supabase_client
from .ocr import MinerUProcessor
from .parser import parse_resume
from .config import get_app_settings

import mimetypes
import unicodedata
import re
import time as _ts
import uuid as _uuid
from concurrent.futures import ThreadPoolExecutor


logger = logging.getLogger("upload_watcher")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class UploadDirEventHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        super().__init__()
        self.processor = MinerUProcessor()
        # 批处理触发信号：检测到新 PDF 或定时轮询触发
        self.batch_signal = threading.Event()
        # 并发设置
        self.max_workers = max(1, int(os.getenv("WATCHER_CONCURRENCY", "3")))
        self.executor = ThreadPoolExecutor(max_workers=self.max_workers)
        self._in_progress: set[str] = set()
        self._in_progress_lock = threading.Lock()

    @staticmethod
    def _sanitize_name(filename: str) -> tuple[str, str]:
        """将文件名规范化为 ASCII 安全字符，仅保留 a-zA-Z0-9._-，并返回 (base, ext)。"""
        base = Path(filename).stem
        ext = Path(filename).suffix[1:] if Path(filename).suffix else ""
        norm = unicodedata.normalize("NFKD", base)
        ascii_only = norm.encode("ascii", "ignore").decode("ascii", "ignore")
        ascii_only = ascii_only.strip().replace("/", "_").replace("\\", "_").replace(" ", "_")
        safe_base = re.sub(r"[^A-Za-z0-9._-]", "_", ascii_only)
        safe_base = re.sub(r"_+", "_", safe_base).strip("._") or "file"
        safe_base = safe_base[:100]
        ext_ascii = unicodedata.normalize("NFKD", ext).encode("ascii", "ignore").decode("ascii", "ignore")
        safe_ext = re.sub(r"[^A-Za-z0-9]", "", ext_ascii)[:10] or "pdf"
        return safe_base, safe_ext

    @staticmethod
    def _make_unique_object_key(filename: str) -> str:
        base_s, ext_s = UploadDirEventHandler._sanitize_name(filename)
        uniq = f"{int(_ts.time())}_{_uuid.uuid4().hex[:8]}"
        return f"original/{uniq}_{base_s}.{ext_s}"

    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() == ".pdf":
            # 仅发出批处理信号，不做即时处理
            self.batch_signal.set()

    def on_moved(self, event):
        if getattr(event, "is_directory", False):
            return
        path = Path(event.dest_path)
        if path.suffix.lower() == ".pdf":
            self.batch_signal.set()

    def _handle_file(self, path: Path):
        ext = path.suffix.lower()
        if ext not in {".pdf", ".doc", ".docx", ".txt"}:
            return
        # 等待写入完成
        for _ in range(50):  # 最多等待 ~5s
            try:
                size_a = path.stat().st_size
                time.sleep(0.1)
                size_b = path.stat().st_size
                if size_a == size_b:
                    break
            except FileNotFoundError:
                return
        logger.info(f"检测到新文件: {path.name}")

        # 确保 resume_files 存在并标记为处理中（若不存在则创建）
        client = get_supabase_client()
        rf_id: int | None = None
        try:
            rf = client.table("resume_files").select("id").eq("file_name", path.name).limit(1).execute()
            data = getattr(rf, "data", []) or []
            if data:
                rf_id = data[0]["id"]
                client.table("resume_files").update({"status": "处理中"}).eq("id", rf_id).execute()
            else:
                ins = client.table("resume_files").insert({
                    "file_name": path.name,
                    "file_path": "",  # 不写入本地路径，占位空串（非空约束需调整为允许空串）
                    "uploaded_by": "watcher",
                    "status": "处理中",
                }).execute()
                items = getattr(ins, "data", []) or []
                if items:
                    rf_id = items[0]["id"]
            logger.info(f"[watcher] 标记/创建处理中: file={path.name}, rf_id={rf_id}")
        except Exception as e:
            logger.error(f"[watcher] 标记/创建处理中失败: file={path.name}, error={e}")

        # OCR 提取 → 解析 → 上传存储 → 写库
        try:
            # 若上面未成功拿到 rf_id，这里再兜底查一次
            if rf_id is None:
                rf = client.table("resume_files").select("id").eq("file_name", path.name).limit(1).execute()
                data = getattr(rf, "data", [])
                if data:
                    rf_id = data[0]["id"]

            # 1) OCR / 读取
            text_content: str | None = None
            if ext == ".pdf":
                text_content = self.processor.process_pdf(path)
                self.processor.cleanup_temp_files(path)
            else:
                try:
                    text_content = path.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    text_content = None

            if text_content is None:
                try:
                    client.table("resume_files").update({"status": "处理失败"}).eq("file_name", path.name).execute()
                    logger.error(f"[watcher] OCR/读取失败，标记处理失败: file={path.name}")
                except Exception:
                    pass
                return

            # 2) 结构化解析
            logger.info(f"[watcher] 解析完成，准备上传并写入: file={path.name}, resume_file_id={rf_id}")
            parsed = parse_resume(text_content, rf_id, file_name=path.name)
            row = parsed.to_row()

            # 3) 先上传，再写简历

            # 上传到 Supabase Storage（仅当配置了桶名）
            settings = get_app_settings()
            uploaded_url: str | None = None
            if settings.supabase_storage_bucket:
                client_storage = get_supabase_client().storage.from_(settings.supabase_storage_bucket)
                # 对象键：original/<文件名>（若冲突自动加后缀）
                object_key = self._make_unique_object_key(path.name)
                content_type = mimetypes.guess_type(path.name)[0] or ("application/pdf" if ext == ".pdf" else "application/octet-stream")
                try:
                    with open(path, "rb") as fsrc:
                        data = fsrc.read()
                    up = client_storage.upload(object_key, data, {"content-type": content_type, "x-upsert": "false"})
                    if up is False:
                        raise RuntimeError("upload failed")
                    uploaded_url = build_supabase_public_url(object_key, supabase_url=settings.supabase_url, bucket=settings.supabase_storage_bucket)
                    logger.info(f"[watcher] 上传 Supabase Storage 成功: url={uploaded_url}")
                except Exception as ue:
                    logger.error(f"[watcher] 上传 Supabase Storage 失败: file={path.name}, error={ue}")
                    uploaded_url = None
            else:
                logger.warning("[watcher] 未配置 SUPABASE_STORAGE_BUCKET，跳过上传，记录将使用本地归档路径")

            # 本地归档（作为备份，可选）
            target_dir = UPLOAD_DIRS["completed"]
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / path.name
            if target_path.exists():
                base = target_path.stem
                ext = target_path.suffix
                counter = 1
                while (target_dir / f"{base}_{counter}{ext}").exists():
                    counter += 1
                target_path = target_dir / f"{base}_{counter}{ext}"
            try:
                path.replace(target_path)
            except Exception:
                target_path = path

            # 不论上传是否成功，只要解析成功都要写入 resumes。
            # files 表统一记录：status 置为已处理，file_path 写入 URL 或空串。
            update_payload = {"status": "已处理", "file_path": uploaded_url or ""}
            if rf_id is not None and target_path.name != path.name:
                update_payload["file_name"] = target_path.name

            if rf_id is not None:
                client.table("resume_files").update(update_payload).eq("id", rf_id).execute()
            else:
                client.table("resume_files").update(update_payload).eq("file_name", path.name).execute()
            logger.info(f"[watcher] 更新 resume_files 成功: file={path.name}, url={uploaded_url or ''}")

            # 4) 写入 resumes（若已存在则不重复写入）
            try:
                if rf_id is not None:
                    exists = client.table("resumes").select("id").eq("resume_file_id", rf_id).limit(1).execute()
                    if not (getattr(exists, "data", []) or []):
                        client.table("resumes").insert(row).execute()
                        logger.info(f"[watcher] 写入 resumes 成功: file={path.name}")
                else:
                    client.table("resumes").insert(row).execute()
                    logger.info(f"[watcher] 写入 resumes 成功(无rf_id): file={path.name}")
            except Exception as ie:
                logger.error(f"[watcher] 写入 resumes 失败: {path.name}: {ie}")
        except Exception as e:
            logger.error(f"[watcher] 处理失败: file={path.name}, error={e}")
            try:
                client.table("resume_files").update({"status": "处理失败"}).eq("file_name", path.name).execute()
            except Exception:
                pass
        else:
            # 打印剩余待处理 PDF 数量（processing 目录中）
            try:
                processing_dir = UPLOAD_DIRS["processing"]
                remaining = sum(1 for _ in processing_dir.glob("*.pdf"))
                logger.info(f"剩余待处理 PDF: {remaining}")
            except Exception:
                pass

    def run_processing_loop(self) -> None:
        """后台循环：检测 processing 目录是否存在 PDF；逐个调用 _handle_file 处理。"""
        while True:
            self.batch_signal.wait(timeout=3)
            self.batch_signal.clear()
            processing_dir = UPLOAD_DIRS["processing"]
            try:
                pdfs = sorted([p for p in processing_dir.glob("*.pdf") if p.is_file()])
            except Exception:
                pdfs = []
            for p in pdfs:
                name = p.name
                with self._in_progress_lock:
                    if name in self._in_progress:
                        continue
                    self._in_progress.add(name)

                def _worker(path: Path, fname: str) -> None:
                    try:
                        self._handle_file(path)
                    except Exception as e:
                        logger.error(f"[watcher] 处理文件异常: {path}: {e}")
                    finally:
                        with self._in_progress_lock:
                            self._in_progress.discard(fname)

                self.executor.submit(_worker, p, name)

    # 删除批处理逻辑


def start_watcher_in_background() -> Observer:
    """启动目录监听（后台线程）。"""
    handler = UploadDirEventHandler()
    observer = Observer()
    observer.schedule(handler, str(UPLOAD_DIRS["processing"]) , recursive=False)
    observer.daemon = True
    observer.start()
    # 启动批处理后台循环线程
    t = threading.Thread(target=handler.run_processing_loop, daemon=True)
    t.start()
    logger.info(f"已启动目录监听: {UPLOAD_DIRS['processing']}")
    return observer