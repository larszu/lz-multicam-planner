import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_WALL_HEIGHT_M, defaultWallHeight, migrateWallHeights, resolveWallHeights, wallHeight } from '../utils/wallHeight';
import { sightlineConflicts } from '../utils/sightline';
import type { ProjectFile, Wall } from '../types';

// #198 — Wandhoehe global (Standardhoehe) und je Wand; leer = Standard.

const wand = (id: string, height?: number): Wall => ({ id, x1: 0, y1: 5, x2: 10, y2: 5, label: id, ...(height !== undefined ? { height } : {}) });

describe('wallHeight', () => {
  it('eigene Hoehe vor Standard, leer = Standard', () => {
    expect(wallHeight(wand('a', 4.5), 3)).toBe(4.5);
    expect(wallHeight(wand('b'), 3.2)).toBe(3.2);
    expect(wallHeight({ height: 0 }, 3)).toBe(3);
  });

  it('Standard faellt ohne Wert auf 3 m', () => {
    expect(defaultWallHeight({})).toBe(DEFAULT_WALL_HEIGHT_M);
    expect(defaultWallHeight({ defaultWallHeightM: 6 })).toBe(6);
  });

  it('resolveWallHeights fuellt jede Wand', () => {
    expect(resolveWallHeights([wand('a'), wand('b', 2)], 5).map((w) => w.height)).toEqual([5, 2]);
  });
});

describe('migrateWallHeights — Dateien vor #198', () => {
  it('haeufigste Hoehe wird Standard, Abweichler behalten ihre', () => {
    const r = migrateWallHeights([wand('a', 4), wand('b', 4), wand('c', 2.5)], undefined);
    expect(r.defaultWallHeightM).toBe(4);
    expect(r.walls.map((w) => w.height)).toEqual([undefined, undefined, 2.5]);
    expect('height' in r.walls[0]).toBe(false);
  });

  it('ohne Waende: Standard 3 m', () => {
    expect(migrateWallHeights([], undefined)).toEqual({ walls: [], defaultWallHeightM: 3 });
  });

  it('Datei mit Standard bleibt unveraendert', () => {
    const walls = [wand('a', 3), wand('b')];
    const r = migrateWallHeights(walls, 5);
    expect(r.defaultWallHeightM).toBe(5);
    expect(r.walls).toEqual(walls);
  });
});

describe('Sichtlinie nutzt die effektive Hoehe', () => {
  it('Standardhoehe entscheidet, ob die Linie ueber die Wand geht', () => {
    const cam = { id: 'c', label: 'C', x: 5, y: 0, z: 2, pan: 90, tilt: 0, focusDistance: 20, mountType: 'tripod' } as never;
    const input = { cameras: [cam], walls: [wand('w')], persons: [], stages: [] };
    const niedrig = sightlineConflicts({ ...input, defaultWallHeightM: 0.5 });
    const hoch = sightlineConflicts({ ...input, defaultWallHeightM: 10 });
    expect(niedrig).toHaveLength(0);
    expect(hoch.map((k) => k.obstacleId)).toEqual(['w']);
  });
});

describe('Projektdatei', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  const plan = (over: Partial<ProjectFile> = {}): ProjectFile => ({
    formatVersion: 1, appVersion: '4.8.0', projectVersion: 2, savedAt: '2026-10-14T00:00:00.000Z',
    venue: { name: 'Halle', widthM: 20, heightM: 15, stages: [] },
    cameras: [], persons: [], walls: [], backgroundPlan: null, ...over,
  });

  it('alte Datei: Hoehen bleiben sichtbar gleich, Standard wird gesetzt', async () => {
    const { useStore } = await import('../store/useStore');
    useStore.getState().applyProjectFile(plan({ walls: [wand('wall-1', 3.5), wand('wall-2', 3.5), wand('wall-3', 6)] }));
    const s = useStore.getState();
    expect(s.venue.defaultWallHeightM).toBe(3.5);
    const std = defaultWallHeight(s.venue);
    expect(s.walls.map((w) => wallHeight(w, std))).toEqual([3.5, 3.5, 6]);
    expect(s.walls[0].height).toBeUndefined();
  });

  it('Standard aendern bewegt Waende ohne eigene Hoehe mit; Round-Trip bleibt', async () => {
    const { useStore, buildProjectFile } = await import('../store/useStore');
    useStore.getState().applyProjectFile(plan({ walls: [wand('wall-1', 3), wand('wall-2', 5)] }));
    useStore.getState().setVenue({ ...useStore.getState().venue, defaultWallHeightM: 4 });
    const datei = JSON.parse(JSON.stringify(buildProjectFile(useStore.getState()))) as ProjectFile;
    expect(datei.venue.defaultWallHeightM).toBe(4);
    expect(datei.walls?.map((w) => w.height)).toEqual([undefined, 5]);
    useStore.getState().applyProjectFile(datei);
    const s = useStore.getState();
    expect(s.walls.map((w) => wallHeight(w, defaultWallHeight(s.venue)))).toEqual([4, 5]);
  });

  it('neue Wand ohne Angabe folgt dem Standard', async () => {
    const { useStore } = await import('../store/useStore');
    useStore.getState().addWall({ x1: 0, y1: 0, x2: 1, y2: 0 });
    expect(useStore.getState().walls.slice(-1)[0]?.height).toBeUndefined();
  });
});
