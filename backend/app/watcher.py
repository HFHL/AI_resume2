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
import httpx
import certifi

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

        # 仅处理来源于数据库/远程拉取的文件：要求 resume_files 已存在
        client = get_supabase_client()
        rf_id: int | None = None
        try:
            rf = client.table("resume_files").select("id").eq("file_name", path.name).limit(1).execute()
            data = getattr(rf, "data", []) or []
            if data:
                rf_id = data[0]["id"]
                client.table("resume_files").update({"status": "处理中"}).eq("id", rf_id).execute()
            else:
                logger.warning(f"[watcher] 跳过本地孤立文件（无对应 resume_files 记录）: {path.name}")
                return
            logger.info(f"[watcher] 标记处理中: file={path.name}, rf_id={rf_id}")
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
                # 支持多种后缀：pdf/doc/docx/txt
                candidates = []
                for pattern in ("*.pdf", "*.doc", "*.docx", "*.txt"):
                    candidates.extend([p for p in processing_dir.glob(pattern) if p.is_file()])
                pdfs = sorted(candidates)
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
    
    # 启动周期拉取任务：从数据库查询 status='未处理' 的记录并下载到 processing
    def _pull_loop() -> None:
        poll_interval = max(3, int(os.getenv("PULL_UNPROCESSED_INTERVAL", "10")))
        client = get_supabase_client()
        processing_dir = UPLOAD_DIRS["processing"]
        processing_dir.mkdir(parents=True, exist_ok=True)
        # HTTP 客户端：禁用 HTTP/2，关闭 keep-alive，允许重定向，设置 UA
        http_limits = httpx.Limits(max_keepalive_connections=0, max_connections=10)
        http_client = httpx.Client(
            timeout=30.0,
            follow_redirects=True,
            http2=False,
            verify=certifi.where(),
            limits=http_limits,
            headers={"User-Agent": "AIResumeFetcher/1.0"},
        )
        while True:
            try:
                # 拉取一批待处理（未处理）的记录
                # 允许多来源写入的不同初始状态：未处理/已上传/待处理
                res = (
                    client
                    .table("resume_files")
                    .select("id,file_name,file_path,status")
                    .in_("status", ["未处理", "已上传", "待处理"])  # 统一当作待拉取
                    .order("id")
                    .limit(20)
                    .execute()
                )
                items = getattr(res, "data", []) or []
                if not items:
                    _time.sleep(poll_interval)
                    continue
                for item in items:
                    rid = item.get("id")
                    fname = (item.get("file_name") or "").strip()
                    url = (item.get("file_path") or "").strip()
                    if not rid or not fname or not url:
                        continue
                    # 抢占：将状态 从(未处理/已上传/待处理) -> 拉取中，避免重复并发拉取
                    try:
                        upd = (
                            client
                            .table("resume_files")
                            .update({"status": "拉取中"})
                            .eq("id", rid)
                            .in_("status", ["未处理", "已上传", "待处理"]) 
                            .execute()
                        )
                        updated_rows = getattr(upd, "data", []) or []
                        if not updated_rows:
                            continue  # 未能抢到
                    except Exception:
                        continue

                    # 计算保存路径，若重名则追加后缀
                    target_path = processing_dir / fname
                    if target_path.exists():
                        base = target_path.stem
                        ext = target_path.suffix
                        counter = 1
                        while (processing_dir / f"{base}_{counter}{ext}").exists():
                            counter += 1
                        target_path = processing_dir / f"{base}_{counter}{ext}"

                    # 下载文件到 processing 目录（带重试与退避）
                    max_attempts = max(1, int(os.getenv("PULL_DOWNLOAD_RETRIES", "3")))
                    attempt = 0
                    while True:
                        attempt += 1
                        try:
                            with http_client.stream("GET", url) as resp:
                                status = resp.status_code
                                if status >= 400:
                                    raise httpx.HTTPStatusError(
                                        f"bad status: {status}", request=resp.request, response=resp
                                    )
                                with open(target_path, "wb") as f:
                                    for chunk in resp.iter_bytes(65536):
                                        if chunk:
                                            f.write(chunk)
                            logger.info(f"[pull] 下载成功: id={rid}, file={target_path.name}")
                            # 放到目录后，目录监听/扫描会自动处理。先置为 处理中。
                            try:
                                client.table("resume_files").update({"status": "处理中"}).eq("id", rid).execute()
                            except Exception:
                                pass
                            # 触发处理循环，尽快消费新下载的文件
                            handler.batch_signal.set()
                            # 触发批处理信号，尽快扫描
                            handler.batch_signal.set()
                            break
                        except Exception as de:
                            if attempt >= max_attempts:
                                logger.error(f"[pull] 下载失败: id={rid}, url={url}, error={de}")
                                try:
                                    client.table("resume_files").update({"status": "未处理"}).eq("id", rid).execute()
                                except Exception:
                                    pass
                                break
                            # 指数退避
                            backoff = min(20.0, 1.5 * attempt)
                            logger.warning(f"[pull] 下载失败，退避重试({attempt}/{max_attempts})，等待 {backoff:.1f}s: id={rid}, url={url}")
                            _time.sleep(backoff)
                _time.sleep(0.5)
            except Exception as e:
                logger.error(f"[pull] 拉取循环异常: {e}")
                _time.sleep(poll_interval)

    tp = threading.Thread(target=_pull_loop, daemon=True)
    tp.start()
    
    return observer