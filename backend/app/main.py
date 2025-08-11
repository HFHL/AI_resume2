from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal

from .db import fetch_schema_via_pg_meta, get_supabase_client

app = FastAPI(title="AI Resume Backend", version="0.4.0")

# CORS for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/schema")
def read_schema() -> dict:
    schema = fetch_schema_via_pg_meta()
    return schema


class PositionCreate(BaseModel):
    position_name: str
    position_description: str | None = None
    position_category: str | None = None  # 仅允许：技术类 / 非技术类
    required_keywords: List[str] = []
    match_type: Literal["any", "all"] = "any"
    tags: List[str] = []


@app.post("/positions")
def create_position(payload: PositionCreate) -> dict:
    client = get_supabase_client()
    try:
        result = client.table("positions").insert({
            "position_name": payload.position_name,
            "position_description": payload.position_description,
            "position_category": payload.position_category,
            "required_keywords": payload.required_keywords,
            "match_type": payload.match_type,
            "tags": payload.tags,
        }).execute()
    except Exception as exc:  # supabase client raises python exceptions
        raise HTTPException(status_code=400, detail=str(exc))

    data = getattr(result, "data", None)
    if not data:
        raise HTTPException(status_code=500, detail="插入失败：未返回数据")
    return {"ok": True, "position": data[0]}


@app.get("/tags")
def list_tags(category: str = Query(..., description="标签类别：技术类 或 非技术类")) -> dict:
    client = get_supabase_client()
    try:
        res = client.table("tags").select("*").eq("category", category).order("tag_name").execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"items": getattr(res, "data", [])}


@app.get("/keywords")
def list_keywords() -> dict:
    client = get_supabase_client()
    try:
        res = client.table("keywords").select("*").order("keyword").execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"items": getattr(res, "data", [])}


class KeywordCreate(BaseModel):
    keyword: str


@app.post("/keywords")
def create_keyword(payload: KeywordCreate) -> dict:
    kw = payload.keyword.strip()
    if not kw:
        raise HTTPException(status_code=400, detail="关键词不能为空")

    client = get_supabase_client()
    try:
        # 简单去重策略：先查再插入
        exists = client.table("keywords").select("id, keyword").ilike("keyword", kw).limit(1).execute()
        data = getattr(exists, "data", [])
        if data:
            return {"ok": True, "keyword": data[0]}
        res = client.table("keywords").insert({"keyword": kw}).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    data = getattr(res, "data", None)
    if not data:
        raise HTTPException(status_code=500, detail="创建失败：未返回数据")
    return {"ok": True, "keyword": data[0]}
