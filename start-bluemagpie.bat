@echo off
setlocal
cd /d "%~dp0"
title OpenFormosa BlueMagpie-TTS Server (127.0.0.1:8001)

set "PYTHON_EXE="
if exist ".venv312\Scripts\python.exe" set "PYTHON_EXE=.venv312\Scripts\python.exe"
if "%PYTHON_EXE%"=="" if exist "..\bluemagpie_project\.venv312\Scripts\python.exe" set "PYTHON_EXE=..\bluemagpie_project\.venv312\Scripts\python.exe"
if "%PYTHON_EXE%"=="" if exist "C:\whisper_ov\.venv312\Scripts\python.exe" set "PYTHON_EXE=C:\whisper_ov\.venv312\Scripts\python.exe"

if "%PYTHON_EXE%"=="" (
  echo Creating Python 3.12 virtual environment at .venv312...
  py -3.12 -m venv .venv312
  if errorlevel 1 (
    echo [ERROR] Python 3.12 was not found. BlueMagpie-TTS requires Python 3.10-3.12.
    pause
    exit /b 1
  )
  set "PYTHON_EXE=.venv312\Scripts\python.exe"
)

"%PYTHON_EXE%" -c "import bluemagpie, soundfile" >nul 2>nul
if errorlevel 1 (
  echo Installing OpenFormosa/BlueMagpie-TTS dependencies...
  if exist "..\bluemagpie_project\BlueMagpie-TTS\pyproject.toml" (
    "%PYTHON_EXE%" -m pip install -e "..\bluemagpie_project\BlueMagpie-TTS[clone]" soundfile
  ) else (
    "%PYTHON_EXE%" -m pip install "git+https://github.com/OpenFormosa/BlueMagpie-TTS.git" soundfile speechbrain
  )
  if errorlevel 1 (
    echo [ERROR] Failed to install BlueMagpie-TTS dependencies.
    pause
    exit /b 1
  )
)

set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"

echo Starting OpenFormosa BlueMagpie-TTS server on http://127.0.0.1:8001 ...
"%PYTHON_EXE%" server\bluemagpie_server.py --host 127.0.0.1 --port 8001
pause
