# PHOS clinic PC — status + reliability diagnostics (edit root in phos-config if needed)

$ScriptsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

. (Join-Path $ScriptsDir "phos-config.ps1")

. (Join-Path $ScriptsDir "phos-build-verify.ps1")

. (Join-Path $ScriptsDir "phos-process.ps1")



$cfg = Get-PhosConfig

$PhosRoot = $cfg.PhosRoot



Write-Host "`n========== PHOS CLINIC PC CHECK ==========" -ForegroundColor Cyan

Write-Host "Computer: $env:COMPUTERNAME  User: $env:USERNAME"

Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n"



Write-Host "--- LAN IP (staff use http://THIS:80/) ---" -ForegroundColor Yellow

Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |

  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |

  Select-Object IPAddress, InterfaceAlias |

  Format-Table -AutoSize



Write-Host "--- Folders under $PhosRoot ---" -ForegroundColor Yellow

if (Test-Path $PhosRoot) {

  Get-ChildItem $PhosRoot -ErrorAction SilentlyContinue | Format-Table Name, Mode, LastWriteTime -AutoSize

} else {

  Write-Host "MISSING: $PhosRoot" -ForegroundColor Red

}



$standalone = Get-PhosStandaloneDirectory

$paths = @{

  "Backend"           = $cfg.Backend

  "Frontend"          = $cfg.Frontend

  "Scripts"           = Join-Path $PhosRoot "scripts"

  "phos-clinic.ps1"   = Join-Path $PhosRoot "scripts\phos-clinic.ps1"

  "Caddy"             = $cfg.CaddyExe

  "Caddyfile"         = Join-Path $cfg.GatewayDir "Caddyfile"

  "Backend .env"      = Join-Path $cfg.Backend ".env"

  "Web standalone"    = Join-Path $standalone "server.js"

  "Logs dir"          = $cfg.LogsDir

  "Run dir"           = $cfg.RunDir

}

Write-Host "--- Important paths ---" -ForegroundColor Yellow

foreach ($k in $paths.Keys) {

  $ok = Test-Path $paths[$k]

  $mark = if ($ok) { "OK" } else { "MISSING" }

  $color = if ($ok) { "Green" } else { "Red" }

  Write-Host ("  [{0}] {1}" -f $mark, $k) -ForegroundColor $color

  Write-Host "        $($paths[$k])"

}



Write-Host "`n--- Web standalone integrity ---" -ForegroundColor Yellow

$integrity = Test-PhosWebStandaloneIntegrity -StandaloneDir $standalone

if ($integrity.Ok) {

  Write-Host "  [OK] Manifest and static checks passed" -ForegroundColor Green

  Write-Host "        Active standalone: $standalone"

} else {

  Write-Host "  [FAIL] Integrity check failed" -ForegroundColor Red

  foreach ($e in $integrity.Errors) { Write-Host "        $e" -ForegroundColor Red }

}



$degPath = Join-Path $cfg.StateDir "degraded.json"

if (Test-Path $degPath) {

  Write-Host "`n--- Degraded state ---" -ForegroundColor Yellow

  Get-Content $degPath -Raw | Write-Host

}



Write-Host "`n--- Owned process registry ---" -ForegroundColor Yellow

foreach ($comp in @("api", "web", "caddy")) {

  $reg = Get-PhosComponentRegistry -Component $comp

  if ($reg) {

    Write-Host "  $comp : pid=$($reg.pid) registered=$($reg.registeredAt)" -ForegroundColor Green

  } else {

    Write-Host "  $comp : (no registry file)" -ForegroundColor DarkGray

  }

}



Write-Host "`n--- Tools ---" -ForegroundColor Yellow

foreach ($cmd in @("node", "npm", "git")) {

  $v = & $cmd --version 2>$null

  if ($LASTEXITCODE -eq 0 -or $v) { Write-Host "  $cmd : $v" -ForegroundColor Green }

  else { Write-Host "  $cmd : NOT FOUND" -ForegroundColor Red }

}

if (Test-Path $cfg.CaddyExe) {

  $cv = & $cfg.CaddyExe version 2>$null

  Write-Host "  caddy : $cv" -ForegroundColor Green

}



Write-Host "`n--- PostgreSQL service ---" -ForegroundColor Yellow

$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue

if ($pg) { $pg | Format-Table Name, Status, StartType -AutoSize }

else { Write-Host "  No postgresql* service found" -ForegroundColor Red }



Write-Host "--- Ports (PHOS) ---" -ForegroundColor Yellow

foreach ($port in @($cfg.GatewayPort, $cfg.WebPort, $cfg.ApiPort)) {

  $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

  if ($listen) {

    $ownerPid = ($listen | Select-Object -First 1).OwningProcess

    Write-Host "  Port $port : IN USE (pid $ownerPid)" -ForegroundColor Green

  } else {

    Write-Host "  Port $port : free" -ForegroundColor DarkGray

  }

}



Write-Host "`n--- Recent orchestrate log ---" -ForegroundColor Yellow

if (Test-Path $cfg.LogsDir) {

  $log = Get-ChildItem $cfg.LogsDir -Filter "orchestrate-*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

  if ($log) {

    Get-Content $log.FullName -Tail 5 | ForEach-Object { Write-Host "  $_" }

  } else {

    Write-Host "  (no orchestrate log yet)" -ForegroundColor DarkGray

  }

}



Write-Host "`n--- Git (if repos) ---" -ForegroundColor Yellow

foreach ($repo in @("PHOS", "PHOS-Frontend")) {

  $dir = Join-Path $PhosRoot $repo

  if (Test-Path (Join-Path $dir ".git")) {

    Push-Location $dir

    $branch = git branch --show-current 2>$null

    $remote = git remote get-url origin 2>$null

    Write-Host "  $repo : branch=$branch"

    Write-Host "           $remote"

    Pop-Location

  } else {

    Write-Host "  $repo : not a git folder" -ForegroundColor DarkYellow

  }

}



Write-Host "`n========== END ==========" -ForegroundColor Cyan

Write-Host "Staff URL (if Caddy+build OK): http://<LAN-IP-above>/`n"


