@echo off
chcp 65001 >nul
cd /d %~dp0

if "%1"=="" (
    echo 用法: git-push "提交信息"
    echo 示例: git-push "fix: 修复异常捕获"
    exit /b 1
)

echo 正在通过 WSL2 提交并推送到 GitHub...
wsl bash git-push-wsl.sh "%*"

echo.
pause
