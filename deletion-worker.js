const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Worker thread for parallel deletion
async function deleteItems(items) {
  let deleted = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const stats = fs.statSync(item);
      
      // Quick attribute removal
      if (process.platform === 'win32') {
        try {
          execSync(`attrib -r -s -h "${item}"`, { stdio: 'ignore', timeout: 300 });
        } catch (e) {
          // Continue
        }
      }

      if (stats.isDirectory()) {
        // Try to delete empty directory
        try {
          fs.rmdirSync(item);
          deleted++;
        } catch (e) {
          // Try command line
          if (process.platform === 'win32') {
            try {
              execSync(`rmdir /s /q "${item}"`, { stdio: 'ignore', timeout: 1000 });
              deleted++;
            } catch (cmdError) {
              failed++;
            }
          } else {
            failed++;
          }
        }
      } else {
        // Delete file
        try {
          fs.unlinkSync(item);
          deleted++;
        } catch (e) {
          // Try command line
          if (process.platform === 'win32') {
            try {
              execSync(`del /f /q "${item}"`, { stdio: 'ignore', timeout: 500 });
              deleted++;
            } catch (cmdError) {
              // Last resort with takeown
              try {
                execSync(`takeown /f "${item}" && icacls "${item}" /grant administrators:F && del /f /q "${item}"`, 
                  { stdio: 'ignore', timeout: 1500 });
                deleted++;
              } catch (finalError) {
                failed++;
              }
            }
          } else {
            failed++;
          }
        }
      }
    } catch (error) {
      failed++;
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
