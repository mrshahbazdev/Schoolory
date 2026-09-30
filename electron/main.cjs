const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session, ipcMain, shell, dialog, Menu } = require('electron');

const { registerStoreIPC } = require('./ipc/store.cjs');
const { registerExportIPC } = require('./ipc/export.cjs');
const { registerSyncIPC } = require('./ipc/sync.cjs');
const { registerHostIPC } = require('./ipc/host.cjs');


const isDev = !app.isPackaged;
let mainWindow = null;


if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(init);
}

function init() {
  applyCSP();
  registerStoreIPC();
  registerExportIPC();
  registerSyncIPC();
  registerHostIPC();
  registerAppIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Shop records hold stock counts and sale ledgers — the renderer should
// never be able to reach the network, full stop.
function applyCSP() {
  const policy = isDev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:5173 ws://localhost:5173; img-src 'self' data: blob:;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';";

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
}

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return s.width && s.height ? s : { width: 1440, height: 900 };
  } catch {
    return { width: 1440, height: 900 };
  }
}

function saveState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(statePath(), JSON.stringify({ ...b, maximized: mainWindow.isMaximized() }));
  } catch { /* not worth interrupting the user */ }
}

function createWindow() {
  const state = loadState();
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    title: 'Schoolory',
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    const ok = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://');
    if (!ok) e.preventDefault();
  });

  let t = null;
  const queue = () => { clearTimeout(t); t = setTimeout(saveState, 400); };
  mainWindow.on('resize', queue);
  mainWindow.on('move', queue);
  mainWindow.on('close', saveState);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerAppIPC() {
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('app:openFile', async (_e, { filters } = {}) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All files', extensions: ['*'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;

    const filePath = res.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();

    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : `image/${ext.slice(1)}`;
      const b64 = fs.readFileSync(filePath).toString('base64');
      return { path: filePath, name: path.basename(filePath), dataUrl: `data:${mime};base64,${b64}` };
    }

    return { path: filePath, name: path.basename(filePath), text: fs.readFileSync(filePath, 'utf8') };
  });

  ipcMain.handle('app:openUserData', () => shell.openPath(app.getPath('userData')));
}

app.on('before-quit', saveState);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
