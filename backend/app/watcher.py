from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
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
from .config import get_app_settings
from datetime import datetime, timezone

import mimetypes
import unicodedata
import re
import time as _ts
import uuid as _uuid
 


logger = logging.getLogger("upload_watcher")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class UploadDirEventHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        super().__init__()
        self.processor = MinerUProcessor()
        # 批处理触发信号：检测到新 PDF 或定时轮询触发
        self.batch_signal = threading.Event()
        # 并发控制：最多 N 个并行处理（默认 3，可通过 WATCHER_WORKERS 配置）
        try:
            self._max_workers = max(1, int(os.getenv("WATCHER_WORKERS", "3")))
        except Exception:
            self._max_workers = 3
        self._executor = ThreadPoolExecutor(max_workers=self._max_workers, thread_name_prefix="watcher-worker")
        self._in_progress: set[str] = set()
        self._in_progress_lock = threading.Lock()

    @staticmethod
    def _normalize_download_name(filename: str) -> str:
        """规范下载下来的文件名，处理多余空格/重复后缀/非法字符等。
        - 去除首尾空白与尾随点
        - 折叠连续空白为单空格
        - 移除 Windows 不允许字符
        - 合并尾部重复的 .pdf（含空格变体）为一个 .pdf
        """
        name = (filename or "").strip()
        # 折叠空白
        name = re.sub(r"\s+", " ", name)
        # 去掉尾随空格与点
        name = name.rstrip(" .")
        # 移除非法字符
        name = re.sub(r"[\\/:*?\"<>|]", "_", name)
        # 合并重复 pdf 后缀（支持中间有空格的变体）
        name = re.sub(r"(?i)\s*(?:\.pdf\s*)+$", ".pdf", name)
        # 避免空文件名
        return name or "file.pdf"

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

        # 文件名规范化：如含多余空格/非法字符/重复后缀，先本地重命名再处理
        original_name = path.name
        normalized_name = self._normalize_download_name(original_name)
        renamed = False
        if normalized_name != original_name:
            target_dir = path.parent
            new_path = target_dir / normalized_name
            if new_path.exists():
                base = new_path.stem
                extn = new_path.suffix
                counter = 1
                while (target_dir / f"{base}_{counter}{extn}").exists():
                    counter += 1
                new_path = target_dir / f"{base}_{counter}{extn}"
            try:
                path = path.replace(new_path)
                renamed = True
                logger.info(f"[watcher] 已重命名文件: '{original_name}' -> '{path.name}'")
            except Exception as re:
                logger.warning(f"[watcher] 重命名失败，继续使用原名: {original_name}, error={re}")

        # 处理文件：若数据库中不存在对应记录，则自动创建一条 resume_files
        client = get_supabase_client()
        rf_id: int | None = None
        try:
            # 优先用原始名查找（如果发生过重命名），否则用当前名
            lookup_name = original_name if renamed else path.name
            rf = client.table("resume_files").select("id").eq("file_name", lookup_name).limit(1).execute()
            data = getattr(rf, "data", []) or []
            if data:
                rf_id = data[0]["id"]
                client.table("resume_files").update({"status": "处理中"}).eq("id", rf_id).execute()
                # 若已重命名本地文件，则同步更新数据库中的文件名
                if renamed and path.name != lookup_name:
                    try:
                        client.table("resume_files").update({"file_name": path.name}).eq("id", rf_id).execute()
                        logger.info(f"[watcher] 同步更新数据库文件名: rf_id={rf_id}, file_name={path.name}")
                    except Exception:
                        pass
            else:
                # 若按原始名没找到且发生过重命名，退而按新名再查一次
                if renamed:
                    rf2 = client.table("resume_files").select("id").eq("file_name", path.name).limit(1).execute()
                    data2 = getattr(rf2, "data", []) or []
                    if data2:
                        rf_id = data2[0]["id"]
                        client.table("resume_files").update({"status": "处理中"}).eq("id", rf_id).execute()
                    else:
                        # 自动创建一条记录
                        created = client.table("resume_files").insert({
                            "file_name": path.name,
                            "uploaded_by": "watcher",
                            "status": "处理中",
                            "parse_status": "pending",
                            "file_path": ""
                        }).execute()
                        rows = getattr(created, "data", []) or []
                        if rows:
                            rf_id = rows[0]["id"]
                            logger.info(f"[watcher] 自动创建 resume_files 记录: rf_id={rf_id}, file_name={path.name}")
                        else:
                            logger.warning(f"[watcher] 自动创建 resume_files 失败: {path.name}")
                            return
                else:
                    # 自动创建一条记录
                    created = client.table("resume_files").insert({
                        "file_name": path.name,
                        "uploaded_by": "watcher",
                        "status": "处理中",
                        "parse_status": "pending",
                        "file_path": ""
                    }).execute()
                    rows = getattr(created, "data", []) or []
                    if rows:
                        rf_id = rows[0]["id"]
                        logger.info(f"[watcher] 自动创建 resume_files 记录: rf_id={rf_id}, file_name={path.name}")
                    else:
                        logger.warning(f"[watcher] 自动创建 resume_files 失败: {path.name}")
                        return
            logger.info(f"[watcher] 标记处理中: file={path.name}, rf_id={rf_id}")
        except Exception as e:
            logger.error(f"[watcher] 标记/创建处理中失败: file={path.name}, error={e}")

        # OCR 提取 → 写入 OCR 原文到 resume_files（不做 LLM 解析） → 上传存储/归档
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

            # 2) 写入 OCR 原文到 resume_files
            logger.info(f"[watcher] OCR 完成，写入 resume_files.ocr_md: file={path.name}, resume_file_id={rf_id}")
            def _detect_lang(s: str) -> str:
                try:
                    letters = sum(1 for ch in s if ('A' <= ch <= 'Z') or ('a' <= ch <= 'z'))
                    total = len([ch for ch in s if ch.strip()])
                    if total > 0 and (letters / total) > 0.6:
                        return 'en'
                except Exception:
                    pass
                return 'zh'

            now_iso = datetime.now(timezone.utc).isoformat()
            update_ocr = {
                "ocr_md": text_content,
                "ocr_lang": _detect_lang(text_content or ""),
                "ocr_engine": "mineru",
                "ocr_at": now_iso,
                "parse_status": "ocr_done",
            }
            try:
                if rf_id is not None:
                    client.table("resume_files").update(update_ocr).eq("id", rf_id).execute()
                else:
                    client.table("resume_files").update(update_ocr).eq("file_name", path.name).execute()
                logger.info(f"[watcher] 已写入 OCR 原文并标记 ocr_done: file={path.name}")
            except Exception as ue:
                logger.error(f"[watcher] 写入 OCR 原文失败: file={path.name}: {ue}")

            # 3) 上传/归档文件（与解析解耦，保留原逻辑方便追溯）

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

            # files 表统一记录：status 置为已处理，file_path 写入 URL 或空串。
            update_payload = {"status": "已处理", "file_path": uploaded_url or ""}
            if rf_id is not None and target_path.name != path.name:
                update_payload["file_name"] = target_path.name

            if rf_id is not None:
                client.table("resume_files").update(update_payload).eq("id", rf_id).execute()
            else:
                client.table("resume_files").update(update_payload).eq("file_name", path.name).execute()
            logger.info(f"[watcher] 更新 resume_files 成功: file={path.name}, url={uploaded_url or ''}")
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

                # 提交到线程池，由最多 self._max_workers 个并行处理
                try:
                    self._executor.submit(_worker, p, name)
                except Exception as se:
                    logger.error(f"[watcher] 任务提交失败: {p}: {se}")
                    # 若提交失败，立即释放占位，避免卡死
                    with self._in_progress_lock:
                        self._in_progress.discard(name)

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
                    new_fname = UploadDirEventHandler._normalize_download_name(fname)
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
                    target_path = processing_dir / new_fname
                    if target_path.exists():
                        base = target_path.stem
                        ext = target_path.suffix
                        counter = 1
                        while (processing_dir / f"{base}_{counter}{ext}").exists():
                            counter += 1
                        target_path = processing_dir / f"{base}_{counter}{ext}"

                    # 下载文件到 processing 目录（单次尝试，无退避重试）
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
                        # 如文件名被规范化/去重，则写回数据库保持一致
                        try:
                            if new_fname != fname or target_path.name != fname:
                                client.table("resume_files").update({
                                    "file_name": target_path.name
                                }).eq("id", rid).execute()
                        except Exception:
                            pass
                        # 放到目录后，目录监听/扫描会自动处理。先置为 处理中。
                        try:
                            client.table("resume_files").update({"status": "处理中"}).eq("id", rid).execute()
                        except Exception:
                            pass
                        # 触发处理循环，尽快消费新下载的文件
                        handler.batch_signal.set()
                        # 触发批处理信号，尽快扫描
                        handler.batch_signal.set()
                    except Exception as de:
                        logger.error(f"[pull] 下载失败: id={rid}, url={url}, error={de}")
                        try:
                            client.table("resume_files").update({"status": "未处理"}).eq("id", rid).execute()
                        except Exception:
                            pass
                _time.sleep(0.5)
            except Exception as e:
                logger.error(f"[pull] 拉取循环异常: {e}")
                _time.sleep(poll_interval)

    tp = threading.Thread(target=_pull_loop, daemon=True)
    tp.start()
    
    return observer