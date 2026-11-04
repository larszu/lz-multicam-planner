import { describe, expect, it } from 'vitest';
import type { SensorSize, VenueCamera } from '../types';
import { getCameraById } from '../data/cameras';
import { getCompatibleLenses, getLensById } from '../data/lenses';
import { kontrastText } from '../utils/color';
import { computeDof } from '../utils/fov';
import { maskenRechteck, maskenVerhaeltnis } from '../utils/rahmenmaske';
import { testbildGitter } from '../utils/testbild';
import { formatBildrate, fusszeile, wandLayout } from '../utils/multiviewWand';
import { blaettern, kompatibleObjektive, objektivSet, objektivWechsel, sucherZeilen } from '../utils/sucherSchild';
import { STUMPF_FLAECHEN, schaerfeDeckkraft, schaerfeKoerper, stumpfEcken } from '../utils/schaerfeKoerper';

const S35: SensorSize = { name: 'Super 35', widthMm: 24.89, heightMm: 14.0, cropFactor: 1.39 };
const t = (_k: string, en: string) => en;

function kamera(patch: Partial<VenueCamera> = {}): VenueCamera {
  return {
    id: 'c1', label: 'CAM 1', cameraId: 'sony-hdc-f5500', lensId: 'can-cn-e18-80', x: 0, y: 0, z: 1.5,
    pan: 0, tilt: 0, focalLength: 50, aperture: 2.8, focusDistance: 5, color: '#ef4444', extenderActive: 1,
    ...patch,
  };
}

describe('Kamerafarbe (#233)', () => {
  it('waehlt die lesbarere Schrift auf der Kamerafarbe', () => {
    expect(kontrastText('#eab308')).toBe('#0b1426');
    expect(kontrastText('#1d324f')).toBe('#ffffff');
    expect(kontrastText('kaputt')).toBe('#ffffff');
  });
});

describe('Rahmenmasken (#224)', () => {
  it('legt die Maske mittig und so gross wie moeglich in das 16:9-Bild', () => {
    const hoch = maskenRechteck(1600, 900, maskenVerhaeltnis('9:16'));
    expect(hoch.h).toBe(900);
    expect(hoch.w).toBeCloseTo(900 * 9 / 16);
    expect(hoch.x).toBeCloseTo((1600 - hoch.w) / 2);
    const kino = maskenRechteck(1600, 900, maskenVerhaeltnis('2.39'));
    expect(kino.w).toBe(1600);
    expect(kino.h).toBeCloseTo(1600 / 2.39);
    expect(kino.y).toBeCloseTo((900 - kino.h) / 2);
  });
});

describe('Testbild (#236)', () => {
  it('teilt das Bild in quadratische Felder', () => {
    const { xs, ys } = testbildGitter(1600, 900);
    expect(xs).toHaveLength(15);
    expect(ys).toHaveLength(8);
    expect(xs[0]).toBeCloseTo(ys[0]);
  });
});

describe('Multiview-Wand als PNG (#220, #236)', () => {
  it('ordnet 13 Kacheln in vier Spalten unter Preview und Program', () => {
    const l = wandLayout(13, 1920);
    expect(l.kacheln).toHaveLength(13);
    expect(l.kacheln[4].y).toBeGreaterThan(l.kacheln[0].y);
    expect(l.kacheln[0].y).toBeGreaterThan(l.pvw.y + l.pvw.h);
    expect(l.pgm.x + l.pgm.w).toBeLessThanOrEqual(1920);
    expect(l.fuss.y).toBeGreaterThanOrEqual(l.kacheln[12].y + l.kacheln[12].h);
    expect(l.hoehe).toBe(l.fuss.y + l.fuss.h);
  });

  it('schreibt Projekt, Datum, Bildrate und Kachelaufloesung in die Fusszeile', () => {
    const z = fusszeile(t, { projekt: 'Arena', datum: new Date(2026, 10, 4, 9, 5), fps: 29.97, kachelW: 480, kachelH: 270 });
    expect(z).toBe('Arena · 2026-11-04 09:05 · 29.97 fps · Tile 480×270 px');
    expect(formatBildrate(25)).toBe('25');
    expect(formatBildrate(23.976)).toBe('23.976');
  });
});

describe('Sucher: Objektive blaettern (#224)', () => {
  const camDef = getCameraById('sony-hdc-f5500')!;

  it('bietet dieselben Objektive wie die Seitenleiste an', () => {
    const liste = kompatibleObjektive(camDef, undefined, [], []);
    expect(liste.map((l) => l.id)).toEqual(getCompatibleLenses(camDef.mount).map((l) => l.id));
  });

  it('blaettert in den Favoriten, sobald es mindestens zwei sind', () => {
    const passend = kompatibleObjektive(camDef, undefined, [], []);
    const [a, b, c] = passend;
    expect(objektivSet(passend, [a.id], c.id)).toBe(passend);
    const set = objektivSet(passend, [a.id, b.id], c.id);
    expect(set.map((l) => l.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(blaettern([a, b], a.id, 1)?.id).toBe(b.id);
    expect(blaettern([a, b], b.id, 1)?.id).toBe(a.id);
    expect(blaettern([a, b], a.id, -1)?.id).toBe(b.id);
    expect(blaettern([a], a.id, 1)).toBeNull();
  });

  it('setzt beim Wechsel Brennweite, Blende und einen passenden Extender', () => {
    const lens = getLensById('can-cn-e70-200')!;
    const p = objektivWechsel(kamera({ extenderActive: 2 }), lens, 'EF');
    expect(p).toMatchObject({ lensId: lens.id, focalLength: 70, aperture: 4.4, extenderActive: 1 });
  });

  it('beschriftet Kamera, Format, Blende, Crop und Objektiv', () => {
    const lens = getLensById('can-cn-e18-80')!;
    const z = sucherZeilen(camDef, lens, S35, kamera({ extenderActive: 2, focalLength: 24 }));
    expect(z.kamera).toBe('Sony HDC-F5500 | Super 35 · 24.9×14.0 mm | f/2.8 | 1.39×');
    expect(z.objektiv).toBe('Canon CN-E 18-80mm T4.4 · 24 mm × 2 = 48 mm');
  });
});

describe('Schaerfekoerper (#225)', () => {
  it('liegt genau zwischen Nah- und Ferngrenze der eigenen Rechnung', () => {
    const cam = kamera();
    const k = schaerfeKoerper(S35, cam, 1, 100)!;
    const dof = computeDof(S35, 50, 2.8, 5, 1);
    expect(k.nah.d).toBeCloseTo(dof.nearLimit);
    expect(k.fern.d).toBeCloseTo(dof.farLimit);
    expect(k.fokus.d).toBe(5);
    expect(k.hyperfokalM).toBeCloseTo(dof.hyperfocal);
    expect(k.cocMm).toBeCloseTo(dof.circleOfConfusion);
    expect(k.gekuerzt).toBe(false);
    expect(k.fern.halbB / k.fern.d).toBeCloseTo(k.nah.halbB / k.nah.d);
    expect(k.nah.halbB / k.nah.halbH).toBeCloseTo(16 / 9);
  });

  it('kuerzt eine unendliche Ferngrenze auf die Halle', () => {
    const k = schaerfeKoerper(S35, kamera({ focalLength: 14, aperture: 11, focusDistance: 50 }), 1, 40)!;
    expect(k.fern.d).toBe(40);
    expect(k.gekuerzt).toBe(true);
  });

  it('zeichnet offene Blenden kraeftiger als geschlossene', () => {
    expect(schaerfeDeckkraft(1.4)).toBeGreaterThan(schaerfeDeckkraft(2.8));
    expect(schaerfeDeckkraft(2.8)).toBeGreaterThan(schaerfeDeckkraft(11));
    expect(schaerfeDeckkraft(64)).toBe(0.06);
  });

  it('baut einen geschlossenen Stumpf aus acht Ecken', () => {
    const k = schaerfeKoerper(S35, kamera(), 1, 100)!;
    expect(stumpfEcken(k)).toHaveLength(24);
    expect(STUMPF_FLAECHEN).toHaveLength(36);
    expect(Math.max(...STUMPF_FLAECHEN)).toBe(7);
  });
});
