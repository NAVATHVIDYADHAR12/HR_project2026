@echo off
REM Double-click to start TalentDesk. Keep this window open while you use the app; close it to stop.
title TalentDesk
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org ^(version 22 or newer^) and try again. & pause & exit /b 1)
if not exist node_modules (
  echo First run: installing... this takes a minute.
  call npm install || (echo Install failed. & pause & exit /b 1)
)
echo Building the app...
call npx next build || (echo Build failed. & pause & exit /b 1)
REM Open the browser a moment after the server starts.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:5174"
echo.
echo TalentDesk is running at http://127.0.0.1:5174
echo Keep this window open. Close it to stop TalentDesk.
echo.
call npx next start -p 5174 -H 127.0.0.1
pause
