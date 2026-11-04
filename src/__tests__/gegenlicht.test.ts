import { describe, it, expect } from 'vitest';
import { gegenlichtFuer, type GegenlichtKamera } from '../utils/gegenlicht';
import { foreignFixturesFrom, lichtplanAusText, STANDARD_HOEHE_M } from '../utils/foreignView';

// Kamera auf 1,5 m schaut nach rechts (+x) in den Raum, Weitwinkel.
const kamera: GegenlichtKamera = { x: 0, y: 10, z: 1.5, pan: 0, tilt: 0, hFovDeg: 60, vFovDeg: 34 };
const leuchte = (o: Record<string, unknown>) =>
  foreignFixturesFrom({ fixtures: [{ id: 'f', x: 20, y: 10, mountingHeight: 4, fixture: { name: 'Spot', beamAngle: 20, fieldAngle: 30 }, ...o }] });

describe('Gegenlicht-Warnung', () => {
  it('meldet eine Leuchte im Bild, deren Kegel auf die Kamera zeigt', () => {
    const g = gegenlichtFuer(kamera, leuchte({ aimX: 0, aimY: 10 }));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ fixtureId: 'f', name: 'Spot' });
    expect(g[0].imStrahlDeg).toBeLessThan(15);
  });

  it('schweigt, wenn die Leuchte von der Kamera weg strahlt', () => {
    expect(gegenlichtFuer(kamera, leuchte({ aimX: 30, aimY: 10 }))).toEqual([]);
  });

  it('schweigt, wenn die Leuchte hinter der Kamera oder ausserhalb des Bildes haengt', () => {
    expect(gegenlichtFuer({ ...kamera, pan: 180 }, leuchte({ aimX: 0, aimY: 10 }))).toEqual([]);
    expect(gegenlichtFuer({ ...kamera, hFovDeg: 5, vFovDeg: 3 }, leuchte({ aimX: 0, aimY: 10 }))).toEqual([]);
  });

  it('ein schmaler Kegel trifft die Kamera nicht, ein Zoom auf weit schon', () => {
    const neben = { aimX: 0, aimY: 2 };
    expect(gegenlichtFuer(kamera, leuchte(neben))).toEqual([]);
    expect(gegenlichtFuer(kamera, leuchte({ ...neben, currentBeamAngle: 50 }))).toHaveLength(1);
  });

  it('stummgeschaltete oder ganz gedimmte Leuchten zaehlen nicht', () => {
    expect(gegenlichtFuer(kamera, leuchte({ aimX: 0, aimY: 10, hidden: true }))).toEqual([]);
    expect(gegenlichtFuer(kamera, leuchte({ aimX: 0, aimY: 10, dimming: 0 }))).toEqual([]);
  });
});

describe('Lichtplan einlesen', () => {
  const plan = { meta: { name: 'Rig' }, fixtures: [{ id: 'a', x: 1, y: 2 }] };

  it('nimmt die Projektdatei des Light Planners unveraendert', () => {
    expect(lichtplanAusText(JSON.stringify(plan))).toEqual(plan);
  });

  it('nimmt aus einer .avplan die Domaene lighting', () => {
    expect(lichtplanAusText(JSON.stringify({ kind: 'avplan', formatVersion: 1, venue: {}, domains: { lighting: plan } }))).toEqual(plan);
  });

  it('lehnt Dateien ohne Leuchten und kaputtes JSON ab', () => {
    expect(() => lichtplanAusText('{')).toThrow('json');
    expect(() => lichtplanAusText(JSON.stringify({ kind: 'avplan', domains: {} }))).toThrow('keine-leuchten');
  });

  it('Leuchte ohne Hoehe und Winkel bekommt Standardwerte', () => {
    const [f] = foreignFixturesFrom(plan);
    expect(f.z).toBe(STANDARD_HOEHE_M);
    expect(f.fieldDeg).toBe(30);
    expect(f.hidden).toBe(false);
  });
});
