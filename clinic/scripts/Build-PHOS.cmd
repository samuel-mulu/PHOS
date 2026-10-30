@echo off
title PHOS Build and Start
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0phos-clinic.ps1"
echo.
echo Done. If errors appeared above, fix before using Start-PHOS.cmd.
pause
