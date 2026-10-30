# PHOS clinic — Next.js standalone integrity checks
. "$PSScriptRoot\phos-config.ps1"

function Test-PhosWebStandaloneIntegrity {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StandaloneDir
  )
  $errors = [System.Collections.Generic.List[string]]::new()
  $checks = @(
    @{ Path = Join-Path $StandaloneDir "server.js"; Type = "file" }
    @{ Path = Join-Path $StandaloneDir ".next\static"; Type = "dir_nonempty" }
    @{ Path = Join-Path $StandaloneDir ".next\server\server-reference-manifest.json"; Type = "file" }
    @{ Path = Join-Path $StandaloneDir ".next\server\app\page_client-reference-manifest.js"; Type = "file" }
  )
  foreach ($c in $checks) {
    $p = $c.Path
    switch ($c.Type) {
      "file" {
        if (-not (Test-Path $p -PathType Leaf)) {
          $errors.Add("Missing file: $p")
        } elseif ((Get-Item $p).Length -le 0) {
          $errors.Add("Empty file: $p")
        }
      }
      "dir_nonempty" {
        if (-not (Test-Path $p -PathType Container)) {
          $errors.Add("Missing directory: $p")
        } elseif (-not (Get-ChildItem $p -ErrorAction SilentlyContinue | Select-Object -First 1)) {
          $errors.Add("Empty directory: $p")
        }
      }
    }
  }
  $appDir = Join-Path $StandaloneDir ".next\server\app"
  if (Test-Path $appDir) {
    $loginManifest = Get-ChildItem $appDir -Filter "*login*client-reference-manifest.js" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $loginManifest) {
      $errors.Add("Missing login client-reference-manifest under $appDir")
    }
  } else {
    $errors.Add("Missing app server directory: $appDir")
  }
  return @{
    Ok     = ($errors.Count -eq 0)
    Errors = $errors.ToArray()
  }
}
