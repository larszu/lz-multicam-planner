// Bruecken zwischen Renderer und Hauptprozess: das Anmelde-Token der
// Geraetebibliothek im Schluesselbund (safeStorage), die Projektdatei (#199:
// Dialoge und Schreiben in eine vom Nutzer gewaehlte Datei), die
// GPU-Auskunft fuer die Einstellungen und ein ATEM ohne Bridge (atem.cjs). Der Renderer bleibt sandboxed und ohne
// Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('multicamSecureStore', {
  get: () => ipcRenderer.invoke('device-library-token:get'),
  set: (value) => ipcRenderer.invoke('device-library-token:set', String(value)),
  clear: () => ipcRenderer.invoke('device-library-token:clear'),
});

contextBridge.exposeInMainWorld('multicamProjectFile', {
  saveAs: (defaultName, text) => ipcRenderer.invoke('project-file:save-as', String(defaultName), String(text)),
  write: (filePath, text) => ipcRenderer.invoke('project-file:write', String(filePath), String(text)),
  open: () => ipcRenderer.invoke('project-file:open'),
  setDocumentState: (state) => ipcRenderer.send('project-file:document-state', {
    path: state && typeof state.path === 'string' ? state.path : null,
    edited: !!(state && state.edited),
  }),
});

contextBridge.exposeInMainWorld('multicamGpu', {
  info: () => ipcRenderer.invoke('gpu-info:get'),
});

contextBridge.exposeInMainWorld('multicamAtem', {
  connect: (host) => ipcRenderer.invoke('atem:connect', String(host)),
  disconnect: () => ipcRenderer.invoke('atem:disconnect'),
  command: (cmd, source) => ipcRenderer.invoke('atem:command', String(cmd), source === undefined ? undefined : Number(source)),
  onState: (cb) => {
    const h = (_e, state) => cb(state);
    ipcRenderer.on('atem:state', h);
    return () => ipcRenderer.removeListener('atem:state', h);
  },
});
