$wailsJson = Get-Content "wails.json" | ConvertFrom-Json
$version = $wailsJson.info.productVersion

Write-Host "Start LuminSSH packaging process: V$version" -ForegroundColor Cyan

# Sync version to config.ts, package.json, package-lock.json, build/windows/info.json, build/config.yml
node scripts/sync-version.mjs $version
if ($LASTEXITCODE -ne 0) { Write-Error "Version sync failed"; exit 1 }

# NSIS (makensis) is only required for the installer; the portable build does not use it
$hasNsis = $null -ne (Get-Command makensis -ErrorAction SilentlyContinue)

# Ensure Go-installed tools (wails3) are reachable
$env:PATH = "$env:USERPROFILE\go\bin;" + $env:PATH

$mode = if ($hasNsis) { "portable + installer" } else { "portable only (NSIS not found, installer skipped)" }
Write-Host "`n[1/2] Building with Wails v3 ($mode)..." -ForegroundColor Yellow

wails3 task build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

if ($hasNsis) {
    wails3 task windows:package
    if ($LASTEXITCODE -ne 0) { Write-Error "Package failed"; exit 1 }
} else {
    Write-Warning "makensis not found in PATH - skipping NSIS installer. Install NSIS (e.g. winget install NSIS.NSIS) to build the installer."
}

# Compress the portable exe with UPX (v2 CLI did this via -upx; v3 has no flag).
# Must run AFTER windows:package, which re-runs go build and overwrites bin\Lumin.exe.
$upxCmd = (Get-Command upx -ErrorAction SilentlyContinue).Source
if (-not $upxCmd -and (Test-Path "$env:LOCALAPPDATA\Microsoft\WinGet\Links\upx.exe")) {
    $upxCmd = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\upx.exe"
}

if ($upxCmd) {
    Write-Host "`nCompressing portable exe with UPX..." -ForegroundColor Yellow
    & $upxCmd --best --lzma "bin\Lumin.exe"
    if ($LASTEXITCODE -ne 0) { Write-Warning "UPX compression failed - keeping uncompressed exe" }
} else {
    Write-Warning "upx not found - portable exe will not be compressed. Install with: winget install upx"
}

Write-Host "`n[2/2] Renaming output files..." -ForegroundColor Yellow
$portableDest = "bin\Lumin-V$version-portable.exe"
Move-Item -Path "bin\Lumin.exe" -Destination $portableDest -Force

Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "  SUCCESS!" -ForegroundColor Cyan
Write-Host "  Portable:  $portableDest" -ForegroundColor Green
if ($hasNsis) {
    $setupDest = "bin\Lumin-V$version-amd64-installer.exe"
    Move-Item -Path "bin\Lumin-amd64-installer.exe" -Destination $setupDest -Force
    Write-Host "  Installer: $setupDest" -ForegroundColor Green
}
Write-Host "==============================================" -ForegroundColor Cyan
