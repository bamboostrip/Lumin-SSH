$wailsJson = Get-Content "wails.json" | ConvertFrom-Json
$version = $wailsJson.info.productVersion

Write-Host "Start LumeTerm packaging process: V$version" -ForegroundColor Cyan

# Sync version to config.ts, package.json, package-lock.json
node -e "const fs=require('fs');const v=process.argv[1];let c=fs.readFileSync('frontend/src/config.ts','utf8');c=c.replace(/APP_VERSION\s*=\s*'[^']*'/,'APP_VERSION = '+String.fromCharCode(39)+v+String.fromCharCode(39));fs.writeFileSync('frontend/src/config.ts',c);const p=JSON.parse(fs.readFileSync('frontend/package.json','utf8'));p.version=v;fs.writeFileSync('frontend/package.json',JSON.stringify(p,null,2)+'\n');const pl=JSON.parse(fs.readFileSync('frontend/package-lock.json','utf8'));pl.version=v;if(pl.packages&&pl.packages[''])pl.packages[''].version=v;fs.writeFileSync('frontend/package-lock.json',JSON.stringify(pl,null,2)+'\n');console.log('Synced version '+v+' to config.ts, package.json, package-lock.json')" "$version"
if ($LASTEXITCODE -ne 0) { Write-Error "Version sync failed"; exit 1 }

# NSIS (makensis) is only required for the installer; the portable build does not use it
$hasNsis = $null -ne (Get-Command makensis -ErrorAction SilentlyContinue)

# Ensure Go-installed tools (wails3) are reachable
$env:PATH = "$env:USERPROFILE\go\bin;" + $env:PATH

# Windows locks running executables, which would make the final Move-Item
# overwrite fail with an obscure error. Fail fast with an actionable hint.
$runningApps = Get-Process -Name "LumeTerm*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith((Join-Path $PSScriptRoot "bin"), [System.StringComparison]::OrdinalIgnoreCase) }
if ($runningApps) {
    Write-Error "Detected running LumeTerm instance(s) launched from bin\: $($runningApps.Path -join ', '). Close the app and retry."
    exit 1
}

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
# Must run AFTER windows:package, which re-runs go build and overwrites bin\LumeTerm.exe.
$upxCmd = (Get-Command upx -ErrorAction SilentlyContinue).Source
if (-not $upxCmd -and (Test-Path "$env:LOCALAPPDATA\Microsoft\WinGet\Links\upx.exe")) {
    $upxCmd = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\upx.exe"
}

if ($upxCmd) {
    Write-Host "`nCompressing portable exe with UPX..." -ForegroundColor Yellow
    & $upxCmd --best --lzma "bin\LumeTerm.exe"
    if ($LASTEXITCODE -ne 0) { Write-Warning "UPX compression failed - keeping uncompressed exe" }
} else {
    Write-Warning "upx not found - portable exe will not be compressed. Install with: winget install upx"
}

Write-Host "`n[2/2] Renaming output files..." -ForegroundColor Yellow
$portableDest = "bin\LumeTerm-$version-windows-amd64-portable.exe"
try {
    Move-Item -Path "bin\LumeTerm.exe" -Destination $portableDest -Force -ErrorAction Stop
} catch {
    Write-Error "Failed to rename portable exe: $($_.Exception.Message). If the file is in use, close the running LumeTerm app and retry."
    exit 1
}

Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "  SUCCESS!" -ForegroundColor Cyan
Write-Host "  Portable:  $portableDest" -ForegroundColor Green
if ($hasNsis) {
    $setupDest = "bin\LumeTerm-$version-windows-amd64-installer.exe"
    try {
        Move-Item -Path "bin\LumeTerm-amd64-installer.exe" -Destination $setupDest -Force -ErrorAction Stop
    } catch {
        Write-Error "Failed to rename installer exe: $($_.Exception.Message). If the file is in use, close the running LumeTerm app and retry."
        exit 1
    }
    Write-Host "  Installer: $setupDest" -ForegroundColor Green
}
Write-Host "==============================================" -ForegroundColor Cyan
