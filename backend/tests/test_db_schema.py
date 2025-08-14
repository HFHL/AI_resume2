import json
import os

import pytest

from backend.app.db import fetch_schema_via_pg_meta


@pytest.mark.skipif(
    not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY")),
    reason="未配置 SUPABASE_URL / SUPABASE_KEY，跳过连接测试。",
)
def test_can_fetch_schema_via_pg_meta() -> None:
    schema = fetch_schema_via_pg_meta()
    # 打印所有表结构（使用 `-s` 可在控制台看到）
    print(json.dumps(schema, ensure_ascii=False, indent=2))
    assert isinstance(schema, dict)
