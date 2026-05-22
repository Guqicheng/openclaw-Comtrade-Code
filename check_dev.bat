@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "venv\Scripts\python.exe" (
  venv\Scripts\python.exe -c "import sys; print(sys.version)" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] 当前 venv 已损坏，请先运行 start_dev.bat 自动重建
    pause
    exit /b 1
  )
) else (
  echo [ERROR] 未找到 venv，请先运行 start_dev.bat
  pause
  exit /b 1
)

call venv\Scripts\activate.bat

echo [1/3] 检查 Flask 应用导入...
python -c "from backend.app import create_app; app=create_app(); print('routes:', len(list(app.url_map.iter_rules())))"
if errorlevel 1 goto fail

echo [2/3] 检查 COMTRADE 解析模块导入...
python -c "from comtrade_parser.parser import parse_metadata; print('parser ok')"
if errorlevel 1 goto fail

echo [3/3] 检查后端核心模块导入...
python -c "from backend.analysis import calculate_rms, detect_peaks, calculate_fft, calculate_phase_difference; print('analysis ok')"
if errorlevel 1 goto fail

echo.
echo [OK] 开发环境检查通过
pause
exit /b 0

:fail
echo.
echo [ERROR] 检查失败，请查看上方错误信息
pause
exit /b 1
