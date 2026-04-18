@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

if not exist "%ROOT%\.venv\Scripts\python.exe" (
  echo Python virtual environment not found in "%ROOT%\.venv".
  echo Create it with: py -m venv .venv
  echo Then install dependencies with: .venv\Scripts\python.exe -m pip install -r requirements.txt
  pause
  exit /b 1
)

echo Starting backend and frontend...
start "BACKEND" cmd /k "cd /d %ROOT% && .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "FRONTEND" cmd /k "cd /d %ROOT%\frontend && npm.cmd run dev -- --host 0.0.0.0 --port 5173"

echo Done.
