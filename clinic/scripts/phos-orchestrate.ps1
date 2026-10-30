# PHOS clinic — idempotent startup orchestration (Phase A)
. "$PSScriptRoot\phos-config.ps1"
. "$PSScriptRoot\phos-logging.ps1"
. "$PSScriptRoot\phos-build-verify.ps1"
. "$PSScriptRoot\phos-process.ps1"
. "$PSScriptRoot\phos-readiness.ps1"

function Start-PhosClinicOrchestrated {
  param(
    [switch]$WaitForDrive
  )
  Set-PhosLogChannel -Name "orchestrate"
  Invoke-PhosLogRetention
  Initialize-PhosDirectories
  $cfg = Get-PhosConfig
  $exitCode = 0

  if ($WaitForDrive) {
    if (-not (Wait-PhosClinicRoot -MaxWaitSec $cfg.DriveWaitSec)) {
      return 1
    }
  } elseif (-not (Test-Path $cfg.PhosRoot)) {
    Write-PhosLog -Level ERROR -Component "orchestrate" -Event "missing_root" -Message "PHOS root missing"
    return 1
  }

  if (-not (Enter-PhosOrchestrateMutex)) {
    return 1
  }

  try {
    $standalone = Get-PhosStandaloneDirectory
    Write-PhosLog -Level INFO -Component "orchestrate" -Event "start" -Message "Orchestration started" -Data @{
      standaloneDir = $standalone
      user          = $env:USERNAME
      computer      = $env:COMPUTERNAME
    }

    if (-not (Test-Path (Join-Path $cfg.GatewayDir "Caddyfile"))) {
      Write-PhosLog -Level ERROR -Component "caddy" -Event "preflight_fail" -Message "Missing Caddyfile"
      return 1
    }
    if (-not (Test-Path $cfg.CaddyExe)) {
      Write-PhosLog -Level ERROR -Component "caddy" -Event "preflight_fail" -Message "Missing caddy.exe"
      return 1
    }

    $webIntegrity = Test-PhosWebStandaloneIntegrity -StandaloneDir $standalone
    if (-not $webIntegrity.Ok) {
      Set-PhosDegradedState -Code "WEB_INTEGRITY_FAIL" -Reason "Web standalone failed integrity check" -Extra @{
        errors = ($webIntegrity.Errors -join "; ")
      }
      Write-PhosLog -Level ERROR -Component "web" -Event "integrity_fail" -Message ($webIntegrity.Errors -join "; ")
    } else {
      $deg = Get-PhosDegradedState
      if ($deg -and $deg.code -eq "WEB_INTEGRITY_FAIL") {
        Clear-PhosDegradedState
      }
    }

    # --- API ---
    $apiPortStatus = Test-PhosOwnedComponentOnPort -Component "api" -Port $cfg.ApiPort
    if ($apiPortStatus.Foreign) {
      Set-PhosDegradedState -Code "FOREIGN_PROCESS" -Reason "Foreign process on API port" -Extra @{ port = $cfg.ApiPort; pid = $apiPortStatus.Pid }
      Write-PhosLog -Level ERROR -Component "api" -Event "foreign_process" -Message "Port $($cfg.ApiPort) in use by non-PHOS process" -Data @{ pid = $apiPortStatus.Pid }
      $exitCode = 1
    } elseif ((Test-PhosComponentHealthy -Component "api") -and ($apiPortStatus.Owned -or $apiPortStatus.Listening)) {
      Write-PhosLog -Level INFO -Component "api" -Event "already_healthy" -Message "Skipping API start"
    } elseif ($apiPortStatus.Listening -and (Test-PhosCommandLineMatchesComponent -Component "api" -CommandLine $apiPortStatus.CommandLine)) {
      Write-PhosLog -Level WARN -Component "api" -Event "unhealthy_existing" -Message "PHOS-like API on port but health failed; not starting duplicate"
      Register-PhosComponentFromPort -Component "api" -Port $cfg.ApiPort | Out-Null
      $exitCode = 1
    } else {
      if (-not (Test-PhosPostgresRunning)) {
        Set-PhosDegradedState -Code "POSTGRES_DOWN" -Reason "PostgreSQL service not running"
        Write-PhosLog -Level ERROR -Component "api" -Event "postgres_down" -Message "Will not start API until PostgreSQL is running"
        $exitCode = 1
      } else {
        Write-PhosLog -Level INFO -Component "api" -Event "starting" -Message "Starting API"
        Start-PhosApiProcess
        Register-PhosComponentFromPort -Component "api" -Port $cfg.ApiPort | Out-Null
        if (-not (Wait-PhosComponentReadiness -Component "api")) {
          $exitCode = 1
        }
      }
    }

    # --- Web ---
    $webPortStatus = Test-PhosOwnedComponentOnPort -Component "web" -Port $cfg.WebPort
    if ($webPortStatus.Foreign) {
      Set-PhosDegradedState -Code "FOREIGN_PROCESS" -Reason "Foreign process on web port" -Extra @{ port = $cfg.WebPort; pid = $webPortStatus.Pid }
      Write-PhosLog -Level ERROR -Component "web" -Event "foreign_process" -Message "Port $($cfg.WebPort) in use by non-PHOS process" -Data @{ pid = $webPortStatus.Pid }
      $exitCode = 1
    } elseif (-not $webIntegrity.Ok) {
      Write-PhosLog -Level WARN -Component "web" -Event "start_skipped" -Message "Web not started due to integrity failure"
    } elseif ((Test-PhosComponentHealthy -Component "web") -and ($webPortStatus.Owned -or $webPortStatus.Listening)) {
      Write-PhosLog -Level INFO -Component "web" -Event "already_healthy" -Message "Skipping web start"
      Register-PhosComponentFromPort -Component "web" -Port $cfg.WebPort -StandaloneDir $standalone | Out-Null
    } elseif ($webPortStatus.Listening -and (Test-PhosCommandLineMatchesComponent -Component "web" -CommandLine $webPortStatus.CommandLine)) {
      Write-PhosLog -Level WARN -Component "web" -Event "unhealthy_existing" -Message "PHOS-like web on port but health failed; not starting duplicate"
      Register-PhosComponentFromPort -Component "web" -Port $cfg.WebPort -StandaloneDir $standalone | Out-Null
      $exitCode = 1
    } else {
      Write-PhosLog -Level INFO -Component "web" -Event "starting" -Message "Starting web"
      Start-PhosWebProcess -StandaloneDir $standalone
      Register-PhosComponentFromPort -Component "web" -Port $cfg.WebPort -StandaloneDir $standalone | Out-Null
      if (-not (Wait-PhosComponentReadiness -Component "web")) {
        $exitCode = 1
      }
    }

    # --- Caddy ---
    $webHealthy = Test-PhosComponentHealthy -Component "web"
    if (-not $webHealthy -and -not $cfg.CaddyWhenWebDown) {
      Write-PhosLog -Level WARN -Component "caddy" -Event "start_skipped" -Message "Caddy not started because web is not healthy"
    } else {
      $caddyPortStatus = Test-PhosOwnedComponentOnPort -Component "caddy" -Port $cfg.GatewayPort
      if ($caddyPortStatus.Foreign) {
        Set-PhosDegradedState -Code "FOREIGN_PROCESS" -Reason "Foreign process on gateway port" -Extra @{ port = $cfg.GatewayPort; pid = $caddyPortStatus.Pid }
        Write-PhosLog -Level ERROR -Component "caddy" -Event "foreign_process" -Message "Port $($cfg.GatewayPort) in use by non-PHOS process" -Data @{ pid = $caddyPortStatus.Pid }
        $exitCode = 1
      } elseif ((Test-PhosComponentHealthy -Component "caddy") -and ($caddyPortStatus.Owned -or $caddyPortStatus.Listening)) {
        Write-PhosLog -Level INFO -Component "caddy" -Event "already_healthy" -Message "Skipping Caddy start"
      } elseif ($caddyPortStatus.Listening -and (Test-PhosCommandLineMatchesComponent -Component "caddy" -CommandLine $caddyPortStatus.CommandLine)) {
        Write-PhosLog -Level WARN -Component "caddy" -Event "unhealthy_existing" -Message "PHOS-like Caddy on port but health failed; not starting duplicate"
        Register-PhosComponentFromPort -Component "caddy" -Port $cfg.GatewayPort | Out-Null
        $exitCode = 1
      } else {
        Write-PhosLog -Level INFO -Component "caddy" -Event "starting" -Message "Starting Caddy"
        Start-PhosCaddyProcess
        Register-PhosComponentFromPort -Component "caddy" -Port $cfg.GatewayPort | Out-Null
        if (-not (Wait-PhosComponentReadiness -Component "caddy")) {
          $exitCode = 1
        }
        if (-not (Wait-PhosComponentReadiness -Component "caddy_api")) {
          Write-PhosLog -Level WARN -Component "caddy" -Event "caddy_api_probe_fail" -Message "Gateway API path probe failed"
        }
      }
    }

    if ($exitCode -eq 0 -and (Test-PhosApiHealth) -and (Test-PhosWebLogin) -and (Test-PhosCaddyLogin)) {
      Clear-PhosDegradedState
      Write-PhosLog -Level INFO -Component "orchestrate" -Event "complete" -Message "Orchestration completed successfully"
      Write-Host "Staff browser: http://$($cfg.LanIpHint)/" -ForegroundColor Green
    } else {
      Write-PhosLog -Level WARN -Component "orchestrate" -Event "complete_degraded" -Message "Orchestration finished with issues; see logs and state\degraded.json"
      Write-Host "PHOS started with issues. Check E:\PHOS\logs and phos-clinic-check.ps1" -ForegroundColor Yellow
    }

    return $exitCode
  } finally {
    Exit-PhosOrchestrateMutex
  }
}
