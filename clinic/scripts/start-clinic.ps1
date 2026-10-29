# Clinic server: E:\PHOS\scripts\start-clinic.ps1 (copy from repo clinic\scripts\)
$ErrorActionPreference = "Stop"

$Backend    = "E:\PHOS\PHOS"
$Frontend   = "E:\PHOS\PHOS-frontend"
$GatewayDir = "E:\PHOS\nginx"
$CaddyExe   = "E:\PHOS\bin\caddy.exe"
$Standalone = Join-Path $Frontend ".next\standalone"

if (-not (Test-Path (Join-Path $Standalone "server.js"))) {
  Write-Error "Run build-clinic.ps1 first."
}
if (-not (Test-Path (Join-Path $GatewayDir "Caddyfile"))) {
  Write-Error "Copy clinic\nginx\Caddyfile to E:\PHOS\nginx\"
}

Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$Backend'; Write-Host 'PHOS API :4001' -ForegroundColor Green; npm run start:render"
)
Start-Sleep -Seconds 4

Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$Standalone'; `$env:HOSTNAME='127.0.0.1'; `$env:PORT='3000'; Write-Host 'PHOS Web' -ForegroundColor Green; node server.js"
)
Start-Sleep -Seconds 2

Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$GatewayDir'; Write-Host 'PHOS Gateway :80' -ForegroundColor Green; & '$CaddyExe' run --config Caddyfile"
)

Write-Host "Staff: http://192.168.1.9/" -ForegroundColor Green
