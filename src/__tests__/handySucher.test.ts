import { describe, expect, it } from 'vitest';
import type { VenueCamera } from '../types';
import { getLensById } from '../data/lenses';
import { kameraBildwinkel } from '../utils/bildwinkel';
import {
  PLANER_WEB_URL, QR_GRENZE, blickAusLage, geeichtLangGrad, handyLangGrad, istSucherAufruf, panAusKurs, paketBauen, paketKodieren, paketLesen,
  rueckAnwenden, rueckCodeBauen, rueckCodeLesen, sucherLink, videoWinkel, zielRahmen, zielWinkel,
} from '../utils/handySucher';

function kamera(patch: Partial<VenueCamera> = {}): VenueCamera {
  return {
    id: 'c1', label: 'CAM 1', cameraId: 'sony-hdc-f5500', lensId: 'can-cn-e18-80', x: 0, y: 0, z: 1.5,
    pan: 10, tilt: -2, focalLength: 50, aperture: 2.8, focusDistance: 12, color: '#ef4444', extenderActive: 1,
    ...patch,
  };
}
const KAT = { customCameras: [], customLenses: [], bibliothek: [], favoriten: [] };

describe('Paket fuers Handy (#237)', () => {
  it('traegt Kamera, Objektivsatz und Stand und kommt unveraendert zurueck', async () => {
    const cams = [kamera(), kamera({ id: 'c2', label: 'CAM 2' })];
    const p = paketBauen(cams, KAT, 'de', 'c2');
    expect(p.k).toHaveLength(2);
    expect(p.sel).toBe(1);
    const k = p.k[0];
    expect(p.o[k.lens].id).toBe('can-cn-e18-80');
    expect(k.set.length).toBeGreaterThan(1);
    expect(k.modell).toMatch(/Sony/);
    const code = await paketKodieren(p);
    expect(code[0]).toBe('z');
    expect(await paketLesen(`#${code}`)).toEqual(p);
    expect(await paketLesen('#zkaputt')).toBeNull();
  });

  it('rechnet am Handy denselben Bildwinkel wie der Plan', () => {
    const cam = kamera();
    const p = paketBauen([cam], KAT, 'en', null);
    const k = p.k[0];
    const e = k.set.find((x) => x[0] === k.lens)!;
    const plan = kameraBildwinkel(cam, { customCameras: [], customLenses: [] })!;
    const handy = zielWinkel(e[1], e[2], k.f, k.ext, p.o[k.lens].sq);
    expect(handy.hDeg).toBeCloseTo(plan.hDeg, 1);
    expect(handy.vDeg).toBeCloseTo(plan.vDeg, 1);
  });

  it('kuerzt fuer den QR-Code auf eine Kamera und einen kleinen Satz', async () => {
    const cams = Array.from({ length: 12 }, (_, i) => kamera({ id: `c${i}`, label: `CAM ${i + 1}` }));
    const voll = sucherLink(await paketKodieren(paketBauen(cams, KAT, 'en', 'c3')), null);
    const klein = sucherLink(await paketKodieren(paketBauen(cams, KAT, 'en', 'c3', { nur: 'c3', maxSet: 4 })), null);
    expect(klein.length).toBeLessThan(voll.length);
    expect(klein.length).toBeLessThanOrEqual(QR_GRENZE);
    const p = await paketLesen(klein.split('#')[1]);
    expect(p?.k.map((c) => c.id)).toEqual(['c3']);
    expect(p?.k[0].set.length).toBe(4);
    expect(p?.k[0].set.some((e) => e[0] === p.k[0].lens)).toBe(true);
  });

  it('verlinkt im Web die eigene Adresse, sonst die Webseite', () => {
    expect(sucherLink('zX', { protocol: 'https:', origin: 'https://a.example', pathname: '/p/' })).toBe('https://a.example/p/?sucher#zX');
    expect(sucherLink('zX', { protocol: 'file:', origin: 'null', pathname: '/x/index.html' })).toBe(`${PLANER_WEB_URL}?sucher#zX`);
    expect(istSucherAufruf('?sucher')).toBe(true);
    expect(istSucherAufruf('?bridge=ws://x')).toBe(false);
  });
});

describe('Handykamera und Rahmen (#237)', () => {
  it('schaetzt den Winkel aus der Aequivalenzbrennweite und eicht am Gegenstand', () => {
    expect(handyLangGrad(26)).toBeCloseTo(67.3, 0);
    const lang = geeichtLangGrad(1, 2, 0.5)!;
    expect(Math.tan((lang * Math.PI) / 360)).toBeCloseTo(0.5);
    expect(geeichtLangGrad(1, 0, 0.5)).toBeNull();
    expect(geeichtLangGrad(1, 2, 1.2)).toBeNull();
  });

  it('legt die lange Seite des Videos auf den Winkel, auch hochkant', () => {
    const quer = videoWinkel(1920, 1080, 60);
    const hoch = videoWinkel(1080, 1920, 60);
    expect(quer.hDeg).toBe(60);
    expect(hoch.vDeg).toBe(60);
    expect(hoch.hDeg).toBeCloseTo(quer.vDeg);
  });

  it('meldet, wenn der Ausschnitt weiter ist als das Handy', () => {
    const video = videoWinkel(1600, 900, 60);
    const eng = zielRahmen({ hDeg: 30, vDeg: 17.3 }, video, 1600, 900);
    expect(eng.zuWeit).toBe(false);
    expect(eng.w).toBeLessThan(1600);
    expect(eng.w / eng.h).toBeCloseTo(16 / 9, 1);
    const weit = zielRahmen({ hDeg: 90, vDeg: 58.7 }, video, 1600, 900);
    expect(weit.zuWeit).toBe(true);
    expect(weit.sichtbar).toBeGreaterThan(0);
    expect(weit.sichtbar).toBeLessThan(1);
  });

  it('liest Neigung und Kurs der Rueckkamera hoch und quer', () => {
    const hoch = blickAusLage(0, 90, 0);
    expect(hoch.neigung).toBeCloseTo(0);
    expect(hoch.kurs).toBeCloseTo(0);
    expect(blickAusLage(90, 90, 0).kurs).toBeCloseTo(270);
    expect(blickAusLage(0, 0, 0).neigung).toBeCloseTo(-90);
    expect(blickAusLage(0, 0, 90).neigung).toBeCloseTo(0);
    expect(blickAusLage(0, 100, 0).neigung).toBeCloseTo(10);
  });

  it('dreht den Plan-Schwenk um den Kurs seit dem Nullen', () => {
    expect(panAusKurs(10, 350, 20)).toBe(40);
    expect(panAusKurs(170, 0, 30)).toBe(-160);
  });
});

describe('Austauschcode zurueck in den Plan (#237)', () => {
  it('findet den Code auch in einem Text und setzt die Kamera', () => {
    const code = rueckCodeBauen({ cam: 'c1', lens: 'can-cn-e18-80', f: 500, z: 3.2, tilt: -4, pan: 200, notiz: 'Säule im Weg' });
    const d = rueckCodeLesen(`Hier: ${code} — bis gleich`)!;
    expect(d.cam).toBe('c1');
    const lens = getLensById('can-cn-e18-80')!;
    const neu = rueckAnwenden(kamera({ notes: 'Podest' }), d, lens);
    expect(neu.focalLength).toBe(lens.focalLengthMax);
    expect(neu.z).toBe(3.2);
    expect(neu.tilt).toBe(-4);
    expect(neu.pan).toBe(-160);
    expect(neu.notes).toBe('Podest\nSäule im Weg');
  });

  it('laesst Objektiv und Brennweite stehen, wenn das Objektiv fehlt, und weist Fremdes ab', () => {
    const d = rueckCodeLesen(rueckCodeBauen({ cam: 'c1', lens: 'gibt-es-nicht', f: 35 }))!;
    const neu = rueckAnwenden(kamera(), d, undefined);
    expect(neu).toEqual({});
    expect(rueckCodeLesen('MCV1.@@@')).toBeNull();
    expect(rueckCodeLesen('hallo')).toBeNull();
  });
});
