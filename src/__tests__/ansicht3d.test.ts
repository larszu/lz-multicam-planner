import { describe, it, expect, beforeEach } from 'vitest';
import {
  ansicht3DAusDatei,
  exportAnsicht,
  fixierteAnsichtenAusDatei,
  fovFuerSeitenverhaeltnis,
  gleicheAnsicht,
  mitFixierung,
  type Ansicht3D,
} from '../utils/ansicht3d';
import { venueAusDatei } from '../utils/raum';
import { BLICK3D_START, buildProjectFile, useStore } from '../store/useStore';
import { bedarf3DAnfordern, braucht } from '../components/Render3D/kameraBild3d';
import type { Venue } from '../types';

const START: Ansicht3D = { pos: [10, 15, 25], yaw: 0, pitch: -0.6, fovDeg: 50 };
const OBEN: Ansicht3D = { pos: [10, 30, 7], yaw: 0, pitch: -1.57, fovDeg: 50, aspect: 2 };
const SCHRAEG: Ansicht3D = { pos: [3, 4, 5], yaw: 0.4, pitch: -0.2, fovDeg: 35, aspect: 1.5 };

describe('Blickpunkte der 3D-Ansicht', () => {
  it('liest nur brauchbare Blickpunkte aus der Datei', () => {
    expect(ansicht3DAusDatei(SCHRAEG)).toEqual(SCHRAEG);
    expect(ansicht3DAusDatei({ pos: [1, 2], yaw: 0, pitch: 0, fovDeg: 50 })).toBeUndefined();
    expect(ansicht3DAusDatei({ pos: [1, 2, 'x'], yaw: 0, pitch: 0 })).toBeUndefined();
    expect(ansicht3DAusDatei('kaputt')).toBeUndefined();
    // Unbrauchbarer Bildwinkel faellt auf den der Ansicht zurueck.
    expect(ansicht3DAusDatei({ pos: [1, 2, 3], yaw: 0, pitch: 0, fovDeg: 0 })?.fovDeg).toBe(50);
  });

  it('fixiert je Modus und loest wieder; leer heisst gar kein Feld', () => {
    const a = mitFixierung(undefined, 'top', OBEN);
    expect(a).toEqual({ top: OBEN });
    const b = mitFixierung(a, 'perspective', SCHRAEG);
    expect(b).toEqual({ top: OBEN, perspective: SCHRAEG });
    expect(mitFixierung(mitFixierung(b, 'top', undefined), 'perspective', undefined)).toBeUndefined();
    expect(fixierteAnsichtenAusDatei({ top: OBEN, perspective: { kaputt: 1 } })).toEqual({ top: OBEN });
    expect(fixierteAnsichtenAusDatei({})).toBeUndefined();
  });

  it('der Export nimmt die fixierte Perspektive, sonst die Draufsicht, sonst die Startansicht', () => {
    expect(exportAnsicht(undefined, START)).toBe(START);
    expect(exportAnsicht({ top: OBEN }, START)).toBe(OBEN);
    expect(exportAnsicht({ top: OBEN, perspective: SCHRAEG }, START)).toBe(SCHRAEG);
  });

  it('haelt die Breite des fixierten Ausschnitts in einem schmaleren Bild', () => {
    // Fixiert bei 2:1, exportiert in 16:9: der Winkel waechst, bis dieselbe Breite passt.
    const v = fovFuerSeitenverhaeltnis(OBEN, 16 / 9);
    const breite = (fov: number, asp: number) => Math.tan((fov * Math.PI) / 360) * asp;
    expect(breite(v, 16 / 9)).toBeCloseTo(breite(50, 2), 6);
    // Schmaler fixiert: der Winkel bleibt.
    expect(fovFuerSeitenverhaeltnis(SCHRAEG, 16 / 9)).toBe(35);
    expect(fovFuerSeitenverhaeltnis(START, 16 / 9)).toBe(50);
  });

  it('vergleicht ohne Rundungsrauschen', () => {
    expect(gleicheAnsicht(SCHRAEG, { ...SCHRAEG, pos: [3.0000001, 4, 5] })).toBe(true);
    expect(gleicheAnsicht(SCHRAEG, { ...SCHRAEG, yaw: 0.5 })).toBe(false);
    expect(gleicheAnsicht(null, null)).toBe(true);
    expect(gleicheAnsicht(SCHRAEG, null)).toBe(false);
  });
});

describe('Fixierte Ansicht im Projekt', () => {
  beforeEach(() => { useStore.getState().newProject(); });

  it('alte Dateien ohne Feld bleiben ohne; gespeicherte kommen zurueck', () => {
    const roh = { name: 'H', widthM: 20, heightM: 15, stages: [] } as unknown as Venue;
    expect('views3d' in venueAusDatei(roh, [])).toBe(false);
    const mit = venueAusDatei({ ...roh, views3d: { perspective: SCHRAEG } } as Venue, []);
    expect(mit.views3d).toEqual({ perspective: SCHRAEG });
  });

  it('Fixieren landet in der Projektdatei und macht das Projekt geaendert', () => {
    const v0 = useStore.getState().projectVersion;
    useStore.getState().fixiereAnsicht3D('top', OBEN);
    const s = useStore.getState();
    expect(s.projectVersion).toBe(v0 + 1);
    const datei = JSON.parse(JSON.stringify(buildProjectFile(s)));
    expect(datei.venue.views3d).toEqual({ top: OBEN });
    useStore.getState().newProject();
    useStore.getState().applyProjectFile(datei);
    expect(useStore.getState().venue.views3d).toEqual({ top: OBEN });
  });

  it('der zuletzt gesehene Blickpunkt ist kein Projektinhalt und gilt nur fuer die offene Halle', () => {
    const v0 = useStore.getState().projectVersion;
    useStore.getState().merkeBlick3D({ preset: 'top', frei: 'top', ansicht: { top: OBEN } });
    expect(useStore.getState().projectVersion).toBe(v0);
    expect(useStore.getState().blick3d.ansicht.top).toEqual(OBEN);
    expect('blick3d' in buildProjectFile(useStore.getState())).toBe(false);
    useStore.getState().newProject();
    expect(useStore.getState().blick3d).toEqual(BLICK3D_START);
  });
});

describe('Renderer fuer den Export anfordern', () => {
  it('haelt den Renderer, bis freigegeben ist; doppeltes Freigeben zaehlt einmal', () => {
    expect(braucht()).toBe(false);
    const frei = bedarf3DAnfordern();
    const frei2 = bedarf3DAnfordern();
    expect(braucht()).toBe(true);
    frei();
    frei();
    expect(braucht()).toBe(true);
    frei2();
    expect(braucht()).toBe(false);
  });
});
