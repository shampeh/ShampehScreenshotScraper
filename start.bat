@echo off
title Shampeh Screenshot Scraper
cd /d "%~dp0"

REM kill any stale node processes holding the port
taskkill /F /IM node.exe >nul 2>&1

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting Shampeh Screenshot Scraper on http://localhost:3847
echo.
start "" "http://localhost:3847"
node server.js
pause
