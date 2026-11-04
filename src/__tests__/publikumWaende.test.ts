// #248 — Publikum nur in eingezeichneten Flächen, Glasfronten, Türen und Fenster.
import { describe, expect, it } from 'vitest';
import { sitzblockNormal, sitzblockPlaetzeListe } from '../avplan/floorplan';
import { publikumsBild, sitzflaecheAusRahmen } from '../utils/raum';
import { fensterScheiben, neueOeffnung, oeffnungStrecke, wandStuecke } from '../utils/wallOpenings';
import { sightlineConflicts } from '../utils/sightline';
import type { Venue, VenueCamera, Wall } from '../types';

const halle = (over: Partial<Venue> = {}): Venue => ({
  name: 'Halle', widthM: 20, heightM: 15,
  stages: [{ id: 's', x: 7, y: 0.5, width: 6, height: 3, label: 'Stage' }],
  ...over,
});

describe('Publikumsfläche aus einem aufgezogenen Rechteck', () => {
  it('füllt das Rechteck und schaut zur Bühne oben', () => {
    const b = sitzflaecheAusRahmen(halle(), { minX: 4, minY: 6, maxX: 16, maxY: 12 });
    expect(b).toMatchObject({ x: 10, y: 9, width: 12, rotationDeg: 0, standing: false });
    expect(b.rows * b.rowSpacingM!).toBeCloseTo(6, 1);
    const plaetze = sitzblockPlaetzeListe(b);
    expect(plaetze.every((p) => p.x >= 4 && p.x <= 16 && p.y >= 6 && p.y <= 12)).toBe(true);
    // Blick nach −y, zur Bühne
    expect(plaetze[0].blickDeg).toBeCloseTo(-90, 6);
  });

  it('dreht sich zur Bühne an der Seite und tauscht Breite und Tiefe', () => {
    const v = halle({ stages: [{ id: 's', x: 0.5, y: 5, width: 3, height: 6, label: 'Stage' }] });
    const b = sitzflaecheAusRahmen(v, { minX: 8, minY: 4, maxX: 14, maxY: 12 }, true);
    expect(b.rotationDeg).toBe(270);
    expect(b.width).toBeCloseTo(8, 6);
    expect(b.rows * b.rowSpacingM!).toBeCloseTo(6, 1);
    const n = sitzblockNormal(b);
    const plaetze = sitzblockPlaetzeListe(n);
    expect(plaetze.every((p) => p.x >= 7.9 && p.x <= 14.1 && p.y >= 3.9 && p.y <= 12.1)).toBe(true);
  });

  it('schaut ohne Bühne nach oben', () => {
    expect(sitzflaecheAusRahmen(halle({ stages: [] }), { minX: 0, minY: 0, maxX: 4, maxY: 2 }).rotationDeg).toBe(0);
  });
});

describe('Publikum nur in Flächen, wenn ein Plan da ist', () => {
  const basis = { widthM: 20, depthM: 15, stages: halle().stages, cameras: [], persons: [], walls: [] };
  it('füllt einen leeren Raum wie bisher', () => {
    expect(publikumsBild({ ...basis, freiFuellen: true }).menschen.length).toBeGreaterThan(50);
    expect(publikumsBild(basis).menschen.length).toBeGreaterThan(50);
  });
  it('lässt einen Gebäudeplan ohne Flächen leer', () => {
    expect(publikumsBild({ ...basis, freiFuellen: false }).menschen).toHaveLength(0);
  });
  it('setzt Menschen in eingezeichnete Flächen, auch mit Plan', () => {
    const block = sitzflaecheAusRahmen(halle(), { minX: 4, minY: 6, maxX: 16, maxY: 12 });
    expect(publikumsBild({ ...basis, freiFuellen: false, blocks: [block] }).menschen.length).toBeGreaterThan(20);
  });
});

describe('Türen, Fenster und Glas', () => {
  const wand: Wall = { id: 'w', x1: 0, y1: 0, x2: 0, y2: 6, label: 'Wall' };

  it('legt Tür und Fenster mittig mit üblichen Maßen an', () => {
    expect(neueOeffnung(wand, 'door')).toEqual({ offset: 2.55, width: 0.9, bottom: 0, top: 2.1, kind: 'door' });
    const f = neueOeffnung(wand, 'window');
    expect(f).toMatchObject({ width: 1.2, bottom: 0.9, top: 2.3, kind: 'window' });
    expect(neueOeffnung({ x1: 0, y1: 0, x2: 0.5, y2: 0 }, 'door').width).toBeCloseTo(0.3, 6);
  });

  it('findet die Öffnung entlang der Wand', () => {
    expect(oeffnungStrecke(wand, { offset: 1, width: 2 })).toEqual([0, 1, 0, 3]);
  });

  it('spart die Tür aus und setzt ins Fenster eine Scheibe', () => {
    const w: Wall = { ...wand, openings: [neueOeffnung(wand, 'door')] };
    expect(wandStuecke(w, 3)).toHaveLength(3);
    expect(fensterScheiben(w, 3)).toHaveLength(0);
    const mitFenster: Wall = { ...wand, openings: [{ offset: 1, width: 2, bottom: 0.9, top: 2.3, kind: 'window' }] };
    const [s] = fensterScheiben(mitFenster, 3);
    expect(s).toMatchObject({ x: 0, y: 2, unten: 0.9, laenge: 2 });
    expect(s.hoehe).toBeCloseTo(1.4, 6);
  });

  it('Glas verdeckt keine Sichtlinie', () => {
    const kamera = { id: 'c', label: 'CAM 1', cameraId: 'x', lensId: 'l', x: 0, y: 0, z: 1.5, pan: 0, tilt: 0, focalLength: 50, aperture: 2.8, focusDistance: 10, color: '#fff', extenderActive: 1 } as VenueCamera;
    const quer: Wall = { id: 'q', x1: 5, y1: -3, x2: 5, y2: 3, height: 3, label: 'Front' };
    const leer = { persons: [], stages: [] };
    expect(sightlineConflicts({ ...leer, cameras: [kamera], walls: [quer] })).toHaveLength(1);
    expect(sightlineConflicts({ ...leer, cameras: [kamera], walls: [{ ...quer, kind: 'glass' }] })).toHaveLength(0);
  });
});
