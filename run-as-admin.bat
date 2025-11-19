@echo off
:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with admin privileges...
    cd /d "%~dp0"
    npm start
) else (
    echo Requesting admin privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c cd /d %~dp0 && npm start && pause' -Verb RunAs"
)
