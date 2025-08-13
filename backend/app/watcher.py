from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
import shutil
import time as _time

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from . import UPLOAD_DIRS, build_r2_public_url
from .db import get_supabase_client
from .ocr import MinerUProcessor
from .parser import parse_resume
from .config import get_app_settings

import boto3
from botocore.client import Config as _BotoConfig
import certifi


logger = logging.getLogger("upload_watcher")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class UploadDirEventHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        super().__init__()
        self.processor = MinerUProcessor()
        # 批处理触发信号：检测到新 PDF 或定时轮询触发
        self.batch_signal = threading.Event()

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

        # 标记数据库：处理中
        client = get_supabase_client()
        try:
            client.table("resume_files").update({"status": "处理中"}).eq("file_name", path.name).execute()
            logger.info(f"[watcher] 标记处理中: file={path.name}")
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
                logger.error(f"[watcher] OCR/读取失败，标记处理失败: file={path.name}")
            except Exception:
                pass
            return

        # 将解析内容落库到 resumes，并更新文件状态与文件归档/上传
        try:
            # 找到对应的 resume_files 记录
            rf = client.table("resume_files").select("id").eq("file_name", path.name).limit(1).execute()
            rf_id = None
            data = getattr(rf, "data", [])
            if data:
                rf_id = data[0]["id"]

            logger.info(f"[watcher] 解析完成，准备写入 resumes 并上传: file={path.name}, resume_file_id={rf_id}")
            # 结构化解析
            parsed = parse_resume(text_content, rf_id, file_name=path.name)
            row = parsed.to_row()
            # 先上传，再写简历：保证失败不入库

            # 上传到 Cloudflare R2（仅当为 PDF 时设置 ContentType）
            settings = get_app_settings()
            r2_bucket = settings.r2_bucket
            uploaded_url: str | None = None
            if settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key and r2_bucket:
                endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
                logger.info(f"[watcher] 初始化 R2 客户端: endpoint={endpoint}, bucket={r2_bucket}")
                s3 = boto3.client(
                    "s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=settings.r2_access_key_id,
                    aws_secret_access_key=settings.r2_secret_access_key,
                    region_name="auto",
                    config=_BotoConfig(
                        signature_version="s3v4",
                        s3={"addressing_style": "path"},
                        retries={"max_attempts": 2, "mode": "standard"},
                        proxies={},  # Disable proxy for R2
                    ),
                )
                # 采用对象键：简历/原始/<文件名>，避免与后续解析产物冲突
                object_key = f"resumes/original/{path.name}"
                # 若同名存在，自动加后缀
                try:
                    s3.head_object(Bucket=r2_bucket, Key=object_key)
                    base = Path(path.name).stem
                    ext = Path(path.name).suffix
                    counter = 1
                    while True:
                        object_key = f"resumes/original/{base}_{counter}{ext}"
                        try:
                            s3.head_object(Bucket=r2_bucket, Key=object_key)
                            counter += 1
                        except Exception:
                            break
                except Exception:
                    pass

                # 执行上传
                with open(path, "rb") as fsrc:
                    s3.upload_fileobj(
                        fsrc,
                        r2_bucket,
                        object_key,
                        ExtraArgs={
                            "ContentType": "application/pdf" if ext == ".pdf" else "application/octet-stream",
                        },
                    )
                uploaded_url = build_r2_public_url(
                    object_key,
                    r2_public_base_url=settings.r2_public_base_url,
                    r2_bucket=r2_bucket,
                    r2_account_id=settings.r2_account_id,
                )
                logger.info(f"[watcher] 上传 R2 成功: url={uploaded_url}")
            else:
                logger.warning("[watcher] 未配置 R2 环境变量，跳过上传，记录将使用本地归档路径")

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

            # 更新文件记录：状态 + 远程 URL（优先）或本地路径；若重命名也同步 file_name
            final_path_value = uploaded_url or str(target_path)
            update_payload = {"status": "已处理", "file_path": final_path_value}
            if rf_id is not None and target_path.name != path.name:
                update_payload["file_name"] = target_path.name

            if rf_id is not None:
                client.table("resume_files").update(update_payload).eq("id", rf_id).execute()
            else:
                client.table("resume_files").update(update_payload).eq("file_name", path.name).execute()
            logger.info(f"[watcher] 更新 resume_files 成功: file={path.name}, url={final_path_value}")

            # 最后写入 resumes（确保文件已可用）
            client.table("resumes").insert(row).execute()
            logger.info(f"[watcher] 写入 resumes 成功: file={path.name}")
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

    def run_batch_loop(self) -> None:
        """后台批处理循环：
        - 每当有信号或超时到期，检查 processing 目录是否存在 PDF；
        - 若存在则调用 on_batch() 批次处理最多 5 个。
        """
        while True:
            # 最长 3 秒轮询一次；有信号则立即处理
            self.batch_signal.wait(timeout=3)
            self.batch_signal.clear()
            processing_dir = UPLOAD_DIRS["processing"]
            try:
                has_pdf = any(processing_dir.glob("*.pdf"))
            except Exception:
                has_pdf = False
            if has_pdf:
                self.on_batch()

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
        for idx, pdf in enumerate(moved_files):
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
                    logger.error(f"[watcher] 批处理OCR失败，标记处理失败: file={pdf.name}")
                    continue

                logger.info(f"[watcher] 批处理解析完成，准备上传并写入: file={pdf.name}, resume_file_id={rf_id}")
                parsed = parse_resume(text_content, rf_id, file_name=pdf.name)
                row = parsed.to_row()

                # 上传到 Cloudflare R2（批处理同样上传）
                settings = get_app_settings()
                r2_bucket = settings.r2_bucket
                uploaded_url: str | None = None
                if settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key and r2_bucket:
                    endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
                    logger.info(f"[watcher] 初始化 R2 客户端(批处理): endpoint={endpoint}, bucket={r2_bucket}")
                    s3 = boto3.client(
                        "s3",
                        endpoint_url=endpoint,
                        aws_access_key_id=settings.r2_access_key_id,
                        aws_secret_access_key=settings.r2_secret_access_key,
                        region_name="auto",
                        config=_BotoConfig(
                            signature_version="s3v4",
                            s3={"addressing_style": "path"},
                            retries={"max_attempts": 2, "mode": "standard"},
                            proxies={},  # Disable proxy for R2
                        ),
                    )
                    object_key = f"resumes/original/{pdf.name}"
                    try:
                        s3.head_object(Bucket=r2_bucket, Key=object_key)
                        base = pdf.stem
                        ext = pdf.suffix
                        counter = 1
                        while True:
                            object_key = f"resumes/original/{base}_{counter}{ext}"
                            try:
                                s3.head_object(Bucket=r2_bucket, Key=object_key)
                                counter += 1
                            except Exception:
                                break
                    except Exception:
                        pass

                    with open(pdf, "rb") as fsrc:
                        s3.upload_fileobj(
                            fsrc,
                            r2_bucket,
                            object_key,
                            ExtraArgs={
                                "ContentType": "application/pdf",
                            },
                        )
                    uploaded_url = build_r2_public_url(
                        object_key,
                        r2_public_base_url=settings.r2_public_base_url,
                        r2_bucket=r2_bucket,
                        r2_account_id=settings.r2_account_id,
                    )

                # 归档到本地（可选）
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

                update_payload = {"status": "已处理", "file_path": uploaded_url or str(target_path)}
                if rf_id is not None and target_path.name != pdf.name:
                    update_payload["file_name"] = target_path.name
                if rf_id is not None:
                    client.table("resume_files").update(update_payload).eq("id", rf_id).execute()
                else:
                    client.table("resume_files").update(update_payload).eq("file_name", pdf.name).execute()
                logger.info(f"[watcher] 批处理更新 resume_files 成功: file={pdf.name}, url={update_payload['file_path']}")

                # 文件可用后再写简历
                client.table("resumes").insert(row).execute()
                logger.info(f"[watcher] 批处理写入 resumes 成功: file={pdf.name}")
            except Exception as e:
                logger.error(f"批次入库失败: {pdf.name}: {e}")
            finally:
                # 批次内进度与全局剩余数量
                try:
                    processing_dir = UPLOAD_DIRS["processing"]
                    remaining_global = sum(1 for _ in processing_dir.glob("*.pdf")) + (len(moved_files) - idx - 1)
                    logger.info(f"剩余待处理 PDF: {remaining_global}")
                except Exception:
                    pass


def start_watcher_in_background() -> Observer:
    """启动目录监听（后台线程）。"""
    handler = UploadDirEventHandler()
    observer = Observer()
    observer.schedule(handler, str(UPLOAD_DIRS["processing"]) , recursive=False)
    observer.daemon = True
    observer.start()
    # 启动批处理后台循环线程
    t = threading.Thread(target=handler.run_batch_loop, daemon=True)
    t.start()
    logger.info(f"已启动目录监听: {UPLOAD_DIRS['processing']}")
    return observer