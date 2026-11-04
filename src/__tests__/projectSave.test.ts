import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// #199 — „Speichern" schreibt ohne Dialog ins gemerkte Ziel, „Speichern unter"
// fragt immer. Gemessen an der Desktop-Bruecke, am FileHandle und am
// Download-Weg ohne beides.

const texts = { promptName: 'File name', downloaded: 'downloaded {name}', failed: 'failed' };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function laden(win: Record<string, unknown>) {
  vi.stubGlobal('window', win);
  const store = await import('../store/useStore');
  const save = await import('../store/projectSave');
  return { ...store, ...save };
}

function electronBridge() {
  const calls = { saveAs: 0, write: [] as string[], open: 0 };
  const bridge = {
    saveAs: vi.fn(async (name: string) => { calls.saveAs++; return { path: `/tmp/${name}`, name }; }),
    write: vi.fn(async (p: string, _text: string) => { calls.write.push(p); return true; }),
    open: vi.fn(async () => {
      calls.open++;
      return { path: '/tmp/halle.mcplan', name: 'halle.mcplan', text: JSON.stringify({ formatVersion: 1, appVersion: 'x', projectVersion: 7, savedAt: '', venue: { name: 'Halle', widthM: 20, heightM: 10, stages: [] }, cameras: [], persons: [], walls: [], backgroundPlan: null }) };
    }),
    setDocumentState: vi.fn(),
  };
  return { bridge, calls };
}

describe('Desktop-App', () => {
  it('erstes Speichern fragt, danach schreibt es ohne Dialog in dieselbe Datei', async () => {
    const { bridge, calls } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    m.useStore.getState().setVenue({ ...m.useStore.getState().venue, name: 'Saal' });
    expect(await m.saveProject(texts)).toBe('saved');
    expect(calls.saveAs).toBe(1);
    expect(m.useStore.getState().hasUnsavedChanges()).toBe(false);

    m.useStore.getState().addWall();
    expect(m.useStore.getState().hasUnsavedChanges()).toBe(true);
    expect(await m.saveProject(texts)).toBe('saved');
    expect(calls.saveAs).toBe(1);
    expect(calls.write).toHaveLength(1);
    expect(m.useStore.getState().hasUnsavedChanges()).toBe(false);
  });

  it('Speichern unter fragt immer, auch mit Ziel', async () => {
    const { bridge, calls } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    await m.saveProjectAs(texts);
    await m.saveProjectAs(texts);
    expect(calls.saveAs).toBe(2);
    expect(calls.write).toHaveLength(0);
  });

  it('Oeffnen merkt den Pfad; Speichern schreibt dorthin', async () => {
    const { bridge, calls } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    expect(await m.openProjectWithTarget()).toBe(true);
    expect(m.useStore.getState().venue.name).toBe('Halle');
    expect(m.currentTarget()?.name).toBe('halle.mcplan');
    await m.saveProject(texts);
    expect(calls.saveAs).toBe(0);
    expect(calls.write).toEqual(['/tmp/halle.mcplan']);
  });

  it('Neues Projekt vergisst das Ziel — kein Ueberschreiben der vorigen Datei', async () => {
    const { bridge, calls } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    await m.openProjectWithTarget();
    m.useStore.getState().newProject();
    expect(m.currentTarget()).toBeNull();
    await m.saveProject(texts);
    expect(calls.saveAs).toBe(1);
    expect(calls.write).toHaveLength(0);
  });

  it('Abbruch im Dialog laesst alles, wie es war', async () => {
    const { bridge } = electronBridge();
    bridge.saveAs.mockResolvedValueOnce(null as never);
    const m = await laden({ multicamProjectFile: bridge });
    m.useStore.getState().addWall();
    expect(await m.saveProject(texts)).toBe('cancelled');
    expect(m.currentTarget()).toBeNull();
    expect(m.useStore.getState().hasUnsavedChanges()).toBe(true);
  });
});

describe('Browser mit File System Access', () => {
  it('Speichern unter holt einen Handle, Speichern schreibt ohne Picker hinein', async () => {
    const geschrieben: string[] = [];
    const handle = {
      name: 'show.mcplan',
      createWritable: async () => ({ write: async (t: string) => { geschrieben.push(t); }, close: async () => {} }),
    };
    const picker = vi.fn(async () => handle);
    const m = await laden({ showSaveFilePicker: picker });
    expect(await m.saveProjectAs(texts)).toBe('saved');
    m.useStore.getState().addWall();
    expect(await m.saveProject(texts)).toBe('saved');
    expect(picker).toHaveBeenCalledTimes(1);
    expect(geschrieben).toHaveLength(2);
    expect(JSON.parse(geschrieben[1]).walls).toHaveLength(1);
  });

  it('Abbruch des Pickers (AbortError) ist kein Fehler', async () => {
    const m = await laden({ showSaveFilePicker: async () => { throw new DOMException('x', 'AbortError'); } });
    expect(await m.saveProjectAs(texts)).toBe('cancelled');
  });
});

describe('Browser ohne File System Access', () => {
  it('fragt einmal nach dem Namen, laedt danach ohne Frage herunter und sagt es', async () => {
    const downloads: string[] = [];
    vi.stubGlobal('document', { createElement: () => ({ set download(n: string) { downloads.push(n); }, click: () => {}, href: '' }) });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const prompt = vi.fn(() => 'mein-plan');
    const m = await laden({ prompt });
    expect(await m.saveProject(texts)).toBe('downloaded');
    expect(await m.saveProject(texts)).toBe('downloaded');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(['mein-plan.mcplan', 'mein-plan.mcplan']);
  });
});

describe('ungespeichert', () => {
  it('Rueckgaengig nach dem Speichern gilt als Aenderung', async () => {
    const { bridge } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    const { history } = await import('../store/history');
    const stop = history.start();
    m.useStore.getState().addWall();
    await m.saveProject(texts);
    expect(m.useStore.getState().hasUnsavedChanges()).toBe(false);
    history.undo();
    expect(m.useStore.getState().walls).toHaveLength(0);
    expect(m.useStore.getState().hasUnsavedChanges()).toBe(true);
    stop();
  });

  it('Oeffnen gilt nicht als Aenderung', async () => {
    const { bridge } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    await m.openProjectWithTarget();
    expect(m.useStore.getState().hasUnsavedChanges()).toBe(false);
  });
});

describe('Revision statt Aenderungszaehler (#251)', () => {
  it('jedes Speichern zaehlt die Revision um eins hoch, Aenderungen dazwischen nicht', async () => {
    const { bridge } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    expect(m.useStore.getState().savedRevision).toBe(0);
    for (let i = 0; i < 20; i++) m.useStore.getState().addWall();
    await m.saveProject(texts);
    expect(m.useStore.getState().savedRevision).toBe(1);
    for (let i = 0; i < 20; i++) m.useStore.getState().addWall();
    await m.saveProject(texts);
    const s = m.useStore.getState();
    expect(s.savedRevision).toBe(2);
    expect(s.savedAt).not.toBeNull();
    expect(JSON.parse(bridge.write.mock.calls[0][1]).revision).toBe(2);
  });

  it('der vorgeschlagene Dateiname traegt keinen Zaehler', async () => {
    const { bridge } = electronBridge();
    const m = await laden({ multicamProjectFile: bridge });
    m.useStore.getState().setVenue({ ...m.useStore.getState().venue, name: 'Saal' });
    for (let i = 0; i < 5; i++) m.useStore.getState().addWall();
    await m.saveProjectAs(texts);
    expect(bridge.saveAs.mock.calls[0][0]).toBe('Saal.mcplan');
  });

  it('Oeffnen uebernimmt die Revision der Datei; Neu setzt sie zurueck', async () => {
    const { bridge } = electronBridge();
    bridge.open.mockResolvedValueOnce({
      path: '/tmp/a.mcplan', name: 'a.mcplan',
      text: JSON.stringify({ formatVersion: 1, appVersion: 'x', projectVersion: 812, revision: 4, savedAt: '2026-11-04T13:32:00.000Z', venue: { name: 'A', widthM: 20, heightM: 10, stages: [] }, cameras: [], persons: [], walls: [], backgroundPlan: null }),
    });
    const m = await laden({ multicamProjectFile: bridge });
    await m.openProjectWithTarget();
    expect(m.useStore.getState().savedRevision).toBe(4);
    expect(m.useStore.getState().savedAt).toBe('2026-11-04T13:32:00.000Z');
    m.useStore.getState().newProject();
    expect(m.useStore.getState().savedRevision).toBe(0);
    expect(m.useStore.getState().savedAt).toBeNull();
  });
});
