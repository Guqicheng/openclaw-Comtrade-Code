@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "venv\Scripts\python.exe" (
  venv\Scripts\python.exe -c "import sys; print(sys.version)" >nul 2>&1
  if errorlevel 1 (
    echo 检测到旧 venv 已损坏，正在备份并重建...
    ren venv venv.broken
  )
)

if not exist "venv\Scripts\python.exe" (
  echo 正在创建虚拟环境...
  python -m venv venv
)

call venv\Scripts\activate.bat
pip show Flask >nul 2>&1
if errorlevel 1 (
  echo 正在安装依赖...
  pip install -r requirements.txt
)

echo.
echo test1.2 启动中 → http://127.0.0.1:7000
echo.
python -m backend.app
pause
