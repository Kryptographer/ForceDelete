const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Windows-specific utilities for force deletion
 * Handles ownership, permissions, and locked file handles
 */

/**
 * Take ownership of a folder and all its contents recursively
 * @param {string} folderPath - Path to the folder
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function takeOwnership(folderPath) {
  if (process.platform !== 'win32') {
    return { success: true }; // Not needed on non-Windows
  }

  try {
    console.log(`Taking ownership of: ${folderPath}`);

    // Take ownership recursively with error suppression
    // /r = recursive, /d y = default yes to prompts, /f = file/folder
    execSync(`takeown /f "${folderPath}" /r /d y`, {
      stdio: 'ignore',
      timeout: 30000,
      windowsHide: true
    });

    return { success: true };
  } catch (error) {
    // Even if takeown partially fails, continue - we'll try per-file later
    console.warn(`Takeown had issues (will continue): ${error.message}`);
    return { success: true, warning: error.message };
  }
}

/**
 * Grant full permissions to everyone on a folder and all contents
 * @param {string} folderPath - Path to the folder
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function grantFullPermissions(folderPath) {
  if (process.platform !== 'win32') {
    return { success: true };
  }

  try {
    console.log(`Granting full permissions to: ${folderPath}`);

    // Grant full control to everyone recursively
    // /t = recursive, /c = continue on errors, /q = quiet
    execSync(`icacls "${folderPath}" /grant Everyone:F /t /c /q`, {
      stdio: 'ignore',
      timeout: 30000,
      windowsHide: true
    });

    return { success: true };
  } catch (error) {
    console.warn(`icacls had issues (will continue): ${error.message}`);
    return { success: true, warning: error.message };
  }
}

/**
 * Remove all file attributes (read-only, system, hidden) recursively
 * @param {string} folderPath - Path to the folder
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function removeFileAttributes(folderPath) {
  if (process.platform !== 'win32') {
    return { success: true };
  }

  try {
    console.log(`Removing file attributes from: ${folderPath}`);

    // Remove read-only, system, and hidden attributes recursively
    // /s = recursive subdirectories, /d = include directories
    execSync(`attrib -r -s -h "${folderPath}\\*" /s /d`, {
      stdio: 'ignore',
      timeout: 30000,
      windowsHide: true
    });

    return { success: true };
  } catch (error) {
    console.warn(`attrib had issues (will continue): ${error.message}`);
    return { success: true, warning: error.message };
  }
}

/**
 * Find and close file handles to files in the target folder
 * Uses PowerShell to find processes with open handles
 * @param {string} folderPath - Path to the folder
 * @returns {Promise<{closedHandles: number, terminatedProcesses: string[]}>}
 */
async function closeFileHandles(folderPath) {
  if (process.platform !== 'win32') {
    return { closedHandles: 0, terminatedProcesses: [] };
  }

  try {
    console.log(`Searching for processes with open handles to: ${folderPath}`);

    // PowerShell script to find processes with handles to files in the folder
    const psScript = `
      $targetPath = "${folderPath.replace(/\\/g, '\\\\')}"
      $processes = @{}

      # Get all processes with handles (excluding system processes)
      Get-Process | Where-Object {
        $_.Id -gt 4 -and $_.ProcessName -notin @('System', 'Registry', 'Idle', 'csrss', 'smss', 'wininit', 'services', 'lsass')
      } | ForEach-Object {
        try {
          $proc = $_
          $modules = $proc.Modules | Where-Object {
            $_.FileName -like "$targetPath*"
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

      # Also check for file handles using openfiles if available
      try {
        $openFiles = openfiles /query /fo csv /v 2>$null | ConvertFrom-Csv
        $openFiles | Where-Object {
          $_.'Open File (Path\\executable)' -like "$targetPath*"
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
        # openfiles might not be available
      }

      # Output processes as JSON
      $processes.Values | ConvertTo-Json -Compress
    `.trim();

    // Execute PowerShell script
    let output;
    try {
      output = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
    } catch (psError) {
      console.warn('PowerShell handle detection failed:', psError.message);
      return { closedHandles: 0, terminatedProcesses: [] };
    }

    if (!output || output.trim() === '') {
      console.log('No processes found with open handles');
      return { closedHandles: 0, terminatedProcesses: [] };
    }

    // Parse the JSON output
    let processes = [];
    try {
      const parsed = JSON.parse(output);
      processes = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.warn('Could not parse process list');
      return { closedHandles: 0, terminatedProcesses: [] };
    }

    const terminatedProcesses = [];

    // Try to terminate each process
    for (const proc of processes) {
      if (!proc || !proc.Id) continue;

      try {
        console.log(`Attempting to terminate process: ${proc.Name} (PID: ${proc.Id})`);

        // Try graceful termination first
        execSync(`taskkill /PID ${proc.Id} /T`, {
          stdio: 'ignore',
          timeout: 5000,
          windowsHide: true
        });

        terminatedProcesses.push(`${proc.Name} (${proc.Id})`);

        // Wait a moment for process to exit
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (killError) {
        // Try force kill
        try {
          execSync(`taskkill /PID ${proc.Id} /F /T`, {
            stdio: 'ignore',
            timeout: 5000,
            windowsHide: true
          });

          terminatedProcesses.push(`${proc.Name} (${proc.Id}) [forced]`);
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (forceKillError) {
          console.warn(`Could not terminate process ${proc.Id}: ${forceKillError.message}`);
        }
      }
    }

    console.log(`Terminated ${terminatedProcesses.length} processes`);
    return {
      closedHandles: terminatedProcesses.length,
      terminatedProcesses
    };

  } catch (error) {
    console.error(`Error closing file handles: ${error.message}`);
    return { closedHandles: 0, terminatedProcesses: [] };
  }
}

/**
 * Comprehensive preparation of folder for deletion
 * Takes ownership, grants permissions, removes attributes, and closes handles
 * @param {string} folderPath - Path to the folder
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<{success: boolean, details: object}>}
 */
async function prepareForDeletion(folderPath, progressCallback = () => {}) {
  if (process.platform !== 'win32') {
    return { success: true, details: { message: 'Not Windows, no preparation needed' } };
  }

  const details = {
    ownership: null,
    permissions: null,
    attributes: null,
    handles: null
  };

  try {
    // Step 1: Take ownership
    progressCallback({ stage: 'prepare', message: 'Taking ownership of folder...' });
    details.ownership = await takeOwnership(folderPath);

    // Step 2: Grant full permissions
    progressCallback({ stage: 'prepare', message: 'Granting full permissions...' });
    details.permissions = await grantFullPermissions(folderPath);

    // Step 3: Remove file attributes
    progressCallback({ stage: 'prepare', message: 'Removing file attributes...' });
    details.attributes = await removeFileAttributes(folderPath);

    // Step 4: Close file handles
    progressCallback({ stage: 'prepare', message: 'Closing file handles and terminating processes...' });
    details.handles = await closeFileHandles(folderPath);

    // Wait a moment for everything to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    return { success: true, details };
  } catch (error) {
    console.error('Error during preparation:', error);
    return { success: false, details, error: error.message };
  }
}

/**
 * Force delete a single file with all available methods
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - true if deleted, false if failed
 */
async function forceDeleteFile(filePath) {
  // Method 1: Standard fs.unlinkSync
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    // Continue to next method
  }

  if (process.platform !== 'win32') {
    return false; // No more methods on non-Windows
  }

  // Method 2: Remove attributes and try again
  try {
    execSync(`attrib -r -s -h "${filePath}"`, { stdio: 'ignore', timeout: 300, windowsHide: true });
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    // Continue
  }

  // Method 3: del command
  try {
    execSync(`del /f /q "${filePath}"`, { stdio: 'ignore', timeout: 500, windowsHide: true });
    return true;
  } catch (e) {
    // Continue
  }

  // Method 4: Take ownership and grant permissions, then delete
  try {
    execSync(`takeown /f "${filePath}" && icacls "${filePath}" /grant Everyone:F && del /f /q "${filePath}"`, {
      stdio: 'ignore',
      timeout: 2000,
      windowsHide: true
    });
    return true;
  } catch (e) {
    // All methods failed
  }

  return false;
}

/**
 * Force delete a single directory
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<boolean>} - true if deleted, false if failed
 */
async function forceDeleteDirectory(dirPath) {
  // Method 1: Standard fs.rmdirSync
  try {
    fs.rmdirSync(dirPath);
    return true;
  } catch (e) {
    // Continue
  }

  if (process.platform !== 'win32') {
    return false;
  }

  // Method 2: rmdir command
  try {
    execSync(`rmdir /s /q "${dirPath}"`, { stdio: 'ignore', timeout: 1000, windowsHide: true });
    return true;
  } catch (e) {
    // Continue
  }

  // Method 3: Take ownership and delete
  try {
    execSync(`takeown /f "${dirPath}" /r /d y && icacls "${dirPath}" /grant Everyone:F /t && rmdir /s /q "${dirPath}"`, {
      stdio: 'ignore',
      timeout: 3000,
      windowsHide: true
    });
    return true;
  } catch (e) {
    // All methods failed
  }

  return false;
}

module.exports = {
  takeOwnership,
  grantFullPermissions,
  removeFileAttributes,
  closeFileHandles,
  prepareForDeletion,
  forceDeleteFile,
  forceDeleteDirectory
};
