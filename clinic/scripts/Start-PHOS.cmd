@echo off
title PHOS Start (no build)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0phos-clinic.ps1" -StartOnly
echo.
echo PHOS: 3 windows should open (API, Web, Caddy).
echo PostgreSQL should already be running (Windows service).
echo Staff browser: http://192.168.1.4/
echo Do NOT use http://localhost:3000
pause
