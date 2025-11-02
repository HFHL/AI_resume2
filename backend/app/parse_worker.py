from __future__ import annotations

import argparse
import concurrent.futures
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Ensure project root on path
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from .db import get_supabase_client
from .parser import parse_resume


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_queue(limit: int, only_id: Optional[int], retry_errors: bool, force: bool) -> List[Dict[str, Any]]:
    client = get_supabase_client()
    if only_id is not None:
        # 指定单条：优先取该条，即使状态不是 ocr_done；除非仅允许从 ocr_done 取
        res = client.table("resume_files").select("id,file_name,ocr_md,parse_status").eq("id", only_id).limit(1).execute()
        items = getattr(res, "data", []) or []
        return items

    # 正常队列：ocr_done 优先；可选 retry_errors
    if retry_errors:
        # 先取 error，再取 ocr_done（拼接后截断）
        err = client.table("resume_files").select("id,file_name,ocr_md,parse_status").eq("parse_status", "error").limit(limit).execute()
        err_items = getattr(err, "data", []) or []
        if len(err_items) >= limit:
            return err_items[:limit]
        rest = limit - len(err_items)
        q = client.table("resume_files").select("id,file_name,ocr_md,parse_status").eq("parse_status", "ocr_done").limit(rest).execute()
        q_items = getattr(q, "data", []) or []
        return err_items + q_items
    else:
        q = client.table("resume_files").select("id,file_name,ocr_md,parse_status").eq("parse_status", "ocr_done").limit(limit).execute()
        return getattr(q, "data", []) or []


def upsert_parsed(resume_file_id: int, result_row: Dict[str, Any]) -> None:
    client = get_supabase_client()
    # 确保关联
    result_row = dict(result_row)
    result_row["resume_file_id"] = resume_file_id
    result_row["parsed_at"] = utc_now_iso()
    result_row["parsed_model"] = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # upsert by resume_file_id
    # Supabase python client没有直 upsert on conflict 简洁API，这里用 insert + on conflict
    client.postgrest.from_("resumes").insert(result_row, upsert=True, on_conflict="resume_file_id").execute()


def process_one(item: Dict[str, Any], force: bool) -> None:
    client = get_supabase_client()
    rf_id = int(item["id"])  # type: ignore
    ocr_md = (item.get("ocr_md") or "").strip()
    fname = item.get("file_name") or ""
    if not ocr_md:
        # 无原文，标记错误
        client.table("resume_files").update({
            "parse_status": "error",
            "parse_error": "empty ocr_md"
        }).eq("id", rf_id).execute()
        return

    try:
        parsed = parse_resume(ocr_md, rf_id, file_name=fname)
        row = parsed.to_row()
        upsert_parsed(rf_id, row)
        client.table("resume_files").update({
            "parse_status": "parsed",
            "last_parsed_at": utc_now_iso(),
            "parse_error": None
        }).eq("id", rf_id).execute()
    except Exception as e:
        client.table("resume_files").update({
            "parse_status": "error",
            "parse_error": str(e)
        }).eq("id", rf_id).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="LLM parse worker for resumes (from OCR MD queue)")
    parser.add_argument("--limit", type=int, default=100, help="Max items to pull")
    parser.add_argument("--concurrency", type=int, default=3, help="Parallel workers")
    parser.add_argument("--only-id", type=int, default=None, help="Process a single resume_file id")
    parser.add_argument("--retry-errors", action="store_true", help="Also include items in error state")
    parser.add_argument("--force", action="store_true", help="Force parse even if previously parsed (when using --only-id)")

    args = parser.parse_args()

    items = fetch_queue(limit=args.limit, only_id=args.only_id, retry_errors=args.retry_errors, force=args.force)
    if not items:
        print("No items to process.")
        return

    # 抢占式声明解析任务，避免多设备/多进程重复解析
    client = get_supabase_client()
    claimed: List[Dict[str, Any]] = []
    for it in items:
        try:
            rid = int(it.get("id"))  # type: ignore
        except Exception:
            continue
        try:
            if args.only_id is not None:
                # 单条强制模式：直接标记为 parsing（允许覆盖现状）
                client.table("resume_files").update({
                    "parse_status": "parsing",
                }).eq("id", rid).execute()
                claimed.append(it)
            else:
                # 正常队列：仅当状态为 ocr_done 时成功抢占
                upd = (
                    client
                    .table("resume_files")
                    .update({"parse_status": "parsing"})
                    .eq("id", rid)
                    .eq("parse_status", "ocr_done")
                    .execute()
                )
                rows = getattr(upd, "data", []) or []
                if rows:
                    claimed.append(it)
        except Exception:
            continue

    if not claimed:
        print("No items claimed (possibly already taken by other workers).")
        return

    # 并发处理已抢占任务
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.concurrency))
    futs: List[concurrent.futures.Future] = []
    for it in claimed:
        futs.append(pool.submit(process_one, it, args.force))

    done = 0
    for f in concurrent.futures.as_completed(futs):
        try:
            f.result()
        except Exception as e:
            print(f"worker error: {e}")
        finally:
            done += 1
            if done % 10 == 0:
                print(f"processed {done}/{len(items)}")

    pool.shutdown(wait=True)
    print(f"All done. processed={len(claimed)}")


if __name__ == "__main__":
    main()


