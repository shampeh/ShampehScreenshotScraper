@echo off
title KILL NODE
taskkill /F /IM node.exe
echo.
echo All node processes killed.
timeout /t 2 >nul
