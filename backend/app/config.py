import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

# 尝试从项目根目录或 backend 目录加载 .env
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"), override=False)
load_dotenv(dotenv_path=os.path.join(os.getcwd(), "backend", ".env"), override=False)
load_dotenv(dotenv_path=os.path.join(os.getcwd(), "backend", ".env.local"), override=False)


@dataclass(frozen=True)
class AppSettings:
    supabase_url: str
    supabase_key: str
    port: int = 8000
    # Supabase Storage 配置
    supabase_storage_bucket: Optional[str] = None
    # Cloudflare R2 (S3 兼容) 配置（可选）
    r2_account_id: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_bucket: Optional[str] = None
    # 公共访问基础 URL（例如 r2.dev 或自定义域名），用于拼接可访问链接
    # 若未设置，则回退为 S3 虚拟主机 URL：https://<bucket>.<account>.r2.cloudflarestorage.com/
    r2_public_base_url: Optional[str] = None


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value == "":
        raise RuntimeError(
            f"缺少环境变量 {name}。请在项目根目录或 backend 下的 .env 中设置。"
        )
    return value


def get_app_settings() -> AppSettings:
    return AppSettings(
        supabase_url=_require_env("SUPABASE_URL"),
        supabase_key=_require_env("SUPABASE_KEY"),
        port=int(os.getenv("PORT", "8000")),
        supabase_storage_bucket=os.getenv("SUPABASE_STORAGE_BUCKET"),
        r2_account_id=os.getenv("R2_ACCOUNT_ID"),
        r2_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        r2_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        r2_bucket=os.getenv("R2_BUCKET"),
        r2_public_base_url=os.getenv("R2_PUBLIC_BASE_URL"),
    )