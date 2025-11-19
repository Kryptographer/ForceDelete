const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const windowsUtils = require('./windows-utils');

// Worker thread for parallel deletion
async function deleteItems(items) {
  let deleted = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // Check if item still exists (might have been deleted by parent directory deletion)
      if (!fs.existsSync(item)) {
        deleted++;
        continue;
      }

      const stats = fs.statSync(item);

      if (stats.isDirectory()) {
        // Use enhanced directory deletion
        const success = await windowsUtils.forceDeleteDirectory(item);
        if (success) {
          deleted++;
        } else {
          failed++;
        }
      } else {
        // Use enhanced file deletion
        const success = await windowsUtils.forceDeleteFile(item);
        if (success) {
          deleted++;
        } else {
          failed++;
        }
      }
    } catch (error) {
      // Item doesn't exist or can't be accessed
      if (error.code === 'ENOENT') {
        // Already deleted
        deleted++;
      } else {
        failed++;
      }
    }
  }

  return { deleted, failed };
}

// Process the batch
deleteItems(workerData.items)
  .then(result => {
    parentPort.postMessage({ success: true, result });
  })
  .catch(error => {
    parentPort.postMessage({ success: false, error: error.message });
  });
