@echo off
setlocal
echo ==============================================
echo        Lumin SSH Automated Builder (wails3)
echo ==============================================

if "%~1"=="" (
    set /p VERSION="Enter release version (e.g. 1.0.1): "
) else (
    set "VERSION=%~1"
)

if "%VERSION%"=="" (
    echo [ERROR] Version cannot be empty!
    pause
    exit /b 1
)

REM Strip V/v prefix for source file updates
set "VER_NUM=%VERSION%"
if /i "%VER_NUM:~0,1%"=="V" set "VER_NUM=%VER_NUM:~1%"

echo [1/4] Updating version to %VER_NUM% in source files...
node scripts\sync-version.mjs "%VER_NUM%"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to update version in source files.
    if "%~1"=="" pause
    exit /b 1
)

echo [2/4] Configuring Go and NSIS environment...
for %%I in ("%~dp0..\..\..") do set "ROOT_DIR=%%~fI"
set "GO_BIN=%ROOT_DIR%\Source_Codes\Lumin-Source\go\bin"
set "NSIS_DIR=%ROOT_DIR%\Packaging_Tools\nsis\nsis-3.08"
set "PATH=%GO_BIN%;%NSIS_DIR%;%USERPROFILE%\go\bin;%PATH%"

echo [3/4] Building portable exe (wails3)...
cd /d "%~dp0"
call wails3 task build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    if "%~1"=="" pause
    exit /b 1
)

echo [4/4] Building NSIS installer (wails3)...
call wails3 task windows:package
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Package failed.
    if "%~1"=="" pause
    exit /b 1
)

if not exist "bin\Lumin-amd64-installer.exe" (
    echo [ERROR] Setup installer not found.
    if "%~1"=="" pause
    exit /b 1
)

move /y "bin\Lumin.exe" "bin\Lumin-V%VER_NUM%-portable.exe" >nul
move /y "bin\Lumin-amd64-installer.exe" "bin\Lumin-V%VER_NUM%-amd64-installer.exe" >nul

echo.
echo ==============================================
echo   SUCCESS!
echo   Installer: %CD%\bin\Lumin-V%VER_NUM%-amd64-installer.exe
echo   Portable:  %CD%\bin\Lumin-V%VER_NUM%-portable.exe
echo ==============================================
if "%~1"=="" pause
