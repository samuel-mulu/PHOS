$scriptDir = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts"
$failed = 0
Get-ChildItem $scriptDir -Filter "phos*.ps1" | ForEach-Object {
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$errors)
  if ($errors -and $errors.Count -gt 0) {
    Write-Host "FAIL $($_.Name)"
    $errors | ForEach-Object { Write-Host "  $_" }
    $script:failed++
  } else {
    Write-Host "OK $($_.Name)"
  }
}
if ($failed -gt 0) { exit 1 }
exit 0
