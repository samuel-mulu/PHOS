@echo off
title PHOS Frontend Build Only
cd /d E:\PHOS\PHOS-Frontend
set NEXT_PUBLIC_API_URL=/api/v1
call npm run build -- --webpack
if errorlevel 1 (
  echo Build FAILED.
  pause
  exit /b 1
)
xcopy /E /I /Y public .next\standalone\public
xcopy /E /I /Y .next\static .next\standalone\.next\static
echo.
echo Build OK. Now run Start-PHOS.cmd
pause
