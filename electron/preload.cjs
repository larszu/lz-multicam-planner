// Die einzige Bruecke zwischen Renderer und Hauptprozess: das Anmelde-Token
// der Geraetebibliothek im Schluesselbund (safeStorage). Nichts sonst — der
// Renderer bleibt sandboxed und ohne Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('multicamSecureStore', {
  get: () => ipcRenderer.invoke('device-library-token:get'),
  set: (value) => ipcRenderer.invoke('device-library-token:set', String(value)),
  clear: () => ipcRenderer.invoke('device-library-token:clear'),
});
