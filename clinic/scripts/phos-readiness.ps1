# PHOS clinic — HTTP readiness probes with backoff
. "$PSScriptRoot\phos-config.ps1"
. "$PSScriptRoot\phos-logging.ps1"

$script:PhosWebFailurePatterns = @(
  "client reference manifest",
  "Invariant:",
  "__NEXT_ERROR_CODE"
)

function Test-PhosHttpResponse {
  param(
    [string]$Uri,
    [int]$TimeoutSec = 10,
    [int[]]$AllowedStatus = @(200)
  )
  try {
    $resp = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
    return @{
      Ok         = ($AllowedStatus -contains [int]$resp.StatusCode)
      StatusCode = [int]$resp.StatusCode
      Body       = [string]$resp.Content
    }
  } catch {
    $code = 0
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
    }
    return @{ Ok = $false; StatusCode = $code; Body = ""; Error = $_.Exception.Message }
  }
}

function Test-PhosWebBodyHealthy {
  param([string]$Body)
  if (-not $Body) { return $false }
  $lower = $Body.ToLowerInvariant()
  foreach ($pat in $script:PhosWebFailurePatterns) {
    if ($lower.Contains($pat.ToLowerInvariant())) { return $false }
  }
  return $true
}

function Test-PhosApiHealth {
  $cfg = Get-PhosConfig
  $uri = "http://127.0.0.1:$($cfg.ApiPort)$($cfg.ApiHealthPath)"
  $r = Test-PhosHttpResponse -Uri $uri -TimeoutSec 15
  if (-not $r.Ok) { return $false }
  try {
    $json = $r.Body | ConvertFrom-Json
    return ($json.status -eq "ok")
  } catch {
    return $false
  }
}

function Test-PhosWebLogin {
  $cfg = Get-PhosConfig
  $uri = "http://127.0.0.1:$($cfg.WebPort)$($cfg.WebProbePath)"
  $r = Test-PhosHttpResponse -Uri $uri -TimeoutSec 15 -AllowedStatus @(200, 307, 308)
  if (-not $r.Ok) { return $false }
  return (Test-PhosWebBodyHealthy -Body $r.Body)
}

function Test-PhosCaddyLogin {
  $cfg = Get-PhosConfig
  $uri = "http://127.0.0.1:$($cfg.GatewayPort)$($cfg.WebProbePath)"
  $r = Test-PhosHttpResponse -Uri $uri -TimeoutSec 15 -AllowedStatus @(200, 307, 308)
  if (-not $r.Ok) { return $false }
  return (Test-PhosWebBodyHealthy -Body $r.Body)
}

function Test-PhosCaddyApiHealth {
  $cfg = Get-PhosConfig
  $uri = "http://127.0.0.1:$($cfg.GatewayPort)$($cfg.ApiHealthPath)"
  $r = Test-PhosHttpResponse -Uri $uri -TimeoutSec 15
  if (-not $r.Ok) { return $false }
  try {
    $json = $r.Body | ConvertFrom-Json
    return ($json.status -eq "ok")
  } catch {
    return $false
  }
}

function Wait-PhosComponentReadiness {
  param(
    [ValidateSet("api", "web", "caddy", "caddy_api")][string]$Component
  )
  $cfg = Get-PhosConfig
  $delayMs = $cfg.ReadinessInitialMs
  $attempt = 0
  while ($attempt -lt $cfg.ReadinessAttempts) {
    $attempt++
    $ok = switch ($Component) {
      "api"       { Test-PhosApiHealth }
      "web"       { Test-PhosWebLogin }
      "caddy"     { Test-PhosCaddyLogin }
      "caddy_api" { Test-PhosCaddyApiHealth }
      default     { $false }
    }
    if ($ok) {
      Write-PhosLog -Level INFO -Component $Component -Event "readiness_ok" -Message "Readiness probe succeeded" -Data @{ attempt = $attempt }
      return $true
    }
    Start-Sleep -Milliseconds $delayMs
    $delayMs = [Math]::Min($delayMs * 2, $cfg.ReadinessMaxMs)
  }
  Write-PhosLog -Level ERROR -Component $Component -Event "readiness_timeout" -Message "Readiness probe failed"
  return $false
}

function Test-PhosComponentHealthy {
  param([ValidateSet("api", "web", "caddy")][string]$Component)
  switch ($Component) {
    "api"   { return Test-PhosApiHealth }
    "web"   { return Test-PhosWebLogin }
    "caddy" { return (Test-PhosCaddyLogin -and (Test-PhosCaddyApiHealth)) }
  }
  return $false
}
