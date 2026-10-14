import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PATTERN_ROWS,
  PATTERN_ROWS_MAX,
  stripCount,
  stripRanges,
  stripTransform,
  surfaceKey,
  textureSize,
  tileGrid,
} from '../utils/wallSurface';
import type { Wall } from '../types';

// #74: Das Muster wurde im Bildschirmraum gemalt — beim Reinzoomen wurden es
// immer mehr Blumen (und immer langsamer), und ein Bild klebte am Bildschirm
// statt an der Wand. Diese Tests halten fest, dass die Anzahl jetzt an der
// Wand haengt.

const wall = (over: Partial<Wall> = {}): Wall & { height: number } => ({
  id: 'wall-1',
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 0,
  height: 3,
  label: 'W',
  ...over,
});

describe('tileGrid', () => {
  it('hält die gewünschte Anzahl in der Höhe ein', () => {
    // "wie viele Blumen in der Höhe auf der Wand sichtbar sein sollen"
    expect(tileGrid('tile', 10, 3, 6).rows).toBe(6);
  });

  it('leitet die Spalten aus der Wandform ab, damit Kacheln quadratisch bleiben', () => {
    // 10 m breit, 3 m hoch, 6 Reihen → Kachel 0.5 m → 20 Spalten.
    expect(tileGrid('tile', 10, 3, 6)).toEqual({ cols: 20, rows: 6 });
  });

  it('berücksichtigt das Seitenverhältnis der Vorlage', () => {
    // Ein 2:1-Bild belegt doppelt so viel Breite je Kachel → halb so viele Spalten.
    expect(tileGrid('tile', 10, 3, 6, 2).cols).toBe(10);
  });

  it('legt bei "gedehnt" genau ein Bild über die Wand', () => {
    expect(tileGrid('stretch', 10, 3, 6)).toEqual({ cols: 1, rows: 1 });
  });

  it('skaliert auf die Höhe und wiederholt waagerecht', () => {
    // Bild 1:1, Wandhoehe 3 m → Kachel 3 m breit → 10 m / 3 m ≈ 3 Spalten.
    expect(tileGrid('scale-v', 10, 3, 6)).toEqual({ cols: 3, rows: 1 });
  });

  it('skaliert auf die Breite und wiederholt senkrecht', () => {
    // Bild 2:1 auf 10 m Breite → 5 m hoch → passt einmal in 3 m Hoehe.
    expect(tileGrid('scale-h', 10, 3, 6, 2)).toEqual({ cols: 1, rows: 1 });
    // Flaches Bild 10:1 → 1 m hoch → dreimal.
    expect(tileGrid('scale-h', 10, 3, 6, 10)).toEqual({ cols: 1, rows: 3 });
  });

  it('fängt unsinnige Reihenzahlen ab', () => {
    expect(tileGrid('tile', 10, 3, 0).rows).toBe(DEFAULT_PATTERN_ROWS);
    expect(tileGrid('tile', 10, 3, 9999).rows).toBe(PATTERN_ROWS_MAX);
    expect(tileGrid('tile', 10, 3, -5).rows).toBe(DEFAULT_PATTERN_ROWS);
  });

  it('kommt mit einer Wand ohne Ausdehnung klar', () => {
    const g = tileGrid('tile', 0, 0, 6);
    expect(g.cols).toBeGreaterThanOrEqual(1);
    expect(g.rows).toBeGreaterThanOrEqual(1);
  });

  it('bleibt beim Zoomen gleich — die Funktion kennt den Zoom gar nicht', () => {
    // Genau das war der Fehler: die Anzahl kam aus der Bildschirmflaeche.
    const a = tileGrid('tile', 12, 4, 8);
    const b = tileGrid('tile', 12, 4, 8);
    expect(a).toEqual(b);
  });
});

describe('textureSize', () => {
  it('behält das Seitenverhältnis der Wand', () => {
    const { w, h } = textureSize(10, 5);
    expect(w / h).toBeCloseTo(2, 1);
  });

  it('deckelt sehr lange Wände', () => {
    const { w, h } = textureSize(400, 3);
    expect(w).toBeLessThanOrEqual(2048);
    expect(h).toBeGreaterThan(0);
  });

  it('liefert auch für Nullmaße etwas Zeichenbares', () => {
    const { w, h } = textureSize(0, 0);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });
});

describe('surfaceKey', () => {
  it('ändert sich mit jeder Eigenschaft, die das Aussehen bestimmt', () => {
    const base = surfaceKey(wall({ pattern: 'flowers' }), 10);
    expect(surfaceKey(wall({ pattern: 'grid' }), 10)).not.toBe(base);
    expect(surfaceKey(wall({ pattern: 'flowers', patternRows: 9 }), 10)).not.toBe(base);
    expect(surfaceKey(wall({ pattern: 'flowers', patternFit: 'stretch' }), 10)).not.toBe(base);
    expect(surfaceKey(wall({ pattern: 'flowers', color: '#ff0000' }), 10)).not.toBe(base);
    expect(surfaceKey(wall({ pattern: 'flowers', height: 4 }), 10)).not.toBe(base);
    expect(surfaceKey(wall({ pattern: 'flowers' }), 12)).not.toBe(base);
  });

  it('bleibt gleich, wenn sich nichts Sichtbares ändert', () => {
    // Sonst wuerde die Textur in jedem Bild neu gemalt.
    expect(surfaceKey(wall({ pattern: 'flowers', label: 'A' }), 10))
      .toBe(surfaceKey(wall({ pattern: 'flowers', label: 'B' }), 10));
  });
});

describe('Streifen-Mapping', () => {
  it('zerlegt die Wand lückenlos', () => {
    const r = stripRanges(4);
    expect(r).toHaveLength(4);
    expect(r[0].t0).toBe(0);
    expect(r[3].t1).toBe(1);
    for (let i = 1; i < r.length; i++) expect(r[i].t0).toBeCloseTo(r[i - 1].t1, 10);
  });

  it('liefert mindestens einen Streifen', () => {
    expect(stripRanges(0)).toHaveLength(1);
    expect(stripRanges(-3)).toHaveLength(1);
  });

  it('nimmt mehr Streifen für breite Wände, gedeckelt', () => {
    expect(stripCount(24)).toBeLessThan(stripCount(600));
    expect(stripCount(100000)).toBeLessThanOrEqual(64);
    expect(stripCount(1)).toBeGreaterThanOrEqual(4);
  });

  it('legt den Quellausschnitt exakt auf die drei bekannten Ecken', () => {
    const tl = { x: 100, y: 50 };
    const tr = { x: 200, y: 60 };
    const bl = { x: 100, y: 150 };
    const [a, b, c, d, e, f] = stripTransform(0, 40, 80, tl, tr, bl);
    const apply = (x: number, y: number) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
    expect(apply(0, 0)).toEqual(tl);
    expect(apply(40, 0).x).toBeCloseTo(tr.x, 10);
    expect(apply(40, 0).y).toBeCloseTo(tr.y, 10);
    expect(apply(0, 80).x).toBeCloseTo(bl.x, 10);
    expect(apply(0, 80).y).toBeCloseTo(bl.y, 10);
  });

  it('berücksichtigt den Versatz des Quellausschnitts', () => {
    const tl = { x: 10, y: 0 };
    const tr = { x: 20, y: 0 };
    const bl = { x: 10, y: 30 };
    const [a, b, c, d, e, f] = stripTransform(100, 10, 30, tl, tr, bl);
    const apply = (x: number, y: number) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
    // Der Streifen beginnt bei Quell-x=100 und muss dort links landen.
    expect(apply(100, 0).x).toBeCloseTo(10, 10);
    expect(apply(110, 0).x).toBeCloseTo(20, 10);
  });
});
