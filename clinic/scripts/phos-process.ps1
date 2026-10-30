# PHOS clinic — process ownership, mutex, safe stop/start
. "$PSScriptRoot\phos-config.ps1"
. "$PSScriptRoot\phos-logging.ps1"

$script:PhosMutex = $null

function Enter-PhosOrchestrateMutex {
  $cfg = Get-PhosConfig
  $created = $false
  $script:PhosMutex = New-Object System.Threading.Mutex($false, $cfg.MutexName, [ref]$created)
  if (-not $script:PhosMutex.WaitOne([TimeSpan]::FromSeconds($cfg.MutexWaitSec))) {
    Write-PhosLog -Level ERROR -Component "orchestrate" -Event "mutex_timeout" -Message "Could not acquire orchestrate mutex"
    return $false
  }
  Write-PhosLog -Level INFO -Component "orchestrate" -Event "mutex_acquired" -Message "Orchestrate mutex acquired"
  return $true
}

function Exit-PhosOrchestrateMutex {
  if ($script:PhosMutex) {
    try { $script:PhosMutex.ReleaseMutex() } catch { }
    try { $script:PhosMutex.Dispose() } catch { }
    $script:PhosMutex = $null
  }
}

function Get-PhosComponentRegistryPath {
  param([ValidateSet("api", "web", "caddy")][string]$Component)
  $cfg = Get-PhosConfig
  return Join-Path $cfg.RunDir "$Component.json"
}

function Get-PhosComponentRegistry {
  param([ValidateSet("api", "web", "caddy")][string]$Component)
  $path = Get-PhosComponentRegistryPath -Component $Component
  if (-not (Test-Path $path)) { return $null }
  try {
    return Get-Content $path -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Set-PhosComponentRegistry {
  param(
    [ValidateSet("api", "web", "caddy")][string]$Component,
    [int]$ProcessId,
    [string]$CommandLine,
    [string]$StandaloneDir = ""
  )
  Initialize-PhosDirectories
  $body = @{
    component    = $Component
    pid          = $ProcessId
    commandLine  = $CommandLine
    standaloneDir = $StandaloneDir
    registeredAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  $path = Get-PhosComponentRegistryPath -Component $Component
  $body | ConvertTo-Json | Set-Content -Path $path -Encoding UTF8
}

function Clear-PhosComponentRegistry {
  param([ValidateSet("api", "web", "caddy")][string]$Component)
  $path = Get-PhosComponentRegistryPath -Component $Component
  if (Test-Path $path) { Remove-Item $path -Force -ErrorAction SilentlyContinue }
}

function Get-PhosProcessCommandLine {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return $null }
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if ($null -eq $p) { return $null }
  return $p.CommandLine
}

function Test-PhosProcessAlive {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return $false }
  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Get-PhosPortListenerPid {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return [int]$conn.OwningProcess }
  return 0
}

function Test-PhosCommandLineMatchesComponent {
  param(
    [ValidateSet("api", "web", "caddy")][string]$Component,
    [string]$CommandLine
  )
  if (-not $CommandLine) { return $false }
  $cfg = Get-PhosConfig
  $cl = $CommandLine.ToLowerInvariant()
  switch ($Component) {
    "api" {
      return ($cl -match 'node' -and ($cl -match '\\dist\\main' -or $cl -match '/dist/main'))
    }
    "web" {
      return ($cl -match 'node' -and $cl -match 'server\.js' -and $cl -match '\\standalone')
    }
    "caddy" {
      return ($cl -match 'caddy' -and $cl -match 'run')
    }
  }
  return $false
}

function Test-PhosOwnedComponentOnPort {
  param(
    [ValidateSet("api", "web", "caddy")][string]$Component,
    [int]$Port
  )
  $reg = Get-PhosComponentRegistry -Component $Component
  $listenerPid = Get-PhosPortListenerPid -Port $Port
  if ($listenerPid -le 0) { return @{ Owned = $false; Listening = $false; Pid = 0 } }
  $cmd = Get-PhosProcessCommandLine -ProcessId $listenerPid
  $matchesPattern = Test-PhosCommandLineMatchesComponent -Component $Component -CommandLine $cmd
  if ($reg -and $reg.pid -eq $listenerPid -and $matchesPattern) {
    return @{ Owned = $true; Listening = $true; Pid = $listenerPid; CommandLine = $cmd }
  }
  if ($matchesPattern) {
    Set-PhosComponentRegistry -Component $Component -ProcessId $listenerPid -CommandLine $cmd
    return @{ Owned = $true; Listening = $true; Pid = $listenerPid; CommandLine = $cmd; Adopted = $true }
  }
  return @{ Owned = $false; Listening = $true; Pid = $listenerPid; CommandLine = $cmd; Foreign = $true }
}

function Stop-PhosOwnedComponent {
  param([ValidateSet("api", "web", "caddy")][string]$Component)
  $cfg = Get-PhosConfig
  $port = switch ($Component) { "api" { $cfg.ApiPort } "web" { $cfg.WebPort } "caddy" { $cfg.GatewayPort } }
  $status = Test-PhosOwnedComponentOnPort -Component $Component -Port $port
  if (-not $status.Owned -or $status.Pid -le 0) {
    Write-PhosLog -Level WARN -Component $Component -Event "stop_skipped" -Message "Not stopping: process not owned"
    return $false
  }
  $pidToStop = [int]$status.Pid
  Write-PhosLog -Level INFO -Component $Component -Event "stop_owned" -Message "Stopping owned process" -Data @{ pid = $pidToStop }
  Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Clear-PhosComponentRegistry -Component $Component
  return $true
}

function Start-PhosApiProcess {
  $cfg = Get-PhosConfig
  $wd = $cfg.Backend
  if ($cfg.ShowConsoleWindows) {
    Start-Process powershell -ArgumentList @(
      "-NoExit", "-Command",
      "Set-Location '$wd'; Write-Host 'PHOS API :$($cfg.ApiPort)' -ForegroundColor Green; npm run start:render"
    )
  } else {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
      "-Command",
      "Set-Location '$wd'; npm run start:render *> '$($cfg.LogsDir)\api-stdout.log'"
    )
  }
}

function Start-PhosWebProcess {
  param([string]$StandaloneDir)
  $cfg = Get-PhosConfig
  if ($cfg.ShowConsoleWindows) {
    Start-Process powershell -ArgumentList @(
      "-NoExit", "-Command",
      "Set-Location '$StandaloneDir'; `$env:HOSTNAME='127.0.0.1'; `$env:PORT='$($cfg.WebPort)'; `$env:NODE_ENV='production'; Write-Host 'PHOS Web :$($cfg.WebPort)' -ForegroundColor Green; node server.js"
    )
  } else {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
      "-Command",
      "Set-Location '$StandaloneDir'; `$env:HOSTNAME='127.0.0.1'; `$env:PORT='$($cfg.WebPort)'; `$env:NODE_ENV='production'; node server.js *> '$($cfg.LogsDir)\web-stdout.log'"
    )
  }
}

function Start-PhosCaddyProcess {
  $cfg = Get-PhosConfig
  $wd = $cfg.GatewayDir
  $caddy = $cfg.CaddyExe
  if ($cfg.ShowConsoleWindows) {
    Start-Process powershell -ArgumentList @(
      "-NoExit", "-Command",
      "Set-Location '$wd'; Write-Host 'PHOS Gateway :$($cfg.GatewayPort)' -ForegroundColor Green; & '$caddy' run --config Caddyfile"
    )
  } else {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
      "-Command",
      "Set-Location '$wd'; & '$caddy' run --config Caddyfile *> '$($cfg.LogsDir)\caddy-stdout.log'"
    )
  }
}

function Register-PhosComponentFromPort {
  param(
    [ValidateSet("api", "web", "caddy")][string]$Component,
    [int]$Port,
    [string]$StandaloneDir = ""
  )
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    $status = Test-PhosOwnedComponentOnPort -Component $Component -Port $Port
    if ($status.Listening -and ($status.Owned -or (Test-PhosCommandLineMatchesComponent -Component $Component -CommandLine $status.CommandLine))) {
      Set-PhosComponentRegistry -Component $Component -ProcessId $status.Pid -CommandLine $status.CommandLine -StandaloneDir $StandaloneDir
      return $status.Pid
    }
    Start-Sleep -Milliseconds 500
  }
  return 0
}

function Test-PhosPostgresRunning {
  $pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq "Running" } |
    Select-Object -First 1
  return $null -ne $pg
}

function Set-PhosDegradedState {
  param(
    [string]$Reason,
    [string]$Code,
    [hashtable]$Extra = @{}
  )
  Initialize-PhosDirectories
  $cfg = Get-PhosConfig
  $path = Join-Path $cfg.StateDir "degraded.json"
  $body = @{
    code      = $Code
    reason    = $Reason
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  foreach ($k in $Extra.Keys) { $body[$k] = $Extra[$k] }
  $body | ConvertTo-Json | Set-Content -Path $path -Encoding UTF8
  Write-PhosLog -Level WARN -Component "state" -Event "degraded" -Message $Reason -Data @{ code = $Code }
}

function Clear-PhosDegradedState {
  $cfg = Get-PhosConfig
  $path = Join-Path $cfg.StateDir "degraded.json"
  if (Test-Path $path) { Remove-Item $path -Force -ErrorAction SilentlyContinue }
}

function Get-PhosDegradedState {
  $cfg = Get-PhosConfig
  $path = Join-Path $cfg.StateDir "degraded.json"
  if (-not (Test-Path $path)) { return $null }
  try { return Get-Content $path -Raw | ConvertFrom-Json } catch { return $null }
}

function Test-PhosDeployInProgress {
  $cfg = Get-PhosConfig
  $lockFile = Join-Path $cfg.RunDir "deploy.inprogress"
  return Test-Path $lockFile
}

function Wait-PhosClinicRoot {
  param([int]$MaxWaitSec)
  $cfg = Get-PhosConfig
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  $delayMs = 500
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $cfg.PhosRoot) {
      Write-PhosLog -Level INFO -Component "orchestrate" -Event "drive_ready" -Message "PHOS root available"
      return $true
    }
    Start-Sleep -Milliseconds $delayMs
    $delayMs = [Math]::Min($delayMs * 2, 8000)
  }
  Write-PhosLog -Level ERROR -Component "orchestrate" -Event "drive_timeout" -Message "PHOS root not available"
  return $false
}
