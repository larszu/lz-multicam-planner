import { describe, it, expect } from 'vitest';
import { sonnenstand, sonnenzeiten } from '../avplan/scene3d';
import { HIMMEL_STANDARD, himmelAusDatei, planRichtung, schattenProMeter, sonnenBahn } from '../utils/tageslicht';
import { venueAusDatei } from '../utils/raum';
import type { Venue } from '../types';

const BERLIN = { lat: 52.52, lon: 13.405 };
const minutenAb = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60000;

// Referenzwerte aus dem NOAA Solar Calculator bzw. den daraus abgeleiteten
// Tabellen (Zeitgleichung, Kulminationshoehe = 90° − Breite ± Deklination).
// Gerechnet wird lokal mit suncalc im Paket scene3d; die Toleranzen sind die
// Genauigkeit, die ein Drehplan braucht, nicht die der Ephemeride.
describe('Sonnenstand gegen NOAA-Referenzwerte', () => {
  it('Berlin, Sommeranfang 2026: Auf- und Untergang 04:43 / 21:33 MESZ', () => {
    const z = sonnenzeiten(new Date(Date.UTC(2026, 5, 21, 12)), BERLIN.lat, BERLIN.lon);
    expect(minutenAb(z.aufgang!, new Date(Date.UTC(2026, 5, 21, 2, 43)))).toBeLessThan(3);
    expect(minutenAb(z.untergang!, new Date(Date.UTC(2026, 5, 21, 19, 33)))).toBeLessThan(3);
  });

  it('Berlin: Mittagshoehe 60,9° im Juni und 14,0° im Dezember, Azimut Sued', () => {
    const juni = sonnenzeiten(new Date(Date.UTC(2026, 5, 21, 12)), BERLIN.lat, BERLIN.lon).mittag;
    const dez = sonnenzeiten(new Date(Date.UTC(2026, 11, 21, 12)), BERLIN.lat, BERLIN.lon).mittag;
    const sj = sonnenstand(juni, BERLIN.lat, BERLIN.lon);
    expect(sj.elevationDeg).toBeCloseTo(60.92, 1);
    expect(sj.azimutDeg).toBeGreaterThan(179);
    expect(sj.azimutDeg).toBeLessThan(181);
    expect(sonnenstand(dez, BERLIN.lat, BERLIN.lon).elevationDeg).toBeCloseTo(14.04, 1);
  });

  it('Greenwich: wahrer Mittag nach der Zeitgleichung (3.11. 11:43:36, 11.2. 12:14:12 UTC)', () => {
    const nov = sonnenzeiten(new Date(Date.UTC(2026, 10, 3, 12)), 51.4769, 0).mittag;
    const feb = sonnenzeiten(new Date(Date.UTC(2026, 1, 11, 12)), 51.4769, 0).mittag;
    expect(minutenAb(nov, new Date(Date.UTC(2026, 10, 3, 11, 43, 36)))).toBeLessThan(2);
    expect(minutenAb(feb, new Date(Date.UTC(2026, 1, 11, 12, 14, 12)))).toBeLessThan(2);
  });

  it('Aequator zur Tagundnachtgleiche: Sonne mittags fast im Zenit', () => {
    expect(sonnenstand(new Date(Date.UTC(2026, 2, 20, 12, 7)), 0, 0).elevationDeg).toBeGreaterThan(89.3);
  });
});

describe('Sonne im Grundriss', () => {
  it('Richtung folgt Azimut und Nordrichtung des Plans', () => {
    const sued = planRichtung(180, 0);
    expect(sued.x).toBeCloseTo(0);
    expect(sued.y).toBeCloseTo(1);
    const ost = planRichtung(90, 0);
    expect(ost.x).toBeCloseTo(1);
    // Norden zeigt im Plan nach rechts: Osten liegt dann unten.
    const ostGedreht = planRichtung(90, 90);
    expect(ostGedreht.y).toBeCloseTo(1);
  });

  it('Schattenlaenge je Meter: 45° ergibt 1 m, unter dem Horizont keinen Schatten', () => {
    expect(schattenProMeter(45)).toBeCloseTo(1);
    expect(schattenProMeter(30)).toBeCloseTo(1.732, 2);
    expect(schattenProMeter(-2)).toBeNull();
  });

  it('Tagesbogen liegt ueber dem Horizont und beginnt mit der goldenen Stunde', () => {
    const bahn = sonnenBahn({ ...HIMMEL_STANDARD, datum: '2026-06-21' });
    expect(bahn.length).toBeGreaterThan(90);
    expect(bahn.every((p) => p.elevationDeg > 0)).toBe(true);
    expect(bahn[0].phase).toBe('goldene-stunde');
    expect(bahn.some((p) => p.phase === 'tag')).toBe(true);
  });
});

describe('Tageslicht im Projekt', () => {
  const basis = { name: 'V', widthM: 40, heightM: 30, stages: [] } as unknown as Venue;

  it('alte Projekte ohne Angabe bleiben ohne', () => {
    expect(venueAusDatei(basis, []).sky).toBeUndefined();
  });

  it('liest Ort, Datum und Uhrzeit und verwirft Unbrauchbares', () => {
    const v = venueAusDatei({ ...basis, sky: { datum: '2026-07-04', minuten: 900, ort: 'eigen', lat: 47.5, lon: 999, nordDeg: 90, wetter: 'sturm' } } as unknown as Venue, []);
    expect(v.sky).toEqual({ datum: '2026-07-04', minuten: 900, ort: 'eigen', lat: 47.5, lon: HIMMEL_STANDARD.lon, nordDeg: 90, wetter: HIMMEL_STANDARD.wetter });
    expect(himmelAusDatei('kaputt')).toBeUndefined();
  });
});
