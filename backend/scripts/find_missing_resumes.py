import argparse
import json
import os
import sys
from typing import Iterable, List, Set, Tuple

try:
    from supabase import create_client, Client
except Exception as e:
    print("Please install dependencies: pip install -r backend/requirements.txt", file=sys.stderr)
    raise
try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None  # optional, but recommended


def normalize_name(name: str) -> str:
    base = os.path.basename(name or "")
    return base.strip().lower()


def list_local_files(target_dir: str, exts: Tuple[str, ...]) -> List[str]:
    results: List[str] = []
    for root, _, files in os.walk(target_dir):
        for f in files:
            if not exts or os.path.splitext(f)[1].lower() in exts:
                results.append(os.path.join(root, f))
    return results


def fetch_existing_filenames(sb: Client, page_size: int = 1000) -> Set[str]:
    names: Set[str] = set()
    offset = 0
    while True:
        # Use PostgREST range; supabase-py v2: .range(from_, to)
        resp = (
            sb.table("resume_files")
            .select("id,file_name,file_path")
            .order("id", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        rows = getattr(resp, "data", resp) or []
        if not isinstance(rows, list):
            break
        for r in rows:
            fn = r.get("file_name")
            fp = r.get("file_path")
            if isinstance(fn, str) and fn.strip():
                names.add(normalize_name(fn))
            if isinstance(fp, str) and fp.strip():
                names.add(normalize_name(fp))

        if len(rows) < page_size:
            break
        offset += len(rows)

    return names


def main(argv: Iterable[str]) -> int:
    parser = argparse.ArgumentParser(description="Find local resume files not yet uploaded to Supabase")
    parser.add_argument(
        "--dir",
        dest="target_dir",
        default=r"D:\\FeiYuzi\\project\\AI_resume2\\37",
        help="Directory containing local resume files (defaults to the user's path)",
    )
    parser.add_argument(
        "--out",
        dest="out_path",
        default=os.path.join("backend", "scripts", "missing_resumes.json"),
        help="Output JSON file path",
    )
    parser.add_argument(
        "--ext",
        dest="extensions",
        default=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt",
        help="Comma-separated file extensions to include",
    )
    args = parser.parse_args(list(argv))

    target_dir = args.target_dir
    out_path = args.out_path
    exts = tuple([e.strip().lower() for e in args.extensions.split(",") if e.strip()])

    if not os.path.isdir(target_dir):
        print(f"Target directory not found: {target_dir}", file=sys.stderr)
        return 2

    # Load .env from common locations
    if load_dotenv is not None:
        cwd_env = os.path.join(os.getcwd(), ".env")
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(script_dir, os.pardir, os.pardir))
        candidates = [
            cwd_env,
            os.path.join(project_root, ".env"),
            os.path.join(script_dir, ".env"),
            os.path.join(project_root, "backend", ".env"),
        ]
        for p in candidates:
            if os.path.isfile(p):
                load_dotenv(p, override=False)

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
    )
    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL or SUPABASE_*KEY in environment", file=sys.stderr)
        return 3

    sb = create_client(supabase_url, supabase_key)

    print(f"Scanning local directory: {target_dir}")
    local_files = list_local_files(target_dir, exts)
    local_names = {normalize_name(p) for p in local_files}
    print(f"Local files matched: {len(local_files)}")

    print("Fetching existing resume_files from Supabase...")
    existing_names = fetch_existing_filenames(sb)
    print(f"Existing records in DB (name/path variants): {len(existing_names)}")

    missing: List[str] = []
    existing_set = existing_names
    for full_path in local_files:
        base_norm = normalize_name(full_path)
        if base_norm not in existing_set:
            missing.append(full_path)

    print(f"Missing files: {len(missing)}")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(missing, f, ensure_ascii=False, indent=2)

    print(f"Wrote JSON list to: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


