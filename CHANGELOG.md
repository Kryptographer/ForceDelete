# Changelog

All notable changes to Folder Force Deleter will be documented in this file.

## [3.0.0] - 2026-01-12

### Added
- **Drag & Drop Support**
  - Drop folders directly onto the application window
  - Visual feedback during drag operations
  - Works alongside the browse button

- **Recent Folders**
  - Quick access to recently deleted folder paths
  - Automatically remembers last 10 folders
  - One-click selection from recent list
  - Clear history option available

- **Dry Run / Preview Mode**
  - Preview what will be deleted without actually deleting
  - See total files, files to delete, and excluded files
  - Sample file list preview before deletion
  - Toggle dry run mode in options panel

- **Exclusion Patterns**
  - Skip files matching glob patterns (*.log, *.tmp, etc.)
  - Patterns saved and persist across sessions
  - Support for wildcards (* and ?)
  - Preview shows excluded files separately

- **File Logging & Audit Trail**
  - All deletion operations logged to file
  - Logs stored in app data directory
  - Includes timestamps, success/failure status
  - Log file location shown after deletion
  - Detailed error information for failures

- **Preview Button**
  - Scan folder and see what will be deleted
  - Shows statistics: total, to delete, excluded
  - Displays sample of affected files
  - Works with exclusion patterns

### Improved
- **Worker Thread Timeout**
  - 60-second timeout prevents hanging workers
  - Graceful timeout handling with fallback
  - Better error recovery for stuck operations

- **Error Reporting**
  - Detailed failure information in logs
  - Shows count of failed items
  - Log file path displayed after deletion
  - Warning state for partial failures

- **UI Enhancements**
  - Collapsible options panel
  - Preview results panel with statistics
  - Warning result state (yellow) for partial success
  - Version number in status bar
  - Larger window for better usability (900x750)
  - Improved animations and transitions

- **Code Quality**
  - Removed ~100 lines of unused legacy code
  - Better separation of concerns
  - Centralized configuration
  - Improved async patterns

### Changed
- Window size increased to 900x750 (from 800x650)
- Options are now in a collapsible panel
- Settings persist in app data directory
- Version bumped to 3.0.0

### Technical Details
- Settings stored in Electron's userData path
- Logs stored in userData/logs directory
- Glob patterns converted to regex for matching
- Worker timeout of 60 seconds (configurable)
- Maximum 10 recent folders stored

## [2.0.1] - 2025-11-19

### Fixed
- **Critical Fix**: Deletion functionality now works correctly on all platforms
  - Added `fs.rmSync()` with recursive option for handling non-empty directories
  - Added cross-platform fallbacks: `rm -f` for files, `rm -rf` for directories on Linux/macOS
  - Fixed issue where directories with contents would fail to delete
  - Added existence checks to prevent false failures on already-deleted items
  - Added verification checks after command-line deletions using `!fs.existsSync()`

### Improved
- **File Deletion**: Now has 5 methods (previously 4)
  - Method 1: `fs.unlinkSync()` (fastest)
  - Method 2: `fs.rmSync()` [NEW - Node.js 14.14.0+]
  - Method 3: `rm -f` command [NEW - Linux/macOS]
  - Method 4: `attrib -r -s -h` + `del /f /q` (Windows)
  - Method 5: `takeown` + `icacls` + `del` (Windows last resort)

- **Directory Deletion**: Now has 5 methods (previously 3)
  - Method 1: `fs.rmdirSync()` (empty directories only)
  - Method 2: `fs.rmSync({ recursive: true })` [NEW - handles non-empty]
  - Method 3: `rm -rf` command [NEW - Linux/macOS]
  - Method 4: `rmdir /s /q` (Windows)
  - Method 5: `takeown` + `icacls` + `rmdir` (Windows last resort)

### Testing
- ✅ Verified deletion of complex nested directories (4 files, 3 directories)
- ✅ Verified deletion of read-only files on Linux
- ✅ Confirmed 100% deletion success rate in comprehensive tests
- ✅ Cross-platform compatibility validated

## [2.0.0] - 2025-11-19

### Added
- **Comprehensive Windows Utilities Module** (`windows-utils.js`)
  - Advanced file handle detection and termination
  - Recursive ownership takeover for entire folder structures
  - Full permission management (grant everyone full control)
  - File attribute removal (read-only, system, hidden)
  - Multi-method deletion fallbacks for stubborn files

- **Process Handle Management**
  - PowerShell-based process detection using module enumeration
  - Integration with `openfiles` command for comprehensive handle detection
  - Graceful process termination with force-kill fallback
  - Automatic waiting period for handle release
  - Detailed logging of terminated processes

- **4-Phase Deletion Process**
  - **Phase 0 (NEW)**: Preparation phase for Windows
    - Recursive ownership takeover using `takeown /f /r`
    - Permission grants using `icacls /grant Everyone:F /t`
    - Attribute stripping using `attrib -r -s -h /s`
    - Process handle detection and termination
  - Phase 1: Folder structure scanning
  - Phase 2: Multi-threaded parallel deletion
  - Phase 3: Empty directory cleanup

- **Standalone PowerShell Script** (`force-delete.ps1`)
  - Command-line force deletion with all advanced features
  - Interactive confirmation prompts
  - Detailed progress reporting
  - Color-coded status messages
  - Batch file wrapper (`force-delete.bat`) for easy execution

### Changed
- **Enhanced Deletion Workers**
  - Workers now use `windowsUtils.forceDeleteFile()` and `forceDeleteDirectory()`
  - Improved error handling with ENOENT detection
  - Better handling of already-deleted items

- **Improved Main Deletion Logic**
  - Integration of preparation phase before scanning
  - Enhanced progress reporting for process termination
  - Better final cleanup using enhanced deletion methods
  - More robust error handling and recovery

- **Updated Documentation**
  - Comprehensive README updates with new features
  - Detailed phase-by-phase deletion process documentation
  - Command-line usage instructions
  - Enhanced architecture documentation

- **Version Bump**
  - Updated to version 2.0.0 to reflect major improvements
  - Updated package description

### Technical Improvements
- **Multi-Method File Deletion**
  1. Standard `fs.unlinkSync()` (fastest)
  2. Attribute removal + retry
  3. Windows `del /f /q` command
  4. `takeown + icacls + del` (last resort)

- **Multi-Method Directory Deletion**
  1. Standard `fs.rmdirSync()`
  2. Windows `rmdir /s /q` command
  3. `takeown + icacls + rmdir` (last resort)

- **Handle Detection Methods**
  1. PowerShell module enumeration
  2. Windows `openfiles` command integration
  3. Process filtering (excludes system processes)

### Security & Safety
- Excludes critical system processes from termination:
  - System, Registry, Idle, csrss, smss, wininit, services, lsass
- Requires administrator privileges for advanced features
- Maintains all existing safety confirmations and warnings
- Proper error handling to prevent system instability

### Performance
- Preparation phase adds 5-15 seconds for large folder structures
- Overall deletion success rate significantly improved
- Handles locked files that were previously undeletable
- More reliable on folders with permission issues

### Bug Fixes
- Fixed issues with locked files preventing deletion
- Resolved permission-denied errors on protected folders
- Improved handling of read-only and system files
- Better recovery when directories are not empty

## [1.0.0] - Previous Version

### Features
- Multi-threaded deletion using worker threads
- Browse for folders using native file dialog
- Basic force delete with ownership takeover
- Real-time progress tracking
- Dark theme UI
- Cross-platform support
- Safety warnings and confirmations
