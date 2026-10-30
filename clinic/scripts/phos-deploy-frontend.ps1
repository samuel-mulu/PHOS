# PHOS clinic — safe frontend release deploy (Phase C, manual only)
param(
  [switch]$Confirm,
  [switch]$FullClinic,
  [string]$ReleaseId = ""
)

$ErrorActionPreference = "Stop"
$ScriptsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
. (Join-Path $ScriptsDir "phos-config.ps1")
. (Join-Path $ScriptsDir "phos-logging.ps1")
. (Join-Path $ScriptsDir "phos-build-verify.ps1")
. (Join-Path $ScriptsDir "phos-process.ps1")
. (Join-Path $ScriptsDir "phos-readiness.ps1")

Set-PhosLogChannel -Name "deploy"
Initialize-PhosDirectories
$cfg = Get-PhosConfig

if (-not $Confirm) {
  Write-Host "Deploy requires -Confirm. This will build and may stop the owned web process during switch." -ForegroundColor Yellow
  exit 1
}

$lockFile = Join-Path $cfg.RunDir "deploy.inprogress"
$deployMutex = $null

function Enter-PhosDeployLock {
  $created = $false
  $script:deployMutex = New-Object System.Threading.Mutex($false, $cfg.DeployLockName, [ref]$created)
  if (-not $script:deployMutex.WaitOne([TimeSpan]::FromSeconds(30))) {
    throw "Could not acquire deploy lock"
  }
  Set-Content -Path $lockFile -Value (Get-Date).ToUniversalTime().ToString("o") -Encoding UTF8
}

function Exit-PhosDeployLock {
  if (Test-Path $lockFile) { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
  if ($script:deployMutex) {
    try { $script:deployMutex.ReleaseMutex() } catch { }
    try { $script:deployMutex.Dispose() } catch { }
  }
}

try {
  Enter-PhosDeployLock

  if ($FullClinic) {
    Write-Host "=== PHOS build: backend ===" -ForegroundColor Cyan
    Set-Location $cfg.Backend
    if (Test-Path "package-lock.json") { npm ci }
    npm run prisma:generate
    npm run prisma:deploy
    npm run build
  }

  if (-not $ReleaseId) {
    $ReleaseId = Get-Date -Format "yyyyMMdd-HHmmss"
  }

  $releaseRoot = Join-Path $cfg.ReleasesDir $ReleaseId
  $targetStandalone = Join-Path $releaseRoot "standalone"
  New-Item -ItemType Directory -Path $targetStandalone -Force | Out-Null

  Write-Host "=== PHOS build: frontend (/api/v1) ===" -ForegroundColor Cyan
  Set-Location $cfg.Frontend
  if (-not $FullClinic -and (Test-Path "package-lock.json")) { npm ci }
  $env:NEXT_PUBLIC_API_URL = "/api/v1"
  npm run build -- --webpack
  Copy-Item -Recurse -Force public .next\standalone\public
  Copy-Item -Recurse -Force .next\static .next\standalone\.next\static

  $staging = Join-Path $cfg.Frontend ".next\standalone"
  Write-PhosLog -Level INFO -Component "deploy" -Event "copy_release" -Message "Copying standalone to release folder" -Data @{ releaseId = $ReleaseId }
  & robocopy $staging $targetStandalone /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed with exit code $LASTEXITCODE"
  }

  $integrity = Test-PhosWebStandaloneIntegrity -StandaloneDir $targetStandalone
  if (-not $integrity.Ok) {
    throw "Release failed integrity: $($integrity.Errors -join '; ')"
  }

  $gitSha = ""
  Push-Location $cfg.Frontend
  try { $gitSha = (git rev-parse --short HEAD 2>$null) } catch { }
  Pop-Location

  $manifest = @{
    releaseId   = $ReleaseId
    builtAt     = (Get-Date).ToUniversalTime().ToString("o")
    gitSha      = $gitSha
    standaloneDir = $targetStandalone
  }
  $manifest | ConvertTo-Json | Set-Content (Join-Path $releaseRoot "release-manifest.json") -Encoding UTF8

  $stateFile = Join-Path $cfg.StateDir "current-frontend-release.json"
  $previousId = ""
  if (Test-Path $stateFile) {
    try {
      $prev = Get-Content $stateFile -Raw | ConvertFrom-Json
      $previousId = [string]$prev.releaseId
    } catch { }
  }

  $activeBefore = Get-PhosStandaloneDirectory
  $webStatus = Test-PhosOwnedComponentOnPort -Component "web" -Port $cfg.WebPort
  if ($webStatus.Owned -and $webStatus.Listening) {
    Write-PhosLog -Level INFO -Component "deploy" -Event "stop_web" -Message "Stopping owned web for release switch"
    Stop-PhosOwnedComponent -Component "web" | Out-Null
  }

  $newState = @{
    releaseId          = $ReleaseId
    standaloneDir      = $targetStandalone
    previousReleaseId  = $previousId
    activatedAt        = (Get-Date).ToUniversalTime().ToString("o")
  }
  $newState | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8

  Start-PhosWebProcess -StandaloneDir $targetStandalone
  Register-PhosComponentFromPort -Component "web" -Port $cfg.WebPort -StandaloneDir $targetStandalone | Out-Null
  if (-not (Wait-PhosComponentReadiness -Component "web")) {
    Write-PhosLog -Level ERROR -Component "deploy" -Event "rollback" -Message "New release failed readiness; rolling back"
    if ($previousId) {
      $rollbackDir = Join-Path $cfg.ReleasesDir "$previousId\standalone"
      if (-not (Test-Path (Join-Path $rollbackDir "server.js"))) {
        $rollbackDir = $activeBefore
      }
      Stop-PhosOwnedComponent -Component "web" | Out-Null
      @{
        releaseId     = $previousId
        standaloneDir = $rollbackDir
        activatedAt   = (Get-Date).ToUniversalTime().ToString("o")
      } | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8
      Start-PhosWebProcess -StandaloneDir $rollbackDir
      Register-PhosComponentFromPort -Component "web" -Port $cfg.WebPort -StandaloneDir $rollbackDir | Out-Null
    }
    throw "Deploy verification failed; rolled back if previous release available"
  }

  Write-PhosLog -Level INFO -Component "deploy" -Event "success" -Message "Deploy completed" -Data @{ releaseId = $ReleaseId }
  Write-Host "=== Deploy complete: $ReleaseId ===" -ForegroundColor Green
} finally {
  Exit-PhosDeployLock
}
