const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  forceDeleteFolder: (folderPath) => ipcRenderer.invoke('force-delete-folder', folderPath),
  getFolderInfo: (folderPath) => ipcRenderer.invoke('get-folder-info', folderPath),
  checkAdmin: () => ipcRenderer.invoke('check-admin'),
  onDeleteProgress: (callback) => {
    ipcRenderer.on('delete-progress', (event, progress) => callback(progress));
  }
});
