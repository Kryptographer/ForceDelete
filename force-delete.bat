@echo off
REM Force Delete Batch Wrapper
REM Runs the PowerShell force-delete script with admin privileges

REM Check if path argument is provided
if "%~1"=="" (
    echo Usage: force-delete.bat "C:\path\to\folder"
    echo.
    echo This script will permanently delete the specified folder and all its contents.
    echo Requires Administrator privileges.
    pause
    exit /b 1
)

REM Run PowerShell script with admin privileges
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0force-delete.ps1"" -Path ""%~1""' -Verb RunAs }"

exit /b %ERRORLEVEL%
