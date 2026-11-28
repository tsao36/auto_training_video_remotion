@echo off
setlocal
cd /d "%~dp0"
title Remotion Tech Training Studio

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-single-vite.ps1"

rem Vite selects a port normally, or uses PORT when provided. open=true lets Vite open the actual address.
set "open=true"

echo Starting Remotion Tech Training Studio (Web + API + BlueMagpie-TTS). Press Ctrl+C to stop.
call npm run dev

pause
