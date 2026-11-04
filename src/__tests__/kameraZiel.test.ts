import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReferencePerson, Stage, VenueCamera } from '../types';
import { amZiel, ausrichtungAuf, istFestbrennweite, PERSON_HEIGHT_M, shotSize, zielFolgen, zielPunkt } from '../utils/kameraZiel';
import { aufloesen, positionenAlsText, positionenLesen, type PositionZeile } from '../utils/kameraPositionen';
import { rigLimits } from '../utils/rigLimits';
import { CAMERAS } from '../data/cameras';
import { LENSES } from '../data/lenses';

const cam = (over: Partial<VenueCamera> = {}): VenueCamera => ({
  id: 'cam-1', label: 'CAM 1', cameraId: 'c', lensId: 'l',
  x: 0, y: 0, z: 1.7 / 2, pan: 0, tilt: 0,
  focalLength: 50, aperture: 4, focusDistance: 8, color: '#f00', extenderActive: 1,
  ...over,
});
const stage = (over: Partial<Stage> = {}): Stage => ({ id: 's1', x: 8, y: 8, width: 4, height: 4, label: 'Stage', ...over });
const person = (id: string, x: number, y: number): ReferencePerson => ({ id, x, y, height: 1.8, width: 0.5, label: id, objectType: 'person' });
const szene = { persons: [person('p1', 3, 4)], venue: { stages: [stage()] } };
const sensor = { name: 'S35', widthMm: 24.9, heightMm: 14, cropFactor: 1.5 };

describe('Ziel (#230)', () => {
  it('ohne eigenes Ziel gilt die Buehnenmitte, auf Podesthoehe plus halbe Person', () => {
    expect(zielPunkt(undefined, { persons: [], venue: { stages: [stage({ elevationM: 1 })] } })).toEqual({ x: 10, y: 10, z: 1 + PERSON_HEIGHT_M / 2 });
    expect(zielPunkt(undefined, { persons: [], venue: { stages: [] } })).toBeNull();
  });

  it('Person, Punkt und eine bestimmte Buehne', () => {
    expect(zielPunkt({ kind: 'person', id: 'p1' }, szene)).toEqual({ x: 3, y: 4, z: 0.9 });
    expect(zielPunkt({ kind: 'person', id: 'weg' }, szene)).toBeNull();
    expect(zielPunkt({ kind: 'point', x: 1, y: 2 }, szene)).toMatchObject({ x: 1, y: 2 });
    const zwei = { persons: [], venue: { stages: [stage(), stage({ id: 's2', x: 0, y: 0, width: 2, height: 2 })] } };
    expect(zielPunkt({ kind: 'stage', stageId: 's2' }, zwei)).toMatchObject({ x: 1, y: 1 });
  });

  it('Pan zeigt auf das Ziel, Tilt nach unten, wenn das Ziel tiefer liegt', () => {
    expect(ausrichtungAuf(cam(), { x: 0, y: 10, z: 0.85 })).toEqual({ pan: 90, tilt: 0 });
    const a = ausrichtungAuf(cam({ z: 10.85 }), { x: 10, y: 0, z: 0.85 })!;
    expect(a.pan).toBe(0);
    expect(a.tilt).toBe(-45);
    expect(ausrichtungAuf(cam(), { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('nur folgende Kameras drehen; unveraenderte Liste bleibt dasselbe Objekt', () => {
    const frei = cam({ id: 'a' });
    const folgt = cam({ id: 'b', aimFollow: true });
    const neu = zielFolgen([frei, folgt], szene);
    expect(neu[0]).toBe(frei);
    expect(neu[1].pan).toBe(45);
    expect(zielFolgen(neu, szene)).toBe(neu);
  });
});

describe('Werte am Ziel (#231)', () => {
  it('Entfernung und Bildbreite am Ziel', () => {
    const w = amZiel(cam({ focalLength: 25 }), sensor, undefined, { x: 20, y: 0, z: 0.85 });
    expect(w.distanceM).toBeCloseTo(20);
    expect(w.widthM).toBeCloseTo(20 * 24.9 / 25, 1);
    expect(w.heightM).toBeCloseTo(20 * 14 / 25, 1);
    expect(w.size).toBe('wide');
  });

  it('Einstellungsgroesse nach Bildhoehe gegen 1,70 m', () => {
    expect(shotSize(4)).toBe('wide');
    expect(shotSize(1.9)).toBe('full');
    expect(shotSize(1.0)).toBe('medium');
    expect(shotSize(0.55)).toBe('close');
    expect(shotSize(0.2)).toBe('detail');
  });
});

describe('Objektiv und Montage (#228, #229)', () => {
  it('Festbrennweite erkennt nur gleiche Grenzen', () => {
    expect(istFestbrennweite({ focalLengthMin: 50, focalLengthMax: 50 })).toBe(true);
    expect(istFestbrennweite({ focalLengthMin: 24, focalLengthMax: 70 })).toBe(false);
    expect(istFestbrennweite(undefined)).toBe(false);
  });

  it('Vorgabehoehe je Montage liegt im erlaubten Bereich', () => {
    for (const t of ['tripod', 'handheld', 'jib', 'hihat', 'fixed'] as const) {
      const l = rigLimits({ mountType: t });
      expect(l.standardHeightM).toBeGreaterThanOrEqual(l.minHeightM);
      expect(l.standardHeightM).toBeLessThanOrEqual(l.maxHeightM);
    }
    expect(rigLimits({ mountType: 'handheld' }).standardHeightM).toBe(1.6);
  });
});

describe('Positionen als Text (#232)', () => {
  const kopf = ['Name', 'X (m)', 'Y (m)', 'Height (m)', 'Camera', 'Lens', 'Focal length (mm)', 'Rig'];
  const zeilen: PositionZeile[] = [
    { name: 'CAM 1', x: 2.4, y: -11.2, z: 2.8, camera: 'Body A', lens: 'Lens A', focalLength: 120, rig: 'Tripod' },
    { name: 'CAM; 2', x: 1, y: 2, z: 1.6, camera: '', lens: '', focalLength: null, rig: 'Handheld' },
  ];

  it('alle drei Formate lesen sich verlustfrei zurueck', () => {
    for (const f of ['text', 'markdown', 'csv'] as const) {
      const txt = positionenAlsText(zeilen, f, kopf);
      expect(positionenLesen(txt), f).toEqual(zeilen);
    }
  });

  it('Text ist eine Zeile je Kamera', () => {
    expect(positionenAlsText(zeilen.slice(0, 1), 'text', kopf)).toBe('CAM 1 — X 2.4 m · Y -11.2 m · H 2.8 m · Body A · Lens A · 120 mm · Tripod');
  });

  it('liest auch Komma-Dezimalen und Tabulatoren, ignoriert Kopf und Muell', () => {
    expect(positionenLesen('Name\tX\tY\tH\nCAM 3\t1,5\t2\t1,4\nhallo')).toEqual([
      { name: 'CAM 3', x: 1.5, y: 2, z: 1.4, camera: '', lens: '', focalLength: null, rig: '' },
    ]);
  });

  it('loest Kamera, Objektiv und Montage ueber den Namen auf', () => {
    const c = CAMERAS[0];
    const l = LENSES[0];
    const u = aufloesen(
      { name: 'X', x: 1, y: 2, z: 3, camera: `${c.manufacturer} ${c.model}`, lens: l.model, focalLength: 30, rig: 'Stativ' },
      { cameras: CAMERAS, lenses: LENSES, rigTypen: ['tripod', 'jib'], rigNamen: (r) => (r === 'tripod' ? ['Tripod', 'Stativ'] : ['Jib']) },
    );
    expect(u).toEqual({ name: 'X', x: 1, y: 2, z: 3, cameraId: c.id, lensId: l.id, focalLength: 30, mountType: 'tripod' });
  });
});

describe('Store', () => {
  const speicher: Record<string, string> = {};
  beforeEach(() => {
    for (const key of Object.keys(speicher)) delete speicher[key];
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => speicher[key] ?? null,
      setItem: (key: string, value: string) => { speicher[key] = value; },
      removeItem: (key: string) => { delete speicher[key]; },
    });
  });

  async function store() {
    const { useStore } = await import('../store/useStore');
    const s = useStore.getState();
    s.setVenue({ ...s.venue, widthM: 20, heightM: 20, stages: [stage({ x: 8, y: 0, width: 4, height: 2 })] });
    useStore.setState({ cameras: [], persons: [] });
    useStore.getState().addCamera();
    return useStore;
  }

  it('folgende Kamera dreht beim Verschieben mit, Drehen von Hand loest das Folgen', async () => {
    const useStore = await store();
    const id = useStore.getState().cameras[0].id;
    useStore.getState().updateCamera(id, { aimFollow: true });
    useStore.getState().moveCamera(id, 10, 10);
    expect(useStore.getState().cameras[0].pan).toBe(-90);
    useStore.getState().moveCamera(id, 0, 1);
    expect(useStore.getState().cameras[0].pan).toBe(0);
    useStore.getState().updateStage('s1', { y: 10 });
    expect(useStore.getState().cameras[0].pan).toBeGreaterThan(0);
    useStore.getState().updateCamera(id, { pan: 33 });
    expect(useStore.getState().cameras[0]).toMatchObject({ pan: 33, aimFollow: undefined });
  });

  it('Zuruecksetzen behaelt Name, Position und Objektiv', async () => {
    const useStore = await store();
    const c0 = useStore.getState().cameras[0];
    useStore.getState().updateCamera(c0.id, { label: 'Main', x: 3, pan: 12, tilt: -9, z: 2.1, focalLength: c0.focalLength + 10, aimFollow: true });
    useStore.getState().resetCamera(c0.id);
    expect(useStore.getState().cameras[0]).toMatchObject({ label: 'Main', x: 3, lensId: c0.lensId, pan: -90, tilt: 0, z: 1.4, focalLength: c0.focalLength, aimFollow: undefined });
  });

  it('Einlesen verschiebt gleiche Namen und legt neue an', async () => {
    const useStore = await store();
    const r = useStore.getState().positionenUebernehmen([
      { name: 'cam 1', x: 4, y: 5, z: 2 },
      { name: 'Jib', x: 6, y: 7, z: 3, mountType: 'jib' },
    ]);
    expect(r).toEqual({ updated: 1, added: 1 });
    const [a, b] = useStore.getState().cameras;
    expect(a).toMatchObject({ label: 'CAM 1', x: 4, y: 5, z: 2 });
    expect(b).toMatchObject({ label: 'Jib', x: 6, y: 7, z: 3, mountType: 'jib' });
  });
});
