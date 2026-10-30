Write-Host "PSVersion:" $PSVersionTable.PSVersion
Write-Host "Edition:" $PSVersionTable.PSEdition
. (Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\phos-process.ps1")
$cmd = Get-PhosProcessCommandLine -ProcessId $PID
Write-Host "CommandLine length:" $(if ($cmd) { $cmd.Length } else { 0 })
