#!/usr/bin/env python3
"""
OCR all PDFs in test_parser/test_inputs using MinerU (no fallback),
write markdown to test_parser/ocr_outputs, with de-duplication:
- Skip if a parsed JSON already exists in test_parser/test_outputs
- Skip if a non-empty OCR markdown already exists in test_parser/ocr_outputs
"""

import sys
from pathlib import Path
from typing import List

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.ocr import MinerUProcessor  # type: ignore


def ensure_dirs(base: Path) -> None:
    (base / "test_inputs").mkdir(parents=True, exist_ok=True)
    (base / "ocr_outputs").mkdir(parents=True, exist_ok=True)
    (base / "test_outputs").mkdir(parents=True, exist_ok=True)


def list_pdfs(inputs_dir: Path) -> List[Path]:
    return sorted([p for p in inputs_dir.glob("*.pdf") if p.is_file()])


def main() -> None:
    base = Path(__file__).parent
    ensure_dirs(base)
    inputs_dir = base / "test_inputs"
    ocr_dir = base / "ocr_outputs"
    outputs_dir = base / "test_outputs"

    pdfs = list_pdfs(inputs_dir)
    if not pdfs:
        print("No PDFs found in test_parser/test_inputs. Put files there and rerun.")
        return
    print(f"Found {len(pdfs)} PDFs. Starting OCR...")

    proc = MinerUProcessor()
    done = 0
    skipped_existing = 0
    skipped_parsed = 0
    failed = 0

    for pdf in pdfs:
        stem = pdf.stem
        parsed_json = outputs_dir / f"{stem}.json"
        if parsed_json.exists():
            print(f"[skip-parsed] {pdf.name} -> {parsed_json.name} exists")
            skipped_parsed += 1
            continue
        ocr_md = ocr_dir / f"{stem}.md"
        if ocr_md.exists():
            try:
                content = ocr_md.read_text(encoding="utf-8", errors="ignore")
                if content.strip():
                    print(f"[skip-ocr] {pdf.name} -> {ocr_md.name} already exists")
                    skipped_existing += 1
                    continue
            except Exception:
                pass
        print(f"[ocr] {pdf.name}")
        md_text = proc.process_pdf(pdf)
        if md_text and md_text.strip():
            try:
                ocr_md.write_text(md_text, encoding="utf-8")
                print(f"  -> wrote {ocr_md.name} ({len(md_text)} chars)")
                done += 1
            except Exception as e:
                print(f"  !! failed to write OCR markdown: {e}")
                failed += 1
        else:
            print(f"  !! OCR returned no content")
            failed += 1

    print("\nSummary:")
    print(f"  OCR success: {done}")
    print(f"  Skipped (existing OCR): {skipped_existing}")
    print(f"  Skipped (already parsed): {skipped_parsed}")
    print(f"  Failed: {failed}")


if __name__ == "__main__":
    main()
