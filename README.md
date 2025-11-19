# Folder Force Deleter

An Electron application that allows you to browse for folders and force delete them permanently.

## Features

- **Multi-threaded deletion** - Uses all CPU cores for blazing fast deletion
- **Browse for folders** using native file dialog
- **Force delete** folders with ownership takeover
- **Real-time progress tracking** with percentage and item counts
- **Status bar** showing operation status and admin privileges
- **Folder information** display (size, file count)
- **Dark theme** with Teenage Engineering/Tesla design aesthetic
- **Safety warnings** with custom themed confirmation dialogs
- **Non-blocking UI** - never freezes during deletion
- **Cross-platform** support (Windows, macOS, Linux)

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
1. Click the **Browse** button to select a folder
2. View folder information (size and item count)
3. Click **Force Delete** to permanently delete the selected folder
4. Confirm the deletion in the warning dialog

**Note:** Some protected folders may require administrator privileges to delete.

## Development

For development with DevTools enabled:
```bash
npm run dev
```

## How It Works

### Architecture
- **Main Process** (`main.js`): Coordinates deletion and spawns worker threads
- **Worker Threads** (`deletion-worker.js`): Parallel file deletion workers
- **Renderer Process** (`renderer.js`): Manages the UI and user interactions
- **Preload Script** (`preload.js`): Securely exposes main process APIs to the renderer

### Multi-Threaded Force Delete

The app uses a 3-phase deletion process:

**Phase 1: Scanning** (10%)
- Scans entire folder structure
- Builds list of all files to delete
- Non-blocking with event loop yielding

**Phase 2: Parallel Deletion** (10-95%)
- Detects CPU core count (up to 8 threads)
- Splits files into equal batches
- Each worker thread deletes its batch in parallel
- Real-time progress updates as batches complete
- Uses multiple fallback methods:
  1. Node.js `fs.unlinkSync()` (fastest)
  2. Windows `del /f /q` command
  3. `takeown + icacls` (last resort for protected files)

**Phase 3: Cleanup** (95-100%)
- Removes empty directories
- Cleans up root folder
- Reports final statistics

### Performance
- **1,000 files**: ~1-2 seconds
- **10,000 files**: ~5-10 seconds  
- **100,000 files**: ~30-60 seconds (with admin rights)
- Speed scales with CPU core count

## Safety Features

- **Explicit confirmation** required before deletion
- **Clear warnings** about permanent data loss
- **Path validation** to ensure only directories are deleted
- **Error handling** with informative messages

## Building Portable Executable

To create a standalone portable .exe file:

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

See [BUILD.md](BUILD.md) for detailed build instructions and troubleshooting.

### Build Options:
- **Portable exe**: `npm run build` (single file, no install)
- **Installer**: `npm run build-installer` (NSIS installer)

## Requirements

### For Running:
- Windows 10/11 (x64)
- Administrator rights (recommended)

### For Building:
- Node.js (v14 or higher)
- npm or yarn
- ~500 MB free disk space

## Distribution

After building, you can:
1. Share the single `FolderForceDeleter-Portable.exe` file
2. No installation needed by end users
3. Runs directly on Windows 10/11

## License

MIT
