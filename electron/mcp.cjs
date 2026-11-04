// Lokaler MCP-Server des Planers (#218). Er liest keine Dateien: jede Frage
// geht per IPC in den Renderer und wird dort aus dem Store beantwortet
// (src/mcp/werkzeuge.ts) — mit Undo und Autosave wie jede Bedienung.
//
// Riegel: aus als Vorgabe, nur 127.0.0.1, Bearer-Token, Host-Pruefung gegen
// DNS-Rebinding. Schreibende Werkzeuge nur mit eigenem Schalter.
// Zugangsdaten (Bibliothek, KI, Bridge) sind nicht erreichbar.
const { ipcMain, app } = require('electron');
const { createServer } = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TOOL_SPECS, ALIASES } = require('./mcpTools.cjs');

const WUNSCHPORT = 4191;
const ANTWORT_MS = 20000;

const state = { server: null, port: 0, ausweich: false, empfaenger: null, offen: new Map() };

const einstellungsDatei = () => path.join(app.getPath('userData'), 'mcp.json');

function lesen() {
  try {
    const j = JSON.parse(fs.readFileSync(einstellungsDatei(), 'utf8'));
    return { enabled: j.enabled === true, writeAllowed: j.writeAllowed === true, token: typeof j.token === 'string' ? j.token : '' };
  } catch {
    return { enabled: false, writeAllowed: false, token: '' };
  }
}

function schreiben(e) {
  const datei = einstellungsDatei();
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(e), { mode: 0o600 });
  fs.renameSync(tmp, datei);
}

let einstellungen = null;
const cfg = () => {
  if (!einstellungen) einstellungen = lesen();
  return einstellungen;
};

function status() {
  return {
    enabled: cfg().enabled,
    writeAllowed: cfg().writeAllowed,
    running: !!state.server,
    url: state.server ? `http://127.0.0.1:${state.port}/mcp` : '',
    fallbackPort: state.ausweich,
  };
}

function fragen(name, args) {
  const w = state.empfaenger;
  if (!w || w.isDestroyed()) return Promise.resolve({ text: 'The planner window is not open.', isError: true });
  const id = randomUUID();
  return new Promise((fertig) => {
    const timer = setTimeout(() => {
      state.offen.delete(id);
      fertig({ text: 'The planner did not answer in time.', isError: true });
    }, ANTWORT_MS);
    state.offen.set(id, (antwort) => {
      clearTimeout(timer);
      fertig(antwort);
    });
    w.send('mcp:call', { id, name, args });
  });
}

function inhalt(antwort) {
  const content = [{ type: 'text', text: String(antwort?.text ?? '') }];
  if (antwort?.image?.data) content.push({ type: 'image', data: antwort.image.data, mimeType: 'image/png' });
  return { content, isError: antwort?.isError === true };
}

function baueServer() {
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const mcp = new McpServer({ name: 'lz-multicam-planner', version: app.getVersion() });
  const darfSchreiben = cfg().writeAllowed;
  const anmelden = (name, spec) =>
    mcp.registerTool(
      name,
      { description: spec.description, inputSchema: spec.shape, annotations: { readOnlyHint: !spec.write } },
      async (args) => inhalt(await fragen(spec.name, args ?? {})),
    );
  for (const spec of TOOL_SPECS) {
    if (spec.write && !darfSchreiben) continue;
    anmelden(spec.name, spec);
  }
  for (const [alias, ziel] of Object.entries(ALIASES)) {
    const spec = TOOL_SPECS.find((s) => s.name === ziel);
    if (spec && (!spec.write || darfSchreiben)) anmelden(alias, spec);
  }
  return mcp;
}

function berechtigt(req) {
  const kopf = req.headers.authorization;
  if (typeof kopf !== 'string') return false;
  const wert = kopf.replace(/^Bearer\s+/i, '').trim();
  return !!cfg().token && wert === cfg().token;
}

async function starten() {
  if (state.server) return;
  const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
  if (!cfg().token) {
    einstellungen = { ...cfg(), token: randomBytes(24).toString('hex') };
    schreiben(einstellungen);
  }
  const server = createServer((req, res) => {
    if (!berechtigt(req)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"error":"unauthorized"}');
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: true,
      allowedHosts: [`127.0.0.1:${state.port}`, `localhost:${state.port}`],
    });
    const mcp = baueServer();
    res.on('close', () => { void transport.close(); void mcp.close(); });
    mcp.connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch(() => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('{"error":"mcp failed"}');
        }
      });
  });
  const lauschen = (port) => new Promise((fertig, fehler) => {
    server.once('error', fehler);
    server.listen(port, '127.0.0.1', () => { server.off('error', fehler); fertig(); });
  });
  state.ausweich = false;
  try {
    await lauschen(WUNSCHPORT);
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    await lauschen(0);
    state.ausweich = true;
  }
  state.server = server;
  state.port = server.address().port;
}

function stoppen() {
  state.server?.close();
  state.server = null;
  state.port = 0;
}

async function anwenden() {
  stoppen();
  if (cfg().enabled) await starten();
}

function registerMcp() {
  ipcMain.handle('mcp:status', () => status());
  ipcMain.handle('mcp:set', async (_e, wunsch) => {
    einstellungen = {
      ...cfg(),
      enabled: wunsch?.enabled === true,
      writeAllowed: wunsch?.writeAllowed === true,
    };
    schreiben(einstellungen);
    await anwenden();
    return status();
  });
  ipcMain.handle('mcp:token', () => cfg().token);
  ipcMain.on('mcp:ready', (event) => {
    state.empfaenger = event.sender;
  });
  ipcMain.on('mcp:reply', (_e, msg) => {
    const fertig = msg && state.offen.get(msg.id);
    if (!fertig) return;
    state.offen.delete(msg.id);
    fertig(msg.result);
  });
  app.whenReady().then(() => anwenden()).catch(() => {});
}

module.exports = { registerMcp, stopMcp: stoppen };
