import argparse
import json
import os
import shutil
import sys
import hashlib
from typing import Iterable, List


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def unique_dest_path(dest_dir: str, filename: str) -> str:
    base, ext = os.path.splitext(filename)
    dest_path = os.path.join(dest_dir, filename)
    if not os.path.exists(dest_path):
        return dest_path
    # Add short hash to avoid collisions
    # Use hash of original name+random salt (or full path supplied at call site) for stability
    # Here we will compute hash of filename plus a counter
    counter = 1
    while True:
        candidate = os.path.join(dest_dir, f"{base}_{counter}{ext}")
        if not os.path.exists(candidate):
            return candidate
        counter += 1


def move_files_from_json(json_path: str, dest_dir: str, do_copy: bool = False) -> int:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("JSON must be a list of file paths")

    ensure_dir(dest_dir)
    moved = 0
    skipped: List[str] = []
    errors: List[str] = []

    for entry in data:
        if not isinstance(entry, str):
            continue
        src = entry
        if not os.path.isfile(src):
            skipped.append(src)
            continue
        filename = os.path.basename(src)
        dest_path = unique_dest_path(dest_dir, filename)
        try:
            if do_copy:
                shutil.copy2(src, dest_path)
            else:
                shutil.move(src, dest_path)
            moved += 1
        except Exception as e:
            errors.append(f"{src} -> {dest_path}: {e}")

    print(f"Total entries: {len(data)}")
    print(f"Moved/Copied: {moved}")
    if skipped:
        print(f"Skipped (not found): {len(skipped)}")
    if errors:
        print(f"Errors: {len(errors)}")
        for msg in errors[:20]:
            print("  ", msg)

    return 0 if not errors else 1


def main(argv: Iterable[str]) -> int:
    parser = argparse.ArgumentParser(description="Move or copy files listed in a JSON array to a single directory")
    parser.add_argument(
        "--json",
        dest="json_path",
        default=os.path.join("backend", "scripts", "missing_resumes.json"),
        help="Path to JSON file containing a list of file paths",
    )
    parser.add_argument(
        "--dest",
        dest="dest_dir",
        required=True,
        help="Destination directory where files will be moved/copied",
    )
    parser.add_argument(
        "--copy",
        action="store_true",
        help="Copy instead of move",
    )
    args = parser.parse_args(list(argv))

    return move_files_from_json(args.json_path, args.dest_dir, do_copy=args.copy)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


