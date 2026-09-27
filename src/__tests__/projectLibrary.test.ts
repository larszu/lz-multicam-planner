import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pickProjectLibrary, mergeProjectLibrary } from '../utils/projectLibrary';
import type { Camera, Lens, ProjectFile, VenueCamera } from '../types';

// ───────────────────────────────────────────────────────────────────────────
// Eigene Kameras und Optiken reisen mit dem Projekt (cable-planner#917).
//
// Vorher lagen sie nur im localStorage des Rechners, auf dem sie angelegt
// wurden. Dasselbe Projekt auf einem zweiten Rechner: eine Kamera-Id, zu der
// es keine Kamera gibt — keine Sensormasse, kein Bildwinkel. Geprueft wird
// das Schreiben (nur Benutztes), das Aufnehmen beim Laden (nur Fehlendes)
// und dass ein eigener Eintrag nie still ueberschrieben wird.
// ───────────────────────────────────────────────────────────────────────────

const eigeneKamera = (over: Partial<Camera> = {}): Camera => ({
  id: 'custom-cam-1', manufacturer: 'Eigenbau', model: 'Testkamera', mount: 'E',
  sensor: { name: 'S35', widthMm: 24.89, heightMm: 14, cropFactor: 1.45 },
  resolutions: ['HD'], type: 'cinema',
  ...over,
});

const eigeneOptik = (over: Partial<Lens> = {}): Lens => ({
  id: 'custom-lens-1', manufacturer: 'Eigenbau', model: '50mm', mount: 'E',
  focalLengthMin: 50, focalLengthMax: 50, maxApertureWide: 1.8, type: 'prime', isCustom: true,
  ...over,
});

const platziert = (cameraId: string, lensId: string, id = 'cam-1'): VenueCamera => ({
  id, label: id.toUpperCase(), cameraId, lensId,
  x: 5, y: 5, z: 1.5, pan: 0, tilt: 0, focalLength: 50, aperture: 2.8,
  focusDistance: 5, color: '#ef4444', extenderActive: 1, useSpeedbooster: false,
});

describe('pickProjectLibrary — nur, was das Projekt benutzt', () => {
  it('nimmt die benutzten eigenen Kameras und Optiken, sonst nichts', () => {
    const unbenutzt = eigeneKamera({ id: 'custom-cam-2', model: 'Liegt nur rum' });
    const out = pickProjectLibrary(
      [platziert('custom-cam-1', 'custom-lens-1'), platziert('sony-hdc-3500', 'fuj-ha18x7.6', 'cam-2')],
      [eigeneKamera(), unbenutzt],
      [eigeneOptik(), eigeneOptik({ id: 'custom-lens-2' })],
    );
    expect(out.customCameras?.map((c) => c.id)).toEqual(['custom-cam-1']);
    expect(out.customLenses?.map((l) => l.id)).toEqual(['custom-lens-1']);
  });

  it('trägt keine leeren Felder in eine Datei ohne eigene Einträge', () => {
    expect(pickProjectLibrary([platziert('sony-hdc-3500', 'fuj-ha18x7.6')], [eigeneKamera()], [])).toEqual({});
  });

  it('nimmt auch den Schatten eines eingebauten Modells mit — das Projekt rechnet mit ihm', () => {
    const schatten = eigeneKamera({ id: 'sony-hdc-3500', manufacturer: 'Sony', model: 'HDC-3500' });
    const out = pickProjectLibrary([platziert('sony-hdc-3500', 'fuj-ha18x7.6')], [schatten], []);
    expect(out.customCameras).toEqual([schatten]);
  });
});

describe('mergeProjectLibrary — Fehlendes aufnehmen, Eigenes nie überschreiben', () => {
  const leer = { customCameras: [] as Camera[], customLenses: [] as Lens[] };

  it('nimmt fehlende Einträge auf', () => {
    const r = mergeProjectLibrary(leer, { customCameras: [eigeneKamera()], customLenses: [eigeneOptik()] });
    expect(r.customCameras).toEqual([eigeneKamera()]);
    expect(r.customLenses).toEqual([eigeneOptik()]);
    expect(r).toMatchObject({ addedCameras: 1, addedLenses: 1, conflicts: [], invalid: 0 });
  });

  it('ein gleicher Eintrag ist kein Konflikt — auch mit anderer Feld-Reihenfolge', () => {
    const umsortiert = JSON.parse(JSON.stringify({
      type: 'cinema', resolutions: ['HD'],
      sensor: { cropFactor: 1.45, heightMm: 14, widthMm: 24.89, name: 'S35' },
      mount: 'E', model: 'Testkamera', manufacturer: 'Eigenbau', id: 'custom-cam-1',
    }));
    const r = mergeProjectLibrary({ ...leer, customCameras: [eigeneKamera()] }, { customCameras: [umsortiert] });
    expect(r).toMatchObject({ addedCameras: 0, conflicts: [], invalid: 0 });
  });

  it('dieselbe Id mit anderem Inhalt: der eigene bleibt, der Konflikt wird genannt', () => {
    const lokal = eigeneKamera();
    const fremd = eigeneKamera({ sensor: { name: 'FF', widthMm: 36, heightMm: 24, cropFactor: 1 } });
    const r = mergeProjectLibrary({ ...leer, customCameras: [lokal] }, { customCameras: [fremd] });
    expect(r.customCameras).toEqual([lokal]);
    expect(r.conflicts).toEqual(['Eigenbau Testkamera']);
    expect(r.addedCameras).toBe(0);
  });

  it('unlesbare Einträge werden nicht aufgenommen, aber gezählt', () => {
    const r = mergeProjectLibrary(leer, {
      customCameras: [null, { id: 'x' }, eigeneKamera({ id: 'ohne-sensor', sensor: undefined as never }), eigeneKamera()],
      customLenses: [eigeneOptik({ focalLengthMin: 0 }), 'optik'],
    });
    expect(r.customCameras.map((c) => c.id)).toEqual(['custom-cam-1']);
    expect(r.customLenses).toEqual([]);
    expect(r.invalid).toBe(5);
  });

  it('eine Datei ohne Bibliothek ändert nichts', () => {
    const lokal = { customCameras: [eigeneKamera()], customLenses: [eigeneOptik()] };
    const r = mergeProjectLibrary(lokal, {});
    expect(r.customCameras).toBe(lokal.customCameras);
    expect(r).toMatchObject({ addedCameras: 0, addedLenses: 0, conflicts: [], invalid: 0 });
  });
});

// ── Der Weg durch den Store: Rechner A speichert, Rechner B oeffnet. ──────

const speicher: Record<string, string> = {};
let quotaFull = false;

const laden = async () => {
  const { useStore, buildProjectFile } = await import('../store/useStore');
  const { buildAvPlanExport } = await import('../store/avplanExport');
  const { getCameraById } = await import('../data/cameras');
  return { useStore, buildProjectFile, buildAvPlanExport, getCameraById };
};

describe('eigene Kameras/Optiken im Projekt — über den Store', () => {
  beforeEach(() => {
    for (const key of Object.keys(speicher)) delete speicher[key];
    quotaFull = false;
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => speicher[key] ?? null,
      setItem: (key: string, value: string) => {
        if (quotaFull) throw new Error('QuotaExceededError');
        speicher[key] = value;
      },
      removeItem: (key: string) => { delete speicher[key]; },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Rechner A: eine eigene Kamera mit eigener Optik, platziert. */
  const rechnerA = async () => {
    const a = await laden();
    const kameraId = a.useStore.getState().addCustomCamera(eigeneKamera());
    const optikId = a.useStore.getState().addCustomLens(eigeneOptik());
    a.useStore.getState().addCamera();
    const platzierteId = a.useStore.getState().cameras[0].id;
    a.useStore.getState().updateCamera(platzierteId, { cameraId: kameraId, lensId: optikId });
    return { ...a, kameraId, optikId };
  };

  /** Den Rechner wechseln: leerer localStorage, frischer Store. */
  const rechnerB = async (vorbelegt: Record<string, string> = {}) => {
    for (const key of Object.keys(speicher)) delete speicher[key];
    Object.assign(speicher, vorbelegt);
    vi.resetModules();
    return laden();
  };

  it('die .mcplan trägt sie, und Rechner B nimmt sie auf', async () => {
    const a = await rechnerA();
    const datei = JSON.parse(JSON.stringify(a.buildProjectFile(a.useStore.getState()))) as ProjectFile;
    expect(datei.customCameras?.map((c) => c.id)).toEqual([a.kameraId]);
    expect(datei.customLenses?.map((l) => l.id)).toEqual([a.optikId]);

    const b = await rechnerB();
    b.useStore.getState().applyProjectFile(datei);
    const s = b.useStore.getState();
    expect(b.getCameraById(s.cameras[0].cameraId, s.customCameras)?.model).toBe('Testkamera');
    expect(s.customLenses.map((l) => l.id)).toEqual([a.optikId]);
    // Und dauerhaft — nicht nur fuer diese Sitzung.
    expect(JSON.parse(speicher['multicam-custom-cameras']).map((c: Camera) => c.id)).toEqual([a.kameraId]);
    expect(JSON.parse(speicher['multicam-custom-lenses']).map((l: Lens) => l.id)).toEqual([a.optikId]);
    expect(s.lastLibraryMerge).toBeNull();
  });

  it('die .avplan trägt sie im cameras-Slot ebenso', async () => {
    const a = await rechnerA();
    const avplan = JSON.stringify(a.buildAvPlanExport(a.useStore.getState(), 't'));
    const slot = JSON.parse(avplan).domains.cameras as ProjectFile;
    expect(slot.customCameras?.map((c) => c.id)).toEqual([a.kameraId]);

    const b = await rechnerB();
    const { parseAvPlan } = await import('../utils/avplan');
    b.useStore.getState().importAvPlan(parseAvPlan(avplan));
    expect(b.useStore.getState().customCameras.map((c) => c.id)).toEqual([a.kameraId]);
  });

  it('ein eigener Eintrag mit derselben Id bleibt — und das wird gemeldet', async () => {
    const a = await rechnerA();
    const datei = JSON.parse(JSON.stringify(a.buildProjectFile(a.useStore.getState()))) as ProjectFile;
    const lokal = eigeneKamera({ id: a.kameraId, sensor: { name: 'FF', widthMm: 36, heightMm: 24, cropFactor: 1 } });

    const b = await rechnerB({ 'multicam-custom-cameras': JSON.stringify([lokal]) });
    b.useStore.getState().applyProjectFile(datei);
    expect(b.useStore.getState().customCameras).toEqual([lokal]);
    expect(JSON.parse(speicher['multicam-custom-cameras'])).toEqual([lokal]);
    expect(b.useStore.getState().lastLibraryMerge).toEqual({ conflicts: ['Eigenbau Testkamera'], invalid: 0 });
    b.useStore.getState().dismissLibraryMerge();
    expect(b.useStore.getState().lastLibraryMerge).toBeNull();
  });

  it('voller Speicher beim Aufnehmen wird gemeldet, die Einträge stehen trotzdem bereit', async () => {
    const a = await rechnerA();
    const datei = JSON.parse(JSON.stringify(a.buildProjectFile(a.useStore.getState()))) as ProjectFile;
    const b = await rechnerB();
    quotaFull = true;
    b.useStore.getState().applyProjectFile(datei);
    expect(b.useStore.getState().libraryStorageFull).toBe(true);
    expect(b.useStore.getState().customCameras.map((c) => c.id)).toEqual([a.kameraId]);
  });
});

// ── Eintraege der Geraetebibliothek im Projekt ──────────────────────────────

describe('Bibliothekseintraege im Projekt — über den Store', () => {
  beforeEach(() => {
    for (const key of Object.keys(speicher)) delete speicher[key];
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => speicher[key] ?? null,
      setItem: (key: string, value: string) => { speicher[key] = value; },
      removeItem: (key: string) => { delete speicher[key]; },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const bibKamera = eigeneKamera({ id: 'devlib-eigenbau-testkamera', model: 'Aus der Bibliothek' });

  it('reisen in der .mcplan mit und rechnen auf Rechner B ohne Bibliothek — ohne dessen Cache zu fuellen', async () => {
    const a = await laden();
    const reg = await import('../library/registry');
    reg.setLibraryCatalog({ cameras: [bibKamera], lenses: [] });
    a.useStore.getState().addCamera();
    const id = a.useStore.getState().cameras[0].id;
    a.useStore.getState().updateCamera(id, { cameraId: bibKamera.id });
    const datei = JSON.parse(JSON.stringify(a.buildProjectFile(a.useStore.getState()))) as ProjectFile;
    expect(datei.libraryCameras?.map((c) => c.id)).toEqual([bibKamera.id]);
    expect(datei.customCameras).toBeUndefined();

    for (const key of Object.keys(speicher)) delete speicher[key];
    vi.resetModules();
    const b = await laden();
    b.useStore.getState().applyProjectFile(datei);
    expect(b.getCameraById(bibKamera.id, b.useStore.getState().customCameras)?.model).toBe('Aus der Bibliothek');
    expect(b.useStore.getState().customCameras).toEqual([]);
    expect(speicher['multicam-device-library-cache']).toBeUndefined();

    // Das naechste Projekt bringt sie nicht mehr mit.
    b.useStore.getState().newProject();
    expect(b.getCameraById(bibKamera.id)).toBeUndefined();
  });
});
