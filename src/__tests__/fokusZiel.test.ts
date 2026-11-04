import { describe, it, expect } from 'vitest';
import type { ReferencePerson, Stage, VenueCamera } from '../types';
import { fokusEntfernung, laufBisKante } from '../utils/kameraZiel';

const cam = (over: Partial<VenueCamera> = {}): VenueCamera => ({
  id: 'cam-1', label: 'CAM 1', cameraId: 'c', lensId: 'l',
  x: 0, y: 10, z: 1.5, pan: 0, tilt: 0,
  focalLength: 50, aperture: 4, focusDistance: 8, color: '#f00', extenderActive: 1,
  ...over,
});
const stage: Stage = { id: 's1', x: 8, y: 6, width: 4, height: 8, label: 'Stage', elevationM: 1 };
const tisch: ReferencePerson = { id: 't1', x: 3, y: 14, height: 0.8, width: 1, label: 'Table', objectType: 'table' };
const szene = { persons: [tisch], venue: { stages: [stage] } };

describe('Fokus auf ein Ziel (#225)', () => {
  it('Buehnenkante: Eintritt der Achse in die Buehne, nicht die Mitte', () => {
    expect(laufBisKante(cam(), stage)).toBeCloseTo(8);
    expect(fokusEntfernung(cam(), { kind: 'stage-edge', stageId: 's1' }, szene)).toBeCloseTo(8);
  });

  it('schraeg: die zugewandte Kante in Blickrichtung', () => {
    // Von unten links unter 45° trifft die Achse zuerst die untere Kante y = 6.
    const c = cam({ x: 6, y: 2, pan: 45 });
    expect(laufBisKante(c, stage)).toBeCloseTo(4 * Math.SQRT2);
  });

  it('geneigt: entlang der optischen Achse', () => {
    const c = cam({ tilt: -10 });
    expect(fokusEntfernung(c, { kind: 'stage-edge', stageId: 's1' }, szene)).toBeCloseTo(8 / Math.cos((10 * Math.PI) / 180));
  });

  it('Achse verfehlt die Buehne oder Kamera steht darauf: kein Wert', () => {
    expect(laufBisKante(cam({ pan: 180 }), stage)).toBeNull();
    expect(laufBisKante(cam({ pan: 90 }), stage)).toBeNull();
    expect(laufBisKante(cam({ x: 10 }), stage)).toBeNull();
    expect(fokusEntfernung(cam(), { kind: 'stage-edge', stageId: 'weg' }, szene)).toBeNull();
  });

  it('Objekt und Buehnenmitte ueber die Zielwahl aus #230', () => {
    expect(fokusEntfernung(cam(), { kind: 'person', id: 't1' }, szene)).toBeCloseTo(Math.hypot(3, 4, 0.4 - 1.5));
    expect(fokusEntfernung(cam(), { kind: 'stage', stageId: 's1' }, szene)).toBeCloseTo(Math.hypot(10, 0, 1 + 0.85 - 1.5));
  });
});
