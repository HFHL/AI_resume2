from fastapi import FastAPI, HTTPException, Query, Path, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal
import os
import shutil

from .db import fetch_schema_via_pg_meta, get_supabase_client
from .config import get_app_settings
from . import UPLOAD_DIRS
from .watcher import start_watcher_in_background

app = FastAPI(title="AI Resume Backend", version="0.5.0")

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


class PositionUpdate(BaseModel):
    position_name: str | None = None
    position_description: str | None = None
    position_category: str | None = None
    required_keywords: List[str] | None = None
    match_type: Literal["any", "all"] | None = None
    tags: List[str] | None = None


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


@app.get("/positions")
def list_positions() -> dict:
    client = get_supabase_client()
    try:
        res = (
            client.table("positions")
            .select("id, position_name, position_category, tags, match_type, created_at")
            .order("id", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"items": getattr(res, "data", [])}


@app.get("/positions/{position_id}")
def get_position(position_id: int = Path(...)) -> dict:
    client = get_supabase_client()
    try:
        res = (
            client.table("positions")
            .select("*")
            .eq("id", position_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    items = getattr(res, "data", [])
    if not items:
        raise HTTPException(status_code=404, detail="职位不存在")
    return {"item": items[0]}


@app.put("/positions/{position_id}")
def update_position(payload: PositionUpdate, position_id: int = Path(...)) -> dict:
    client = get_supabase_client()
    # 过滤掉 None 字段
    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not changes:
        return {"ok": True, "position": (get_position(position_id))["item"]}
    try:
        res = (
            client.table("positions")
            .update(changes)
            .eq("id", position_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    data = getattr(res, "data", None)
    if not data:
        raise HTTPException(status_code=500, detail="更新失败：未返回数据")
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


@app.get("/resumes")
def list_resumes(limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0)) -> dict:
    """返回简历列表。当前为简单列表接口，筛选由前端先行实现。
    后续如需服务端筛选/分页，可扩展查询参数。
    """
    client = get_supabase_client()
    try:
        res = (
            client.table("resumes")
            .select("id, name, skills, education_degree, education_tiers, created_at")
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"items": getattr(res, "data", [])}


@app.get("/resumes/{resume_id}")
def get_resume(resume_id: int = Path(...)) -> dict:
    client = get_supabase_client()
    try:
        res = (
            client.table("resumes")
            .select(
                "id, name, contact_info, education_degree, education_school, education_major, education_graduation_year, education_tier, education_tiers, skills, work_experience, internship_experience, project_experience, self_evaluation, other, created_at, updated_at"
            )
            .eq("id", resume_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    items = getattr(res, "data", [])
    if not items:
        raise HTTPException(status_code=404, detail="简历不存在")
    return {"item": items[0]}


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


# ================== 上传与文件登记 ==================
class UploadResponse(BaseModel):
    ok: bool
    files: List[str]


@app.post("/upload", response_model=UploadResponse)
async def upload_files(
    uploaded_by: str = Form(..., description="上传者姓名"),
    files: List[UploadFile] = File(..., description="批量文件"),
) -> UploadResponse:
    if not uploaded_by.strip():
        raise HTTPException(status_code=400, detail="上传者姓名不能为空")
    if not files:
        raise HTTPException(status_code=400, detail="未选择文件")

    client = get_supabase_client()

    saved_names: List[str] = []
    for f in files:
        # 仅允许部分扩展名
        _, ext = os.path.splitext(f.filename)
        ext_lower = ext.lower()
        if ext_lower not in {".pdf", ".doc", ".docx", ".txt"}:
            raise HTTPException(status_code=400, detail=f"不支持的文件类型: {f.filename}")

        # 保存到 processing 目录，文件名增加时间戳避免冲突
        safe_name = f.filename.replace("/", "_").replace("\\", "_")
        dest_path = UPLOAD_DIRS["processing"] / safe_name

        # 如果存在则在文件名后追加数字
        counter = 1
        base, extn = os.path.splitext(dest_path.name)
        while dest_path.exists():
            dest_path = UPLOAD_DIRS["processing"] / f"{base}_{counter}{extn}"
            counter += 1

        with open(dest_path, "wb") as out:
            shutil.copyfileobj(f.file, out)

        saved_names.append(dest_path.name)

        # 在 resume_files 中登记记录，状态 = 待处理
        try:
            client.table("resume_files").insert({
                "file_name": dest_path.name,
                "file_path": str(dest_path),
                "uploaded_by": uploaded_by,
                "status": "待处理",
            }).execute()
        except Exception as exc:
            # 插入失败也不应阻断其他文件保存
            # 标记失败目录
            fail_target = UPLOAD_DIRS["failed"] / dest_path.name
            try:
                if dest_path.exists():
                    dest_path.replace(fail_target)
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=f"登记数据库失败: {exc}")

    return UploadResponse(ok=True, files=saved_names)


_observer = None


@app.on_event("startup")
def _on_startup():
    global _observer
    try:
        _observer = start_watcher_in_background()
    except Exception:
        _observer = None


@app.on_event("shutdown")
def _on_shutdown():
    global _observer
    try:
        if _observer is not None:
            _observer.stop()
            _observer.join(timeout=5)
    finally:
        _observer = None
