#!/usr/bin/env python3
"""
Parse all OCR markdowns into structured JSON using backend parser.
- Input sources:
  - test_parser/ocr_outputs/*.md (preferred if exists)
  - test_parser/test_inputs/*.md (fallback for manually provided markdown)
- Output: test_parser/test_outputs/<stem>.json
- Skip if JSON already exists
- Extra: Perform sentence-by-sentence translation to Simplified Chinese for major text fields.
  Translation policy:
    - Split text into sentences (newline / punctuation boundaries)
    - Send each sentence separately to the LLM
    - Strict literal translation, no summarization or omissions
    - Preserve order; join with '\n'
- Extra: Preserve original markdown for display and, if the markdown is mostly in English,
  generate a translated Chinese markdown at test_parser/ocr_outputs_zh/<stem>.md.
"""

import sys
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

# Ensure project root on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.parser import parse_resume  # type: ignore
from backend.app.llm import LLMClient  # type: ignore


def ensure_dirs(base: Path) -> None:
    (base / "test_inputs").mkdir(parents=True, exist_ok=True)
    (base / "ocr_outputs").mkdir(parents=True, exist_ok=True)
    (base / "ocr_outputs_zh").mkdir(parents=True, exist_ok=True)
    (base / "test_outputs").mkdir(parents=True, exist_ok=True)


def list_markdowns(ocr_dir: Path, inputs_dir: Path) -> List[Path]:
    md = [p for p in ocr_dir.glob("*.md") if p.is_file()]
    # also include raw md in inputs if no OCR exists for same stem
    fallback = []
    for p in inputs_dir.glob("*.md"):
        if not (ocr_dir / f"{p.stem}.md").exists():
            fallback.append(p)
    return sorted(md + fallback)


# ---------- Translation helpers ----------

def is_mostly_english(s: str) -> bool:
    if not s:
        return False
    letters = sum(1 for ch in s if ('A' <= ch <= 'Z') or ('a' <= ch <= 'z'))
    total = len([ch for ch in s if ch.strip()])
    return total > 0 and (letters / total) > 0.6


def split_sentences(text: str) -> List[str]:
    if not text:
        return []
    # First split by newlines to respect paragraph breaks
    lines = []
    for block in text.splitlines():
        block = block.strip()
        if not block:
            continue
        # Then split by sentence-ending punctuation (CN/EN)
        parts = re.split(r"(?<=[\.!?。！？])\s+", block)
        for p in parts:
            t = p.strip()
            if t:
                lines.append(t)
    return lines if lines else [text.strip()]


def translate_sentence_by_sentence(sentences: List[str], llm: Optional[LLMClient]) -> List[str]:
    if not sentences:
        return []
    out: List[str] = []
    if not llm:
        return sentences[:]  # no LLM configured
    prompt = (
        "Translate the following text to Simplified Chinese. Requirements:\n"
        "- Translate THIS sentence only, literally and completely.\n"
        "- No summarization, no omission, no merging.\n"
        "- Output ONLY the translated sentence, no extra text, no quotes, no markdown.\n"
    )
    for s in sentences:
        if not s.strip():
            out.append(s)
            continue
        # Skip non-English sentences to avoid over-translation
        if not is_mostly_english(s):
            out.append(s)
            continue
        tr = llm.extract(prompt, s, max_tokens=300) if llm else None
        if tr:
            out.append(tr.strip())
        else:
            out.append(s)
    return out


def translate_text_block(text: Optional[str], llm: Optional[LLMClient]) -> Optional[str]:
    if not text:
        return text
    sentences = split_sentences(text)
    translated = translate_sentence_by_sentence(sentences, llm)
    return "\n".join(translated).strip() if translated else text


def translate_list_blocks(items: Optional[List[str]], llm: Optional[LLMClient]) -> Optional[List[str]]:
    if not items:
        return items
    out: List[str] = []
    for it in items:
        out.append(translate_text_block(it, llm) or it)
    return out


def enrich_with_translations(row: Dict[str, Any]) -> Dict[str, Any]:
    """Augment parsed row with zh translations without mutating original fields."""
    llm = LLMClient.from_env()

    # Flat text fields
    row["self_evaluation_zh"] = translate_text_block(row.get("self_evaluation"), llm)
    row["other_zh"] = translate_text_block(row.get("other"), llm)

    # List fields
    row["work_experience_zh"] = translate_list_blocks(row.get("work_experience"), llm)
    row["internship_experience_zh"] = translate_list_blocks(row.get("internship_experience"), llm)
    row["project_experience_zh"] = translate_list_blocks(row.get("project_experience"), llm)

    # Structured experience
    struct = row.get("work_experience_struct")
    if isinstance(struct, list):
        new_struct: List[Dict[str, Any]] = []
        for it in struct:
            if not isinstance(it, dict):
                new_struct.append(it)
                continue
            it2 = dict(it)
            title_src = it.get("title_en") or it.get("title") or ""
            desc_src = it.get("description_en") or it.get("description") or ""
            details_src = it.get("details_en") if isinstance(it.get("details_en"), list) else it.get("details") if isinstance(it.get("details"), list) else None

            if title_src:
                it2["title_zh"] = translate_text_block(title_src, llm)
            if desc_src:
                it2["description_zh"] = translate_text_block(desc_src, llm)
            if isinstance(details_src, list):
                it2["details_zh"] = translate_list_blocks(details_src, llm)
            new_struct.append(it2)
        row["work_experience_struct_translated"] = new_struct

    return row


# ---------- Markdown translation for display ----------

def split_md_sections(md: str) -> List[Tuple[str, str]]:
    """Split markdown by heading lines starting with '#'.
    Returns a list of (heading_line_or_empty, body_text) preserving order.
    """
    lines = md.splitlines()
    sections: List[Tuple[str, str]] = []
    current_head = ""
    current_body: List[str] = []
    for ln in lines:
        if re.match(r"^\s*#", ln):
            if current_head or current_body:
                sections.append((current_head, "\n".join(current_body).strip()))
            current_head = ln
            current_body = []
        else:
            current_body.append(ln)
    sections.append((current_head, "\n".join(current_body).strip()))
    return sections


def translate_markdown(md_text: str, llm: Optional[LLMClient]) -> str:
    if not md_text:
        return md_text
    sections = split_md_sections(md_text)
    out_lines: List[str] = []
    for head, body in sections:
        # Translate heading text (keep # marks)
        if head.strip():
            m = re.match(r"^(\s*#+\s*)(.*)$", head)
            if m:
                prefix, title = m.group(1), m.group(2)
                tr_title = translate_text_block(title, llm) if is_mostly_english(title) else title
                out_lines.append(f"{prefix}{tr_title}")
            else:
                out_lines.append(head)
        # Translate body paragraph by sentence
        if body:
            translated = translate_text_block(body, llm)
            out_lines.append(translated or body)
    return "\n\n".join([ln for ln in out_lines if ln is not None])


def write_translated_md_if_needed(md_path: Path, md_text: str, base: Path) -> Optional[Path]:
    """Always provide a Chinese markdown at ocr_outputs_zh.
    If the doc is mostly English, translate it; otherwise copy original as zh version.
    Returns the zh path.
    """
    llm = LLMClient.from_env()
    zh_dir = base / "ocr_outputs_zh"
    zh_path = zh_dir / md_path.name
    try:
        if is_mostly_english(md_text):
            zh_text = translate_markdown(md_text, llm)
        else:
            zh_text = md_text
        # Avoid overwriting identical content to reduce churn, but always ensure file exists
        if not zh_path.exists() or zh_path.stat().st_size == 0:
            zh_path.write_text(zh_text, encoding="utf-8")
        return zh_path
    except Exception:
        # Best-effort fallback: copy original if write fails
        try:
            if not zh_path.exists():
                zh_path.write_text(md_text, encoding="utf-8")
            return zh_path
        except Exception:
            return None


def parse_one(md_path: Path, outputs_dir: Path, base: Path) -> Optional[Dict[str, Any]]:
    try:
        text = md_path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        print(f"  !! failed to read {md_path.name}: {e}")
        return None

    try:
        parsed = parse_resume(text, resume_file_id=None, file_name=md_path.name)
        row = parsed.to_row()
        row = enrich_with_translations(row)
        # Record markdown paths for display
        row["md_original"] = str(md_path)
        zh_path = write_translated_md_if_needed(md_path, text, base)
        if zh_path is not None:
            row["md_translated"] = str(zh_path)
            row["md_mostly_english"] = is_mostly_english(text)
        else:
            row["md_mostly_english"] = is_mostly_english(text)
    except Exception as e:
        print(f"  !! parse error: {e}")
        return None

    out_file = outputs_dir / f"{md_path.stem}.json"
    try:
        out_file.write_text(json.dumps({
            "file_name": md_path.name,
            "parsed_at": datetime.now().isoformat(),
            "result": row,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"  !! write json error: {e}")
        return None
    return row


def main() -> None:
    base = Path(__file__).parent
    ensure_dirs(base)
    inputs_dir = base / "test_inputs"
    ocr_dir = base / "ocr_outputs"
    outputs_dir = base / "test_outputs"

    mds = list_markdowns(ocr_dir, inputs_dir)
    if not mds:
        print("No markdowns found. Run ocr_all.py first or put .md files into test_inputs.")
        return

    print(f"Found {len(mds)} markdown files. Starting parse...")
    done = 0
    skipped = 0
    failed = 0

    for md in mds:
        out_json = outputs_dir / f"{md.stem}.json"
        if out_json.exists():
            print(f"[skip] {md.name} -> {out_json.name} exists")
            skipped += 1
            continue
        print(f"[parse] {md.name}")
        r = parse_one(md, outputs_dir, base)
        if r is not None:
            print(f"  -> wrote {out_json.name}")
            done += 1
        else:
            failed += 1

    print("\nSummary:")
    print(f"  Parsed: {done}")
    print(f"  Skipped: {skipped}")
    print(f"  Failed: {failed}")


if __name__ == "__main__":
    main()
