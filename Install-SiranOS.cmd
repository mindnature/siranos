@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo       SiranOS Windows One-Click Install

echo       Local Private Second Brain v0.5.1

echo ============================================
if not exist "%~dp0bridge\cli.mjs" (
  echo ERROR: Extract the complete ZIP before running this installer.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-SiranOS.ps1"
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" echo Installation needs attention. See errors above.
pause
exit /b %CODE%
