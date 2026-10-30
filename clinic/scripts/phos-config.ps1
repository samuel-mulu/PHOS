# PHOS clinic — shared configuration (edit paths for clinic PC)
$script:PhosConfig = @{
  PhosRoot       = "E:\PHOS"
  Backend        = "E:\PHOS\PHOS"
  Frontend       = "E:\PHOS\PHOS-Frontend"
  GatewayDir     = "E:\PHOS\nginx"
  CaddyExe       = "E:\PHOS\bin\caddy.exe"
  LanIpHint      = "192.168.1.4"
  LogsDir        = "E:\PHOS\logs"
  RunDir         = "E:\PHOS\run"
  StateDir       = "E:\PHOS\state"
  ReleasesDir    = "E:\PHOS\releases\frontend"
  ApiPort        = 4001
  WebPort        = 3000
  GatewayPort    = 80
  ApiHealthPath  = "/api/v1/health"
  WebProbePath   = "/login"
  MutexName      = "Global\PHOS-Clinic-Orchestrate"
  DeployLockName = "Global\PHOS-Clinic-Deploy"
  MutexWaitSec   = 120
  DriveWaitSec   = 300
  ReadinessInitialMs = 500
  ReadinessMaxMs     = 8000
  ReadinessAttempts  = 12
  LogRetentionDays   = 30
  ShowConsoleWindows = $true
  CaddyWhenWebDown   = $false
  SupervisorMaxRestartsPerHour = 2
  SupervisorStrikeIntervalSec  = 30
}

function Get-PhosConfig {
  return $script:PhosConfig
}

function Get-PhosStandaloneDirectory {
  $cfg = Get-PhosConfig
  $legacy = Join-Path $cfg.Frontend ".next\standalone"
  $stateFile = Join-Path $cfg.StateDir "current-frontend-release.json"
  if (-not (Test-Path $stateFile)) {
    return $legacy
  }
  try {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($state.standaloneDir -and (Test-Path (Join-Path $state.standaloneDir "server.js"))) {
      return $state.standaloneDir
    }
  } catch { }
  return $legacy
}

function Initialize-PhosDirectories {
  $cfg = Get-PhosConfig
  foreach ($dir in @($cfg.LogsDir, $cfg.RunDir, $cfg.StateDir, $cfg.ReleasesDir)) {
    if (-not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
  }
}

function Get-PhosScriptsDirectory {
  if ($PSScriptRoot) { return $PSScriptRoot }
  return Split-Path -Parent $MyInvocation.MyCommand.Path
}
