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
    )