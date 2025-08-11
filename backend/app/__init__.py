__all__ = []

# 供外部引用的上传目录常量（与 main 中保持一致）
from pathlib import Path as _Path
import os as _os

_PROJECT_ROOT = _Path(_os.getcwd())
_BACKEND_ROOT = _PROJECT_ROOT / "backend"
_UPLOAD_ROOT = _BACKEND_ROOT / "uploads"
UPLOAD_DIRS = {
    "processing": _UPLOAD_ROOT / "processing",
    "completed": _UPLOAD_ROOT / "completed",
    "failed": _UPLOAD_ROOT / "failed",
}

for _d in UPLOAD_DIRS.values():
    _d.mkdir(parents=True, exist_ok=True)