from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Optional

from . import UPLOAD_DIRS


logger = logging.getLogger("ocr_processor")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class MinerUProcessor:
    """使用 MinerU 进行 OCR 的处理器（基础环境直接调用）。"""

    def __init__(self) -> None:
        self.temp_dir = UPLOAD_DIRS["processing"] / "temp_ocr"
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def process_pdf(self, pdf_path: Path) -> Optional[str]:
        try:
            logger.info(f"开始MinerU OCR处理: {pdf_path}")
            if not pdf_path.exists():
                logger.error(f"文件不存在: {pdf_path}")
                return None

            if not self.is_mineru_available():
                logger.warning("MinerU 不可用")
                return None

            output_base_dir = self.temp_dir
            output_base_dir.mkdir(exist_ok=True)

            cmd = ["mineru", "-p", str(pdf_path), "-o", str(output_base_dir)]

            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=300,
                shell=True,  # Windows 环境
            )
            if result.stderr:
                logger.debug(f"mineru stderr: {result.stderr}")

            actual_output_dir = output_base_dir / pdf_path.stem
            markdown_text = self._extract_markdown_content(actual_output_dir)
            if markdown_text:
                logger.info(f"成功提取 markdown，长度: {len(markdown_text)}")
                return markdown_text
            logger.warning("未找到有效 markdown")
            return None

        except subprocess.TimeoutExpired:
            logger.error(f"MinerU 处理超时: {pdf_path}")
            return None
        except subprocess.CalledProcessError as e:
            logger.error(f"MinerU 处理失败: {pdf_path}, 错误: {e.stderr}")
            return None
        except Exception as e:
            logger.error(f"OCR 处理异常: {pdf_path}, 错误: {e}")
            return None

    def _extract_markdown_content(self, output_dir: Path) -> Optional[str]:
        try:
            markdown_files = list(output_dir.glob("**/*.md"))
            if not markdown_files:
                logger.warning(f"未找到 markdown 文件: {output_dir}")
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
        try:
            out_dir = self.temp_dir / pdf_path.stem
            if out_dir.exists():
                import shutil
                shutil.rmtree(out_dir, ignore_errors=True)
        except Exception:
            pass

    def is_mineru_available(self) -> bool:
        try:
            result = subprocess.run(["mineru", "--help"], capture_output=True, text=True, timeout=15, shell=True)
            return result.returncode == 0
        except Exception:
            return False


