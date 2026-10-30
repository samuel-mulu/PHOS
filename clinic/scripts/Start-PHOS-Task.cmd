@echo off
title PHOS Start (Task Scheduler, no pause)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0phos-clinic.ps1" -StartOnly
exit /b %ERRORLEVEL%
