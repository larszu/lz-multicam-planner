// Fahrweg einer Kamera als Strecke (#235): gerade, im Bogen oder als Schwenk
// eines Kranarms um seinen Drehpunkt.
//
// Alle drei Formen sind dieselbe Bewegung: die Parkposition dreht sich um
// einen Mittelpunkt, um den Winkel s / R (s = Weg auf der Strecke). Beim Bogen
// liegt der Mittelpunkt quer zur Rig-Achse, beim Schwenk hinter dem Kopf auf
// der Achse (der Drehpunkt des Arms). Die gerade Strecke ist der Grenzfall R → ∞.
//
// Rig-Koordinaten wie in `rigGeometry`: f entlang der Rig-Achse, l quer nach
// rechts, Ursprung = Parkposition. Reines Modul.
import type { VenueCamera } from '../types';
import { rigLimits, type RigLimits } from './rigLimits';

export interface PathPoint {
  f: number;
  l: number;
  /** Drehung der Fahrtrichtung gegenueber der Rig-Achse (Grad). */
  turnDeg: number;
}

const rigYaw = (cam: Pick<VenueCamera, 'pan' | 'rigRotation'>) => cam.rigRotation ?? cam.pan;

type PathLimits = Pick<RigLimits, 'pathShape' | 'pathRadiusM' | 'travelM'>;

/** Mittelpunkt der Drehung in Rig-Koordinaten; null bei gerader Strecke. */
export function pathCenter(limits: PathLimits): { f: number; l: number } | null {
  const r = limits.pathRadiusM;
  if (limits.pathShape === 'line' || !r) return null;
  return limits.pathShape === 'arc' ? { f: 0, l: r } : { f: -r, l: 0 };
}

/** Dreht einen Rig-Punkt um den Mittelpunkt des Fahrwegs, um den Winkel zu Weg s. */
export function rotateOnPath(limits: PathLimits, p: { f: number; l: number }, s: number): { f: number; l: number } {
  const c = pathCenter(limits);
  if (!c) return { f: p.f + s, l: p.l };
  const a = s / (limits.pathRadiusM as number);
  const df = p.f - c.f;
  const dl = p.l - c.l;
  return { f: c.f + df * Math.cos(a) - dl * Math.sin(a), l: c.l + df * Math.sin(a) + dl * Math.cos(a) };
}

/** Kopf auf der Strecke bei Weg s (m ab Parkposition). */
export function pointOnPath(limits: PathLimits, s: number): PathPoint {
  const p = rotateOnPath(limits, { f: 0, l: 0 }, s);
  const c = pathCenter(limits);
  return { ...p, turnDeg: c ? ((s / (limits.pathRadiusM as number)) * 180) / Math.PI : 0 };
}

/** Gesamtlaenge der Strecke (m) — von Endpunkt 1 bis Endpunkt 2. */
export function pathLengthM(limits: PathLimits): number {
  return 2 * Math.max(0, limits.travelM);
}

/** Ueberstrichener Winkel (Grad); 0 bei gerader Strecke. */
export function pathSweepDeg(limits: PathLimits): number {
  if (!pathCenter(limits)) return 0;
  return (pathLengthM(limits) / Math.abs(limits.pathRadiusM as number)) * (180 / Math.PI);
}

/** Die Strecke als Linienzug in Rig-Koordinaten, von Endpunkt 1 nach 2. */
export function pathPolyline(limits: PathLimits, steps = 48): PathPoint[] {
  const t = Math.max(0, limits.travelM);
  if (t <= 0) return [];
  const n = pathCenter(limits) ? Math.max(2, steps) : 1;
  const out: PathPoint[] = [];
  for (let i = 0; i <= n; i += 1) out.push(pointOnPath(limits, -t + (2 * t * i) / n));
  return out;
}

/** Rig-Koordinaten → Plan (m). */
export function rigToPlan(cam: Pick<VenueCamera, 'x' | 'y' | 'pan' | 'rigRotation'>, p: { f: number; l: number }): { x: number; y: number } {
  const yaw = (rigYaw(cam) * Math.PI) / 180;
  return {
    x: cam.x + p.f * Math.cos(yaw) - p.l * Math.sin(yaw),
    y: cam.y + p.f * Math.sin(yaw) + p.l * Math.cos(yaw),
  };
}

/** Versatz des Kopfes gegenueber der Parkposition im Plan (m) bei Weg s. */
export function pathShift(cam: VenueCamera, s = cam.trackOffset ?? 0): { dx: number; dy: number; headingDeg: number } {
  const limits = rigLimits(cam);
  const p = pointOnPath(limits, s);
  const at = rigToPlan({ x: 0, y: 0, pan: cam.pan, rigRotation: cam.rigRotation }, p);
  return { dx: at.x, dy: at.y, headingDeg: rigYaw(cam) + p.turnDeg };
}

/** Eine Zeile fuer Karte und Shotliste: Form, Laenge, Radius bzw. Schwenk. */
export interface PathSummary {
  shape: RigLimits['pathShape'];
  lengthM: number;
  radiusM?: number;
  sweepDeg: number;
  heightM?: { min: number; max: number };
}

export function pathSummary(cam: VenueCamera): PathSummary | null {
  const limits = rigLimits(cam);
  if (!(limits.travelM > 0)) return null;
  return {
    shape: limits.pathShape,
    lengthM: pathLengthM(limits),
    radiusM: limits.pathRadiusM === undefined ? undefined : Math.abs(limits.pathRadiusM),
    sweepDeg: pathSweepDeg(limits),
    heightM: limits.pathShape === 'swing' ? { min: limits.minHeightM, max: limits.maxHeightM } : undefined,
  };
}
