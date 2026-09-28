const { app, BrowserWindow, shell, session, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

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