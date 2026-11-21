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

rem Web UI is on 5173, API on 3001, BlueMagpie-TTS on 8001; open the browser once Vite has had time to start.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:5173/"

echo Starting Remotion Tech Training Studio (Web + API + BlueMagpie-TTS). Press Ctrl+C to stop.
call npm run dev

pause
