# Folder Force Deleter - Portable Builder (PowerShell)
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Folder Force Deleter - Portable Builder" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host ""
}

# Check for electron-builder
Write-Host "Checking electron-builder..." -ForegroundColor Yellow
npm list electron-builder 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing electron-builder..." -ForegroundColor Yellow
    npm install --save-dev electron-builder
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "ERROR: Failed to install electron-builder" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host ""
}

Write-Host "Building portable executable..." -ForegroundColor Green
Write-Host "This may take a few minutes..." -ForegroundColor Yellow
Write-Host ""

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "BUILD COMPLETE!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Portable executable created in: dist\FolderForceDeleter-Portable.exe" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now:" -ForegroundColor White
Write-Host "1. Copy FolderForceDeleter-Portable.exe anywhere" -ForegroundColor White
Write-Host "2. Run it without installation" -ForegroundColor White
Write-Host "3. No admin rights needed to run (but needed for deletion)" -ForegroundColor White
Write-Host ""
Write-Host "Opening dist folder..." -ForegroundColor Yellow

Start-Process explorer.exe -ArgumentList (Join-Path $PWD "dist")

Write-Host ""
Read-Host "Press Enter to exit"
