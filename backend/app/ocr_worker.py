from __future__ import annotations

import argparse
import os
import signal
import sys
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Standalone OCR worker: periodically pulls pending resume files from DB, "
            "downloads them to local processing dir, runs MinerU OCR, and writes back results."
        )
    )
    parser.add_argument("--poll-interval", type=int, default=None, help="Pull interval seconds (env PULL_UNPROCESSED_INTERVAL)")
    parser.add_argument("--workers", type=int, default=None, help="Max concurrent OCR workers (env WATCHER_WORKERS)")
    parser.add_argument("--mineru-device", type=str, default=None, help="MinerU device, e.g. cuda:0 or cpu (env MINERU_DEVICE)")
    parser.add_argument("--mineru-backend", type=str, default=None, help="MinerU backend, default 'pipeline' (env MINERU_BACKEND)")
    parser.add_argument("--mineru-python", type=str, default=None, help="Specific python to run 'python -m mineru' (env MINERU_PYTHON)")
    parser.add_argument("--input-dir", type=str, default=None, help="Optional: seed local PDFs into processing dir on startup")

    args = parser.parse_args()

    # Apply env overrides if provided
    if args.poll_interval is not None:
        os.environ["PULL_UNPROCESSED_INTERVAL"] = str(max(1, args.poll_interval))
    if args.workers is not None:
        os.environ["WATCHER_WORKERS"] = str(max(1, args.workers))
    if args.mineru_device:
        os.environ["MINERU_DEVICE"] = args.mineru_device
    if args.mineru_backend:
        os.environ["MINERU_BACKEND"] = args.mineru_backend
    if args.mineru_python:
        os.environ["MINERU_PYTHON"] = args.mineru_python

    # Optional: seed files
    try:
        from . import UPLOAD_DIRS
    except Exception as e:  # pragma: no cover
        print(f"[ocr-worker] Failed to import UPLOAD_DIRS: {e}")
        sys.exit(1)

    if args.input_dir:
        src_dir = Path(args.input_dir)
        if src_dir.exists() and src_dir.is_dir():
            proc_dir = UPLOAD_DIRS["processing"]
            proc_dir.mkdir(parents=True, exist_ok=True)
            for p in sorted(list(src_dir.glob("*"))):
                if not p.is_file():
                    continue
                if p.suffix.lower() not in {".pdf", ".doc", ".docx", ".txt"}:
                    continue
                target = proc_dir / p.name
                # avoid overwrite
                if target.exists():
                    base, ext = target.stem, target.suffix
                    i = 1
                    while (proc_dir / f"{base}_{i}{ext}").exists():
                        i += 1
                    target = proc_dir / f"{base}_{i}{ext}"
                try:
                    target.write_bytes(p.read_bytes())
                    print(f"[ocr-worker] Seeded file into processing: {target.name}")
                except Exception as se:
                    print(f"[ocr-worker] Seed copy failed for {p}: {se}")
        else:
            print(f"[ocr-worker] --input-dir not found or not a directory: {args.input_dir}")

    # Start watcher (directory observer + DB pull loop)
    try:
        from .watcher import start_watcher_in_background
    except Exception as e:  # pragma: no cover
        print(f"[ocr-worker] Failed to import watcher: {e}")
        sys.exit(1)

    observer = start_watcher_in_background()
    print("[ocr-worker] Started. Press Ctrl+C to stop.")

    # Graceful shutdown
    stopping = False

    def _graceful_stop(signum, frame):  # type: ignore
        nonlocal stopping
        if stopping:
            return
        stopping = True
        try:
            observer.stop()
            observer.join(timeout=5)
        finally:
            print("[ocr-worker] Stopped.")
            sys.exit(0)

    try:
        signal.signal(signal.SIGINT, _graceful_stop)
        signal.signal(signal.SIGTERM, _graceful_stop)
    except Exception:
        # Windows may not support all signals
        pass

    # Keep alive
    while True:
        time.sleep(1.0)


if __name__ == "__main__":
    main()


