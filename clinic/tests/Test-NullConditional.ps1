$p = $null
try {
  $x = $p?.CommandLine
  Write-Host "RESULT:$x"
  Write-Host "OK"
} catch {
  Write-Host "ERROR:$($_.Exception.Message)"
}
