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

            # 设备选择（默认使用 CUDA，可通过环境变量 MINERU_DEVICE 指定：如 'cuda', 'cuda:0', 'cpu'）
            device = os.getenv("MINERU_DEVICE", "cuda:0").strip()
            cmd = [
                "mineru",
                "-p", str(pdf_path),
                "-o", str(output_base_dir),
                "-d", device,
                "-b", os.getenv("MINERU_BACKEND", "pipeline"),
            ]

            # 传入环境变量，确保 mineru 能读到 MINERU_DEVICE 等
            env_vars = os.environ.copy()
            env_vars["MINERU_DEVICE"] = device
            # 设置虚拟显存大小，避免自动检测失败
            if "MINERU_VIRTUAL_VRAM_SIZE" not in env_vars:
                env_vars["MINERU_VIRTUAL_VRAM_SIZE"] = "8"
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=300,
                shell=True,  # Windows 环境
                env=env_vars,
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
            result = subprocess.run(["mineru", "--help"], capture_output=True, text=True, timeout=15, shell=True)
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

            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=600,
                shell=True,
                env=env_vars,
            )
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


