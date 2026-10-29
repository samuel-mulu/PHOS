# PHOS clinic — one file: build (optional) + start API, Web, Caddy.
# Run:  powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1"
#       powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1" -StartOnly

param(
  [switch]$StartOnly,
  [switch]$BuildOnly
)

# ========== EDIT PATHS HERE (clinic server only) ==========
$Backend    = "E:\PHOS\PHOS"
$Frontend   = "E:\PHOS\PHOS-frontend"
$GatewayDir = "E:\PHOS\nginx"
$CaddyExe   = "E:\PHOS\bin\caddy.exe"
$LanIpHint  = "192.168.1.9"
# ===========================================================

$ErrorActionPreference = "Stop"
$Standalone = Join-Path $Frontend ".next\standalone"

function Build-PhosClinic {
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
  Write-Host "=== Build complete ===" -ForegroundColor Green
}

function Start-PhosClinic {
  if (-not (Test-Path (Join-Path $Standalone "server.js"))) {
    Write-Error "Missing $Standalone\server.js — run without -StartOnly first."
  }
  if (-not (Test-Path (Join-Path $GatewayDir "Caddyfile"))) {
    Write-Error "Missing $GatewayDir\Caddyfile — copy from PHOS repo clinic\nginx\"
  }
  if (-not (Test-Path $CaddyExe)) {
    Write-Error "Missing $CaddyExe"
  }

  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Backend'; Write-Host 'PHOS API :4001' -ForegroundColor Green; npm run start:render"
  )
  Start-Sleep -Seconds 4

  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Standalone'; `$env:HOSTNAME='127.0.0.1'; `$env:PORT='3000'; Write-Host 'PHOS Web :3000' -ForegroundColor Green; node server.js"
  )
  Start-Sleep -Seconds 2

  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$GatewayDir'; Write-Host 'PHOS Gateway :80' -ForegroundColor Green; & '$CaddyExe' run --config Caddyfile"
  )

  Write-Host "Staff browser: http://${LanIpHint}/" -ForegroundColor Green
}

if (-not $StartOnly) {
  Build-PhosClinic
}

if (-not $BuildOnly) {
  Start-PhosClinic
}
