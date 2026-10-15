// Die Tiefenunschaerfe im Bild und die Zahlen daneben kommen aus derselben
// Rechnung: der scharfe Bereich des gezeichneten Bildes faengt dort an, wo
// `computeDof` ihn ansetzt, und er folgt Blende, Brennweite, Extender und
// Sensor.
import { describe, expect, it } from 'vitest';
import { getCameraById, getEffectiveSensor } from '../data/cameras';
import { getLensById } from '../data/lenses';
import { circleOfConfusion, computeDof } from '../utils/fov';
import { scharfeZoneImBild, tiefenschaerfeFuerBild, unschaerfeImBild } from '../utils/tiefenschaerfe';
import type { SensorSize } from '../types';

function sensorVon(camId: string, lensId: string): SensorSize {
  const camDef = getCameraById(camId, [])!;
  const lensDef = getLensById(lensId, [])!;
  return getEffectiveSensor(camDef, lensDef);
}

const FF = sensorVon('sony-fr7', 'sony-fe-24-105g');
const ZWEIDRITTEL = sensorVon('sony-hdc-3500', 'fuj-ua80x9');

const kam = (o: { f: number; blende: number; fokus: number; extender?: number }) =>
  ({ focalLength: o.f, aperture: o.blende, focusDistance: o.fokus, extenderActive: o.extender ?? 1 });

const zone = (o: { f: number; blende: number; fokus: number; extender?: number }, sensor = FF) => {
  const t = tiefenschaerfeFuerBild(kam(o), sensor)!;
  return scharfeZoneImBild(t, sensor);
};

describe('Tiefenunschaerfe im gemeinsamen Renderer', () => {
  it('der nahe Rand des scharfen Bereichs ist der von computeDof', () => {
    for (const o of [
      { f: 50, blende: 1.4, fokus: 4 },
      { f: 50, blende: 11, fokus: 4 },
      { f: 135, blende: 2.8, fokus: 12 },
      { f: 24, blende: 4, fokus: 3 },
      { f: 85, blende: 2, fokus: 2.5 },
    ]) {
      const soll = computeDof(FF, o.f, o.blende, o.fokus);
      expect(zone(o).nah, `${o.f} mm f/${o.blende}`).toBeCloseTo(soll.nearLimit, 6);
    }
  });

  it('hinter der Schaerfeebene bleibt das Bild hoechstens so scharf wie die Physik', () => {
    for (const o of [
      { f: 50, blende: 2, fokus: 5 },
      { f: 200, blende: 4, fokus: 30 },
      { f: 35, blende: 8, fokus: 6 },
    ]) {
      const soll = computeDof(FF, o.f, o.blende, o.fokus);
      const z = zone(o);
      expect(z.fern).toBeLessThanOrEqual(soll.farLimit + 1e-9);
      expect(z.fern).toBeGreaterThan(o.fokus);
    }
  });

  it('groessere Blendenzahl = mehr Schaerfentiefe, laengere Brennweite = weniger', () => {
    const offen = zone({ f: 50, blende: 1.4, fokus: 6 });
    const zu = zone({ f: 50, blende: 11, fokus: 6 });
    expect(zu.fern - zu.nah).toBeGreaterThan(offen.fern - offen.nah);

    const weit = zone({ f: 25, blende: 2.8, fokus: 6 });
    const tele = zone({ f: 100, blende: 2.8, fokus: 6 });
    expect(tele.fern - tele.nah).toBeLessThan(weit.fern - weit.nah);
  });

  it('der Extender wirkt wie die laengere Brennweite', () => {
    const mit = tiefenschaerfeFuerBild(kam({ f: 50, blende: 2.8, fokus: 8, extender: 2 }), FF)!;
    const ohne = tiefenschaerfeFuerBild(kam({ f: 100, blende: 2.8, fokus: 8 }), FF)!;
    expect(mit.brennweiteMm).toBe(100);
    expect(mit.blende).toBeCloseTo(ohne.blende, 9);
    expect(zone({ f: 50, blende: 2.8, fokus: 8, extender: 2 }).nah)
      .toBeCloseTo(computeDof(FF, 50, 2.8, 8, 2).nearLimit, 6);
  });

  it('der Zerstreuungskreis haengt am Sensor, nicht an einer festen Zahl', () => {
    expect(circleOfConfusion(FF.widthMm, FF.heightMm)).toBeGreaterThan(circleOfConfusion(ZWEIDRITTEL.widthMm, ZWEIDRITTEL.heightMm));
    const klein = zone({ f: 50, blende: 2.8, fokus: 6 }, ZWEIDRITTEL);
    const gross = zone({ f: 50, blende: 2.8, fokus: 6 }, FF);
    // Gleiche Brennweite, kleinerer Sensor: kleinerer Zerstreuungskreis,
    // also ein schmalerer scharfer Bereich — wie in computeDof.
    expect(klein.fern - klein.nah).toBeLessThan(gross.fern - gross.nah);
    expect(klein.nah).toBeCloseTo(computeDof(ZWEIDRITTEL, 50, 2.8, 6).nearLimit, 6);
  });

  it('in der Schaerfeebene ist nichts unscharf, davor und dahinter waechst es', () => {
    const t = tiefenschaerfeFuerBild(kam({ f: 85, blende: 2, fokus: 10 }), FF)!;
    expect(unschaerfeImBild(t, 10)).toBeCloseTo(0, 12);
    expect(unschaerfeImBild(t, 12)).toBeGreaterThan(unschaerfeImBild(t, 11));
    expect(unschaerfeImBild(t, 6)).toBeGreaterThan(unschaerfeImBild(t, 8));
    // Am nahen Rand genau ein Zerstreuungskreis des Sensors.
    const rand = computeDof(FF, 85, 2, 10).nearLimit;
    expect(unschaerfeImBild(t, rand) * FF.widthMm).toBeCloseTo(circleOfConfusion(FF.widthMm, FF.heightMm), 9);
  });

  it('ohne brauchbare Werte gibt es nichts zu rechnen', () => {
    expect(tiefenschaerfeFuerBild(kam({ f: 0, blende: 2, fokus: 5 }), FF)).toBeNull();
    expect(tiefenschaerfeFuerBild(kam({ f: 50, blende: 0, fokus: 5 }), FF)).toBeNull();
  });
});
