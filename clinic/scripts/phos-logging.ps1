# PHOS clinic — structured logging (JSON lines, no PHI)
. "$PSScriptRoot\phos-config.ps1"

$script:PhosLogChannel = "orchestrate"

function Set-PhosLogChannel {
  param([string]$Name)
  $script:PhosLogChannel = $Name
}

function Write-PhosLog {
  param(
    [ValidateSet("DEBUG", "INFO", "WARN", "ERROR")]
    [string]$Level = "INFO",
    [string]$Component = "system",
    [string]$Event = "message",
    [string]$Message,
    [hashtable]$Data = @{}
  )
  Initialize-PhosDirectories
  $cfg = Get-PhosConfig
  $day = Get-Date -Format "yyyyMMdd"
  $logFile = Join-Path $cfg.LogsDir "$($script:PhosLogChannel)-$day.log"
  $entry = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    level     = $Level
    component = $Component
    event     = $Event
    message   = $Message
  }
  foreach ($k in $Data.Keys) {
    if ($k -match 'password|token|secret|authorization|cookie|patient|phi' ) { continue }
    $entry[$k] = $Data[$k]
  }
  $line = ($entry | ConvertTo-Json -Compress)
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  if ($Level -in @("WARN", "ERROR")) {
    Write-Host "[$Level] $Component/$Event : $Message" -ForegroundColor $(if ($Level -eq "ERROR") { "Red" } else { "Yellow" })
  }
}

function Invoke-PhosLogRetention {
  $cfg = Get-PhosConfig
  if (-not (Test-Path $cfg.LogsDir)) { return }
  $cutoff = (Get-Date).AddDays(-1 * $cfg.LogRetentionDays)
  Get-ChildItem $cfg.LogsDir -Filter "*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}
