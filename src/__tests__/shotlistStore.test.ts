import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveJSONSafe } from '../utils/storage';

// Store-Slice der Shotlist (#62 Punkt 5). Der Store liest localStorage beim
// Modul-Laden, deshalb wird der Stub VOR dem dynamischen Import gesetzt.
const store: Record<string, string> = {};
let quotaFull = false;

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  quotaFull = false;
  vi.resetModules();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      if (quotaFull) throw new Error('QuotaExceededError');
      store[key] = value;
    },
    removeItem: (key: string) => { delete store[key]; },
  });
});

async function freshStore() {
  const mod = await import('../store/useStore');
  return mod.useStore;
}

const sampleShot = (name: string) => ({
  name,
  cameraId: 'cam-1',
  state: {
    x: 1, y: 2, z: 1.5, pan: 0, tilt: 0,
    focalLength: 35, aperture: 2.8, focusDistance: 4, trackOffset: 0,
  },
  transition: 'fast' as const,
});

describe('Shotlist-Store', () => {
  it('legt eine Shotlist an und aktiviert sie', async () => {
    const useStore = await freshStore();
    const id = useStore.getState().addShotlist('Show A');
    const s = useStore.getState();
    expect(s.shotlists).toHaveLength(1);
    expect(s.shotlists[0].name).toBe('Show A');
    expect(s.activeShotlistId).toBe(id);
  });

  it('hängt Shots in Aufnahme-Reihenfolge an', async () => {
    const useStore = await freshStore();
    const list = useStore.getState().addShotlist();
    useStore.getState().addShot(list, sampleShot('A'));
    useStore.getState().addShot(list, sampleShot('B'));
    expect(useStore.getState().shotlists[0].shots.map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('vergibt eindeutige Ids auch bei Aufnahmen in derselben Millisekunde', async () => {
    const useStore = await freshStore();
    const list = useStore.getState().addShotlist();
    // Date.now einfrieren: genau der Fall, in dem eine reine Zeitstempel-Id
    // kollidieren wuerde und ein Shot den anderen ueberschreibt.
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const ids = [1, 2, 3].map(() => useStore.getState().addShot(list, sampleShot('X')));
    now.mockRestore();
    expect(new Set(ids).size).toBe(3);
  });

  it('sortiert Shots per moveShot um (Drag-Reihenfolge)', async () => {
    const useStore = await freshStore();
    const list = useStore.getState().addShotlist();
    ['A', 'B', 'C'].forEach((n) => useStore.getState().addShot(list, sampleShot(n)));

    useStore.getState().moveShot(list, 0, 2); // A ans Ende
    expect(useStore.getState().shotlists[0].shots.map((s) => s.name)).toEqual(['B', 'C', 'A']);

    useStore.getState().moveShot(list, 2, 0); // wieder nach vorn
    expect(useStore.getState().shotlists[0].shots.map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('lässt die Sequenz bei ungültigen Drop-Indizes unverändert', async () => {
    const useStore = await freshStore();
    const list = useStore.getState().addShotlist();
    ['A', 'B'].forEach((n) => useStore.getState().addShot(list, sampleShot(n)));
    const before = useStore.getState().shotlists[0].shots.map((s) => s.name);

    useStore.getState().moveShot(list, -1, 1);
    useStore.getState().moveShot(list, 0, 99);
    useStore.getState().moveShot(list, 1, 1);

    expect(useStore.getState().shotlists[0].shots.map((s) => s.name)).toEqual(before);
  });

  it('aktualisiert und löscht einzelne Shots', async () => {
    const useStore = await freshStore();
    const list = useStore.getState().addShotlist();
    const a = useStore.getState().addShot(list, sampleShot('A'));
    useStore.getState().addShot(list, sampleShot('B'));

    useStore.getState().updateShot(list, a, { name: 'A2', note: 'Regie' });
    const updated = useStore.getState().shotlists[0].shots.find((s) => s.id === a);
    expect(updated?.name).toBe('A2');
    expect(updated?.note).toBe('Regie');

    useStore.getState().removeShot(list, a);
    expect(useStore.getState().shotlists[0].shots.map((s) => s.name)).toEqual(['B']);
  });

  it('setzt currentShotId zurück, wenn genau dieser Shot gelöscht wird', async () => {
    const useStore = await freshStore();
    const list = useStore.getState().addShotlist();
    const a = useStore.getState().addShot(list, sampleShot('A')); // addShot setzt current
    expect(useStore.getState().currentShotId).toBe(a);
    useStore.getState().removeShot(list, a);
    expect(useStore.getState().currentShotId).toBeNull();
  });

  it('wählt nach dem Löschen der aktiven Liste die nächste aus', async () => {
    const useStore = await freshStore();
    const first = useStore.getState().addShotlist('A');
    const second = useStore.getState().addShotlist('B');
    expect(useStore.getState().activeShotlistId).toBe(second);
    useStore.getState().removeShotlist(second);
    expect(useStore.getState().activeShotlistId).toBe(first);
  });

  it('steht im Projekt, nicht im localStorage (#200)', async () => {
    const mod = await import('../store/useStore');
    const useStore = mod.useStore;
    const list = useStore.getState().addShotlist('Im Projekt');
    useStore.getState().addShot(list, sampleShot('A'));
    expect(store['multicam-shotlists']).toBeUndefined();

    const datei = JSON.parse(JSON.stringify(mod.buildProjectFile(useStore.getState())));
    expect(datei.shotlists.map((l: { name: string }) => l.name)).toEqual(['Im Projekt']);

    useStore.getState().newProject();
    expect(useStore.getState().shotlists).toEqual([]);
    useStore.getState().applyProjectFile(datei);
    expect(useStore.getState().shotlists[0].shots.map((s) => s.name)).toEqual(['A']);
    expect(useStore.getState().activeShotlistId).toBe(list);
  });

  it('jede Änderung macht das Projekt ungespeichert', async () => {
    const useStore = await freshStore();
    useStore.setState({ lastSavedVersion: useStore.getState().projectVersion });
    useStore.getState().addShotlist('X');
    expect(useStore.getState().hasUnsavedChanges()).toBe(true);
  });

  it('Rückgängig nimmt einen Shot zurück (#177)', async () => {
    const useStore = await freshStore();
    const { history } = await import('../store/history');
    const stop = history.start();
    const list = useStore.getState().addShotlist('U');
    await new Promise((r) => setTimeout(r, 350));
    useStore.getState().addShot(list, sampleShot('A'));
    expect(useStore.getState().shotlists[0].shots).toHaveLength(1);
    history.undo();
    expect(useStore.getState().shotlists[0].shots).toHaveLength(0);
    history.redo();
    expect(useStore.getState().shotlists[0].shots).toHaveLength(1);
    history.undo();
    history.undo();
    expect(useStore.getState().shotlists).toHaveLength(0);
    expect(useStore.getState().activeShotlistId).toBeNull();
    stop();
  });

  it('überspringt kaputte Einträge in der Datei', async () => {
    const mod = await import('../store/useStore');
    const datei = mod.buildProjectFile(mod.useStore.getState());
    mod.useStore.getState().applyProjectFile({
      ...datei,
      shotlists: [{ id: 'ok', name: 'Gut', shots: [] }, { id: 'kaputt' }, null] as never,
    });
    expect(mod.useStore.getState().shotlists.map((l) => l.id)).toEqual(['ok']);
  });
});

describe('Übernahme der alten localStorage-Listen (#200)', () => {
  const alteDatei = (cameraIds: string[]) => ({
    formatVersion: 1 as const, appVersion: '4.8.0', projectVersion: 3, savedAt: '',
    venue: { name: 'Halle', widthM: 20, heightM: 10, stages: [] },
    cameras: cameraIds.map((id) => ({ id })) as never,
    persons: [], walls: [], backgroundPlan: null,
  });
  const pool = () => [
    { id: 'l1', name: 'Zu cam-7', shots: [{ ...sampleShot('A'), id: 's1', cameraId: 'cam-7' }] },
    { id: 'l2', name: 'Zu cam-9', shots: [{ ...sampleShot('B'), id: 's2', cameraId: 'cam-9' }] },
    { id: 'l3', name: 'Leer', shots: [] },
  ];

  it('altes Projekt übernimmt die passenden Listen, der Rest bleibt im Pool', async () => {
    store['multicam-shotlists'] = JSON.stringify(pool());
    const useStore = await freshStore();
    expect(useStore.getState().shotlists).toEqual([]);
    useStore.getState().applyProjectFile(alteDatei(['cam-7']));
    expect(useStore.getState().shotlists.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(JSON.parse(store['multicam-shotlists']).map((l: { id: string }) => l.id)).toEqual(['l2']);
    expect(JSON.parse(store['multicam-shotlists-before-200'])).toHaveLength(3);
    // Nicht als Änderung gezählt: geöffnet ist geöffnet.
    expect(useStore.getState().hasUnsavedChanges()).toBe(false);

    useStore.getState().applyProjectFile(alteDatei(['cam-9']));
    expect(useStore.getState().shotlists.map((l) => l.id)).toEqual(['l2']);
    expect(store['multicam-shotlists']).toBeUndefined();
  });

  it('Datei nach #200 bekommt nichts aus dem Pool', async () => {
    store['multicam-shotlists'] = JSON.stringify(pool());
    const useStore = await freshStore();
    useStore.getState().applyProjectFile({ ...alteDatei(['cam-7']), shotlists: [] });
    expect(useStore.getState().shotlists).toEqual([]);
    expect(JSON.parse(store['multicam-shotlists'])).toHaveLength(3);
  });

  it('Neues Projekt bekommt nichts aus dem Pool', async () => {
    store['multicam-shotlists'] = JSON.stringify(pool());
    const useStore = await freshStore();
    useStore.getState().newProject();
    expect(useStore.getState().shotlists).toEqual([]);
  });

  it('ohne Sicherungskopie bleibt der Pool unangetastet', async () => {
    store['multicam-shotlists'] = JSON.stringify(pool());
    const useStore = await freshStore();
    quotaFull = true;
    useStore.getState().applyProjectFile(alteDatei(['cam-7']));
    expect(useStore.getState().shotlists.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(JSON.parse(store['multicam-shotlists'])).toHaveLength(3);
  });
});

describe('saveJSONSafe', () => {
  it('meldet Erfolg und Misserfolg', () => {
    expect(saveJSONSafe('k', { a: 1 })).toBe(true);
    quotaFull = true;
    expect(saveJSONSafe('k', { a: 2 })).toBe(false);
  });
});
