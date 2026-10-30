# PHOS clinic — lightweight health supervisor (Phase B) — run with -Once per scheduled tick
param([switch]$Once)

$ScriptsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
. (Join-Path $ScriptsDir "phos-config.ps1")
. (Join-Path $ScriptsDir "phos-logging.ps1")
. (Join-Path $ScriptsDir "phos-build-verify.ps1")
. (Join-Path $ScriptsDir "phos-process.ps1")
. (Join-Path $ScriptsDir "phos-readiness.ps1")

Set-PhosLogChannel -Name "supervisor"
Initialize-PhosDirectories
$cfg = Get-PhosConfig

function Get-PhosSupervisorStatePath {
  return Join-Path $cfg.RunDir "supervisor-state.json"
}

function Get-PhosSupervisorState {
  $path = Get-PhosSupervisorStatePath
  if (-not (Test-Path $path)) {
    return @{
      strikes       = @{ api = 0; web = 0; caddy = 0 }
      restarts      = @{ api = @(); web = @(); caddy = @() }
      lastStrikeAt  = @{ api = $null; web = $null; caddy = $null }
    }
  }
  try {
    $raw = Get-Content $path -Raw | ConvertFrom-Json
    return @{
      strikes      = @{ api = [int]$raw.strikes.api; web = [int]$raw.strikes.web; caddy = [int]$raw.strikes.caddy }
      restarts     = @{
        api   = @($raw.restarts.api | ForEach-Object { [string]$_ })
        web   = @($raw.restarts.web | ForEach-Object { [string]$_ })
        caddy = @($raw.restarts.caddy | ForEach-Object { [string]$_ })
      }
      lastStrikeAt = @{
        api   = $raw.lastStrikeAt.api
        web   = $raw.lastStrikeAt.web
        caddy = $raw.lastStrikeAt.caddy
      }
    }
  } catch {
    return @{
      strikes       = @{ api = 0; web = 0; caddy = 0 }
      restarts      = @{ api = @(); web = @(); caddy = @() }
      lastStrikeAt  = @{ api = $null; web = $null; caddy = $null }
    }
  }
}

function Save-PhosSupervisorState {
  param($State)
  $path = Get-PhosSupervisorStatePath
  $State | ConvertTo-Json -Depth 6 | Set-Content -Path $path -Encoding UTF8
}

function Test-PhosRestartAllowed {
  param(
    [ValidateSet("api", "web", "caddy")][string]$Component,
    $State
  )
  $now = Get-Date
  $hourAgo = $now.AddHours(-1)
  $recent = @($State.restarts[$Component] | Where-Object {
      $_ -and ([DateTime]::Parse($_) -gt $hourAgo)
    })
  return ($recent.Count -lt $cfg.SupervisorMaxRestartsPerHour)
}

function Register-PhosSupervisorRestart {
  param(
    [ValidateSet("api", "web", "caddy")][string]$Component,
    $State
  )
  $list = [System.Collections.Generic.List[string]]::new()
  $list.AddRange(@($State.restarts[$Component]))
  $list.Add((Get-Date).ToUniversalTime().ToString("o"))
  $State.restarts[$Component] = $list.ToArray()
}

function Invoke-PhosSupervisorPass {
  $state = Get-PhosSupervisorState
  $standalone = Get-PhosStandaloneDirectory
  $integrity = Test-PhosWebStandaloneIntegrity -StandaloneDir $standalone
  $degraded = Get-PhosDegradedState
  $deployBusy = Test-PhosDeployInProgress

  Write-PhosLog -Level INFO -Component "supervisor" -Event "pass_start" -Message "Supervisor pass"

  if ($deployBusy) {
    Write-PhosLog -Level INFO -Component "supervisor" -Event "deploy_busy" -Message "Deploy in progress; skipping recovery"
    return 0
  }

  $components = @(
    @{ Name = "api"; Port = $cfg.ApiPort }
    @{ Name = "web"; Port = $cfg.WebPort }
    @{ Name = "caddy"; Port = $cfg.GatewayPort }
  )

  foreach ($c in $components) {
    $name = $c.Name
    $healthy = Test-PhosComponentHealthy -Component $name
    if ($healthy) {
      $state.strikes[$name] = 0
      $state.lastStrikeAt[$name] = $null
      continue
    }

    $portStatus = Test-PhosOwnedComponentOnPort -Component $name -Port $c.Port
    if ($portStatus.Foreign) {
      Set-PhosDegradedState -Code "FOREIGN_PROCESS" -Reason "Foreign process blocks recovery" -Extra @{ component = $name; pid = $portStatus.Pid }
      Write-PhosLog -Level WARN -Component $name -Event "foreign_no_recovery" -Message "Foreign process on port; supervisor will not kill"
      continue
    }

    if ($name -eq "web" -and -not $integrity.Ok) {
      Set-PhosDegradedState -Code "WEB_INTEGRITY_FAIL" -Reason "Web integrity failure; no auto-restart"
      Write-PhosLog -Level WARN -Component "web" -Event "integrity_no_restart" -Message ($integrity.Errors -join "; ")
      continue
    }

    if ($degraded -and $degraded.code -eq "WEB_INTEGRITY_FAIL" -and $name -eq "web") {
      continue
    }

    if ($name -eq "api" -and -not (Test-PhosPostgresRunning)) {
      Set-PhosDegradedState -Code "POSTGRES_DOWN" -Reason "PostgreSQL not running"
      continue
    }

    $last = $state.lastStrikeAt[$name]
    if ($last) {
      $elapsed = (Get-Date) - [DateTime]::Parse($last)
      if ($elapsed.TotalSeconds -lt $cfg.SupervisorStrikeIntervalSec) {
        continue
      }
    }

    $state.strikes[$name] = [int]$state.strikes[$name] + 1
    $state.lastStrikeAt[$name] = (Get-Date).ToUniversalTime().ToString("o")

    if ($state.strikes[$name] -lt 2) {
      Write-PhosLog -Level WARN -Component $name -Event "strike" -Message "Health strike recorded" -Data @{ strike = $state.strikes[$name] }
      continue
    }

    if (-not (Test-PhosRestartAllowed -Component $name -State $state)) {
      Set-PhosDegradedState -Code "RECOVERY_EXhaustED" -Reason "Restart cap reached for $name"
      Write-PhosLog -Level ERROR -Component $name -Event "restart_cap" -Message "Max restarts per hour reached"
      continue
    }

    Write-PhosLog -Level WARN -Component $name -Event "recover_restart" -Message "Restarting owned component"
    Stop-PhosOwnedComponent -Component $name | Out-Null
    switch ($name) {
      "api" {
        Start-PhosApiProcess
        Register-PhosComponentFromPort -Component "api" -Port $cfg.ApiPort | Out-Null
        Wait-PhosComponentReadiness -Component "api" | Out-Null
      }
      "web" {
        Start-PhosWebProcess -StandaloneDir $standalone
        Register-PhosComponentFromPort -Component "web" -Port $cfg.WebPort -StandaloneDir $standalone | Out-Null
        Wait-PhosComponentReadiness -Component "web" | Out-Null
      }
      "caddy" {
        Start-PhosCaddyProcess
        Register-PhosComponentFromPort -Component "caddy" -Port $cfg.GatewayPort | Out-Null
        Wait-PhosComponentReadiness -Component "caddy" | Out-Null
      }
    }
    Register-PhosSupervisorRestart -Component $name -State $state
    $state.strikes[$name] = 0
    $state.lastStrikeAt[$name] = $null
  }

  Save-PhosSupervisorState -State $state
  Write-PhosLog -Level INFO -Component "supervisor" -Event "pass_end" -Message "Supervisor pass complete"
  return 0
}

if ($Once) {
  exit (Invoke-PhosSupervisorPass)
}

while ($true) {
  Invoke-PhosSupervisorPass | Out-Null
  Start-Sleep -Seconds 300
}
