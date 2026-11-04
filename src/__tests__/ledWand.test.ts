import { describe, expect, it } from 'vitest';
import {
  ledAusDatei,
  ledEinschalten,
  ledMasse,
  ledNormal,
  ledWandAendern,
  leinwand,
  moireFuerKamera,
  rasterKontrast,
  sensorPixelBreite,
  unschaerfeKreisMm,
  ansichtAus,
  type LedVideoWall,
  type MoireKamera,
} from '../utils/ledWand';
import { pixelkarteMassstab } from '../utils/pixelkarte';
import { venueAusDatei } from '../utils/raum';
import type { Venue } from '../types';

const led = { pitchMm: 3.9, moduleWmm: 500, moduleHmm: 500, modulesX: 12, modulesY: 7, canvasX: 0, canvasY: 0 };
const wand = (extra: Partial<LedVideoWall> = {}): LedVideoWall => ({ id: 'w1', x: 3, y: 0, widthM: 6, heightM: 3.5, bottomM: 1, rotationDeg: 0, led, ...extra });

describe('LED-Masse', () => {
  it('folgen aus Modul, Pixelabstand und Modulzahl', () => {
    const m = ledMasse(led);
    expect(m.pxModulX).toBe(128);
    expect(m.breitePx).toBe(1536);
    expect(m.hoehePx).toBe(896);
    expect(m.breiteM).toBe(6);
    expect(m.hoeheM).toBe(3.5);
    expect(m.pitchXmm).toBeCloseTo(3.906, 3);
  });

  it('verwirft Unbrauchbares und fremde URL-Schemata', () => {
    expect(ledNormal(null)).toBeNull();
    expect(ledNormal({ pitchMm: -1 })?.pitchMm).toBe(0.5);
    expect(ledNormal({ ...led, medienUrl: 'javascript:alert(1)' })?.medienUrl).toBeUndefined();
    expect(ledNormal({ ...led, medienUrl: 'https://x.test/clip.mp4' })?.medienArt).toBe('video');
    expect(ledNormal({ ...led, medienUrl: 'https://x.test/bild.png' })?.medienArt).toBe('bild');
  });

  it('eine Sitzungsdatei faellt beim Laden weg, alte Waende bleiben unveraendert', () => {
    const alt: LedVideoWall = { id: 'a', x: 1, y: 1, widthM: 4, heightM: 2 };
    expect(ledAusDatei(alt)).toBe(alt);
    const geladen = ledAusDatei(wand({ led: { ...led, inhalt: 'medien', medienUrl: 'blob:http://x/1', medienArt: 'video' } }));
    expect(geladen.led?.medienUrl).toBeUndefined();
    expect(geladen.led?.inhalt).toBe('medien');
  });

  it('Projekt ohne LED-Felder laedt wie bisher', () => {
    const roh = { name: 'v', widthM: 20, heightM: 20, stages: [], videoWalls: [{ id: 'a', x: 1, y: 1, widthM: 4, heightM: 2 }] } as Venue;
    const v = venueAusDatei(roh, []);
    expect(v.videoWalls?.[0]).toEqual({ id: 'a', x: 1, y: 1, widthM: 4, heightM: 2 });
    expect('ledProcessorMaxPx' in v).toBe(false);
  });

  it('einschalten rastet die Wand auf Module und legt sie rechts neben die anderen', () => {
    const a = wand();
    const b: LedVideoWall = { id: 'w2', x: 10, y: 0, widthM: 4.2, heightM: 2.4 };
    const p = ledEinschalten(b, [a, b]);
    expect(p.led?.modulesX).toBe(8);
    expect(p.led?.canvasX).toBe(1536);
    expect(p.widthM).toBe(4);
  });

  it('breiter ziehen im Plan rastet auf ganze Module', () => {
    const n = ledWandAendern(wand(), { widthM: 7.3 });
    expect(n.led?.modulesX).toBe(15);
    expect(n.widthM).toBe(7.5);
    expect(n.heightM).toBe(3.5);
  });
});

describe('Leinwand', () => {
  it('Gesamtaufloesung, Pixelzahl und Ueberlappung', () => {
    const a = wand();
    const b = wand({ id: 'w2', led: { ...led, modulesX: 4, canvasX: 1536 } });
    const lw = leinwand([a, b, { id: 'ohne', x: 0, y: 0, widthM: 2, heightM: 1 }]);
    expect(lw.flaechen).toHaveLength(2);
    expect(lw.breitePx).toBe(1536 + 512);
    expect(lw.hoehePx).toBe(896);
    expect(lw.pixel).toBe(1536 * 896 + 512 * 896);
    expect(lw.ueberlappt).toBe(false);
    expect(leinwand([a, wand({ id: 'w3', led: { ...led, canvasX: 100 } })]).ueberlappt).toBe(true);
  });

  it('grosse Karten werden fuer das PNG verkleinert', () => {
    expect(pixelkarteMassstab(4000, 1000)).toBe(1);
    expect(pixelkarteMassstab(16384, 1000)).toBe(0.5);
  });
});

describe('Optik', () => {
  it('Sensorabtastung aus dem hoechsten Format', () => {
    expect(sensorPixelBreite(['4K', 'HD'])).toBe(3840);
    expect(sensorPixelBreite(['HD'])).toBe(1920);
    expect(sensorPixelBreite(['6K', '4K'])).toBe(6144);
    expect(sensorPixelBreite(['8K'])).toBe(7680);
  });

  it('Unschaerfekreis verschwindet in der Schaerfeebene und waechst davor', () => {
    expect(unschaerfeKreisMm(50, 2.8, 10, 10)).toBeCloseTo(0, 6);
    expect(unschaerfeKreisMm(50, 2.8, 3, 10)).toBeGreaterThan(unschaerfeKreisMm(50, 5.6, 3, 10));
  });

  it('Rasterkontrast: 1 fuer grobe Raster, faellt mit Unschaerfe und Pixelflaeche', () => {
    const o = { unschaerfeMm: 0, blende: 2.8, sensorPitchMm: 0.005 };
    expect(rasterKontrast(0.001, o)).toBeCloseTo(1, 3);
    expect(rasterKontrast(150, { ...o, unschaerfeMm: 0.05 })).toBeLessThan(rasterKontrast(150, o));
    expect(rasterKontrast(200, o)).toBeCloseTo(0, 6);
  });

  it('Ansicht nach Winkel', () => {
    expect(ansichtAus(10)).toBe('frontal');
    expect(ansichtAus(40)).toBe('angled');
    expect(ansichtAus(75)).toBe('grazing');
  });
});

describe('Moiré je Kamera', () => {
  // Wand 6 × 3,5 m bei y = 0, Bild nach +y; Kamera 20 m davor auf Mittenhoehe.
  const hd = (extra: Partial<MoireKamera> = {}): MoireKamera => ({
    x: 3, y: 20, z: 2.75, pan: -90, tilt: 0, hDeg: 2 * Math.atan(9.59 / 2 / 20) * (180 / Math.PI),
    brennweiteMm: 20, blende: 4, fokusM: 20, sensorBreiteMm: 9.59, sensorPx: 1920, ...extra,
  });

  it('weit und scharf auf der Wand: Raster unter Nyquist, Moiré wird gemeldet', () => {
    const e = moireFuerKamera(hd(), wand())!;
    expect(e.ansicht).toBe('frontal');
    expect(e.sensorPxJeLed).toBeLessThan(2);
    expect(e.baenderPx).not.toBeNull();
    expect(['possible', 'likely']).toContain(e.stufe);
  });

  it('dieselbe Kamera mit Schaerfe weit vor der Wand: Unschaerfe loescht das Raster', () => {
    const e = moireFuerKamera(hd({ fokusM: 3, blende: 1.8 }), wand())!;
    expect(e.stufe).toBe('low');
  });

  it('lange Brennweite loest das Raster auf', () => {
    const f = 200;
    const e = moireFuerKamera(hd({ brennweiteMm: f, hDeg: 2 * Math.atan(9.59 / 2 / f) * (180 / Math.PI) }), wand())!;
    expect(e.stufe).toBe('grid');
    expect(e.sensorPxJeLed).toBeGreaterThan(2);
  });

  it('schraeg, hinter der Wand, ausser Bild', () => {
    expect(moireFuerKamera(hd({ x: 23, pan: -135 }), wand())!.ansicht).toBe('angled');
    expect(moireFuerKamera(hd({ y: -10, pan: 90 }), wand())!.stufe).toBe('behind');
    expect(moireFuerKamera(hd({ pan: 90 }), wand())!.stufe).toBe('offFrame');
  });

  it('ohne LED-Daten keine Aussage', () => {
    expect(moireFuerKamera(hd(), { id: 'x', x: 0, y: 0, widthM: 4, heightM: 2 })).toBeNull();
  });
});
