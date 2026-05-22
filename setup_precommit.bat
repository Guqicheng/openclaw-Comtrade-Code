@echo off
cd /d "%~dp0"
echo Installing pre-commit hooks...
python -m pre_commit install
if errorlevel 1 (
  echo Failed. Try: pip install pre-commit
  exit /b 1
)
echo OK. Use: python -m pre_commit run --all-files
exit /b 0
