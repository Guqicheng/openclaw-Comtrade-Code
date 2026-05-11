@echo off
chcp 65001 >nul
cd /d %~dp0
set "msg=%*"
if "%msg%"=="" (
    echo 用法: git-commit "提交信息"
    pause
    exit /b 1
)
git add -A
git commit -m "%msg%"
echo.
git status
