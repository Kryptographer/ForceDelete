# Performance Optimizations

## Anti-Freeze Improvements

### 1. Counting Phase
- **Depth limit**: Max 10 levels deep to prevent infinite recursion
- **Event loop yielding**: Every 50 items during counting
- **Estimation**: Returns estimate for very deep folders

### 2. Deletion Phase
- **Fast attribute removal**: Only quick `attrib` command (500ms timeout)
- **No recursive takeown/icacls**: These commands are only used as last resort per file
- **Frequent yielding**: Event loop yields every 20 items
- **Reduced timeouts**: 500ms-2000ms max per command

### 3. Ownership Strategy
**Priority order:**
1. Try Node.js `fs.unlinkSync()` (fastest)
2. Try `del /f /q` command
3. Last resort: `takeown + icacls + del` (only if first two fail)

This prevents the app from hanging on `takeown /r` and `icacls /t` commands which can take minutes on large folders.

## Why It Was Freezing

**Before:**
- Running `takeown /f "folder" /r /d y` (recursive) on every folder
- Running `icacls "folder" /grant administrators:F /t` (recursive) on every folder
- These commands could take 30+ seconds each on large folders
- UI completely frozen during these operations

**After:**
- Only run `attrib -r -s -h` (fast, non-recursive)
- Use takeown/icacls ONLY as last resort for stubborn files
- Yield to event loop frequently
- Show real-time progress updates

## Recommended Usage

For best performance and success rate:
1. **Run as Administrator** using `run-as-admin.bat`
2. Smaller folders (<1000 files) = instant deletion
3. Large folders (10,000+ files) = progress tracked, no freezing
4. Protected/system folders = requires admin mode

## Status Bar

The status bar shows:
- Current operation (Ready, Counting, Deleting, etc.)
- Admin status (Yes/No)
- Real-time progress during deletion
