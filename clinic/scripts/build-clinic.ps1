# Clinic server: E:\PHOS\scripts\build-clinic.ps1 (copy from repo clinic\scripts\)
$ErrorActionPreference = "Stop"

$Backend  = "E:\PHOS\PHOS"
$Frontend = "E:\PHOS\PHOS-frontend"

Write-Host "=== PHOS build: backend ===" -ForegroundColor Cyan
Set-Location $Backend
if (Test-Path "package-lock.json") { npm ci }
npm run prisma:generate
npm run prisma:deploy
npm run build

Write-Host "=== PHOS build: frontend (/api/v1) ===" -ForegroundColor Cyan
Set-Location $Frontend
if (Test-Path "package-lock.json") { npm ci }
$env:NEXT_PUBLIC_API_URL = "/api/v1"
npm run build
Copy-Item -Recurse -Force public .next\standalone\public
Copy-Item -Recurse -Force .next\static .next\standalone\.next\static

Write-Host "=== Done. Run E:\PHOS\scripts\start-clinic.ps1 ===" -ForegroundColor Green
