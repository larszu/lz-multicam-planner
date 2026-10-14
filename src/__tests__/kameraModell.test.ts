import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { achsVersatz, kameraModell, koerperArt, objektivArt } from '../utils/kameraModell';
import { CAMERAS } from '../data/cameras';
import { LENSES } from '../data/lenses';
import { erzeugeKameraRig } from '../avplan/scene3d';
import type { Camera, CameraMountType, Lens, VenueCamera } from '../types';

const kamera = (id: string): Camera => {
  const c = CAMERAS.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};
const linse = (id: string): Lens => {
  const l = LENSES.find((x) => x.id === id);
  if (!l) throw new Error(id);
  return l;
};
const typ = (t: Camera['type'], extra: Partial<Camera> = {}): Camera => ({ ...kamera('sony-hdc-3500'), type: t, mount: 'EF', ...extra });

const venueCam = (over: Partial<VenueCamera> = {}): VenueCamera => ({
  id: 'c1', label: 'CAM 1', cameraId: 'x', lensId: 'y', x: 10, y: 5, z: 1.6, pan: 30, tilt: -12,
  focalLength: 50, aperture: 2.8, focusDistance: 10, color: '#2b6bff', extenderActive: 1, mountType: 'tripod', ...over,
});

describe('Kameratyp → Modell', () => {
  it('ordnet die Katalogtypen den Koerpern zu', () => {
    expect(koerperArt(typ('ptz'), undefined)).toBe('ptz');
    expect(koerperArt(typ('cinema'), undefined)).toBe('cinema');
    expect(koerperArt(typ('mirrorless'), undefined)).toBe('spiegellos');
    expect(koerperArt(typ('eng'), undefined)).toBe('eng');
    expect(koerperArt(typ('camcorder'), undefined)).toBe('eng');
    expect(koerperArt(undefined, undefined)).toBe('cinema');
    expect(koerperArt(kamera('sony-fx3'), undefined)).toBe('spiegellos');
    expect(koerperArt(kamera('sony-fx6'), undefined)).toBe('cinema');
  });

  it('macht aus einer Systemkamera mit Grossobjektiv die Studiokamera, mit Handobjektiv den Schulter-Look', () => {
    const hdc = kamera('sony-hdc-3500');
    expect(koerperArt(hdc, linse('fuj-ua107x8.4'))).toBe('studio');
    expect(objektivArt('studio', linse('fuj-ua107x8.4'))).toBe('box');
    expect(koerperArt(hdc, linse('fuj-ua24x7.8'))).toBe('eng');
    expect(objektivArt('eng', linse('fuj-ua24x7.8'))).toBe('eng');
  });

  it('waehlt Cine-Zoom oder Festbrennweite nach dem Objektivtyp', () => {
    expect(objektivArt('cinema', { ...linse('fuj-ua24x7.8'), mount: 'PL', type: 'zoom' })).toBe('cineZoom');
    expect(objektivArt('cinema', { ...linse('fuj-ua24x7.8'), mount: 'PL', type: 'prime' })).toBe('cinePrime');
    expect(objektivArt('spiegellos', { ...linse('fuj-ua24x7.8'), mount: 'E', type: 'zoom' })).toBe('foto');
  });

  it('nimmt die Halterung aus der Montage, ohne Pflichtangaben', () => {
    const halterung = (m: CameraMountType | undefined, t: Camera['type'] = 'cinema', z = 1.6) =>
      kameraModell(venueCam({ mountType: m, z }), typ(t), undefined, { detail: 'niedrig' });
    expect(halterung(undefined).optionen.halterung).toBe('stativ');
    expect(halterung('pedestal').optionen.halterung).toBe('pedestal');
    expect(halterung('jib').optionen.halterung).toBe('kran');
    expect(halterung('dolly').optionen.halterung).toBe('dolly');
    expect(halterung('handheld').bediener).toBe('kameraSchulter');
    expect(halterung('fixed', 'ptz', 2.2).optionen.halterung).toBe('wand');
    expect(halterung('fixed', 'ptz', 3.5).optionen.halterung).toBe('decke');
    const drohne = halterung('drone');
    expect(drohne.optionen.halterung).toBe('keine');
    expect(drohne.skelett).toBe(true);
  });

  it('setzt den Wagen auf der Schiene an den Fahrweg', () => {
    const m = kameraModell(venueCam({ mountType: 'dolly', trackLengthM: 4.2, trackOffset: 1.5 }), typ('cinema'), undefined, { detail: 'niedrig' });
    expect(m.optionen.schienenLaengeM).toBeCloseTo(4.2);
    expect(m.optionen.position).toBeCloseTo(1.5 / (2.1 - 0.6));
  });
});

describe('Sichtkegel an der optischen Achse', () => {
  const montagen: CameraMountType[] = ['tripod', 'pedestal', 'jib', 'dolly', 'slider', 'handheld', 'fixed', 'drone'];
  for (const mountType of montagen) {
    for (const t of ['cinema', 'ptz', 'broadcast'] as const) {
      it(`${mountType} / ${t}: Blickrichtung wie Pan/Tilt, Ursprung nahe der Kamera`, () => {
        const cam = venueCam({ mountType, z: mountType === 'fixed' ? 3 : 1.6 });
        const { optionen } = kameraModell(cam, typ(t), undefined, { detail: 'niedrig' });
        const rig = erzeugeKameraRig(optionen);
        rig.gruppe.position.set(cam.x, 0, cam.y);
        const v = achsVersatz(rig, cam);
        // Im Neige-Rahmen zeigt die Achse nach +x: keine Restdrehung.
        expect(new THREE.Vector3(1, 0, 0).applyQuaternion(v.quaternion).x).toBeCloseTo(1, 4);
        // Bei geneigtem Fluidkopf wandert die Optik um seine Achse — aber nur um Zentimeter.
        expect(v.position.length()).toBeLessThan(0.9);
        rig.dispose();
      });
    }
  }

  it('liegt bei Tilt 0 auf Objektivhoehe (hoeheM = cam.z)', () => {
    const cam = venueCam({ tilt: 0 });
    const rig = erzeugeKameraRig(kameraModell(cam, typ('cinema'), undefined, { detail: 'niedrig' }).optionen);
    rig.gruppe.position.set(cam.x, 0, cam.y);
    expect(achsVersatz(rig, cam).position.y).toBeCloseTo(0, 3);
    rig.dispose();
  });
});
