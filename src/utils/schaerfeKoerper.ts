import type { SensorSize } from '../types';
import { bildVDeg } from './bildwinkel';
import { dofBand } from './dofBand';
import { computeDof, computeFov } from './fov';

/**
 * Schaerfentiefe als Koerper im 3D-Raum (#225): der Teil des Bildkegels
 * zwischen Nah- und Ferngrenze. Grenzen kommen aus `dofBand`/`computeDof` —
 * dieselbe Rechnung wie Seitenleiste, 2D-Band und Tiefenunschaerfe im Bild.
 */
export interface SchaerfeEbene {
  /** Abstand von der Kamera in Metern. */
  d: number;
  halbB: number;
  halbH: number;
}

export interface SchaerfeKoerper {
  nah: SchaerfeEbene;
  fokus: SchaerfeEbene;
  fern: SchaerfeEbene;
  /** Ferngrenze liegt hinter dem gezeichneten Bereich (oder im Unendlichen). */
  gekuerzt: boolean;
  hyperfokalM: number;
  cocMm: number;
  deckkraft: number;
}

/** Offene Blende = duenne, kritische Schaerfe = kraeftiger gezeichnet. */
export function schaerfeDeckkraft(blende: number): number {
  if (!(blende > 0)) return 0.06;
  return Math.max(0.06, Math.min(0.3, 0.35 / Math.sqrt(blende)));
}

export function schaerfeKoerper(
  sensor: SensorSize,
  cam: { focalLength: number; aperture: number; focusDistance: number; extenderActive: number },
  squeeze: number,
  maxM: number,
): SchaerfeKoerper | null {
  const band = dofBand(sensor, cam.focalLength, cam.aperture, cam.focusDistance, cam.extenderActive, maxM);
  if (!band) return null;
  const dof = computeDof(sensor, cam.focalLength, cam.aperture, cam.focusDistance, cam.extenderActive);
  const fov = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, squeeze);
  const tanH = Math.tan((fov.horizontalDeg / 2) * (Math.PI / 180));
  const tanV = Math.tan((bildVDeg(fov.horizontalDeg) / 2) * (Math.PI / 180));
  const ebene = (d: number): SchaerfeEbene => ({ d, halbB: tanH * d, halbH: tanV * d });
  return {
    nah: ebene(band.vonM),
    fokus: ebene(Math.min(band.fokusM, band.bisM)),
    fern: ebene(band.bisM),
    gekuerzt: band.gekuerzt,
    hyperfokalM: dof.hyperfocal,
    cocMm: dof.circleOfConfusion,
    deckkraft: schaerfeDeckkraft(cam.aperture),
  };
}

/** Eckpunkte des Stumpfs entlang −Z (Kamerablick wie die FOV-Pyramide): erst nah, dann fern. */
export function stumpfEcken(k: SchaerfeKoerper): Float32Array {
  const e = (p: SchaerfeEbene) => [
    -p.halbB, p.halbH, -p.d,
    p.halbB, p.halbH, -p.d,
    p.halbB, -p.halbH, -p.d,
    -p.halbB, -p.halbH, -p.d,
  ];
  return new Float32Array([...e(k.nah), ...e(k.fern)]);
}

/** Dreiecke der sechs Seiten (Indizes in `stumpfEcken`). */
export const STUMPF_FLAECHEN = [
  0, 1, 2, 0, 2, 3,
  4, 6, 5, 4, 7, 6,
  0, 4, 5, 0, 5, 1,
  1, 5, 6, 1, 6, 2,
  2, 6, 7, 2, 7, 3,
  3, 7, 4, 3, 4, 0,
];
