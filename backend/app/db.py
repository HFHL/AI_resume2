from typing import Any, Dict, List

import httpx
from supabase import create_client, Client

from .config import get_app_settings


def get_supabase_client() -> Client:
    settings = get_app_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


def fetch_schema_via_pg_meta() -> Dict[str, List[Dict[str, Any]]]:
    """
    通过 pg-meta 端点获取所有 schema 下各表的列信息。
    需要 service role key 或拥有元数据权限的 key。
    """
    settings = get_app_settings()

    # pg-meta: 获取表
    # 文档路径常见为 /pg/meta/tables 或 /rest/v1/pg_meta_tables 取决于部署。
    # 在 Supabase 的托管版本中，pg-meta 通过 `pg-meta` 服务暴露：/pg/meta/tables 和 /pg/meta/columns
    base = settings.supabase_url.rstrip("/")
    headers = {
        "apikey": settings.supabase_key,
        "Authorization": f"Bearer {settings.supabase_key}",
    }

    # 尝试不同的pg-meta端点格式
    tables_url = f"{base}/rest/v1/tables"
    columns_url = f"{base}/rest/v1/columns"

    with httpx.Client(timeout=20.0) as client:
        tables_resp = client.get(tables_url, headers=headers)
        tables_resp.raise_for_status()
        tables = tables_resp.json()

        columns_resp = client.get(columns_url, headers=headers)
        columns_resp.raise_for_status()
        columns = columns_resp.json()

    # 整理为 {"schema.table": [columns...]}
    result: Dict[str, List[Dict[str, Any]]] = {}

    # 列表字段名随版本可能不同，做一些健壮性兼容
    def table_key(tbl: Dict[str, Any]) -> str:
        schema_name = tbl.get("schema") or tbl.get("schema_name") or tbl.get("table_schema") or "public"
        table_name = tbl.get("name") or tbl.get("table") or tbl.get("table_name")
        return f"{schema_name}.{table_name}"

    # 建表映射
    table_keys = {tbl.get("id") or table_key(tbl): table_key(tbl) for tbl in tables}

    for col in columns:
        schema_name = col.get("schema") or col.get("schema_name") or col.get("table_schema") or "public"
        table_name = col.get("table") or col.get("table_name")
        if not table_name:
            # 某些版本字段为 name
            table_name = col.get("name")
        key = f"{schema_name}.{table_name}"
        if key not in result:
            result[key] = []
        result[key].append(
            {
                "column": col.get("name") or col.get("column") or col.get("column_name"),
                "type": col.get("data_type") or col.get("format"),
                "nullable": col.get("is_nullable"),
                "default": col.get("default_value") or col.get("default"),
                "position": col.get("ordinal_position") or col.get("position"),
            }
        )

    # 确保每张表都有键，即使没有列被返回
    for _, tkey in table_keys.items():
        result.setdefault(tkey, [])

    # 列顺序
    for t in result:
        result[t].sort(key=lambda c: (c.get("position") or 0))

    return result
