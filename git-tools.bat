@echo off
chcp 65001 >nul
cd /d %~dp0

echo ========================================
echo   COMTRADE Viewer - Git 工具助手
echo ========================================
echo.
echo 1. 查看状态 (git status)
echo 2. 提交改动 (git add + commit)
echo 3. 创建分支 (git checkout -b)
echo 4. 合并分支 (git merge)
echo 5. 查看分支 (git branch)
echo 6. 推送远程 (git push)
echo 7. 退出
echo.

set /p choice="请选择操作 (1-7): "

if "%choice%"=="1" goto status
if "%choice%"=="2" goto commit
if "%choice%"=="3" goto branch
if "%choice%"=="4" goto merge
if "%choice%"=="5" goto showbranch
if "%choice%"=="6" goto push
if "%choice%"=="7" goto end

:status
    echo.
    git status
    goto end

:commit
    echo.
    set /p msg="输入提交信息: "
    git add -A
    git commit -m "%msg%"
    echo.
    git status
    goto end

:branch
    echo.
    set /p name="输入新分支名: "
    git checkout -b "%name%"
    goto end

:merge
    echo.
    git branch
    echo.
    set /p name="输入要合并的分支名: "
    git merge "%name%"
    goto end

:showbranch
    echo.
    git branch -a
    goto end

:push
    echo.
    set /p remote="输入远程名 (默认 origin): "
    if "%remote%"=="" set remote=origin
    set /p branch="输入分支名: "
    if "%branch%"=="" goto end
    git push %remote% %branch%
    goto end

:end
    echo.
    pause
