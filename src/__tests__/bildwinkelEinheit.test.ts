// #192: Vorschau (gezeichnet), Kamerablick der 3D-Ansicht und gerendertes
// Kamerabild zeigen denselben Ausschnitt — den, den Sensor, Brennweite,
// Extender und Squeeze ergeben. Gemessen wird an Weltpunkten, die genau auf
// dem Bildrand liegen muessen, in jeder Fenstergroesse.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getCameraById, getEffectiveSensor } from '../data/cameras';
import { getLensById } from '../data/lenses';
import { computeFov } from '../utils/fov';
import { BILD_SEITENVERHAELTNIS, bildKamera, bildVDeg, kameraBildwinkel, kameraProjektion, povLeinwand } from '../utils/bildwinkel';
import { cameraDirection, povFraming } from '../utils/view3dScene';
import { groundHeightAt, stageTopZ } from '../utils/stageBody';
import type { Stage, VenueCamera } from '../types';

const DEG = Math.PI / 180;
const KATALOG = { customCameras: [], customLenses: [] };

/** Kamera-/Objektivpaare quer durch Sensorformate, Extender und Anamorphot. */
const FAELLE: { name: string; cam: Partial<VenueCamera> }[] = [
  { name: 'HDC-3500 2/3" B4, 120 mm', cam: { cameraId: 'sony-hdc-3500', lensId: 'fuj-ua80x9', focalLength: 120, extenderActive: 1 } },
  { name: 'HDC-3500 mit 2x-Extender', cam: { cameraId: 'sony-hdc-3500', lensId: 'fuj-ua80x9', focalLength: 60, extenderActive: 2 } },
  { name: 'FR7 Vollformat 3:2, 24–105 @ 28 mm', cam: { cameraId: 'sony-fr7', lensId: 'sony-fe-24-105g', focalLength: 28, extenderActive: 1 } },
  { name: 'AW-UE150 1" PTZ, 30 mm', cam: { cameraId: 'pana-aw-ue150', lensId: 'ptz-pana-ue150', focalLength: 30, extenderActive: 1 } },
  { name: 'ALEXA 35 mit Anamorphot 2x, 40 mm', cam: { cameraId: 'arri-alexa-35', lensId: 'arri-ma-40', focalLength: 40, extenderActive: 1 } },
];
const FENSTER: [number, number][] = [[1600, 900], [1000, 1100], [1900, 700], [390, 800], [1250, 703]];
const NEIGUNGEN = [0, -8, 12];

function kamera(teil: Partial<VenueCamera>, tilt: number): VenueCamera {
  return {
    id: 'k', label: 'K', x: 12, y: 30, z: 3.2, pan: -70, tilt, aperture: 2.8, focusDistance: 15, color: '#fff',
    cameraId: '', lensId: '', focalLength: 50, extenderActive: 1, ...teil,
  } as VenueCamera;
}

/** Weltpunkt (Plan-x, Plan-y, Hoehe), der im Kamerabild bei (u, v) liegt — u, v in tan-Einheiten. */
function punktImBild(cam: VenueCamera, u: number, v: number, abstand = 20): [number, number, number] {
  const [fx, fz, fy] = cameraDirection(cam.pan, cam.tilt); // Welt: x, Hoehe, Plan-y
  const r = [-Math.sin(cam.pan * DEG), Math.cos(cam.pan * DEG), 0];
  const oben = [-Math.sin(cam.tilt * DEG) * Math.cos(cam.pan * DEG), -Math.sin(cam.tilt * DEG) * Math.sin(cam.pan * DEG), Math.cos(cam.tilt * DEG)];
  const d = [fx + u * r[0] + v * oben[0], fy + u * r[1] + v * oben[1], fz + u * r[2] + v * oben[2]];
  return [cam.x + d[0] * abstand, cam.y + d[1] * abstand, cam.z + d[2] * abstand];
}

/** Bildpunkt eines Weltpunkts durch eine three.js-Kamera, in Pixeln einer Flaeche b × h. */
function durchThree(f: { pos: [number, number, number]; yaw: number; pitch: number }, fovDeg: number, aspect: number, p: [number, number, number], b: number, h: number) {
  const k = new THREE.PerspectiveCamera(fovDeg, aspect, 0.1, 1000);
  k.position.set(...f.pos);
  k.rotation.order = 'YXZ';
  k.rotation.set(f.pitch, f.yaw, 0);
  k.updateMatrixWorld(true);
  const n = new THREE.Vector3(p[0], p[2], p[1]).project(k);
  return { sx: ((n.x + 1) / 2) * b, sy: ((1 - n.y) / 2) * h };
}

describe('Ein Bildwinkel fuer Vorschau, Kamerablick und gerendertes Bild (#192)', () => {
  for (const fall of FAELLE) {
    it(`${fall.name}: Bildwinkel kommt aus computeFov`, () => {
      const cam = kamera(fall.cam, 0);
      const camDef = getCameraById(cam.cameraId, [])!;
      const lensDef = getLensById(cam.lensId, [])!;
      expect(camDef, cam.cameraId).toBeTruthy();
      expect(lensDef, cam.lensId).toBeTruthy();
      const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
      const soll = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1).horizontalDeg;
      const bw = kameraBildwinkel(cam, KATALOG)!;
      expect(bw.hDeg).toBeCloseTo(soll, 10);
      expect(bw.vDeg).toBeCloseTo(bildVDeg(soll), 10);
      if (lensDef.squeeze && lensDef.squeeze > 1) expect(bw.hDeg).toBeGreaterThan(computeFov(sensor, cam.focalLength, 10).horizontalDeg * 1.5);
    });

    for (const tilt of NEIGUNGEN) {
      for (const [b, h] of FENSTER) {
        it(`${fall.name}, Neigung ${tilt}°, Fenster ${b}×${h}: alle drei Ansichten treffen denselben Bildrand`, () => {
          const cam = kamera(fall.cam, tilt);
          const bw = kameraBildwinkel(cam, KATALOG)!;
          const tanH = Math.tan((bw.hDeg * DEG) / 2);
          const tanV = Math.tan((bw.vDeg * DEG) / 2);
          // Rechter Rand Mitte, oberer Rand Mitte, linke obere Ecke.
          const proben: [number, number, number, number][] = [[tanH, 0, 1, 0.5], [0, tanV, 0.5, 0], [-tanH, tanV, 0, 0]];

          // 1. Gezeichnete Vorschau: 16:9-Flaeche so breit wie die Vorschau.
          const vb = Math.min(b, 1280);
          const vh = (vb * 9) / 16;
          const zeichnung = kameraProjektion(cam, bw.hDeg, vb, vh);
          // 2. Kamerablick der 3D-Ansicht: ganze Flaeche, 16:9-Rahmen darin.
          const lw = povLeinwand(b, h, bw.hDeg);
          expect(lw.rahmen.w / lw.rahmen.h).toBeCloseTo(BILD_SEITENVERHAELTNIS, 9);
          expect(lw.rahmen.w).toBeLessThanOrEqual(b + 1e-9);
          expect(lw.rahmen.h).toBeLessThanOrEqual(h + 1e-9);
          expect(Math.max(lw.rahmen.w / b, lw.rahmen.h / h)).toBeCloseTo(1, 9);
          const pov = povFraming(cam, bw.hDeg, b / h);
          // 3. Gerendertes Kamerabild (Host): eigene Kamera, genau 16:9.
          const bild = bildKamera(cam, bw.hDeg);
          const rb = 1280;
          const rh = 720;

          for (const [u, v, ex, ey] of proben) {
            const p = punktImBild(cam, u, v);
            const z = zeichnung.zuBild(zeichnung.zuKamera(...p));
            expect(z.sx / vb).toBeCloseTo(ex, 6);
            expect(z.sy / vh).toBeCloseTo(ey, 6);

            const k = durchThree(pov, lw.vFovDeg, b / h, p, b, h);
            expect((k.sx - lw.rahmen.x) / lw.rahmen.w).toBeCloseTo(ex, 6);
            expect((k.sy - lw.rahmen.y) / lw.rahmen.h).toBeCloseTo(ey, 6);

            const r = durchThree(bild, bild.fovDeg, bild.aspect, p, rb, rh);
            expect(r.sx / rb).toBeCloseTo(ex, 6);
            expect(r.sy / rh).toBeCloseTo(ey, 6);
          }
        });
      }
    }
  }
});

describe('Massstab: 1 m im Plan ist 1 m in 3D', () => {
  it('die Blickkamera steht genau am Standort und in der Hoehe der Kamera', () => {
    const f = povFraming({ x: 7.25, y: 18.5, z: 4.1, pan: -90, tilt: -3 }, 30, 16 / 9);
    expect(f.pos).toEqual([7.25, 4.1, 18.5]);
  });

  it('eine Person auf der Buehne steht in Vorschau und 3D gleich gross an derselben Stelle', () => {
    const buehne: Stage = { id: 's', x: 3, y: 0.5, width: 9, height: 4, label: 'Buehne', elevationM: 0.6 } as Stage;
    const fuss = groundHeightAt([buehne], 7.5, 2.5);
    expect(fuss).toBeCloseTo(stageTopZ(buehne), 9);
    expect(fuss).toBeCloseTo(0.6, 9);
    const cam = kamera({ cameraId: 'pana-aw-ue150', lensId: 'ptz-pana-ue150', focalLength: 30 }, -4);
    Object.assign(cam, { x: 7.5, y: 15, z: 3, pan: -90 });
    const bw = kameraBildwinkel(cam, KATALOG)!;
    const zeichnung = kameraProjektion(cam, bw.hDeg, 1280, 720);
    const bild = bildKamera(cam, bw.hDeg);
    for (const hoehe of [fuss, fuss + 1.8]) {
      const z = zeichnung.zuBild(zeichnung.zuKamera(7.5, 2.5, hoehe));
      const r = durchThree(bild, bild.fovDeg, bild.aspect, [7.5, 2.5, hoehe], 1280, 720);
      expect(r.sx).toBeCloseTo(z.sx, 4);
      expect(r.sy).toBeCloseTo(z.sy, 4);
    }
    // 1,80 m in 12,5 m Abstand: so viele Bildhoehen, wie die Geometrie sagt.
    const kopf = zeichnung.zuBild(zeichnung.zuKamera(7.5, 2.5, fuss + 1.8));
    const fussPx = zeichnung.zuBild(zeichnung.zuKamera(7.5, 2.5, fuss));
    const bildhoeheBeiAbstand = 2 * 12.5 * Math.tan((bw.vDeg * DEG) / 2);
    expect((fussPx.sy - kopf.sy) / 720).toBeCloseTo(1.8 / bildhoeheBeiAbstand, 1);
  });
});
