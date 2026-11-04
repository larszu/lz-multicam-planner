import { describe, it, expect } from 'vitest';
import { ebenenListe, gedrehteLage, ohneEbenen, winkelNorm } from '../lib/planBearbeiten';
import { alsHintergrundPlan, dxfMeterBreite } from '../lib/hintergrundPlan';
import type { VektorZeichnung } from '../avplan/floorplan';

const plan = { widthPx: 2000, heightPx: 1000, scaleX: 0.01, scaleY: 0.01, offsetX: 2, offsetY: 3 };

describe('turning the floor plan', () => {
  it('a quarter turn swaps the sides and keeps the centre', () => {
    const l = gedrehteLage(plan, 90);
    expect(l.widthPx).toBe(1000);
    expect(l.heightPx).toBe(2000);
    expect(l.offsetX + (l.widthPx * l.scale) / 2).toBeCloseTo(2 + 10);
    expect(l.offsetY + (l.heightPx * l.scale) / 2).toBeCloseTo(3 + 5);
  });

  it('an odd angle grows the bounding box and never exceeds the pixel cap', () => {
    const l = gedrehteLage(plan, 30, 2000);
    expect(l.widthPx * l.scale).toBeCloseTo(20 * Math.cos(Math.PI / 6) + 10 * 0.5);
    expect(Math.max(l.widthPx, l.heightPx)).toBeLessThanOrEqual(2000);
  });

  it('normalises angles', () => {
    expect(winkelNorm(-90)).toBe(270);
    expect(winkelNorm(450)).toBe(90);
  });
});

describe('DXF layers and scale', () => {
  const z: VektorZeichnung = {
    quelle: 'dxf', breite: 40000, hoehe: 20000, meterJeEinheit: 0.001, texte: [],
    pfade: [
      { teile: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], zu: [false], kurve: false, gefuellt: false, gezogen: true, breite: 0, ebene: 'WALLS' },
      { teile: [[{ x: 0, y: 0 }, { x: 2, y: 2 }]], zu: [false], kurve: false, gefuellt: false, gezogen: true, breite: 0, ebene: 'WALLS' },
      { teile: [[{ x: 0, y: 0 }, { x: 3, y: 3 }]], zu: [false], kurve: false, gefuellt: false, gezogen: true, breite: 0, ebene: 'FURNITURE' },
    ],
  };

  it('lists the layers with their line count', () => {
    expect(ebenenListe(z)).toEqual([{ name: 'FURNITURE', linien: 1 }, { name: 'WALLS', linien: 2 }]);
  });

  it('hides layers without changing the drawing extent', () => {
    const ohne = ohneEbenen(z, ['FURNITURE']);
    expect(ohne.pfade).toHaveLength(2);
    expect(ohne.breite).toBe(z.breite);
    expect(ohneEbenen(z, [])).toBe(z);
  });

  it('a DXF with units lands at its real size', () => {
    expect(dxfMeterBreite(z)).toBe(40);
    expect(dxfMeterBreite({ ...z, meterJeEinheit: undefined })).toBeUndefined();
    const bg = alsHintergrundPlan({ src: 'x', name: 'a.dxf', naturalWidth: 3000, naturalHeight: 1500, art: 'bild', seiten: 1, seite: 0 }, 20, 40);
    expect(bg.widthPx * bg.scaleX).toBeCloseTo(40);
  });
});
