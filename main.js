const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const os = require('os');
const windowsUtils = require('./windows-utils');

let mainWindow;

// Request admin privileges on Windows
let isAdmin = false;
if (process.platform === 'win32') {
  const { execSync } = require('child_process');
  
  // Check if running as admin
  try {
    execSync('net session', { stdio: 'ignore' });
    console.log('Running with admin privileges');
    isAdmin = true;
  } catch (e) {
    console.log('Not running as admin - some operations may fail');
    isAdmin = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 650,
    minWidth: 700,
    minHeight: 550,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    backgroundColor: '#0a0a0a',
    show: false,
    autoHideMenuBar: true,
    darkTheme: true,
    resizable: true
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('force-delete-folder', async (event, folderPath) => {
  try {
    await forceDeleteFolderWithProgress(folderPath, (progress) => {
      // Send progress updates to renderer
      event.sender.send('delete-progress', progress);
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-folder-info', async (event, folderPath) => {
  try {
    const info = await calculateFolderInfo(folderPath);
    return { success: true, info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-admin', async () => {
  return { isAdmin };
});

async function calculateFolderInfo(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error('Folder does not exist');
  }

  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  let totalSize = 0;
  let fileCount = 0;
  let folderCount = 0;
  let itemsProcessed = 0;
  const MAX_ITEMS = 10000; // Prevent hanging on huge folders
  const MAX_DEPTH = 20; // Prevent infinite recursion

  function calculateDir(dirPath, depth = 0) {
    // Stop if we've processed too many items or gone too deep
    if (itemsProcessed >= MAX_ITEMS || depth >= MAX_DEPTH) {
      return;
    }

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        if (itemsProcessed >= MAX_ITEMS) break;
        
        const itemPath = path.join(dirPath, item.name);
        itemsProcessed++;
        
        try {
          if (item.isDirectory()) {
            folderCount++;
            // Use async-like behavior by yielding occasionally
            if (itemsProcessed % 100 === 0) {
              // Allow event loop to process
              setImmediate(() => {});
            }
            calculateDir(itemPath, depth + 1);
          } else if (item.isFile()) {
            fileCount++;
            try {
              const itemStats = fs.statSync(itemPath);
              totalSize += itemStats.size;
            } catch (e) {
              // Skip files we can't stat
            }
          }
        } catch (error) {
          // Skip items we can't access
          console.warn(`Warning: Could not access ${itemPath}`);
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`Warning: Could not read directory ${dirPath}`);
    }
  }

  // Start calculation with timeout protection
  const startTime = Date.now();
  const TIMEOUT = 5000; // 5 second timeout
  
  try {
    calculateDir(folderPath, 0);
    
    const elapsed = Date.now() - startTime;
    if (elapsed > TIMEOUT) {
      console.warn('Folder info calculation timed out');
    }
  } catch (error) {
    console.warn(`Warning: Error calculating folder info: ${error.message}`);
  }

  return { 
    size: totalSize, 
    files: fileCount, 
    folders: folderCount,
    limited: itemsProcessed >= MAX_ITEMS
  };
}

async function forceDeleteFolderWithProgress(folderPath, progressCallback) {
  if (!fs.existsSync(folderPath)) {
    throw new Error('Folder does not exist');
  }

  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  // Phase 0: Preparation (Windows only - take ownership, grant permissions, close handles)
  if (process.platform === 'win32') {
    progressCallback({ stage: 'prepare', percent: 0, message: 'Preparing folder for deletion...' });

    const prepResult = await windowsUtils.prepareForDeletion(folderPath, (progress) => {
      progressCallback({ stage: 'prepare', percent: 5, message: progress.message });
    });

    if (prepResult.details.handles && prepResult.details.handles.terminatedProcesses.length > 0) {
      const procCount = prepResult.details.handles.terminatedProcesses.length;
      progressCallback({
        stage: 'prepare',
        percent: 8,
        message: `Closed ${procCount} process(es) with file locks`
      });
    }

    // Wait for handles to fully release
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Phase 1: Scan all items
  progressCallback({ stage: 'scanning', percent: 10, message: 'Scanning folder structure...' });
  const allItems = await scanAllItems(folderPath);
  
  if (allItems.length === 0) {
    // Empty directory, just remove it
    try {
      fs.rmdirSync(folderPath);
      progressCallback({ stage: 'complete', percent: 100, message: 'Complete' });
      return;
    } catch (error) {
      throw new Error(`Failed to delete empty directory: ${error.message}`);
    }
  }

  const totalItems = allItems.length;
  progressCallback({ stage: 'scanning', percent: 10, message: `Found ${totalItems} items to delete` });

  // Phase 2: Multi-threaded deletion
  const numThreads = Math.min(os.cpus().length, 8); // Max 8 threads
  const batchSize = Math.ceil(totalItems / numThreads);
  
  progressCallback({ 
    stage: 'deleting', 
    percent: 15, 
    message: `Using ${numThreads} threads for fast deletion...` 
  });

  let deletedItems = 0;
  let failedItems = 0;
  const workers = [];

  // Split work into batches
  for (let i = 0; i < numThreads; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, totalItems);
    if (start >= totalItems) break;

    const batch = allItems.slice(start, end);
    
    const worker = new Worker(path.join(__dirname, 'deletion-worker.js'), {
      workerData: { items: batch }
    });

    workers.push(new Promise((resolve, reject) => {
      worker.on('message', (msg) => {
        if (msg.success) {
          deletedItems += msg.result.deleted;
          failedItems += msg.result.failed;
          
          const percent = Math.min(95, Math.floor((deletedItems / totalItems) * 100));
          progressCallback({
            stage: 'deleting',
            percent,
            message: `Deleted ${deletedItems} of ${totalItems} items (${failedItems} failed)`
          });
          
          resolve(msg.result);
        } else {
          reject(new Error(msg.error));
        }
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    }));
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  // Phase 3: Clean up empty directories
  progressCallback({ stage: 'cleanup', percent: 96, message: 'Cleaning up directories...' });
  await removeEmptyDirectories(folderPath);

  // Final cleanup - remove root folder
  try {
    await windowsUtils.forceDeleteDirectory(folderPath);
  } catch (e) {
    console.warn('Could not remove root folder:', e.message);
  }

  progressCallback({ 
    stage: 'complete', 
    percent: 100, 
    message: `Complete! Deleted ${deletedItems} items, ${failedItems} failed` 
  });
}

// Scan all files and directories (depth-first for files, breadth-first for dirs)
async function scanAllItems(dirPath) {
  const items = [];
  const dirsToScan = [dirPath];
  
  while (dirsToScan.length > 0) {
    const currentDir = dirsToScan.shift();
    
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      // First collect all files
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        try {
          if (entry.isFile()) {
            items.push(fullPath);
          } else if (entry.isDirectory()) {
            dirsToScan.push(fullPath);
          }
        } catch (error) {
          // Skip inaccessible items
        }
      }
      
      // Yield every 100 items
      if (items.length % 100 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`Could not read directory: ${currentDir}`);
    }
  }
  
  return items;
}

// Remove empty directories after files are deleted
async function removeEmptyDirectories(dirPath) {
  const dirs = [];
  
  // Collect all directories
  function collectDirs(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(currentDir, entry.name);
          dirs.push(fullPath);
          collectDirs(fullPath);
        }
      }
    } catch (error) {
      // Skip
    }
  }
  
  collectDirs(dirPath);
  
  // Sort by depth (deepest first)
  dirs.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
  
  // Remove directories
  for (const dir of dirs) {
    try {
      await windowsUtils.forceDeleteDirectory(dir);
    } catch (error) {
      // Skip if can't delete
    }
  }
}

async function removeDirectoryRecursiveWithProgress(dirPath, onItemDeleted) {
  if (fs.existsSync(dirPath)) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const { execSync } = require('child_process');
    let itemsProcessed = 0;
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      itemsProcessed++;
      
      try {
        // Take ownership and remove restrictions on Windows (non-recursive, per item)
        if (process.platform === 'win32') {
          try {
            // Quick attribute removal only (no takeown/icacls as they're too slow)
            execSync(`attrib -r -s -h "${fullPath}"`, { stdio: 'ignore', timeout: 500 });
          } catch (e) {
            // Continue anyway
          }
        }
        
        if (entry.isDirectory()) {
          await removeDirectoryRecursiveWithProgress(fullPath, onItemDeleted);
        } else {
          // Try multiple methods to delete file
          try {
            fs.unlinkSync(fullPath);
          } catch (e) {
            // Try force delete via command line
            if (process.platform === 'win32') {
              try {
                execSync(`del /f /q "${fullPath}"`, { stdio: 'ignore', timeout: 1000 });
              } catch (cmdError) {
                // Last resort - try takeown on this specific file
                try {
                  execSync(`takeown /f "${fullPath}" && icacls "${fullPath}" /grant administrators:F && del /f /q "${fullPath}"`, { stdio: 'ignore', timeout: 2000 });
                } catch (lastError) {
                  throw e; // Give up on this file
                }
              }
            } else {
              throw e;
            }
          }
          onItemDeleted();
        }
      } catch (error) {
        // Continue trying to delete other files even if one fails
        console.warn(`Warning: Could not delete ${fullPath}: ${error.message}`);
        onItemDeleted(); // Count it anyway to keep progress moving
      }
      
      // Yield to event loop every 20 items
      if (itemsProcessed % 20 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Try to remove the directory itself
    try {
      fs.rmdirSync(dirPath);
      onItemDeleted();
    } catch (error) {
      // Try force delete via command line
      if (process.platform === 'win32') {
        try {
          execSync(`rmdir /s /q "${dirPath}"`, { stdio: 'ignore', timeout: 1000 });
          onItemDeleted();
          return;
        } catch (cmdError) {
          // Try with takeown
          try {
            execSync(`takeown /f "${dirPath}" && icacls "${dirPath}" /grant administrators:F && rmdir /s /q "${dirPath}"`, { stdio: 'ignore', timeout: 2000 });
            onItemDeleted();
            return;
          } catch (lastError) {
            // Continue to retry
          }
        }
      }
      
      // If directory removal fails, try one more time after a short delay
      await new Promise(resolve => setTimeout(resolve, 50));
      try {
        fs.rmdirSync(dirPath);
        onItemDeleted();
      } catch (finalError) {
        console.warn(`Warning: Could not remove directory ${dirPath}: ${finalError.message}`);
        onItemDeleted(); // Count it anyway
      }
    }
  }
}
