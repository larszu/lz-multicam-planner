// ATEM direkt aus der Desktop-App, ohne LZ Camera Bridge. Ein Browser kann
// das nicht: das ATEM-Protokoll ist UDP (Port 9910). Dieselbe Bibliothek wie
// in der Bridge (atem-connection), damit es den Treiber nur einmal gibt.
//
// Der Renderer bekommt nur Busse, Uebergang und Eingangsnamen von M/E 1 —
// dieselbe Form, die die Bridge als `switcherState` schickt.
const { ipcMain } = require('electron');

const BEFEHLE = new Set(['preview', 'cut', 'auto', 'take']);
// IPv4, IPv6 oder Hostname im eigenen Netz; nichts anderes erreicht den Socket.
const HOST = /^[A-Za-z0-9.:\-[\]]{1,253}$/;

let atem = null;
let host = null;
let empfaenger = null;
let timer = null;

function stand() {
  const { AtemConnectionStatus } = require('atem-connection');
  const s = atem?.state;
  const me = s?.video?.mixEffects?.[0];
  return {
    host,
    connected: !!atem && atem.status === AtemConnectionStatus.CONNECTED,
    model: s?.info?.productIdentifier || null,
    program: me?.programInput ?? 0,
    preview: me?.previewInput ?? 0,
    inTransition: !!me?.transitionPosition?.inTransition,
    inputs: Object.values(s?.inputs ?? {})
      .filter(Boolean)
      .map((i) => ({ id: i.inputId, name: i.shortName || i.longName || String(i.inputId) })),
  };
}

// Waehrend einer Blende kommt jedes Bild ein Stand; der Renderer braucht ihn
// hoechstens alle 40 ms.
function melden() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (empfaenger && !empfaenger.isDestroyed()) empfaenger.send('atem:state', stand());
  }, 40);
}

async function trennen() {
  const alt = atem;
  atem = null;
  host = null;
  if (alt) {
    alt.removeAllListeners();
    try { await alt.disconnect(); } catch { /* war nicht verbunden */ }
    try { await alt.destroy(); } catch { /* schon zu */ }
  }
}

function registerAtem() {
  ipcMain.handle('atem:connect', async (event, wunsch) => {
    const h = String(wunsch || '').trim();
    if (!HOST.test(h)) return false;
    await trennen();
    empfaenger = event.sender;
    const { Atem } = require('atem-connection');
    // Ohne eigenen Thread: der Kindprozess laedt eine Datei aus dem asar-Archiv
    // und scheitert in der gepackten App.
    atem = new Atem({ disableMultithreaded: true });
    host = h;
    for (const e of ['connected', 'disconnected', 'stateChanged']) atem.on(e, melden);
    atem.on('error', () => { /* Verbindung versucht es selbst weiter */ });
    atem.connect(h).catch(() => melden());
    melden();
    return true;
  });

  ipcMain.handle('atem:disconnect', async () => {
    await trennen();
    if (empfaenger && !empfaenger.isDestroyed()) empfaenger.send('atem:state', stand());
  });

  ipcMain.handle('atem:command', async (_event, cmd, source) => {
    if (!atem || !BEFEHLE.has(cmd)) return false;
    const n = Number(source);
    try {
      if (cmd === 'cut') await atem.cut(0);
      else if (cmd === 'auto') await atem.autoTransition(0);
      else if (!Number.isInteger(n) || n < 0) return false;
      else if (cmd === 'preview') await atem.changePreviewInput(n, 0);
      else await atem.changeProgramInput(n, 0);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = { registerAtem, closeAtem: trennen };
