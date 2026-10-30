# PHOS clinic — build (optional) + start API, Web, Caddy.

# Run:  powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1"

#       powershell -ExecutionPolicy Bypass -File "E:\PHOS\scripts\phos-clinic.ps1" -StartOnly



param(

  [switch]$StartOnly,

  [switch]$BuildOnly,

  [switch]$WaitForDrive,

  [switch]$Confirm

)



$ErrorActionPreference = "Stop"

$ScriptsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }



. (Join-Path $ScriptsDir "phos-config.ps1")

. (Join-Path $ScriptsDir "phos-logging.ps1")

. (Join-Path $ScriptsDir "phos-orchestrate.ps1")



$cfg = Get-PhosConfig

$Frontend = $cfg.Frontend

$Backend = $cfg.Backend

$Standalone = Get-PhosStandaloneDirectory



function Build-PhosClinic {

  if (Test-Path (Join-Path $ScriptsDir "phos-deploy-frontend.ps1")) {

    if (-not $Confirm) {

      Write-Host "Full build requires phos-deploy-frontend.ps1 with -Confirm (Phase C). Running legacy in-tree build." -ForegroundColor Yellow

    } else {

      & (Join-Path $ScriptsDir "phos-deploy-frontend.ps1") -FullClinic -Confirm

      return

    }

  }

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

  npm run build -- --webpack

  Copy-Item -Recurse -Force public .next\standalone\public

  Copy-Item -Recurse -Force .next\static .next\standalone\.next\static

  Write-Host "=== Build complete ===" -ForegroundColor Green

}



function Start-PhosClinic {

  $wait = $WaitForDrive.IsPresent

  if (-not $wait -and -not $PSBoundParameters.ContainsKey('WaitForDrive')) {

    $wait = $true

  }

  $code = Start-PhosClinicOrchestrated -WaitForDrive:$wait

  if ($code -ne 0) { exit $code }

}



if ($BuildOnly -and $Confirm) {

  & (Join-Path $ScriptsDir "phos-deploy-frontend.ps1") -Confirm

  exit $LASTEXITCODE

}



if (-not $StartOnly) {

  Build-PhosClinic

}



if (-not $BuildOnly) {

  Start-PhosClinic

}


