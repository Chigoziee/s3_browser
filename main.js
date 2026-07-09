const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { ZipArchive } = require('archiver');
const fs = require('fs');
const { pipeline } = require('stream/promises');

let Store;
let store;
let mainWindow;
let settingsWindow;

async function initStore() {
  Store = (await import('electron-store')).default;
  store = new Store();
}

function getS3Client() {
  const credentials = store.get('credentials');
  if (!credentials) return null;
  return new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });
}

function hasCredentials() {
  const creds = store.get('credentials');
  return !!(creds && creds.accessKeyId && creds.secretAccessKey && creds.region && creds.bucket);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'S3 Browser',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: openSettingsWindow,
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    modal: false,
    parent: mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Settings — S3 Browser',
    show: false,
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings-window', 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.once('closed', () => {
    settingsWindow = null;
  });
  settingsWindow.setMenu(null);
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  return store.get('credentials') || {};
});

ipcMain.handle('settings:save', (event, credentials) => {
  store.set('credentials', credentials);
  // Notify main window to refresh
  if (mainWindow) mainWindow.webContents.send('credentials-updated');
  if (settingsWindow) settingsWindow.close();
  return { ok: true };
});

ipcMain.handle('settings:hasCredentials', () => hasCredentials());

ipcMain.handle('settings:open', () => openSettingsWindow());

ipcMain.handle('s3:list', async (event, prefix) => {
  const client = getS3Client();
  if (!client) throw new Error('No credentials configured. Open Settings to add them.');
  const bucket = store.get('credentials.bucket');

  const results = { folders: [], files: [] };
  let continuationToken;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || '',
      Delimiter: '/',
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    });
    const resp = await client.send(cmd);

    for (const cp of (resp.CommonPrefixes || [])) {
      results.folders.push(cp.Prefix);
    }
    for (const obj of (resp.Contents || [])) {
      // Skip "folder placeholder" objects (key === prefix)
      if (obj.Key === prefix) continue;
      results.files.push({
        key: obj.Key,
        name: obj.Key.slice(prefix.length),
        size: obj.Size,
        lastModified: obj.LastModified,
      });
    }

    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
  } while (continuationToken);

  return results;
});

ipcMain.handle('s3:downloadFile', async (event, key) => {
  const client = getS3Client();
  if (!client) throw new Error('No credentials configured.');
  const bucket = store.get('credentials.bucket');
  const fileName = key.split('/').pop();

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: fileName,
    title: 'Save file as',
  });
  if (!filePath) return { cancelled: true };

  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const resp = await client.send(cmd);
  await pipeline(resp.Body, fs.createWriteStream(filePath));
  return { ok: true, filePath };
});

ipcMain.handle('s3:downloadFolder', async (event, prefix) => {
  const client = getS3Client();
  if (!client) throw new Error('No credentials configured.');
  const bucket = store.get('credentials.bucket');
  const folderName = prefix.replace(/\/$/, '').split('/').pop() || 'download';

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${folderName}.zip`,
    title: 'Save zip as',
    filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
  });
  if (!filePath) return { cancelled: true };

  // Collect all objects under the prefix
  const keys = [];
  let continuationToken;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    });
    const resp = await client.send(cmd);
    for (const obj of (resp.Contents || [])) {
      if (obj.Key !== prefix && obj.Size > 0) keys.push(obj.Key);
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
  } while (continuationToken);

  if (keys.length === 0) return { ok: true, filePath, count: 0 };

  const output = fs.createWriteStream(filePath);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  archive.pipe(output);

  let done = 0;
  for (const key of keys) {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const resp = await client.send(cmd);
    const relativePath = key.slice(prefix.length);
    archive.append(resp.Body, { name: relativePath });
    done++;
    const pct = Math.round((done / keys.length) * 100);
    event.sender.send('download-progress', { pct, done, total: keys.length });
  }

  await archive.finalize();
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  return { ok: true, filePath, count: keys.length };
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await initStore();

  if (!hasCredentials()) {
    // Show settings first, then open main window after credentials are saved
    createMainWindow();
    openSettingsWindow();
  } else {
    createMainWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
