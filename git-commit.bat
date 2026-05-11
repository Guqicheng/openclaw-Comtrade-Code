@echo off
chcp 65001 >nul
cd /d %~dp0
git add -A
git commit -m "%*"
echo.
git status
