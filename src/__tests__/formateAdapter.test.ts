import { describe, it, expect } from 'vitest';
import { FRAME_MASKS, maskedFov, maskenRechteck, maskenVerhaeltnis, normaliseFrameMask, formatLabel } from '../utils/rahmenmaske';
import { LENS_ADAPTERS, adaptersForBody, activeLensAdapter, FLANGE_FOCAL_MM } from '../data/lensAdapters';
import { getCameraById, getCoverageStatus, getEffectiveAperture, getEffectiveSensor } from '../data/cameras';
import { LENSES } from '../data/lenses';
import { parseLensModelCode } from '../utils/lensModelCode';
import type { Camera } from '../types';

describe('Rahmenmasken (#217)', () => {
  const vollV = (2 * Math.atan(Math.tan((30 * Math.PI) / 180) / (16 / 9)) * 180) / Math.PI;

  it('Seitenverhaeltnisse aus dem Namen', () => {
    expect(maskenVerhaeltnis('9:16')).toBeCloseTo(9 / 16, 9);
    expect(maskenVerhaeltnis('1.85')).toBe(1.85);
    expect(maskenVerhaeltnis('4:3')).toBeCloseTo(4 / 3, 9);
  });

  it('eine breite Maske kuerzt nur den vertikalen Winkel, eine hohe nur den horizontalen', () => {
    const breit = maskedFov(60, '2.39');
    expect(breit.hDeg).toBeCloseTo(60, 6);
    expect(breit.vDeg).toBeLessThan(vollV);
    const hoch = maskedFov(60, '9:16');
    expect(hoch.hDeg).toBeLessThan(60);
    expect(hoch.vDeg).toBeCloseTo(vollV, 6);
  });

  it('der maskierte Winkel passt zum gezeichneten Rechteck', () => {
    const r = maskenRechteck(1600, 900, maskenVerhaeltnis('4:3'));
    const m = maskedFov(60, '4:3');
    expect(Math.tan((m.hDeg * Math.PI) / 360) / Math.tan(Math.PI / 6)).toBeCloseTo(r.w / 1600, 6);
  });

  it('unbekannte Masken fallen beim Laden weg, bekannte bleiben', () => {
    expect(normaliseFrameMask({ frameMask: '2.39' })).toEqual({ frameMask: '2.39' });
    expect(normaliseFrameMask({ frameMask: '3:1' }).frameMask).toBeUndefined();
    expect(FRAME_MASKS).toContain('1.85');
  });

  it('Pixel stehen nur dabei, wenn das Format sie hat', () => {
    expect(formatLabel({ name: 'S35', widthMm: 24.9, heightMm: 14, cropFactor: 1.45 })).toBe('S35');
    expect(formatLabel({ name: 'S35', widthMm: 24.9, heightMm: 14, cropFactor: 1.45, pixelsW: 4096, pixelsH: 2160 })).toBe('S35 · 4096×2160 px');
  });
});

describe('B4-Konverter (#241)', () => {
  const s35PL: Camera = {
    id: 'test-s35-pl', manufacturer: 'Test', model: 'S35 PL', mount: 'PL', resolutions: ['4K'], type: 'cinema',
    sensor: { name: 'S35', widthMm: 24.6, heightMm: 13.8, cropFactor: 1.46 },
  };
  const b4Lens = LENSES.find((l) => l.mount === 'B4' && l.type === 'zoom')!;
  const hdx35 = LENS_ADAPTERS.find((a) => a.id === 'ibe-hdx35-mk3')!;

  it('jede Zahl hat einen Datenblattbeleg', () => {
    for (const a of LENS_ADAPTERS) {
      expect(a.manufacturerUrl).toMatch(/^https:\/\/.+\.pdf$/);
      for (const k of ['magnification', 'imageCircleMm', 'lightLossStops', 'lengthMm'] as const) {
        expect(a.specSource[k]?.value).toBe(String(a[k]));
        expect(a.specSource[k]?.source).toMatch(/Datenblatt/);
      }
    }
    expect(FLANGE_FOCAL_MM.B4.mm).toBe(48);
  });

  it('der Konverter passt nur an Bodys mit seinem Kamerabajonett', () => {
    expect(adaptersForBody(s35PL).map((a) => a.id)).toContain('ibe-hdx35-mk3');
    expect(adaptersForBody({ mount: 'integrated' })).toEqual([]);
    expect(activeLensAdapter(s35PL, { mount: 'EF' }, hdx35.id)).toBeUndefined();
    expect(activeLensAdapter(s35PL, b4Lens, hdx35.id)).toBe(hdx35);
  });

  it('die Vergroesserung verlaengert die Brennweite: der Sensor wirkt um den Faktor kleiner', () => {
    const s = getEffectiveSensor(s35PL, b4Lens, false, undefined, undefined, hdx35.id);
    expect(s.widthMm).toBeCloseTo(24.6 / 2.6, 6);
    expect(s.cropFactor).toBeCloseTo(1.46 * 2.6, 6);
  });

  it('Licht kostet, was das Datenblatt sagt', () => {
    expect(getEffectiveAperture(s35PL, b4Lens, 2, false, undefined, hdx35.id)).toBeCloseTo(2 * 2 ** (2.5 / 2), 6);
  });

  it('Deckung: HDx35 deckt S35, HDx1.4 nicht', () => {
    expect(getCoverageStatus(s35PL, b4Lens, false, undefined, undefined, hdx35.id).status).toBe('ok');
    expect(getCoverageStatus(s35PL, b4Lens, false, undefined, undefined, 'ibe-hdx1-4').status).toBe('vignette');
  });

  it('ohne Konverter bleibt alles beim Alten', () => {
    const f5 = getCameraById('sony-pmw-f5')!;
    expect(getEffectiveSensor(f5, b4Lens, false, undefined, 'B4').name).toMatch(/2\/3/);
  });
});

describe('Modellcodes (#241)', () => {
  it('liest Zoomfaktor und kurze Brennweite', () => {
    expect(parseLensModelCode('HA22x7.8BERM')).toEqual({ zoomRatio: 22, wideMm: 7.8, teleMm: 171.6 });
    expect(parseLensModelCode('CJ20ex7.8B')).toEqual({ zoomRatio: 20, wideMm: 7.8, teleMm: 156 });
    expect(parseLensModelCode('XA20sx8.5BRM')?.teleMm).toBe(170);
    expect(parseLensModelCode('UHDgc CJ12ex4.3B')?.zoomRatio).toBe(12);
    expect(parseLensModelCode('24-70mm F2.8')).toBeNull();
  });

  it('stimmt mit jedem B4-Zoom im Katalog auf 3 % ueberein', () => {
    const b4 = LENSES.filter((l) => l.mount === 'B4' && l.type === 'zoom');
    let geprueft = 0;
    for (const l of b4) {
      const c = parseLensModelCode(l.model);
      if (!c) continue;
      geprueft++;
      expect(c.wideMm, l.model).toBeCloseTo(l.focalLengthMin, 1);
      expect(Math.abs(c.teleMm - l.focalLengthMax) / l.focalLengthMax, l.model).toBeLessThan(0.03);
    }
    expect(geprueft).toBeGreaterThan(40);
  });
});
