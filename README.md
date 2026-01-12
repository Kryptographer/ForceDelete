# Folder Force Deleter v3.0

An Electron application that allows you to browse for folders and force delete them permanently with advanced features like drag & drop, preview mode, and exclusion patterns.

## Features

### Core Features
- **Multi-threaded deletion** - Uses all CPU cores for blazing fast deletion
- **Comprehensive ownership takeover** - Recursively takes ownership of entire folder structure
- **Full permission management** - Grants necessary permissions to all files and subfolders
- **Process handle detection & termination** - Automatically finds and closes processes with file locks
- **File attribute removal** - Strips read-only, system, and hidden attributes
- **Cross-platform** support (Windows, macOS, Linux)

### New in v3.0
- **Drag & Drop** - Drop folders directly into the app window
- **Recent Folders** - Quick access to recently deleted paths (remembers last 10)
- **Preview Mode** - See what will be deleted before confirming
- **Dry Run Mode** - Simulate deletion without actually removing files
- **Exclusion Patterns** - Skip files matching patterns (*.log, *.tmp, etc.)
- **File Logging** - Complete audit trail of all deletion operations
- **Worker Timeout** - 60-second timeout prevents hanging on stuck files

### UI Features
- **Browse for folders** using native file dialog
- **Real-time progress tracking** with percentage and item counts
- **Status bar** showing operation status and admin privileges
- **Dark theme** with Teenage Engineering/Tesla design aesthetic
- **Collapsible options panel** for advanced settings
- **Safety warnings** with custom themed confirmation dialogs
- **Non-blocking UI** - never freezes during deletion

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Normal Mode
1. Start the application:
   ```bash
   npm start
   ```

### Admin Mode (Recommended for Windows)
For deleting system folders or folders with permissions issues:

**Option 1 - Using batch file:**
```bash
run-as-admin.bat
```

**Option 2 - Using PowerShell:**
```bash
.\run-as-admin.ps1
```

**Option 3 - Using npm:**
```bash
npm run admin
```

### Using the App
1. **Select a folder** - Click Browse or drag & drop a folder
2. **Configure options** (optional):
   - Enable **Dry Run Mode** to preview without deleting
   - Add **Exclusion Patterns** to skip certain files
3. **Preview** (optional) - Click Preview to see what will be deleted
4. **Delete** - Click Force Delete and confirm

### New Features Guide

#### Drag & Drop
Simply drag a folder from your file explorer and drop it anywhere in the app window.

#### Preview Mode
Click the "Preview" button to scan the folder and see:
- Total number of files
- Files that will be deleted
- Files that will be excluded (based on patterns)

#### Dry Run Mode
1. Click "Options" to expand the options panel
2. Check "Dry Run Mode"
3. Click "Force Delete"
4. The app will simulate deletion and show results without removing files

#### Exclusion Patterns
Add patterns to skip certain files during deletion:
```
*.log
*.tmp
node_modules
.git
*.bak
```
Patterns support `*` (any characters) and `?` (single character) wildcards.

#### Recent Folders
Recently deleted folders appear automatically. Click any entry to select it again.

### Command-Line Usage (PowerShell Script)

For command-line force deletion with all advanced features:

**PowerShell:**
```powershell
.\force-delete.ps1 -Path "C:\path\to\folder"
```

**Batch file wrapper:**
```bash
force-delete.bat "C:\path\to\folder"
```

## Development

For development with DevTools enabled:
```bash
npm run dev
```

## How It Works

### Architecture
- **Main Process** (`main.js`): Coordinates deletion, manages settings, and spawns worker threads
- **Worker Threads** (`deletion-worker.js`): Parallel file deletion workers with timeout protection
- **Renderer Process** (`renderer.js`): Manages the UI, drag & drop, and user interactions
- **Preload Script** (`preload.js`): Securely exposes main process APIs to the renderer
- **Windows Utils** (`windows-utils.js`): Platform-specific deletion utilities

### Multi-Threaded Force Delete

The app uses a 4-phase deletion process:

**Phase 0: Preparation** (0-10%) - Windows Only
- **Take Ownership**: Recursively takes ownership using `takeown /f /r`
- **Grant Permissions**: Grants full control using `icacls /grant Everyone:F /t`
- **Remove Attributes**: Strips read-only, system, hidden attributes
- **Close Handles**: Detects and terminates processes blocking deletion

**Phase 1: Scanning** (10-20%)
- Scans entire folder structure
- Applies exclusion patterns
- Builds list of files to delete

**Phase 2: Parallel Deletion** (20-95%)
- Up to 8 worker threads (based on CPU cores)
- 60-second timeout per worker
- Multiple fallback methods per file
- Real-time progress updates

**Phase 3: Cleanup** (95-100%)
- Removes empty directories
- Generates log summary
- Reports final statistics

### Performance
- **1,000 files**: ~1-2 seconds
- **10,000 files**: ~5-10 seconds
- **100,000 files**: ~30-60 seconds
- Speed scales with CPU core count

## File Logging

All deletion operations are logged to:
- **Windows**: `%APPDATA%/folder-deleter/logs/`
- **macOS**: `~/Library/Application Support/folder-deleter/logs/`
- **Linux**: `~/.config/folder-deleter/logs/`

Log files include:
- Timestamp for each operation
- Success/failure status
- Error details for failed items
- Summary statistics

## Safety Features

- **Explicit confirmation** required before deletion
- **Preview mode** to review before deleting
- **Dry run mode** for safe testing
- **Exclusion patterns** to protect important files
- **Clear warnings** about permanent data loss
- **Path validation** to ensure only directories are deleted
- **Audit logging** for accountability

## Building Portable Executable

### Quick Build:
```bash
build-portable.bat
```

or

```bash
npm install
npm run build
```

**Output**: `dist/FolderForceDeleter-Portable.exe`

See [BUILD.md](BUILD.md) for detailed build instructions.

### Build Options:
- **Portable exe**: `npm run build` (single file, no install)
- **Installer**: `npm run build-installer` (NSIS installer)

## Requirements

### For Running:
- Windows 10/11, macOS, or Linux (x64)
- Administrator rights (recommended for Windows)

### For Building:
- Node.js (v14 or higher)
- npm or yarn
- ~500 MB free disk space

## Distribution

After building, you can:
1. Share the single `FolderForceDeleter-Portable.exe` file
2. No installation needed by end users
3. Runs directly on Windows 10/11

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT
