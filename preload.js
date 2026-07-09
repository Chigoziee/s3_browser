const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (credentials) => ipcRenderer.invoke('settings:save', credentials),
  hasCredentials: () => ipcRenderer.invoke('settings:hasCredentials'),
  openSettings: () => ipcRenderer.invoke('settings:open'),

  // S3 operations
  listFolder: (prefix) => ipcRenderer.invoke('s3:list', prefix),
  downloadFile: (key) => ipcRenderer.invoke('s3:downloadFile', key),
  downloadFolder: (prefix) => ipcRenderer.invoke('s3:downloadFolder', prefix),

  // Events from main process
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onCredentialsUpdated: (callback) => {
    ipcRenderer.on('credentials-updated', () => callback());
  },
});
