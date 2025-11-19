# Force Delete PowerShell Script
# Comprehensive folder deletion with ownership, permissions, and handle management
# Usage: .\force-delete.ps1 -Path "C:\path\to\folder"

param(
    [Parameter(Mandatory=$true, HelpMessage="Path to the folder to delete")]
    [string]$Path,

    [Parameter(Mandatory=$false, HelpMessage="Skip confirmation prompt")]
    [switch]$Force
)

# Requires Administrator privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

# Check if path exists
if (-not (Test-Path $Path)) {
    Write-Error "Path does not exist: $Path"
    exit 1
}

# Check if it's a directory
if (-not (Get-Item $Path).PSIsContainer) {
    Write-Error "Path is not a directory: $Path"
    exit 1
}

Write-Host "`nForce Delete - Comprehensive Folder Deletion" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host "`nTarget folder: $Path" -ForegroundColor Yellow

# Confirmation
if (-not $Force) {
    $confirm = Read-Host "`nThis will PERMANENTLY DELETE all contents. Continue? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "Operation cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "`nStarting force deletion process..." -ForegroundColor Green

# Step 1: Find and close file handles
Write-Host "`n[1/5] Searching for processes with open handles..." -ForegroundColor Cyan

$processes = @{}
$processesTerminated = 0

# Find processes with file handles to the target path
Get-Process | Where-Object {
    $_.Id -gt 4 -and $_.ProcessName -notin @('System', 'Registry', 'Idle', 'csrss', 'smss', 'wininit', 'services', 'lsass')
} | ForEach-Object {
    try {
        $proc = $_
        $modules = $proc.Modules | Where-Object {
            $_.FileName -like "$Path*"
        }
        if ($modules) {
            $processes[$proc.Id] = @{
                Name = $proc.ProcessName
                Id = $proc.Id
                Path = $proc.Path
            }
        }
    } catch {
        # Access denied or process exited - skip
    }
}

# Also check using openfiles command if available
try {
    $openFiles = openfiles /query /fo csv /v 2>$null | ConvertFrom-Csv
    $openFiles | Where-Object {
        $_.'Open File (Path\executable)' -like "$Path*"
    } | ForEach-Object {
        $procName = $_.'Accessed By'
        if ($procName -and $procName -ne 'N/A') {
            $proc = Get-Process -Name $procName -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($proc -and $proc.Id -gt 4) {
                $processes[$proc.Id] = @{
                    Name = $proc.ProcessName
                    Id = $proc.Id
                    Path = $proc.Path
                }
            }
        }
    }
} catch {
    Write-Host "  Note: openfiles command not available" -ForegroundColor DarkGray
}

if ($processes.Count -eq 0) {
    Write-Host "  No processes found with open handles." -ForegroundColor Green
} else {
    Write-Host "  Found $($processes.Count) process(es) with open handles:" -ForegroundColor Yellow

    foreach ($proc in $processes.Values) {
        Write-Host "    - $($proc.Name) (PID: $($proc.Id))" -ForegroundColor Yellow

        try {
            # Try graceful termination first
            Stop-Process -Id $proc.Id -Force -ErrorAction Stop
            $processesTerminated++
            Write-Host "      Terminated successfully" -ForegroundColor Green
            Start-Sleep -Milliseconds 200
        } catch {
            Write-Host "      Failed to terminate: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host "  Terminated $processesTerminated process(es)" -ForegroundColor Green
    Start-Sleep -Seconds 1
}

# Step 2: Take ownership
Write-Host "`n[2/5] Taking ownership of folder and all contents..." -ForegroundColor Cyan

try {
    $output = takeown /f "$Path" /r /d y 2>&1
    Write-Host "  Ownership taken successfully" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Some ownership changes may have failed" -ForegroundColor Yellow
}

# Step 3: Grant full permissions
Write-Host "`n[3/5] Granting full permissions..." -ForegroundColor Cyan

try {
    $output = icacls "$Path" /grant Everyone:F /t /c /q 2>&1
    Write-Host "  Permissions granted successfully" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Some permission changes may have failed" -ForegroundColor Yellow
}

# Step 4: Remove file attributes
Write-Host "`n[4/5] Removing file attributes (read-only, system, hidden)..." -ForegroundColor Cyan

try {
    $output = attrib -r -s -h "$Path\*" /s /d 2>&1
    Write-Host "  Attributes removed successfully" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Some attribute changes may have failed" -ForegroundColor Yellow
}

# Step 5: Delete the folder
Write-Host "`n[5/5] Deleting folder and all contents..." -ForegroundColor Cyan

try {
    # Use Remove-Item with force
    Remove-Item -Path $Path -Recurse -Force -ErrorAction Stop
    Write-Host "  Folder deleted successfully!" -ForegroundColor Green
} catch {
    # Try using rmdir command as fallback
    Write-Host "  Trying alternative deletion method..." -ForegroundColor Yellow

    try {
        $output = cmd /c "rmdir /s /q `"$Path`"" 2>&1

        if (Test-Path $Path) {
            Write-Error "Folder still exists. Some files could not be deleted."

            # Show remaining files
            Write-Host "`nRemaining items:" -ForegroundColor Yellow
            Get-ChildItem -Path $Path -Recurse -ErrorAction SilentlyContinue | Select-Object -First 10 | ForEach-Object {
                Write-Host "  - $($_.FullName)" -ForegroundColor Yellow
            }

            exit 1
        } else {
            Write-Host "  Folder deleted successfully!" -ForegroundColor Green
        }
    } catch {
        Write-Error "Failed to delete folder: $($_.Exception.Message)"
        exit 1
    }
}

# Verify deletion
if (Test-Path $Path) {
    Write-Host "`nWARNING: Folder still exists. Deletion may have been incomplete." -ForegroundColor Red
    exit 1
} else {
    Write-Host "`n" + "=" * 50 -ForegroundColor Green
    Write-Host "SUCCESS! Folder has been completely deleted." -ForegroundColor Green
    Write-Host "=" * 50 -ForegroundColor Green
    exit 0
}
