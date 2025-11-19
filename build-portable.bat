@echo off
echo ====================================
echo Folder Force Deleter - Portable Builder
echo ====================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

REM Install electron-builder if not present
echo Checking electron-builder...
call npm list electron-builder >nul 2>&1
if errorlevel 1 (
    echo Installing electron-builder...
    call npm install --save-dev electron-builder
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install electron-builder
        pause
        exit /b 1
    )
    echo.
)

echo Building portable executable...
echo This may take a few minutes...
echo.

call npm run build

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo ====================================
echo BUILD COMPLETE!
echo ====================================
echo.
echo Portable executable created in: dist\FolderForceDeleter-Portable.exe
echo.
echo You can now:
echo 1. Copy FolderForceDeleter-Portable.exe anywhere
echo 2. Run it without installation
echo 3. No admin rights needed to run (but needed for deletion)
echo.
echo Opening dist folder...
start "" "%cd%\dist"
echo.
pause
