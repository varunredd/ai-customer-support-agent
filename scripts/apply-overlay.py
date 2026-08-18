#!/usr/bin/env python3
"""Apply a later phase overlay ZIP into this repository root."""
from __future__ import annotations

import sys
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/apply-overlay.py <phase-overlay.zip>")

archive_path = Path(sys.argv[1]).expanduser().resolve()
if not archive_path.exists():
    raise SystemExit(f"Overlay not found: {archive_path}")

with ZipFile(archive_path) as archive:
    for member in archive.infolist():
        destination = (ROOT / member.filename).resolve()
        if ROOT != destination and ROOT not in destination.parents:
            raise SystemExit(f"Unsafe ZIP member: {member.filename}")
    archive.extractall(ROOT)

print(f"Applied {archive_path.name} to {ROOT}")
