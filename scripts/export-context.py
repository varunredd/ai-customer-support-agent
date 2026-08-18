#!/usr/bin/env python3
"""Create a source-context ZIP without dependencies, secrets, build output, or runtime DB files."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "jobform-source-context.zip"
EXCLUDED_DIRS = {"node_modules", ".next", ".git", "out", "build", "coverage", ".idea", ".vscode"}
EXCLUDED_NAMES = {".DS_Store"}
EXCLUDED_SUFFIXES = {".db", ".db-shm", ".db-wal", ".log", ".zip"}


def git_files() -> list[Path] | None:
    try:
        result = subprocess.run(
            ["git", "ls-files", "-co", "--exclude-standard", "-z"],
            cwd=ROOT,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return [ROOT / raw.decode() for raw in result.stdout.split(b"\0") if raw]


def fallback_files() -> list[Path]:
    return [path for path in ROOT.rglob("*") if path.is_file()]


def include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDED_DIRS for part in rel.parts):
        return False
    if path.name in EXCLUDED_NAMES or path.suffix in EXCLUDED_SUFFIXES:
        return False
    if path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example"):
        return False
    return True


files = git_files() or fallback_files()
with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        if path.exists() and include(path):
            archive.write(path, path.relative_to(ROOT))

print(OUTPUT)
