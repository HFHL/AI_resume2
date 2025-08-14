#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import time
import uuid
import logging
from typing import List, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Path, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client

from .config import get_app_settings
from . import UPLOAD_DIRS, build_r2_public_url
from .watcher import start_watcher_in_background
import boto3
from botocore.client import Config as _BotoConfig
import certifi

# 确保环境变量加载
load_dotenv()

_observer = None

# 创建 FastAPI 应用
app = FastAPI(title="AI简历匹配系统 API", version="0.1.0")
logger = logging.getLogger("api")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_supabase_client() -> Client:
    """获取 Supabase 客户端实例"""
    settings = get_app_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


# ===== Pydantic 模型定义 =====
from pydantic import BaseModel


class ResumeCreate(BaseModel):
    file_name: str
    uploaded_by: str | None = None
    parse_status: str = "pending"
    s3_key: str | None = None
    # 解析结果字段在解析后更新


class PositionCreate(BaseModel):
    position_name: str
    position_description: str | None = None
    position_category: str | None = None  # 技术类/非技术类
    required_keywords: List[str] = []
    match_type: Literal["any", "all"] = "any"
    tags: List[str] = []


class TagCreate(BaseModel):
    tag_name: str
    category: str  # 技术类/非技术类


class KeywordCreate(BaseModel):
    keyword: str


# ===== API 路由 =====


@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    # 验证数据库连接
    try:
        client = get_supabase_client()
        print("✅ 数据库连接成功")
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")


@app.get("/")
def read_root():
    return {"message": "AI简历匹配系统 API 正在运行", "version": "0.1.0"}


@app.get("/health")
def health() -> dict:
    """健康检查 + 数据库连通性快速校验（不暴露敏感信息）"""
    info: dict = {"status": "ok"}
    try:
        client = get_supabase_client()
        # 试探查询任一表，避免权限/网络问题时无感
        res = client.table("resumes").select("id").limit(1).execute()
        sample = getattr(res, "data", [])
        info["db"] = {
            "ok": True,
            "sampleCount": len(sample),
        }
    except Exception as exc:
        info["db"] = {
            "ok": False,
            "error": str(exc),
        }
    return info


@app.post("/upload")
async def upload_resumes(
    uploaded_by: str = Form(..., description="上传者姓名"),
    files: List[UploadFile] = File(..., description="批量文件"),
):
    """批量上传简历文件"""
    if not files:
        raise HTTPException(status_code=400, detail="未提供文件")

    results = []
    client = get_supabase_client()

    for file in files:
        # 保存到 processing 目录，避免冲突自动重命名（后续 watcher 负责 OCR + 上传到 R2 + 入库修正路径）
        safe_name = file.filename.replace('/', '_').replace('\\', '_')
        target = UPLOAD_DIRS["processing"] / safe_name
        base, ext = os.path.splitext(target.name)
        counter = 1
        while target.exists():
            target = UPLOAD_DIRS["processing"] / f"{base}_{counter}{ext}"
            counter += 1
        try:
            with open(target, "wb") as f:
                content = await file.read()
                f.write(content)
            logger.info(f"[upload] 保存文件到本地 processing: {target}")
        except Exception as e:
            logger.error(f"[upload] 保存文件失败: {file.filename}: {e}")
            results.append({"filename": file.filename, "status": "failed", "error": f"保存失败: {e}"})
            continue

        # 插入记录到数据库（初始为本地临时路径，后续 watcher 会把 file_path 更新为 R2 URL）
        data = {
            "file_name": file.filename,
            "uploaded_by": uploaded_by,
            "parse_status": "pending",
            "file_path": str(target),
            "status": "待处理",
        }

        try:
            logger.info(f"[upload] 向 resume_files 写入记录: file_name={data['file_name']}, uploaded_by={data['uploaded_by']}")
            res = client.table("resume_files").insert(data).execute()
            if getattr(res, "data", None):
                rid = res.data[0]["id"]
                logger.info(f"[upload] 写入 resume_files 成功: id={rid}, path={data['file_path']}")
                results.append({"filename": file.filename, "status": "success", "id": rid})
            else:
                logger.error(f"[upload] 写入 resume_files 失败（无返回 data）: {file.filename}")
                try:
                    os.remove(target)
                except Exception:
                    pass
                results.append({"filename": file.filename, "status": "failed", "error": "插入失败"})
        except Exception as e:
            logger.error(f"[upload] 写入 resume_files 异常: {file.filename}: {e}")
            try:
                os.remove(target)
            except Exception:
                pass
            results.append({"filename": file.filename, "status": "failed", "error": str(e)})

    return {"results": results}


class PresignRequest(BaseModel):
    file_name: str
    content_type: str | None = None


class PresignResponse(BaseModel):
    url: str
    object_key: str
    public_url: str


@app.post("/uploads/presign", response_model=PresignResponse)
def presign_upload(req: PresignRequest) -> PresignResponse:
    settings = get_app_settings()
    if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key and settings.r2_bucket):
        raise HTTPException(status_code=400, detail="未配置 R2，无法生成预签名URL")

    endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
        config=_BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 2, "mode": "standard"},
        ),
        verify=certifi.where(),
    )

    safe_name = req.file_name.replace("/", "_").replace("\\", "_")
    uniq = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    object_key = f"resumes/original/{uniq}_{safe_name}"

    params = {
        "Bucket": settings.r2_bucket,
        "Key": object_key,
        "ContentType": req.content_type or "application/octet-stream",
    }
    try:
        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params=params,
            ExpiresIn=600,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"生成预签名URL失败: {exc}")

    public_url = build_r2_public_url(
        object_key,
        r2_public_base_url=settings.r2_public_base_url,
        r2_bucket=settings.r2_bucket,
        r2_account_id=settings.r2_account_id,
    )
    return PresignResponse(url=url, object_key=object_key, public_url=public_url)


class UploadCompleteRequest(BaseModel):
    file_name: str
    object_key: str
    uploaded_by: str


@app.post("/uploads/complete")
def upload_complete(body: UploadCompleteRequest) -> dict:
    """前端直传 R2 完成后，记录到数据库。"""
    settings = get_app_settings()
    public_url = build_r2_public_url(
        body.object_key,
        r2_public_base_url=settings.r2_public_base_url,
        r2_bucket=settings.r2_bucket,
        r2_account_id=settings.r2_account_id,
    )

    client = get_supabase_client()
    row = {
        "file_name": body.file_name,
        "uploaded_by": body.uploaded_by,
        "file_path": public_url,
        "status": "已上传",
        "parse_status": "pending",
    }
    try:
        res = client.table("resume_files").insert(row).execute()
        data = getattr(res, "data", []) or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if not data:
        raise HTTPException(status_code=500, detail="写入数据库失败")
    return {"item": data[0]}


@app.on_event("startup")
def _on_startup():
    global _observer
    try:
        _observer = start_watcher_in_background()
    except Exception as e:
        _observer = None
        print(f"⚠️ 启动目录监听失败: {e}")


@app.on_event("shutdown")
def _on_shutdown():
    global _observer
    try:
        if _observer is not None:
            _observer.stop()
            _observer.join(timeout=5)
    finally:
        _observer = None


@app.get("/tags")
def list_tags(category: str | None = Query(None, description="标签类别筛选"), limit: int = Query(100, ge=1, le=500)) -> dict:
    """获取标签列表"""
    client = get_supabase_client()
    query = client.table("tags").select("*").order("tag_name")
    if category:
        query = query.eq("category", category)
    try:
        res = query.limit(limit).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"items": getattr(res, "data", [])}


@app.get("/keywords")
def list_keywords(limit: int = Query(100, ge=1, le=500)) -> dict:
    """获取关键词列表"""
    client = get_supabase_client()
    try:
        res = client.table("keywords").select("*").order("keyword").limit(limit).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"items": getattr(res, "data", [])}


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


@app.get("/resumes/_search")
def search_resumes(q: str | None = Query(None, description="模糊搜索关键字"), limit: int = Query(200, ge=1, le=2000), offset: int = Query(0, ge=0)) -> dict:
    """简单搜索：在姓名、联系方式、技能、经历、自评等字段中做子串匹配（不区分大小写）。
    为方便实现，先拉取一定数量记录后在内存中过滤，适合中小数据量。
    """
    client = get_supabase_client()
    try:
        # 为避免全表扫描压力，这里最多拉取 5000 条进行内存过滤
        base_limit = 5000
        res = (
            client.table("resumes")
            .select(
                "id, name, contact_info, skills, work_experience, internship_experience, project_experience, self_evaluation, education_degree, education_tiers, created_at"
            )
            .order("id", desc=True)
            .range(0, base_limit - 1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    rows = getattr(res, "data", []) or []
    needle = (q or "").strip().lower()
    if not needle:
        total = len(rows)
        sliced = rows[offset: offset + limit]
        return {"items": sliced, "total": total}

    def make_blob(row: dict) -> str:
        parts = [
            str(row.get("name") or ""),
            str(row.get("contact_info") or ""),
            str(row.get("self_evaluation") or ""),
            str(row.get("education_degree") or ""),
        ]
        for key in ("skills", "work_experience", "internship_experience", "project_experience"):
            vals = row.get(key) or []
            if isinstance(vals, list):
                parts.extend([str(x) for x in vals])
        return "\n".join(parts).lower()

    matched = [r for r in rows if needle in make_blob(r)]
    total = len(matched)
    sliced = matched[offset: offset + limit]
    return {"items": sliced, "total": total}


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


@app.get("/positions/{position_id}/match")
def match_resumes_for_position(
    position_id: int = Path(...),
    limit: int = Query(2000, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> dict:
    """同步计算匹配：基于职位关键词在简历文本中统计命中数并排序。
    优先返回命中数多的简历。暂不考虑复杂的匹配逻辑（如技能权重、经验年限等）。
    """
    client = get_supabase_client()

    # 1. 获取职位信息
    try:
        pos_res = client.table("positions").select("*").eq("id", position_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    pos_items = getattr(pos_res, "data", [])
    if not pos_items:
        raise HTTPException(status_code=404, detail="职位不存在")
    position = pos_items[0]

    # 2. 拉取所有简历（简化处理，实际场景可能需要分批）
    try:
        resume_res = (
            client.table("resumes")
            .select(
                "id, name, contact_info, skills, work_experience, internship_experience, project_experience, self_evaluation, education_degree, education_tiers"
            )
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    resumes = getattr(resume_res, "data", []) or []

    # 3. 简单匹配：统计关键词命中
    required_keywords = position.get("required_keywords") or []
    match_type = position.get("match_type", "any")

    def compute_match(resume: dict) -> dict:
        """计算单个简历的匹配结果"""
        # 构建简历文本
        parts = [
            str(resume.get("name") or ""),
            str(resume.get("contact_info") or ""),
            str(resume.get("self_evaluation") or ""),
        ]
        for key in ("skills", "work_experience", "internship_experience", "project_experience"):
            vals = resume.get(key) or []
            if isinstance(vals, list):
                parts.extend([str(x) for x in vals])
        blob = "\n".join(parts).lower()

        # 统计命中
        matched_keywords = []
        for kw in required_keywords:
            if kw.lower() in blob:
                matched_keywords.append(kw)

        hit_count = len(matched_keywords)
        if match_type == "all" and hit_count < len(required_keywords):
            # 如果要求全部命中，但没有全部命中，则跳过
            return None

        # 简单的分数计算（可扩展）
        score = hit_count * 10  # 每个关键词10分
        return {
            "id": resume["id"],
            "name": resume.get("name", "未知"),
            "education_degree": resume.get("education_degree"),
            "education_tiers": resume.get("education_tiers", []),
            "skills": resume.get("skills", []),
            "matched_keywords": matched_keywords,
            "hit_count": hit_count,
            "score": score,
        }

    # 执行匹配
    results = []
    for r in resumes:
        m = compute_match(r)
        if m:
            results.append(m)

    # 按分数降序排序
    results.sort(key=lambda x: x["score"], reverse=True)

    # 分页返回
    total = len(results)
    sliced = results[offset: offset + limit]
    return {"items": sliced, "total": total}


@app.get("/positions")
def list_positions(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> dict:
    """获取职位列表"""
    client = get_supabase_client()
    try:
        res = (
            client.table("positions")
            .select("id, position_name, position_category, tags, match_type, created_at")
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"items": getattr(res, "data", [])}


@app.get("/positions/{position_id}")
def get_position(position_id: int = Path(...)) -> dict:
    """获取单个职位详情"""
    client = get_supabase_client()
    try:
        res = client.table("positions").select("*").eq("id", position_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    items = getattr(res, "data", [])
    if not items:
        raise HTTPException(status_code=404, detail="职位不存在")
    return {"item": items[0]}


@app.post("/positions")
def create_position(data: PositionCreate) -> dict:
    """创建新职位"""
    client = get_supabase_client()
    insert_data = data.dict()
    try:
        res = client.table("positions").insert(insert_data).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    items = getattr(res, "data", [])
    if not items:
        raise HTTPException(status_code=500, detail="创建失败")
    return {"position": items[0]}


@app.post("/keywords")
def create_keyword(data: KeywordCreate) -> dict:
    """创建新关键词"""
    client = get_supabase_client()
    try:
        res = client.table("keywords").insert({"keyword": data.keyword}).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    items = getattr(res, "data", [])
    if not items:
        raise HTTPException(status_code=500, detail="创建失败")
    return {"keyword": items[0]}


@app.put("/positions/{position_id}")
def update_position(position_id: int, data: PositionCreate) -> dict:
    """更新职位信息"""
    client = get_supabase_client()
    update_data = data.dict()
    try:
        res = client.table("positions").update(update_data).eq("id", position_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    items = getattr(res, "data", [])
    if not items:
        raise HTTPException(status_code=404, detail="职位不存在或更新失败")
    return {"position": items[0]}


@app.delete("/positions/{position_id}")
def delete_position(position_id: int) -> dict:
    """删除职位"""
    client = get_supabase_client()
    try:
        res = client.table("positions").delete().eq("id", position_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    items = getattr(res, "data", [])
    if not items:
        raise HTTPException(status_code=404, detail="职位不存在")
    return {"message": "删除成功", "deleted": items[0]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)