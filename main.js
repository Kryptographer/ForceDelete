const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const os = require('os');
const windowsUtils = require('./windows-utils');

let mainWindow;

// Configuration
const CONFIG = {
  maxThreads: 8,
  workerTimeout: 60000, // 60 seconds timeout for workers
  maxRecentFolders: 10,
  logDir: path.join(app.getPath('userData'), 'logs'),
  settingsFile: path.join(app.getPath('userData'), 'settings.json')
};

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

// Ensure log directory exists
function ensureLogDir() {
  if (!fs.existsSync(CONFIG.logDir)) {
    fs.mkdirSync(CONFIG.logDir, { recursive: true });
  }
}

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(CONFIG.settingsFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.settingsFile, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not load settings:', e.message);
  }
  return { recentFolders: [], exclusionPatterns: [] };
}

// Save settings
function saveSettings(settings) {
  try {
    const dir = path.dirname(CONFIG.settingsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG.settingsFile, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.warn('Could not save settings:', e.message);
  }
}

// Add to recent folders
function addRecentFolder(folderPath) {
  const settings = loadSettings();
  const recent = settings.recentFolders || [];

  // Remove if already exists
  const index = recent.indexOf(folderPath);
  if (index > -1) {
    recent.splice(index, 1);
  }

  // Add to beginning
  recent.unshift(folderPath);

  // Keep only last N folders
  settings.recentFolders = recent.slice(0, CONFIG.maxRecentFolders);
  saveSettings(settings);
}

// Logging utility
class DeletionLogger {
  constructor(folderPath) {
    ensureLogDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = path.basename(folderPath).replace(/[^a-z0-9]/gi, '_');
    this.logFile = path.join(CONFIG.logDir, `deletion_${safeName}_${timestamp}.log`);
    this.entries = [];
    this.startTime = Date.now();
  }

  log(level, message, details = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details
    };
    this.entries.push(entry);
    const logLine = `[${entry.timestamp}] [${level}] ${message}${details ? ' | ' + JSON.stringify(details) : ''}\n`;
    fs.appendFileSync(this.logFile, logLine);
  }

  info(message, details) { this.log('INFO', message, details); }
  warn(message, details) { this.log('WARN', message, details); }
  error(message, details) { this.log('ERROR', message, details); }

  getSummary() {
    const duration = Date.now() - this.startTime;
    const errors = this.entries.filter(e => e.level === 'ERROR');
    const warnings = this.entries.filter(e => e.level === 'WARN');
    return {
      logFile: this.logFile,
      duration,
      totalEntries: this.entries.length,
      errors: errors.length,
      warnings: warnings.length,
      errorDetails: errors.slice(0, 10).map(e => e.message)
    };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 750,
    minWidth: 750,
    minHeight: 600,
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

ipcMain.handle('force-delete-folder', async (event, folderPath, options = {}) => {
  try {
    const result = await forceDeleteFolderWithProgress(folderPath, options, (progress) => {
      event.sender.send('delete-progress', progress);
    });

    // Add to recent folders on success
    if (result.success && !options.dryRun) {
      addRecentFolder(folderPath);
    }

    return result;
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

ipcMain.handle('get-recent-folders', async () => {
  const settings = loadSettings();
  // Filter out folders that no longer exist
  const existing = (settings.recentFolders || []).filter(f => fs.existsSync(f));
  return existing;
});

ipcMain.handle('clear-recent-folders', async () => {
  const settings = loadSettings();
  settings.recentFolders = [];
  saveSettings(settings);
  return true;
});

ipcMain.handle('get-exclusion-patterns', async () => {
  const settings = loadSettings();
  return settings.exclusionPatterns || [];
});

ipcMain.handle('save-exclusion-patterns', async (event, patterns) => {
  const settings = loadSettings();
  settings.exclusionPatterns = patterns;
  saveSettings(settings);
  return true;
});

ipcMain.handle('preview-deletion', async (event, folderPath, exclusionPatterns = []) => {
  try {
    const preview = await previewDeletion(folderPath, exclusionPatterns);
    return { success: true, preview };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Preview what will be deleted
async function previewDeletion(folderPath, exclusionPatterns = []) {
  if (!fs.existsSync(folderPath)) {
    throw new Error('Folder does not exist');
  }

  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  const items = await scanAllItems(folderPath);
  const excluded = [];
  const toDelete = [];

  for (const item of items) {
    if (shouldExclude(item, folderPath, exclusionPatterns)) {
      excluded.push(item);
    } else {
      toDelete.push(item);
    }
  }

  return {
    total: items.length,
    toDelete: toDelete.length,
    excluded: excluded.length,
    excludedFiles: excluded.slice(0, 20), // Show first 20 excluded
    sampleFiles: toDelete.slice(0, 20) // Show first 20 to delete
  };
}

// Check if file should be excluded based on patterns
function shouldExclude(filePath, basePath, patterns) {
  if (!patterns || patterns.length === 0) return false;

  const relativePath = path.relative(basePath, filePath);
  const fileName = path.basename(filePath);

  for (const pattern of patterns) {
    if (!pattern.trim()) continue;

    // Convert glob pattern to regex
    const regex = globToRegex(pattern.trim());

    if (regex.test(relativePath) || regex.test(fileName)) {
      return true;
    }
  }

  return false;
}

// Convert glob pattern to regex
function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

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
  const MAX_ITEMS = 10000;
  const MAX_DEPTH = 20;

  function calculateDir(dirPath, depth = 0) {
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
            if (itemsProcessed % 100 === 0) {
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
          console.warn(`Warning: Could not access ${itemPath}`);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${dirPath}`);
    }
  }

  const startTime = Date.now();
  const TIMEOUT = 5000;

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

async function forceDeleteFolderWithProgress(folderPath, options = {}, progressCallback) {
  const { dryRun = false, exclusionPatterns = [] } = options;
  const logger = new DeletionLogger(folderPath);

  logger.info('Starting deletion process', {
    folderPath,
    dryRun,
    exclusionPatterns,
    isAdmin,
    platform: process.platform
  });

  if (!fs.existsSync(folderPath)) {
    logger.error('Folder does not exist');
    throw new Error('Folder does not exist');
  }

  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    logger.error('Path is not a directory');
    throw new Error('Path is not a directory');
  }

  // Phase 0: Preparation (Windows only)
  if (process.platform === 'win32' && !dryRun) {
    progressCallback({ stage: 'prepare', percent: 0, message: 'Preparing folder for deletion...' });
    logger.info('Starting Windows preparation phase');

    try {
      const prepResult = await windowsUtils.prepareForDeletion(folderPath, (progress) => {
        progressCallback({ stage: 'prepare', percent: 5, message: progress.message });
        logger.info(progress.message);
      });

      if (prepResult.details.handles && prepResult.details.handles.terminatedProcesses.length > 0) {
        const procCount = prepResult.details.handles.terminatedProcesses.length;
        progressCallback({
          stage: 'prepare',
          percent: 8,
          message: `Closed ${procCount} process(es) with file locks`
        });
        logger.info(`Terminated ${procCount} processes with file locks`, {
          processes: prepResult.details.handles.terminatedProcesses
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      logger.warn('Preparation phase had errors', { error: e.message });
    }
  }

  // Phase 1: Scan all items
  progressCallback({ stage: 'scanning', percent: 10, message: 'Scanning folder structure...' });
  logger.info('Scanning folder structure');

  const allItems = await scanAllItems(folderPath);

  if (allItems.length === 0) {
    if (!dryRun) {
      try {
        fs.rmdirSync(folderPath);
        logger.info('Deleted empty directory');
        progressCallback({ stage: 'complete', percent: 100, message: 'Complete' });
        return { success: true, summary: logger.getSummary() };
      } catch (error) {
        logger.error('Failed to delete empty directory', { error: error.message });
        throw new Error(`Failed to delete empty directory: ${error.message}`);
      }
    } else {
      progressCallback({ stage: 'complete', percent: 100, message: 'Dry run complete - folder is empty' });
      return { success: true, dryRun: true, summary: logger.getSummary() };
    }
  }

  // Filter out excluded items
  const itemsToDelete = allItems.filter(item => !shouldExclude(item, folderPath, exclusionPatterns));
  const excludedCount = allItems.length - itemsToDelete.length;

  if (excludedCount > 0) {
    logger.info(`Excluded ${excludedCount} items based on patterns`);
  }

  const totalItems = itemsToDelete.length;
  progressCallback({
    stage: 'scanning',
    percent: 10,
    message: `Found ${totalItems} items to delete${excludedCount > 0 ? ` (${excludedCount} excluded)` : ''}`
  });
  logger.info(`Found ${totalItems} items to delete, ${excludedCount} excluded`);

  if (dryRun) {
    progressCallback({
      stage: 'complete',
      percent: 100,
      message: `Dry run complete - would delete ${totalItems} items`
    });
    return {
      success: true,
      dryRun: true,
      wouldDelete: totalItems,
      excluded: excludedCount,
      summary: logger.getSummary()
    };
  }

  // Phase 2: Multi-threaded deletion with timeout
  const numThreads = Math.min(os.cpus().length, CONFIG.maxThreads);
  const batchSize = Math.ceil(totalItems / numThreads);

  progressCallback({
    stage: 'deleting',
    percent: 15,
    message: `Using ${numThreads} threads for fast deletion...`
  });
  logger.info(`Starting multi-threaded deletion`, { threads: numThreads, batchSize });

  let deletedItems = 0;
  let failedItems = 0;
  const failedPaths = [];
  const workers = [];

  for (let i = 0; i < numThreads; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, totalItems);
    if (start >= totalItems) break;

    const batch = itemsToDelete.slice(start, end);

    const worker = new Worker(path.join(__dirname, 'deletion-worker.js'), {
      workerData: { items: batch }
    });

    const workerPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate();
        logger.warn(`Worker ${i} timed out after ${CONFIG.workerTimeout}ms`);
        reject(new Error(`Worker ${i} timed out`));
      }, CONFIG.workerTimeout);

      worker.on('message', (msg) => {
        clearTimeout(timeout);
        if (msg.success) {
          deletedItems += msg.result.deleted;
          failedItems += msg.result.failed;
          if (msg.result.failedPaths) {
            failedPaths.push(...msg.result.failedPaths);
          }

          const percent = Math.min(95, Math.floor((deletedItems / totalItems) * 100));
          progressCallback({
            stage: 'deleting',
            percent,
            message: `Deleted ${deletedItems} of ${totalItems} items (${failedItems} failed)`
          });

          resolve(msg.result);
        } else {
          logger.error(`Worker ${i} failed`, { error: msg.error });
          reject(new Error(msg.error));
        }
      });

      worker.on('error', (err) => {
        clearTimeout(timeout);
        logger.error(`Worker ${i} error`, { error: err.message });
        reject(err);
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          logger.warn(`Worker ${i} exited with code ${code}`);
        }
      });
    });

    workers.push(workerPromise.catch(err => {
      logger.warn(`Worker failed but continuing`, { error: err.message });
      return { deleted: 0, failed: batch.length };
    }));
  }

  await Promise.all(workers);

  logger.info(`Deletion phase complete`, { deleted: deletedItems, failed: failedItems });

  // Log failed paths
  if (failedPaths.length > 0) {
    logger.warn(`Failed to delete ${failedPaths.length} items`, {
      samples: failedPaths.slice(0, 10)
    });
  }

  // Phase 3: Clean up empty directories
  progressCallback({ stage: 'cleanup', percent: 96, message: 'Cleaning up directories...' });
  logger.info('Starting cleanup phase');

  await removeEmptyDirectories(folderPath);

  // Final cleanup - remove root folder
  try {
    await windowsUtils.forceDeleteDirectory(folderPath);
    logger.info('Removed root folder');
  } catch (e) {
    logger.warn('Could not remove root folder', { error: e.message });
  }

  const summary = logger.getSummary();

  progressCallback({
    stage: 'complete',
    percent: 100,
    message: `Complete! Deleted ${deletedItems} items, ${failedItems} failed`,
    summary
  });

  return {
    success: failedItems === 0 || deletedItems > 0,
    deleted: deletedItems,
    failed: failedItems,
    excluded: excludedCount,
    summary
  };
}

async function scanAllItems(dirPath) {
  const items = [];
  const dirsToScan = [dirPath];

  while (dirsToScan.length > 0) {
    const currentDir = dirsToScan.shift();

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

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

      if (items.length % 100 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    } catch (error) {
      console.warn(`Could not read directory: ${currentDir}`);
    }
  }

  return items;
}

async function removeEmptyDirectories(dirPath) {
  const dirs = [];

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

  dirs.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);

  for (const dir of dirs) {
    try {
      await windowsUtils.forceDeleteDirectory(dir);
    } catch (error) {
      // Skip if can't delete
    }
  }
}
