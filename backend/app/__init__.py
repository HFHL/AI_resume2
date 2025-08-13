__all__ = []

# 供外部引用的上传目录常量（与 main 中保持一致）
from pathlib import Path as _Path
import os as _os
from typing import Optional as _Optional

_PROJECT_ROOT = _Path(_os.getcwd())
_BACKEND_ROOT = _PROJECT_ROOT / "backend"
_UPLOAD_ROOT = _BACKEND_ROOT / "uploads"
UPLOAD_DIRS = {
    "processing": _UPLOAD_ROOT / "processing",
    # 本地归档目录仍保留，可作为失败回退/本地缓存
    "completed": _UPLOAD_ROOT / "completed",
    "failed": _UPLOAD_ROOT / "failed",
    "batches": _UPLOAD_ROOT / "batches",           # 每批处理的工作目录（输入目录，持久化）
    "ocr_output": _UPLOAD_ROOT / "ocr_output",     # MinerU 输出目录（持久化）
}

for _d in UPLOAD_DIRS.values():
    _d.mkdir(parents=True, exist_ok=True)


def build_r2_public_url(object_key: str, *,
                        r2_public_base_url: _Optional[str],
                        r2_bucket: _Optional[str],
                        r2_account_id: _Optional[str]) -> str:
    """根据配置生成可公开访问的 R2 对象 URL。
    优先使用 r2_public_base_url（r2.dev 或自定义域名），否则回退为 cloudflarestorage.com 虚拟主机样式。
    """
    object_key = object_key.lstrip("/")
    if r2_public_base_url:
        base = r2_public_base_url.rstrip("/")
        return f"{base}/{object_key}"
    # 回退： https://<bucket>.<accountid>.r2.cloudflarestorage.com/<object_key>
    if not (r2_bucket and r2_account_id):
        # 最差回退，本地路径风格（避免报错）；上层应避免这种情况
        return object_key
    return f"https://{r2_bucket}.{r2_account_id}.r2.cloudflarestorage.com/{object_key}"