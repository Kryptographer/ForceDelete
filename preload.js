const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Folder selection
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // Deletion operations
  forceDeleteFolder: (folderPath, options) => ipcRenderer.invoke('force-delete-folder', folderPath, options),
  previewDeletion: (folderPath, exclusionPatterns) => ipcRenderer.invoke('preview-deletion', folderPath, exclusionPatterns),

  // Folder info
  getFolderInfo: (folderPath) => ipcRenderer.invoke('get-folder-info', folderPath),

  // Admin status
  checkAdmin: () => ipcRenderer.invoke('check-admin'),

  // Recent folders
  getRecentFolders: () => ipcRenderer.invoke('get-recent-folders'),
  clearRecentFolders: () => ipcRenderer.invoke('clear-recent-folders'),

  // Exclusion patterns
  getExclusionPatterns: () => ipcRenderer.invoke('get-exclusion-patterns'),
  saveExclusionPatterns: (patterns) => ipcRenderer.invoke('save-exclusion-patterns', patterns),

  // Progress listener
  onDeleteProgress: (callback) => {
    ipcRenderer.on('delete-progress', (event, progress) => callback(progress));
  }
});
