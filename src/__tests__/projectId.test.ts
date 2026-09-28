import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newProjectId } from '../utils/projectId';
import type { ProjectFile } from '../types';

// ───────────────────────────────────────────────────────────────────────────
// Die stabile Projekt-Id (cable-planner#908): entsteht mit dem Projekt, wird
// beim Laden geheilt, wenn sie fehlt, und ueberlebt jedes Speichern.
// ───────────────────────────────────────────────────────────────────────────

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

afterEach(() => vi.unstubAllGlobals());

const laden = async () => (await import('../store/useStore'));

const plan = (over: Partial<ProjectFile> = {}): ProjectFile => ({
  formatVersion: 1,
  appVersion: '4.3.5',
  projectVersion: 3,
  savedAt: '2026-09-24T00:00:00.000Z',
  venue: { name: 'Halle', widthM: 20, heightM: 15, stages: [] },
  cameras: [],
  persons: [],
  walls: [],
  backgroundPlan: null,
  ...over,
});

describe('newProjectId', () => {
  it('liefert eine v4-UUID, jedes Mal eine andere', () => {
    const a = newProjectId();
    expect(a).toMatch(UUID_V4);
    expect(newProjectId()).not.toBe(a);
  });

  it('auch ohne randomUUID — die Seite über http im Hallen-LAN', () => {
    const echt = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array<ArrayBuffer>) => echt.getRandomValues(a) });
    expect(newProjectId()).toMatch(UUID_V4);
  });
});

describe('die Projekt-Id im Store', () => {
  it('ein neues Projekt hat eine — und „Neues Projekt" eine neue', async () => {
    const { useStore } = await laden();
    const erste = useStore.getState().projectId;
    expect(erste).toMatch(UUID_V4);
    useStore.getState().newProject();
    expect(useStore.getState().projectId).toMatch(UUID_V4);
    expect(useStore.getState().projectId).not.toBe(erste);
  });

  it('eine Datei mit Id behält sie', async () => {
    const { useStore } = await laden();
    useStore.getState().applyProjectFile(plan({ projectId: 'aus-der-datei' }));
    expect(useStore.getState().projectId).toBe('aus-der-datei');
  });

  it('eine Datei ohne Id wird geheilt — mit einer aus der Datei abgeleiteten Id', async () => {
    const { useStore } = await laden();
    const ids = new Set<string>();
    for (const projectId of [undefined, '', '   ', 42 as unknown as string]) {
      useStore.getState().applyProjectFile(plan({ projectId }));
      const id = useStore.getState().projectId;
      expect(id, String(projectId)).toMatch(/^legacy-[0-9a-f]{16}$/);
      ids.add(id);
    }
    // Dieselbe alte Datei, mehrfach geoeffnet und nie gespeichert: dieselbe Id.
    // Gewuerfelt hielte der cable-planner jede Kamera-Liste daraus fuer ein
    // fremdes Projekt und legte die Kameras jedes Mal neu an.
    expect(ids.size).toBe(1);
  });

  it('zwei verschiedene alte Dateien bekommen verschiedene Ids', async () => {
    const { useStore } = await laden();
    useStore.getState().applyProjectFile(plan({ projectId: undefined, savedAt: '2026-01-01T00:00:00.000Z' }));
    const a = useStore.getState().projectId;
    useStore.getState().applyProjectFile(plan({ projectId: undefined, savedAt: '2026-02-01T00:00:00.000Z' }));
    expect(useStore.getState().projectId).not.toBe(a);
  });

  it('überlebt Speichern und Wiederöffnen', async () => {
    const { useStore, buildProjectFile } = await laden();
    const id = useStore.getState().projectId;
    const datei = JSON.parse(JSON.stringify(buildProjectFile(useStore.getState()))) as ProjectFile;
    expect(datei.projectId).toBe(id);
    useStore.getState().newProject();
    useStore.getState().applyProjectFile(datei);
    expect(useStore.getState().projectId).toBe(id);
  });

  it('eine Vorlage laden ist kein neues Projekt', async () => {
    const { useStore } = await laden();
    const id = useStore.getState().projectId;
    useStore.getState().loadTemplate('concert-small');
    expect(useStore.getState().venue.name).toBe('Small Concert');
    expect(useStore.getState().projectId).toBe(id);
  });
});
