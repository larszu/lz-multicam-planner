import { describe, it, expect, beforeEach, vi } from 'vitest';

// #175 — Rueckgaengig/Wiederherstellen. Geprueft wird, was ein Mensch als
// Schritt erlebt: eine Aenderung, eine Geste (Ziehen = viele Ereignisse),
// und dass Oeffnen die Historie neu beginnt.
const speicher: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(speicher)) delete speicher[key];
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => speicher[key] ?? null,
    setItem: (key: string, value: string) => { speicher[key] = value; },
    removeItem: (key: string) => { delete speicher[key]; },
  });
});

async function frisch() {
  const store = await import('../store/useStore');
  const h = await import('../store/history');
  const stop = h.history.start();
  const spaeter = () => vi.advanceTimersByTime(h.COALESCE_MS + 1);
  return { useStore: store.useStore, ...h, stop, spaeter };
}

describe('Historie (#175)', () => {
  it('nimmt eine Aenderung zurueck und stellt sie wieder her', async () => {
    const { useStore, history, spaeter } = await frisch();
    expect(history.canUndo()).toBe(false);
    useStore.getState().addCamera();
    const id = useStore.getState().cameras[0].id;
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(useStore.getState().cameras).toHaveLength(0);
    expect(history.canRedo()).toBe(true);
    history.redo();
    expect(useStore.getState().cameras.map((c) => c.id)).toEqual([id]);
    spaeter();
    useStore.getState().moveCamera(id, 3, 4);
    history.undo();
    expect(useStore.getState().cameras[0].x).not.toBe(3);
  });

  it('eine neue Aenderung verwirft die Zukunft', async () => {
    const { useStore, history, spaeter } = await frisch();
    useStore.getState().addCamera();
    history.undo();
    spaeter();
    useStore.getState().addPerson(1, 1);
    expect(history.canRedo()).toBe(false);
  });

  it('ein Ziehen ist EIN Schritt, nicht jedes Mausereignis', async () => {
    const { useStore, history, beginGesture, endGesture, spaeter } = await frisch();
    useStore.getState().addCamera();
    const id = useStore.getState().cameras[0].id;
    const start = { x: useStore.getState().cameras[0].x, y: useStore.getState().cameras[0].y };
    spaeter();
    beginGesture();
    for (let i = 1; i <= 30; i++) {
      useStore.getState().moveCamera(id, i, i);
      vi.advanceTimersByTime(500);
    }
    endGesture();
    history.undo();
    expect(useStore.getState().cameras[0]).toMatchObject(start);
    history.undo();
    expect(useStore.getState().cameras).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
  });

  it('Auswahl und Ansicht sind kein Schritt', async () => {
    const { useStore, history } = await frisch();
    useStore.getState().setActiveTab('3d');
    useStore.getState().toggleShowAllFov();
    expect(history.canUndo()).toBe(false);
  });

  it('Oeffnen und Neu beginnen die Historie von vorn', async () => {
    const { useStore, history } = await frisch();
    useStore.getState().addCamera();
    expect(history.canUndo()).toBe(true);
    useStore.getState().newProject();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('nach „Alles loeschen" und Rueckgaengig vergibt Hinzufuegen keine Id doppelt', async () => {
    const { useStore, history, spaeter } = await frisch();
    useStore.getState().addCamera();
    useStore.getState().addCamera();
    spaeter();
    useStore.getState().clearAll();
    history.undo();
    expect(useStore.getState().cameras).toHaveLength(2);
    spaeter();
    useStore.getState().addCamera();
    const ids = useStore.getState().cameras.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('Rueckgaengig waehlt eine verschwundene Kamera ab', async () => {
    const { useStore, history } = await frisch();
    useStore.getState().addCamera();
    useStore.getState().selectCamera(useStore.getState().cameras[0].id);
    history.undo();
    expect(useStore.getState().selectedCameraId).toBeNull();
  });
});
