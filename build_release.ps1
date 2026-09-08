$wailsJson = Get-Content "wails.json" | ConvertFrom-Json
$version = $wailsJson.info.productVersion

Write-Host "Start LuminSSH packaging process: V$version" -ForegroundColor Cyan

$basePath = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$nsisPath = "$basePath\Packaging_Tools\nsis\nsis-3.08"
$goPath = "$basePath\Source_Codes\Lumin-Source\go\bin"

# Sync version to config.ts, package.json, package-lock.json, build/windows/info.json, build/config.yml
node scripts/sync-version.mjs $version
if ($LASTEXITCODE -ne 0) { Write-Error "Version sync failed"; exit 1 }

# Inject required paths
$env:PATH = "$goPath;$nsisPath;$env:USERPROFILE\go\bin;" + $env:PATH

Write-Host "`n[1/2] Building with Wails v3 (portable + installer)..." -ForegroundColor Yellow
wails3 task build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

wails3 task windows:package
if ($LASTEXITCODE -ne 0) { Write-Error "Package failed"; exit 1 }

Write-Host "`n[2/2] Renaming output files..." -ForegroundColor Yellow
$portableDest = "bin\Lumin-V$version-portable.exe"
$setupDest = "bin\Lumin-V$version-amd64-installer.exe"
Move-Item -Path "bin\Lumin.exe" -Destination $portableDest -Force
Move-Item -Path "bin\Lumin-amd64-installer.exe" -Destination $setupDest -Force

Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "  SUCCESS!" -ForegroundColor Cyan
Write-Host "  Portable:  $portableDest" -ForegroundColor Green
Write-Host "  Installer: $setupDest" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan
