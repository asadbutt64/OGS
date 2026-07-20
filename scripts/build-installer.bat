@echo off
:: =============================================================================
::  OmniGene Studio — Windows Installer Build Script
::  Run this from the repo root (the folder containing package.json).
::
::  Prerequisites (install once):
::    Node.js  >=18        https://nodejs.org/
::    Python   3.10–3.12   https://www.python.org/
::    The backend venv already set up:
::      cd backend
::      python -m venv .venv
::      .venv\Scripts\pip install -r requirements.txt
::
::  Output:
::    dist-package\OmniGene-Studio-Setup-1.0.0.exe
:: =============================================================================
setlocal enabledelayedexpansion
title OmniGene Studio — Build Installer

:: ── Colour helpers ──────────────────────────────────────────────────────────
set "GREEN=[92m"
set "RED=[91m"
set "CYAN=[96m"
set "RESET=[0m"

echo.
echo %CYAN%╔══════════════════════════════════════════════════════╗%RESET%
echo %CYAN%║      OmniGene Studio  —  Build Windows Installer     ║%RESET%
echo %CYAN%╚══════════════════════════════════════════════════════╝%RESET%
echo.

:: ── 0. Sanity checks ────────────────────────────────────────────────────────
where node >nul 2>&1 || (echo %RED%ERROR: Node.js is not on PATH. Install from https://nodejs.org/%RESET% & exit /b 1)
where python >nul 2>&1 || (echo %RED%ERROR: Python is not on PATH. Install from https://www.python.org/%RESET% & exit /b 1)
where pyinstaller >nul 2>&1 || (
    echo %RED%ERROR: pyinstaller not found on PATH.%RESET%
    echo        Activate the backend venv first:
    echo          backend\.venv\Scripts\activate
    echo        or install globally:
    echo          pip install pyinstaller
    exit /b 1
)

if not exist "package.json" (
    echo %RED%ERROR: Run this script from the repo root (the folder containing package.json).%RESET%
    exit /b 1
)

:: ── 1. Install / update Node dependencies ───────────────────────────────────
echo %CYAN%[1/5] Installing Node dependencies...%RESET%
call npm install --prefer-offline
if errorlevel 1 (echo %RED%npm install failed%RESET% & exit /b 1)
echo %GREEN%  OK%RESET%

:: ── 2. Generate application icon ────────────────────────────────────────────
echo %CYAN%[2/5] Generating icon (build\icon.ico)...%RESET%
python scripts\make_icon.py
if errorlevel 1 (echo %RED%Icon generation failed%RESET% & exit /b 1)
echo %GREEN%  OK%RESET%

:: ── 3. Build the React frontend ─────────────────────────────────────────────
echo %CYAN%[3/5] Building React frontend (tsc + vite build)...%RESET%
call node node_modules\typescript\bin\tsc --noEmit
if errorlevel 1 (echo %RED%TypeScript check failed. Fix type errors first.%RESET% & exit /b 1)
call node node_modules\.bin\vite build
if errorlevel 1 (echo %RED%Vite build failed%RESET% & exit /b 1)
echo %GREEN%  OK — dist\ ready%RESET%

:: ── 4. Build the Python backend with PyInstaller ────────────────────────────
echo %CYAN%[4/5] Building Python backend (PyInstaller)...%RESET%
echo        This may take 2–5 minutes. The backend venv must be active.
echo.
pyinstaller --clean --distpath dist-backend backend_server.spec
if errorlevel 1 (echo %RED%PyInstaller build failed%RESET% & exit /b 1)
if not exist "dist-backend\backend_server.exe" (
    echo %RED%ERROR: dist-backend\backend_server.exe was not produced.%RESET%
    exit /b 1
)
echo %GREEN%  OK — dist-backend\backend_server.exe ready%RESET%

:: ── 5. Package with electron-builder (NSIS installer) ───────────────────────
echo %CYAN%[5/5] Building NSIS installer (electron-builder)...%RESET%
call node node_modules\.bin\electron-builder --win nsis
if errorlevel 1 (echo %RED%electron-builder failed%RESET% & exit /b 1)

:: ── Done ────────────────────────────────────────────────────────────────────
echo.
echo %GREEN%══════════════════════════════════════════════════════%RESET%
echo %GREEN%  BUILD COMPLETE!%RESET%
echo.
for /r "dist-package" %%f in (*-Setup-*.exe) do (
    echo %GREEN%  Installer: %%f%RESET%
)
echo %GREEN%══════════════════════════════════════════════════════%RESET%
echo.
echo  Share the .exe with end-users. It installs OmniGene Studio
echo  fully offline and adds a Start Menu and Desktop shortcut.
echo.
pause
