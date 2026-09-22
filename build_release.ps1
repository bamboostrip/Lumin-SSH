param(
    # 指定版本号（可带 v 前缀），会同步写入 wails.json 等文件；不指定则用 wails.json 当前版本
    [string]$Version,
    # 快速模式：跳过 -clean 和 UPX，产物体积偏大，仅用于本地验证打包流程
    [switch]$Fast
)

if ($Version) {
    $version = $Version.Trim() -replace '^[vV]', ''
    if ($version -notmatch '^\d+\.\d+\.\d+$') {
        Write-Error "版本号格式不正确：$Version（应为 1.2.3）"
        exit 1
    }
} else {
    $version = (Get-Content "wails.json" | ConvertFrom-Json).info.productVersion
}

if ($Fast) {
    Write-Host "Start LumeTerm fast packaging: V$version (skip clean/upx)" -ForegroundColor Cyan
} else {
    Write-Host "Start LumeTerm packaging process: V$version" -ForegroundColor Cyan
}

$basePath = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$nsisPath = "$basePath\Packaging_Tools\nsis\nsis-3.08"
$goPath = "$basePath\Source_Codes\Lumin-Source\go\bin"

# 正式模式需要 UPX 压缩便携版，提前检查，避免编译完才发现缺工具
if (-not $Fast -and -not (Get-Command upx -ErrorAction SilentlyContinue)) {
    Write-Error "未找到 upx，请先安装或将其加入 PATH（或使用 -Fast 跳过）"
    exit 1
}

# Sync version to wails.json, config.ts, package.json, package-lock.json
node -e "const fs=require('fs');const v=process.argv[1];const w=JSON.parse(fs.readFileSync('wails.json','utf8'));w.info.productVersion=v;fs.writeFileSync('wails.json',JSON.stringify(w,null,2)+'\n');let c=fs.readFileSync('frontend/src/config.ts','utf8');c=c.replace(/APP_VERSION\s*=\s*'[^']*'/,'APP_VERSION = '+String.fromCharCode(39)+v+String.fromCharCode(39));fs.writeFileSync('frontend/src/config.ts',c);const p=JSON.parse(fs.readFileSync('frontend/package.json','utf8'));p.version=v;fs.writeFileSync('frontend/package.json',JSON.stringify(p,null,2)+'\n');const pl=JSON.parse(fs.readFileSync('frontend/package-lock.json','utf8'));pl.version=v;if(pl.packages&&pl.packages[''])pl.packages[''].version=v;fs.writeFileSync('frontend/package-lock.json',JSON.stringify(pl,null,2)+'\n');console.log('Synced version '+v+' to wails.json, config.ts, package.json, package-lock.json')" "$version"
if ($LASTEXITCODE -ne 0) { Write-Error "版本号同步失败"; exit 1 }

# NSIS (makensis) is only required for the installer; the portable build does not use it
$hasNsis = $null -ne (Get-Command makensis -ErrorAction SilentlyContinue)

# Inject required paths
$env:PATH = "$goPath;$nsisPath;$env:USERPROFILE\go\bin;" + $env:PATH

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

Write-Host "`n[2/2] Renaming output files..." -ForegroundColor Yellow
$portableDest = "bin\LumeTerm-$version-windows-amd64-portable.exe"
$setupDest = "bin\LumeTerm-$version-windows-amd64-installer.exe"

if ($Fast) {
    Move-Item -Path "bin\LumeTerm.exe" -Destination $portableDest -Force
} else {
    # 便携版单独 UPX（--best 与 CI 一致）：安装包内保持未压缩 exe，由 project.nsi 的
    # LZMA solid 压缩，体积更小；压缩的是拷贝出的便携版，不影响已打好的安装包
    Copy-Item -Path "bin\LumeTerm.exe" -Destination $portableDest -Force
    upx --best $portableDest | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "UPX compression failed"; exit 1 }
    Remove-Item -Path "bin\LumeTerm.exe" -Force
}
if ($hasNsis) {
    Move-Item -Path "bin\LumeTerm-amd64-installer.exe" -Destination $setupDest -Force
}

Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "  SUCCESS!" -ForegroundColor Green
Write-Host "  Portable:  $portableDest" -ForegroundColor Green
if ($hasNsis) {
    Write-Host "  Installer: $setupDest" -ForegroundColor Green
}
Write-Host "==============================================" -ForegroundColor Cyan
