// ───────────────────────────────────────────────────────────────────────────
// EIN Bildwinkel fuer alle Kamerabilder (#192).
//
// Die gezeichnete Vorschau (cameraViewRenderer), der Kamerablick der
// 3D-Ansicht und das gerenderte Kamerabild in Vorschau und Multiview rechnen
// hier — nicht jede Ansicht fuer sich. Vorher nahm der Kamerablick den
// Bildwinkel einmal beim Hinfahren und liess ihn dann vom Fenster strecken:
// je nach Seitenverhaeltnis zu nah oder zu weit.
//
// Das Bild ist 16:9, so breit wie der Sensor (bzw. der entzerrte Anamorphot):
// der horizontale Winkel kommt aus `computeFov`, der vertikale folgt aus 16:9.
// Ein 3:2-Sensor zeichnet Video ebenfalls 16:9 und schneidet oben und unten
// ab — das Bild ist nie hoeher, als 16:9 erlaubt.
//
// Koordinaten wie in view3dScene: Plan-x/-y, Hoehe z. Pan 0 blickt nach +x,
// positiver Pan dreht nach +y, positiver Tilt blickt nach oben.
// ───────────────────────────────────────────────────────────────────────────
import { getCameraById, getEffectiveSensor } from '../data/cameras';
import { getLensById } from '../data/lenses';
import type { Camera, Lens, SensorSize, FovResult, VenueCamera } from '../types';
import { computeFov } from './fov';
import { povFraming, type Framing } from './view3dScene';

/** Seitenverhaeltnis jedes Kamerabilds. */
export const BILD_SEITENVERHAELTNIS = 16 / 9;

const DEG = Math.PI / 180;

/** Vertikaler Winkel des 16:9-Bildes zu einem horizontalen. */
export function bildVDeg(hDeg: number, aspect = BILD_SEITENVERHAELTNIS): number {
  return (2 * Math.atan(Math.tan((hDeg * DEG) / 2) / aspect)) / DEG;
}

export interface KameraBildwinkel {
  camDef: Camera;
  lensDef: Lens;
  sensor: SensorSize;
  fov: FovResult;
  /** Horizontaler Bildwinkel in Grad — `fov.horizontalDeg`. */
  hDeg: number;
  /** Vertikaler Bildwinkel des 16:9-Bildes in Grad. */
  vDeg: number;
}

/** Bildwinkel einer Planer-Kamera aus Sensor, Brennweite, Extender und Squeeze. */
export function kameraBildwinkel(
  cam: Pick<VenueCamera, 'cameraId' | 'lensId' | 'focalLength' | 'focusDistance' | 'extenderActive' | 'useSpeedbooster' | 'sensorModeIndex' | 'activeMount'>,
  katalog: { customCameras: Camera[]; customLenses: Lens[] },
): KameraBildwinkel | null {
  const camDef = getCameraById(cam.cameraId, katalog.customCameras);
  const lensDef = getLensById(cam.lensId, katalog.customLenses);
  if (!camDef || !lensDef) return null;
  const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
  const fov = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1);
  return { camDef, lensDef, sensor, fov, hDeg: fov.horizontalDeg, vDeg: bildVDeg(fov.horizontalDeg) };
}

export interface KameraPunkt { x: number; y: number; z: number }

export interface Projektion {
  /** Welt (Plan-x, Plan-y, Hoehe) → Kameraraum: x rechts, y oben, z Tiefe. */
  zuKamera(wx: number, wy: number, wz: number): KameraPunkt;
  /** Kameraraum → Bildpunkt in Pixeln (0..breite, 0..hoehe, y nach unten). */
  zuBild(p: KameraPunkt): { sx: number; sy: number; dist: number };
}

/**
 * Lochkamera einer Planer-Kamera fuer ein Bild `breite` × `hoehe`. Die
 * Neigung dreht den Blick (wie eine echte Kamera auf dem Kopf), sie
 * verschiebt das Bild nicht — so rechnet auch three.js.
 */
export function kameraProjektion(
  cam: { x: number; y: number; z: number; pan: number; tilt: number },
  hDeg: number,
  breite: number,
  hoehe: number,
): Projektion {
  const cp = Math.cos(cam.pan * DEG);
  const sp = Math.sin(cam.pan * DEG);
  const ct = Math.cos(cam.tilt * DEG);
  const st = Math.sin(cam.tilt * DEG);
  const tanH = Math.tan((hDeg * DEG) / 2);
  const tanV = tanH * (hoehe / breite);
  return {
    zuKamera(wx, wy, wz) {
      const dx = wx - cam.x;
      const dy = wy - cam.y;
      const dz = wz - cam.z;
      const vor = dx * cp + dy * sp;
      return { x: -dx * sp + dy * cp, y: dz * ct - vor * st, z: dz * st + vor * ct };
    },
    zuBild(p) {
      return {
        sx: breite / 2 + (p.x / (p.z * tanH)) * (breite / 2),
        sy: hoehe / 2 - (p.y / (p.z * tanV)) * (hoehe / 2),
        dist: p.z,
      };
    },
  };
}

/**
 * Blickkamera des gerenderten Kamerabilds (Kamerablick, Vorschau, Multiview):
 * Standort und Ausrichtung der Planer-Kamera, Bild genau 16:9 mit `hDeg`
 * Breite. `cam.x/y` ist der wirksame Standort (`effectiveCameraPos`).
 */
export function bildKamera(cam: { x: number; y: number; z: number; pan: number; tilt: number }, hDeg: number): Framing & { aspect: number } {
  return { ...povFraming(cam, hDeg, BILD_SEITENVERHAELTNIS), aspect: BILD_SEITENVERHAELTNIS };
}
