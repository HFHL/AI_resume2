from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
import shutil
import time as _time

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from . import UPLOAD_DIRS
from .db import get_supabase_client
from .ocr import MinerUProcessor
from .parser import parse_resume


logger = logging.getLogger("upload_watcher")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class UploadDirEventHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        super().__init__()
        self.processor = MinerUProcessor()

    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        self._handle_file(path)

    def on_moved(self, event):
        if getattr(event, "is_directory", False):
            return
        path = Path(event.dest_path)
        self._handle_file(path)

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

        # 标记数据库：处理中
        client = get_supabase_client()
        try:
            client.table("resume_files").update({"status": "处理中"}).eq("file_name", path.name).execute()
        except Exception:
            pass

        # 仅处理 PDF 进行 OCR，其它类型暂时跳过或后续扩展
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
            except Exception:
                pass
            return

        # 将解析内容落库到 resumes，并更新文件状态与文件归档
        try:
            # 找到对应的 resume_files 记录
            rf = client.table("resume_files").select("id").eq("file_name", path.name).limit(1).execute()
            rf_id = None
            data = getattr(rf, "data", [])
            if data:
                rf_id = data[0]["id"]

            # 结构化解析
            parsed = parse_resume(text_content, rf_id, file_name=path.name)
            row = parsed.to_row()
            client.table("resumes").insert(row).execute()

            # 移动文件到 completed 目录
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
                # 若移动失败，不影响入库，但仍更新状态
                target_path = path

            # 更新文件记录：状态 + 路径（若重命名也同步 file_name）
            update_payload = {
                "status": "已处理",
                "file_path": str(target_path),
            }
            if rf_id is not None and target_path.name != path.name:
                update_payload["file_name"] = target_path.name

            if rf_id is not None:
                client.table("resume_files").update(update_payload).eq("id", rf_id).execute()
            else:
                client.table("resume_files").update(update_payload).eq("file_name", path.name).execute()
        except Exception as e:
            logger.error(f"写入解析结果失败: {e}")
            try:
                client.table("resume_files").update({"status": "处理失败"}).eq("file_name", path.name).execute()
            except Exception:
                pass

    def on_batch(self):
        """按批次处理：
        - 从 processing 取最多 5 个 PDF，移动到 batches/batch_<timestamp>/ 目录；
        - 以该目录为输入根，调用 MinerUProcessor.process_batch() 一次性处理；
        - 对批次结果逐个入库，并将源文件归档到 completed。
        """
        processing_dir = UPLOAD_DIRS["processing"]
        batch_root = UPLOAD_DIRS["batches"]
        batch_root.mkdir(parents=True, exist_ok=True)

        pdfs = sorted([p for p in processing_dir.glob("*.pdf") if p.is_file()])[:5]
        if not pdfs:
            return
        batch_dir = batch_root / f"batch_{int(_time.time())}"
        batch_dir.mkdir(parents=True, exist_ok=True)

        moved_files: list[Path] = []
        for p in pdfs:
            target = batch_dir / p.name
            try:
                shutil.move(str(p), str(target))
                moved_files.append(target)
            except Exception as e:
                logger.error(f"批次移动失败: {p} -> {target}: {e}")

        # 批次运行 mineru
        results = self.processor.process_batch(batch_dir)

        client = get_supabase_client()
        for pdf in moved_files:
            text_content = results.get(pdf)
            # 入库（与 _handle_file 中一致）
            try:
                rf = client.table("resume_files").select("id").eq("file_name", pdf.name).limit(1).execute()
                rf_id = None
                data = getattr(rf, "data", [])
                if data:
                    rf_id = data[0]["id"]

                if text_content is None:
                    client.table("resume_files").update({"status": "处理失败"}).eq("file_name", pdf.name).execute()
                    continue

                parsed = parse_resume(text_content, rf_id, file_name=pdf.name)
                row = parsed.to_row()
                client.table("resumes").insert(row).execute()

                # 归档
                target_dir = UPLOAD_DIRS["completed"]
                target_dir.mkdir(parents=True, exist_ok=True)
                target_path = target_dir / pdf.name
                if target_path.exists():
                    base = target_path.stem
                    ext = target_path.suffix
                    counter = 1
                    while (target_dir / f"{base}_{counter}{ext}").exists():
                        counter += 1
                    target_path = target_dir / f"{base}_{counter}{ext}"
                try:
                    pdf.replace(target_path)
                except Exception:
                    target_path = pdf

                update_payload = {"status": "已处理", "file_path": str(target_path)}
                if rf_id is not None and target_path.name != pdf.name:
                    update_payload["file_name"] = target_path.name
                if rf_id is not None:
                    client.table("resume_files").update(update_payload).eq("id", rf_id).execute()
                else:
                    client.table("resume_files").update(update_payload).eq("file_name", pdf.name).execute()
            except Exception as e:
                logger.error(f"批次入库失败: {pdf.name}: {e}")


def start_watcher_in_background() -> Observer:
    """启动目录监听（后台线程）。"""
    handler = UploadDirEventHandler()
    observer = Observer()
    observer.schedule(handler, str(UPLOAD_DIRS["processing"]) , recursive=False)
    observer.daemon = True
    observer.start()
    logger.info(f"已启动目录监听: {UPLOAD_DIRS['processing']}")
    return observer