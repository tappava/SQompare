const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  onSQLFileImported: (callback) => {
    ipcRenderer.on('sql-file-imported', callback);
  },
  onExportReport: (callback) => {
    ipcRenderer.on('export-report', callback);
  },
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Dialogs
  showErrorDialog: (title, message) => ipcRenderer.invoke('show-error-dialog', title, message),
  
  // File system
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  
  // Clean up listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
