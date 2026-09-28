import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseAvPlan } from '../utils/avplan';
import { CAMERA_LIST_VERSION, parseCameraList } from '../utils/cameraExport';
import type { ProjectFile, VenueCamera } from '../types';

// ───────────────────────────────────────────────────────────────────────────
// Die Kamera-Liste reist in der .avplan mit (cable-planner#908).
//
// Der cable-planner liest die Kameras aus MultiCams Slot, ohne MultiCams
// Projektformat kennen zu muessen: `domains.cameras.cameraList` ist eine
// vollstaendige `camera-list` v2. Sie ist ABGELEITET — beim Einlesen wirft
// MultiCam sie weg und erzeugt sie beim naechsten Export aus dem Stand, der
// dann gilt. Eine mitgeschleppte Liste stimmte nach der ersten verschobenen
// Kamera nicht mehr und stuende trotzdem in der Datei.
// ───────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

const laden = async () => {
  const { useStore, buildProjectFile } = await import('../store/useStore');
  const { buildAvPlanExport, cameraListOf } = await import('../store/avplanExport');
  return { useStore, buildProjectFile, buildAvPlanExport, cameraListOf };
};

type Slot = import('../store/avplanExport').AvPlanCamerasSlot;

const kamera = (id: string, label: string): VenueCamera => ({
  id, label, cameraId: 'sony-hdc-3500', lensId: 'fuj-ha18x7.6',
  x: 4, y: 9, z: 2.5, pan: -90, tilt: 0, focalLength: 30, aperture: 2.8,
  focusDistance: 10, color: '#ef4444', extenderActive: 2, useSpeedbooster: false,
});

const plan: ProjectFile = {
  formatVersion: 1,
  appVersion: '4.3.5',
  projectVersion: 4,
  projectId: 'projekt-halle-1',
  savedAt: '2026-09-24T00:00:00.000Z',
  venue: { name: 'Halle', widthM: 20, heightM: 15, stages: [] },
  cameras: [kamera('cam-1', 'CAM 1'), kamera('cam-2', 'CAM 2')],
  persons: [],
  walls: [],
  backgroundPlan: null,
};

describe('.avplan: die Kamera-Liste im eigenen Slot', () => {
  it('der Export trägt eine vollständige camera-list (v3) mit der Projekt-Id', async () => {
    const { useStore, buildAvPlanExport } = await laden();
    useStore.getState().applyProjectFile(plan);
    const slot = buildAvPlanExport(useStore.getState(), '2026-09-24T12:00:00.000Z').domains.cameras as Slot;

    expect(slot.projectId).toBe('projekt-halle-1');
    const liste = parseCameraList(JSON.stringify(slot.cameraList));
    expect(liste.formatVersion).toBe(CAMERA_LIST_VERSION);
    expect(liste.projectId).toBe('projekt-halle-1');
    expect(liste.cameras.map((c) => c.label)).toEqual(['CAM 1', 'CAM 2']);
    expect(liste.cameras[0]).toMatchObject({
      manufacturer: 'Sony', model: 'HDC-3500', z: 2.5, focalMm: 30, extender: 2, mount: 'B4',
    });
    expect(liste.cameras[0].lens?.focalMinMm).toBeGreaterThan(0);
  });

  it('ist dieselbe Liste wie der Einzel-Export — eine Stelle, nicht zwei', async () => {
    const { useStore, buildAvPlanExport, cameraListOf } = await laden();
    useStore.getState().applyProjectFile(plan);
    const now = '2026-09-24T12:00:00.000Z';
    const slot = buildAvPlanExport(useStore.getState(), now).domains.cameras as Slot;
    expect(slot.cameraList).toEqual(cameraListOf(useStore.getState(), now));
  });

  it('beim Einlesen wird sie verworfen und beim nächsten Export neu gebaut', async () => {
    const erst = await laden();
    erst.useStore.getState().applyProjectFile(plan);
    const datei = erst.buildAvPlanExport(erst.useStore.getState(), 't');
    // Eine veraltete Liste, wie sie in einer Datei stehen kann, die jemand
    // nach dem Export von Hand oder mit einem aelteren Stand bearbeitet hat.
    (datei.domains.cameras as Slot).cameraList!.cameras = [{ id: 'geist', label: 'GEIST' }];

    vi.resetModules();
    const dann = await laden();
    dann.useStore.getState().importAvPlan(parseAvPlan(JSON.stringify(datei)));

    const s = dann.useStore.getState();
    expect(s.cameras.map((c) => c.label)).toEqual(['CAM 1', 'CAM 2']);
    expect(s.projectId).toBe('projekt-halle-1');
    expect('cameraList' in dann.buildProjectFile(s)).toBe(false);
    const neu = (dann.buildAvPlanExport(s, 't2').domains.cameras as Slot).cameraList!;
    expect(neu.cameras.map((c) => c.label)).toEqual(['CAM 1', 'CAM 2']);
  });

  it('eine ältere .avplan ohne Kamera-Liste lädt wie bisher', async () => {
    const { useStore } = await laden();
    const alt = {
      kind: 'avplan', formatVersion: 1, app: 'multicam-planner', appVersion: '4.3.5', exportedAt: 't',
      venue: { name: 'Halle', widthM: 20, heightM: 15, persons: [], walls: [], stageObjects: [] },
      domains: { cameras: plan },
    };
    useStore.getState().importAvPlan(parseAvPlan(JSON.stringify(alt)));
    expect(useStore.getState().cameras).toHaveLength(2);
  });
});
