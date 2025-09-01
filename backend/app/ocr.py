from __future__ import annotations

import logging
import subprocess
from pathlib import Path
import os
from typing import Optional

from . import UPLOAD_DIRS


logger = logging.getLogger("ocr_processor")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class MinerUProcessor:
    """使用 MinerU 进行 OCR 的处理器（基础环境直接调用）。"""

    def __init__(self) -> None:
        # 永久输出目录
        self.output_root = UPLOAD_DIRS["ocr_output"]
        self.output_root.mkdir(parents=True, exist_ok=True)

    def process_pdf(self, pdf_path: Path) -> Optional[str]:
        try:
            logger.info(f"开始MinerU OCR处理: {pdf_path}")
            if not pdf_path.exists():
                logger.error(f"文件不存在: {pdf_path}")
                return None

            if not self.is_mineru_available():
                logger.warning("MinerU 不可用")
                return None

            output_base_dir = self.output_root
            output_base_dir.mkdir(exist_ok=True)

            backend = os.getenv("MINERU_BACKEND", "pipeline").strip()
            initial_device = os.getenv("MINERU_DEVICE", "cuda:0").strip()
            devices_to_try: list[str] = [initial_device]
            if initial_device.lower().startswith("cuda"):
                devices_to_try.append("cpu")

            # 方法尝试顺序：auto(省略 -m) → txt → ocr（仅 pipeline 有效）
            methods_to_try: list[Optional[str]] = [None, "txt", "ocr"]

            env_base = os.environ.copy()
            if "MINERU_VIRTUAL_VRAM_SIZE" not in env_base:
                env_base["MINERU_VIRTUAL_VRAM_SIZE"] = "8"

            for device in devices_to_try:
                for method in methods_to_try:
                    cmd = [
                        "mineru",
                        "-p", str(pdf_path),
                        "-o", str(output_base_dir),
                        "-d", device,
                        "-b", backend,
                    ]
                    if method:
                        cmd.extend(["-m", method])

                    env_vars = env_base.copy()
                    env_vars["MINERU_DEVICE"] = device

                    # 打印将要执行的命令与关键环境变量
                    try:
                        logger.info(
                            "mineru 命令: %s | MINERU_DEVICE=%s MINERU_BACKEND=%s MINERU_VIRTUAL_VRAM_SIZE=%s",
                            " ".join(cmd),
                            env_vars.get("MINERU_DEVICE", ""),
                            backend,
                            env_vars.get("MINERU_VIRTUAL_VRAM_SIZE", ""),
                        )
                    except Exception:
                        pass

                    try:
                        result = subprocess.run(
                            cmd,
                            check=True,
                            capture_output=True,
                            text=True,
                            timeout=300,
                            shell=False,
                            env=env_vars,
                        )
                        try:
                            if result.stdout:
                                logger.info("mineru stdout:\n%s", result.stdout[:4000])
                            if result.stderr:
                                logger.info("mineru stderr:\n%s", result.stderr[:4000])
                        except Exception:
                            pass

                        actual_output_dir = output_base_dir / pdf_path.stem
                        markdown_text = self._extract_markdown_content(actual_output_dir)
                        if markdown_text:
                            logger.info(f"成功提取 markdown，长度: {len(markdown_text)}")
                            return markdown_text
                        else:
                            logger.warning(
                                "未找到有效 markdown，准备回退重试: device=%s, method=%s",
                                device,
                                method or "auto",
                            )
                    except subprocess.TimeoutExpired:
                        logger.error(
                            "MinerU 处理超时，准备回退重试: file=%s, device=%s, method=%s",
                            pdf_path,
                            device,
                            method or "auto",
                        )
                    except subprocess.CalledProcessError as e:
                        logger.error(
                            "MinerU 处理失败，准备回退重试: file=%s, device=%s, method=%s, 错误=%s",
                            pdf_path,
                            device,
                            method or "auto",
                            (e.stderr or "").strip()[:1000],
                        )
                    except Exception as e:
                        logger.error(
                            "OCR 处理异常，准备回退重试: file=%s, device=%s, method=%s, 错误=%s",
                            pdf_path,
                            device,
                            method or "auto",
                            e,
                        )

            logger.error("所有 MinerU 回退策略均失败: %s", pdf_path)
            # 终极兜底：尝试纯文本提取（适用于可复制文本的 PDF）
            fallback_text = self._fallback_extract_text(pdf_path)
            if fallback_text and fallback_text.strip():
                logger.warning("使用纯文本提取作为兜底，长度: %d", len(fallback_text))
                return fallback_text
            return None

        except Exception as e:
            logger.error(f"OCR 处理异常: {pdf_path}, 错误: {e}")
            return None

    def _fallback_extract_text(self, pdf_path: Path) -> Optional[str]:
        """当 MinerU 失败时，尝试直接从 PDF 提取纯文本。
        优先使用 PyMuPDF，其次尝试 pdfminer.six（如果安装）。
        """
        # 1) PyMuPDF（fitz）
        try:
            import fitz  # type: ignore

            parts: list[str] = []
            with fitz.open(pdf_path) as doc:  # type: ignore
                for page in doc:  # type: ignore
                    try:
                        parts.append(page.get_text("text"))  # type: ignore
                    except Exception:
                        continue
            text = "\n".join(p.strip() for p in parts if p and p.strip())
            if text:
                return text
        except Exception:
            pass

        # 2) pdfminer.six
        try:
            from io import StringIO
            from pdfminer.high_level import extract_text_to_fp  # type: ignore

            output = StringIO()
            with open(pdf_path, "rb") as fsrc:
                extract_text_to_fp(fsrc, output, laparams=None, output_type="text", codec=None)  # type: ignore
            text2 = output.getvalue()
            if text2:
                return text2
        except Exception:
            pass

        return None

    def _extract_markdown_content(self, output_dir: Path) -> Optional[str]:
        try:
            markdown_files = list(output_dir.glob("**/*.md")) or list(output_dir.glob("**/*.txt"))
            if not markdown_files:
                logger.warning(f"未找到 markdown/txt 文件: {output_dir}")
                return None
            parts: list[str] = []
            for md in markdown_files:
                try:
                    text = md.read_text(encoding="utf-8", errors="ignore")
                    if text.strip():
                        parts.append(text)
                except Exception as e:
                    logger.warning(f"读取 markdown 失败 {md}: {e}")
            return "\n\n".join(parts) if parts else None
        except Exception as e:
            logger.error(f"提取 markdown 失败: {e}")
            return None

    # 不再提供回退提取，记录日志后返回 None 即可（上层会标记处理失败）

    def cleanup_temp_files(self, pdf_path: Path) -> None:
        # 永久保留输出
        return None

    def is_mineru_available(self) -> bool:
        try:
            result = subprocess.run(["mineru", "--help"], capture_output=True, text=True, timeout=15, shell=False)
            if result.returncode != 0:
                # 回退使用 python -m 方式再试
                try:
                    result2 = subprocess.run(["python", "-m", "mineru", "--help"], capture_output=True, text=True, timeout=15, shell=False)
                    return result2.returncode == 0
                except Exception:
                    return False
            return result.returncode == 0
        except Exception:
            return False

    def process_batch(self, batch_dir: Path) -> dict[Path, Optional[str]]:
        """对批次目录运行 MinerU，一次性处理目录内所有 PDF。
        返回：{pdf_path: content or None}
        """
        try:
            if not batch_dir.exists():
                logger.error(f"批次目录不存在: {batch_dir}")
                return {}

            output_base_dir = self.output_root
            output_base_dir.mkdir(exist_ok=True)

            device = os.getenv("MINERU_DEVICE", "cuda:0").strip()
            backend = os.getenv("MINERU_BACKEND", "pipeline")
            cmd = [
                "mineru",
                "-p", str(batch_dir),
                "-o", str(output_base_dir),
                "-d", device,
                "-b", backend,
            ]

            env_vars = os.environ.copy()
            env_vars["MINERU_DEVICE"] = device
            if "MINERU_VIRTUAL_VRAM_SIZE" not in env_vars:
                env_vars["MINERU_VIRTUAL_VRAM_SIZE"] = "8"

            # 打印批处理命令
            try:
                logger.info(
                    "mineru 批处理命令: %s | MINERU_DEVICE=%s MINERU_BACKEND=%s",
                    " ".join(cmd),
                    env_vars.get("MINERU_DEVICE", ""),
                    backend,
                )
            except Exception:
                pass
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=600,
                shell=False,
                env=env_vars,
            )
            try:
                if result.stdout:
                    logger.info("mineru batch stdout:\n%s", result.stdout[:4000])
                if result.stderr:
                    logger.info("mineru batch stderr:\n%s", result.stderr[:4000])
            except Exception:
                pass
            if result.stderr:
                logger.debug(f"mineru batch stderr: {result.stderr}")

            outputs: dict[Path, Optional[str]] = {}
            for pdf in batch_dir.glob("*.pdf"):
                out_dir = output_base_dir / pdf.stem
                outputs[pdf] = self._extract_markdown_content(out_dir)
            return outputs
        except subprocess.TimeoutExpired:
            logger.error(f"MinerU 批次处理超时: {batch_dir}")
            return {}
        except subprocess.CalledProcessError as e:
            logger.error(f"MinerU 批次处理失败: {batch_dir}, 错误: {e.stderr}")
            return {}
        except Exception as e:
            logger.error(f"批次 OCR 处理异常: {batch_dir}, 错误: {e}")
            return {}


