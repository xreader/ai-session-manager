@echo off
REM Stops the Claude Session Manager (whatever listens on port 4317).
setlocal
set FOUND=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4317" ^| findstr LISTENING') do (
  echo Stopping PID %%a ...
  taskkill /PID %%a /F >nul 2>&1
  set FOUND=1
)
if not defined FOUND echo No server running on port 4317.
echo Done.
timeout /t 2 >nul
