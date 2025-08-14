#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
将数据库中 resume_files.file_path 为本地磁盘路径的文件，迁移到 Supabase Storage，
并把 file_path 更新为可公开访问的 URL（要求桶为 public）。

使用方法：
  1) 在项目根 .env 中配置：
     - SUPABASE_URL
     - SUPABASE_SERVICE_ROLE_KEY（优先）或 SUPABASE_KEY（具备存储写权限）
     - SUPABASE_STORAGE_BUCKET（如：resumes）
  2) 运行：
     python backend/scripts/migrate_local_files_to_supabase.py --limit 100
"""

from __future__ import annotations

import os
import sys
import mimetypes
from pathlib import Path
from typing import Optional
import unicodedata
import re

from dotenv import load_dotenv
from supabase import create_client, Client


def is_probably_local_path(p: str) -> bool:
    if not p:
        return False
    p = p.strip()
    if p.lower().startswith("http://") or p.lower().startswith("https://"):
        return False
    # Windows 盘符 或 以 / 开头的绝对路径
    if len(p) >= 2 and p[1] == ":":
        return True
    if p.startswith("/") or p.startswith("\\"):
        return True
    return Path(p).is_absolute()


def sanitize_name(file_name: str) -> tuple[str, str]:
    dot = file_name.rfind(".")
    base = file_name[:dot] if dot > 0 else file_name
    ext = file_name[dot + 1 :] if dot > 0 else ""

    # 统一分解为 ASCII，去掉重音及非 ASCII 字符
    norm = unicodedata.normalize("NFKD", base)
    ascii_only = norm.encode("ascii", "ignore").decode("ascii", "ignore")
    ascii_only = ascii_only.strip().replace("/", "_").replace("\\", "_").replace(" ", "_")
    # 仅允许 ASCII 字符集
    sanitized_base = re.sub(r"[^A-Za-z0-9._-]", "_", ascii_only)
    sanitized_base = re.sub(r"_+", "_", sanitized_base).strip("._") or "file"
    sanitized_base = sanitized_base[:100]

    ext_ascii = unicodedata.normalize("NFKD", ext).encode("ascii", "ignore").decode("ascii", "ignore")
    sanitized_ext = re.sub(r"[^A-Za-z0-9]", "", ext_ascii)[:10] or "bin"
    return sanitized_base, sanitized_ext


def ensure_env(var: str) -> str:
    val = os.getenv(var)
    if not val:
        print(f"[ERROR] 缺少环境变量：{var}")
        sys.exit(1)
    return val


def get_supabase() -> Client:
    url = ensure_env("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ensure_env("SUPABASE_KEY")
    return create_client(url, key)


def migrate(limit: Optional[int] = None) -> None:
    load_dotenv()
    client = get_supabase()
    bucket = ensure_env("SUPABASE_STORAGE_BUCKET")
    supabase_url = ensure_env("SUPABASE_URL").rstrip("/")

    # 拉取 resume_files
    print("[INFO] 读取 resume_files...")
    res = client.table("resume_files").select("id, file_name, file_path").order("id").execute()
    rows = getattr(res, "data", []) or []
    print(f"[INFO] 总记录数：{len(rows)}")

    migrated = 0
    skipped = 0
    failed = 0

    for row in rows[: limit or len(rows)]:
        rid = row.get("id")
        file_name = row.get("file_name") or ""
        file_path = row.get("file_path") or ""

        if not is_probably_local_path(file_path):
            skipped += 1
            continue

        local_path = Path(file_path)
        if not local_path.exists() or not local_path.is_file():
            print(f"[WARN] 本地文件不存在，跳过 id={rid}: {file_path}")
            failed += 1
            continue

        print(f"[INFO] 迁移 id={rid}: {file_path}")

        # 总是基于实际本地文件名做 ASCII 安全化，避免 DB 中的原始名包含无法作为 key 的字符
        base, ext = sanitize_name(local_path.name)
        # 对象键：original/<base>；若冲突则追加计数
        object_key = f"original/{base}.{ext}"
        storage = client.storage.from_(bucket)

        # 读取文件内容
        try:
            data = local_path.read_bytes()
        except Exception as e:
            print(f"[ERROR] 读取失败 id={rid}: {e}")
            failed += 1
            continue

        # 猜测 Content-Type
        content_type = (mimetypes.guess_type(local_path.name)[0] or "application/octet-stream")

        # 冲突规避：最多尝试 20 次
        for i in range(20):
            key_try = object_key if i == 0 else f"original/{base}_{i}.{ext}"
            try:
                # 打印一次将要上传的键，便于排查
                if i == 0:
                    print(f"[INFO] 上传对象键: {key_try}")
                # supabase-py v2: file_options 需要使用 HTTP 头形式，值为字符串
                # 参考 JS SDK：x-upsert: 'false'
                up = storage.upload(
                    key_try,
                    data,
                    {
                        "content-type": content_type,
                        "x-upsert": "false",
                    },
                )
                # supabase-py v2 返回 dict: { data, error }
                # 检查错误（supabase-py v2 上传失败通常抛异常；某些版本也可能返回 False/True）
                if up is False:
                    raise Exception("upload returned False")
                object_key = key_try
                break
            except Exception as e:
                # 若已存在则换名重试
                if "exists" in str(e).lower() or "duplicate" in str(e).lower():
                    continue
                print(f"[ERROR] 上传失败 id={rid}: {e}")
                failed += 1
                object_key = None
                break

        if not object_key:
            continue

        # 直接拼接 public URL（桶需为 public）
        public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{object_key}"

        # 更新数据库
        try:
            upd = client.table("resume_files").update({"file_path": public_url, "status": "已上传"}).eq("id", rid).execute()
            err = getattr(upd, "error", None)
            if err:
                raise Exception(err)
            migrated += 1
            print(f"[OK] id={rid} 已更新: {public_url}")
        except Exception as e:
            print(f"[ERROR] 更新数据库失败 id={rid}: {e}")
            failed += 1

    print("\n===== 汇总 =====")
    print(f"迁移成功: {migrated}")
    print(f"跳过(非本地路径): {skipped}")
    print(f"失败: {failed}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="迁移本地文件到 Supabase Storage 并更新数据库 URL")
    parser.add_argument("--limit", type=int, default=None, help="最多处理的记录数（默认全部）")
    args = parser.parse_args()

    migrate(limit=args.limit)


