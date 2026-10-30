# Pester 3.x tests for PHOS clinic reliability scripts
# Run: Invoke-Pester .\PhosClinic.PhaseA.Tests.ps1

$scriptRoot = Split-Path -Parent $PSScriptRoot
$scriptsDir = Join-Path $scriptRoot "scripts"

Describe "Test-PhosWebStandaloneIntegrity" {
  BeforeAll {
    . (Join-Path $scriptsDir "phos-config.ps1")
    . (Join-Path $scriptsDir "phos-build-verify.ps1")
  }

  It "fails when standalone directory is empty" {
    $tmp = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_.FullName }
    $result = Test-PhosWebStandaloneIntegrity -StandaloneDir $tmp.FullName
    $result.Ok | Should Be $false
    $result.Errors.Count | Should BeGreaterThan 0
    Remove-Item $tmp.FullName -Recurse -Force
  }

  It "passes minimal valid layout" {
    $tmp = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_.FullName }
    $root = $tmp.FullName
    New-Item -ItemType File -Path (Join-Path $root "server.js") -Value "//" -Force | Out-Null
    $static = Join-Path $root ".next\static"
    New-Item -ItemType Directory -Path $static -Force | Out-Null
    "x" | Set-Content (Join-Path $static "chunk.txt")
    $app = Join-Path $root ".next\server\app"
    New-Item -ItemType Directory -Path $app -Force | Out-Null
    "x" | Set-Content (Join-Path $root ".next\server\server-reference-manifest.json")
    "x" | Set-Content (Join-Path $app "page_client-reference-manifest.js")
    "x" | Set-Content (Join-Path $app "login-page_client-reference-manifest.js")
    $result = Test-PhosWebStandaloneIntegrity -StandaloneDir $root
    $result.Ok | Should Be $true
    Remove-Item $root -Recurse -Force
  }
}

Describe "Test-PhosWebBodyHealthy" {
  BeforeAll {
    . (Join-Path $scriptsDir "phos-config.ps1")
    . (Join-Path $scriptsDir "phos-readiness.ps1")
  }

  It "rejects Next invariant error text" {
    Test-PhosWebBodyHealthy -Body "Invariant: client reference manifest" | Should Be $false
  }

  It "accepts normal html" {
    Test-PhosWebBodyHealthy -Body "<html><body>Login</body></html>" | Should Be $true
  }
}

Describe "Test-PhosCommandLineMatchesComponent" {
  BeforeAll {
    . (Join-Path $scriptsDir "phos-config.ps1")
    . (Join-Path $scriptsDir "phos-logging.ps1")
    . (Join-Path $scriptsDir "phos-process.ps1")
  }

  It "matches api node dist main" {
    Test-PhosCommandLineMatchesComponent -Component "api" -CommandLine 'node E:\PHOS\PHOS\dist\main' | Should Be $true
  }

  It "matches web standalone server.js" {
    Test-PhosCommandLineMatchesComponent -Component "web" -CommandLine 'node E:\PHOS\PHOS-Frontend\.next\standalone\server.js' | Should Be $true
  }

  It "does not match unrelated node" {
    Test-PhosCommandLineMatchesComponent -Component "web" -CommandLine 'node C:\tools\other.js' | Should Be $false
  }
}
