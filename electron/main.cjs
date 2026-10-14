const { app, BrowserWindow, shell, session, ipcMain, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// productName changed from "MultiCam Planner" to "LZ Multicam Planner"; Electron
// derives userData from it. Pin the old folder so the stored device-library
// token and Chromium storage (projects, layouts, library cache) stay put.
if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'MultiCam Planner'));

// Anmelde-Token der Geraetebibliothek (devices.zumpelars.de). Verschluesselt
// mit dem Schluesselbund des Betriebssystems; ohne Schluesselbund nur im
// Speicher dieser Sitzung — nie im Klartext auf der Platte. Der Inhalt wird
// nirgends geloggt.
const tokenFile = () => path.join(app.getPath('userData'), 'device-library-token.bin');
let sessionToken = null;

ipcMain.handle('device-library-token:get', () => {
  if (sessionToken !== null) return sessionToken;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(tokenFile()));
  } catch {
    return null;
  }
});

ipcMain.handle('device-library-token:set', (_event, value) => {
  sessionToken = String(value);
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    fs.writeFileSync(tokenFile(), safeStorage.encryptString(sessionToken), { mode: 0o600 });
    sessionToken = null;
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('device-library-token:clear', () => {
  sessionToken = null;
  try { fs.unlinkSync(tokenFile()); } catch { /* war nicht da */ }
});

// Projektdatei (#199). Geschrieben wird nur in Pfade, die der Nutzer in
// dieser Sitzung selbst in einem Dialog gewaehlt hat — der Renderer kann
// sonst keinen beliebigen Pfad ueberschreiben lassen.
const approvedPaths = new Set();
const PROJECT_FILTERS = [{ name: 'LZ Multicam Planner', extensions: ['mcplan'] }, { name: 'JSON', extensions: ['json'] }];
const lastDir = () => {
  const last = [...approvedPaths].pop();
  return last ? path.dirname(last) : app.getPath('documents');
};

ipcMain.handle('project-file:save-as', async (event, defaultName, text) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const safeName = path.basename(String(defaultName || 'project.mcplan'));
  const r = await dialog.showSaveDialog(win, {
    defaultPath: path.join(lastDir(), safeName),
    filters: PROJECT_FILTERS,
  });
  if (r.canceled || !r.filePath) return null;
  const filePath = /\.(mcplan|json)$/i.test(r.filePath) ? r.filePath : `${r.filePath}.mcplan`;
  await fs.promises.writeFile(filePath, String(text), 'utf8');
  approvedPaths.add(filePath);
  return { path: filePath, name: path.basename(filePath) };
});

ipcMain.handle('project-file:write', async (_event, filePath, text) => {
  if (!approvedPaths.has(filePath)) return false;
  try {
    // Erst daneben schreiben, dann umbenennen: ein Abbruch mitten im
    // Schreiben laesst die alte Datei heil.
    const tmp = `${filePath}.tmp-${process.pid}`;
    await fs.promises.writeFile(tmp, String(text), 'utf8');
    await fs.promises.rename(tmp, filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('project-file:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: PROJECT_FILTERS, defaultPath: lastDir() });
  if (r.canceled || !r.filePaths[0]) return null;
  const filePath = r.filePaths[0];
  const text = await fs.promises.readFile(filePath, 'utf8');
  approvedPaths.add(filePath);
  return { path: filePath, name: path.basename(filePath), text };
});

ipcMain.on('project-file:document-state', (event, state) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || process.platform !== 'darwin') return;
  win.setDocumentEdited(!!state.edited);
  win.setRepresentedFilename(state.path && approvedPaths.has(state.path) ? state.path : '');
});

const ALLOWED_EXTERNAL_PROTOCOLS = ['https:', 'mailto:'];

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    // Running-app window / taskbar icon. In the packaged app `build/` is NOT
    // inside the asar (it's not in build.files), so the dev path would resolve
    // to nothing and the app would fall back to the default Electron icon.
    // electron-builder's extraResources copies build/icon.png to
    // <resources>/icon.png, so point there when packaged.
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol)) {
        shell.openExternal(url);
      }
    } catch { /* malformed URL — ignore */ }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.mistral.ai https://api.x.ai https://devices.zumpelars.de data:; " +
          "font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        ],
      },
    });
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});