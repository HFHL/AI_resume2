#!/usr/bin/env python3
"""
Build an index of resumes for the viewer, scanning:
- test_parser/test_inputs (pdf, md)
- test_parser/ocr_outputs (md)
- test_parser/ocr_outputs_zh (md)
- test_parser/test_outputs (json)
Outputs: test_parser/index.json with relative web paths.
Serve the project root (e.g., python -m http.server) and open /test_parser/viewer.html
"""

import json
from pathlib import Path
from typing import Dict

BASE = Path(__file__).parent
PROJECT_ROOT = BASE.parent
inputs = BASE / "test_inputs"
ocr = BASE / "ocr_outputs"
ocr_zh = BASE / "ocr_outputs_zh"
outs = BASE / "test_outputs"
index_path = BASE / "index.json"


def rel(p: Path) -> str:
    """Return a URL path relative to the project root, prefixed with '/'.
    Avoid absolute Windows drive letters in URLs.
    """
    try:
        rp = p.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
        return "/" + rp
    except Exception:
        # Fallback: strip drive and backslashes, ensure forward slashes
        s = p.as_posix()
        for prefix in ("C:/", "D:/", "E:/", "F:/"):
            if s.startswith(prefix):
                s = s[len(prefix):]
                break
        s = s.lstrip("/")
        return "/" + s


def main() -> None:
    stems: Dict[str, Dict[str, str]] = {}

    # PDFs
    for p in inputs.glob("*.pdf"):
        stems.setdefault(p.stem, {})["pdf"] = rel(p)
    # Raw markdown in inputs (optional)
    for p in inputs.glob("*.md"):
        stems.setdefault(p.stem, {})["md_input"] = rel(p)
    # OCR markdown
    for p in ocr.glob("*.md"):
        stems.setdefault(p.stem, {})["md"] = rel(p)
    # Translated markdown
    for p in ocr_zh.glob("*.md"):
        stems.setdefault(p.stem, {})["md_zh"] = rel(p)
    # Parsed json
    for p in outs.glob("*.json"):
        stems.setdefault(p.stem, {})["json"] = rel(p)

    items = []
    for stem, m in sorted(stems.items()):
        item = {"stem": stem}
        item.update(m)
        items.append(item)

    payload = {"count": len(items), "items": items}
    index_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {index_path} with {len(items)} items")


if __name__ == "__main__":
    main()
