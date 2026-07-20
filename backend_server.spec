# -*- mode: python ; coding: utf-8 -*-
#
# OmniGene Studio — PyInstaller spec
#
# Paths are intentionally RELATIVE so the spec works on any machine.
# Run from the repo root:
#
#   pyinstaller --clean --distpath dist-backend backend_server.spec
#
# The produced dist-backend/backend_server.exe is then picked up by
# electron-builder as an extraResource.

import os, sys
from pathlib import Path

ROOT        = Path(".").resolve()          # repo root (cwd when running pyinstaller)
BACKEND_DIR = ROOT / "backend"
VENV_DIR    = BACKEND_DIR / ".venv"
DATASETS_DIR = ROOT / "datasets"

# ── OpenBabel shared libraries (wheel installs them here) ──────────────────
OBABEL_BIN = VENV_DIR / "Lib" / "site-packages" / "openbabel" / "bin"

# ── AutoDock Vina binary ────────────────────────────────────────────────────
VINA_EXE = BACKEND_DIR / "tools" / "vina" / "vina.exe"

# ── Collect binaries that must travel with the exe ─────────────────────────
binaries = []
if VINA_EXE.exists():
    binaries.append((str(VINA_EXE), "tools/vina"))

# ── Collect data files bundled inside the exe ──────────────────────────────
datas = []
if OBABEL_BIN.exists():
    datas.append((str(OBABEL_BIN), "tools/obabel"))

# JSON knowledge-base overrides ship inside the exe so they are always present
for fname in ("curated_overrides.json", "classifier_overrides.json"):
    src = BACKEND_DIR / fname
    if src.exists():
        datas.append((str(src), "."))

# pathways.db (local signaling cascade SQLite)
pathways_db = BACKEND_DIR / "pathways.db"
if pathways_db.exists():
    datas.append((str(pathways_db), "."))

# ── Hidden imports required by FastAPI / uvicorn / pandas ──────────────────
hidden = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "email.mime.text",
    "email.mime.multipart",
    "pyarrow",
    "pyarrow.vendored",
    "pandas",
]

a = Analysis(
    [str(BACKEND_DIR / "app.py")],
    pathex=[str(BACKEND_DIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "scipy", "IPython", "jupyter"],
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="backend_server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # ← NO console window shown to the end user
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,              # electron-builder provides the app icon
)
