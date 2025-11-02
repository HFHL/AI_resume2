#!/usr/bin/env python3
"""
Rename all files in test_parser/test_inputs to contain only:
- Chinese characters (\u4e00-\u9fff)
- English letters (A-Z, a-z)
- Digits (0-9)

Removes: spaces, Chinese/English punctuation, and any other characters.
Resolves name collisions by appending a numeric suffix.
"""

import re
from pathlib import Path
from typing import Set


def sanitize_stem(stem: str) -> str:
    # Keep only Chinese chars, English letters, digits
    sanitized = re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", stem)
    sanitized = sanitized.strip()
    return sanitized or "file"


def make_unique_name(base: str, ext: str, used: Set[str]) -> str:
    name = f"{base}{ext}"
    if name not in used:
        return name
    idx = 1
    while True:
        candidate = f"{base}{idx}{ext}"
        if candidate not in used:
            return candidate
        idx += 1


def main() -> None:
    inputs_dir = Path(__file__).parent / "test_inputs"
    if not inputs_dir.exists():
        print(f"❌ 目录不存在: {inputs_dir}")
        return

    files = [p for p in inputs_dir.iterdir() if p.is_file()]
    if not files:
        print("ℹ️ 没有可处理的文件。")
        return

    used_names: Set[str] = {p.name for p in files}
    # Also include directory listing to avoid collision with existing files not in `files` list
    for p in inputs_dir.iterdir():
        if p.is_file():
            used_names.add(p.name)

    changes = []
    # First pass: compute target names without performing renames to avoid conflicts
    planned = {}
    temp_used = set(used_names)  # local copy for planning

    for src in files:
        stem = src.stem
        ext = src.suffix  # keep original extension
        sanitized = sanitize_stem(stem)
        # If no change and unique, skip
        target_name = make_unique_name(sanitized, ext, temp_used)
        planned[src] = target_name
        temp_used.add(target_name)

    # Second pass: perform renames where needed
    applied = 0
    for src, target_name in planned.items():
        if src.name == target_name:
            continue
        dst = src.with_name(target_name)
        # If destination exists and is not the same file, ensure unique again at runtime
        if dst.exists() and dst.resolve() != src.resolve():
            # regenerate with updated used set
            base = sanitize_stem(src.stem)
            ext = src.suffix
            target_name = make_unique_name(base, ext, {p.name for p in inputs_dir.iterdir() if p.is_file()})
            dst = src.with_name(target_name)
        src.rename(dst)
        applied += 1
        changes.append((src.name, dst.name))

    if applied == 0:
        print("✅ 所有文件名已符合规范，无需修改。")
    else:
        print(f"✅ 重命名完成：共处理 {applied} 个文件\n")
        for old, new in changes:
            print(f"  {old}  ->  {new}")


if __name__ == "__main__":
    main()
