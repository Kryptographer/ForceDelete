# Building Folder Force Deleter

## Portable Executable (.exe)

### Quick Build

**Option 1 - Batch Script (Recommended):**
```bash
build-portable.bat
```

**Option 2 - PowerShell Script:**
```powershell
.\build-portable.ps1
```

**Option 3 - NPM Command:**
```bash
npm install
npm run build
```

### What Gets Built

- **Output**: `dist/FolderForceDeleter-Portable.exe`
- **Size**: ~150-200 MB (includes Electron runtime)
- **Architecture**: x64 (64-bit Windows)
- **Portable**: No installation required

### Build Process

1. **Install dependencies** (if not already installed)
2. **Install electron-builder** (build tool)
3. **Package application** with Electron
4. **Create portable .exe** in `dist` folder

Typical build time: **2-5 minutes** (first build is slower)

## Build Requirements

- **Node.js** 14.x or higher
- **npm** 6.x or higher
- **Windows** (for building Windows executables)
- **~500 MB** free disk space

## Output Files

After building, you'll find in `dist/`:

```
FolderForceDeleter-Portable.exe    (Portable executable)
builder-debug.yml                   (Build info)
```

## Using the Portable Exe

1. **Copy anywhere** - No installation needed
2. **Run directly** - Double-click to start
3. **Request admin** - Right-click → "Run as administrator" for full features
4. **Share easily** - Single file, ready to use

## Build Configuration

Configuration is in `package.json` under `"build"`:

```json
{
  "build": {
    "win": {
      "target": "portable",
      "requestedExecutionLevel": "requireAdministrator"
    },
    "portable": {
      "artifactName": "FolderForceDeleter-Portable.exe"
    }
  }
}
```

### Build Options

**Portable (current):**
```bash
npm run build
```
- Single .exe file
- No installation
- Extracts to temp folder on run

**Installer (alternative):**
```bash
npm run build-installer
```
- NSIS installer
- Install to Program Files
- Start menu shortcuts

## Troubleshooting

### "electron-builder not found"
```bash
npm install --save-dev electron-builder
```

### "Build failed - ENOENT"
Make sure you're in the project directory:
```bash
cd c:/Users/North/Desktop/FD
```

### "Out of memory"
Close other applications and try again, or:
```bash
set NODE_OPTIONS=--max-old-space-size=4096
npm run build
```

### "Missing icon.ico"
The build will work without it. To add an icon:
1. Create `build` folder
2. Add `icon.ico` (256x256 or larger)

## Advanced Options

### Custom output name:
Edit `package.json`:
```json
"portable": {
  "artifactName": "MyCustomName-v${version}.exe"
}
```

### Build for 32-bit:
```json
"target": {
  "target": "portable",
  "arch": ["ia32"]
}
```

### Include extra files:
```json
"files": [
  "**/*",
  "extra-folder/**/*"
]
```

## Distribution

The portable .exe contains:
- ✅ Your application code
- ✅ Electron runtime
- ✅ Node.js
- ✅ All dependencies
- ✅ Multi-threaded deletion engine
- ✅ Dark theme UI

**Total size**: ~150-200 MB (but it's a single file!)

## Version Management

Update version before building:

Edit `package.json`:
```json
{
  "version": "1.0.0"  // Change this
}
```

The version appears in the exe properties.

## Automated Building

Create a scheduled build:

**build-and-release.bat:**
```batch
@echo off
call npm run build
copy dist\FolderForceDeleter-Portable.exe "C:\Releases\FD-v%date:~-4,4%%date:~-10,2%%date:~-7,2%.exe"
echo Built and copied to releases folder
```

## Security Notes

- The `.exe` is **code-signed** if you have a certificate
- Windows Defender may flag it as "unknown publisher"
- Users can right-click → Properties → Unblock

## Performance

**Build performance:**
- First build: 3-5 minutes
- Subsequent builds: 1-2 minutes (cached)
- Clean build: 2-3 minutes

**Executable performance:**
- First run: ~3-5 seconds (extracts to temp)
- Subsequent runs: ~1-2 seconds (cached)
- File size: ~150-200 MB

## Next Steps

After building:

1. **Test the .exe** on a clean Windows machine
2. **Scan with antivirus** to verify it's clean
3. **Document requirements** (Windows 10/11, x64)
4. **Create release notes** for users
5. **Upload to GitHub/drive** for distribution
