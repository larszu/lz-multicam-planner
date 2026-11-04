// Effektive Grenzen einer Kamera-Montage.
//
// Es gibt drei Quellen, in dieser Rangfolge:
//   1. `VenueCamera.trackLengthM` — die tatsaechlich gelegte Schiene (Nutzer).
//   2. Das gewaehlte Rig aus `data/rigs.ts` — echte Geraetemaße.
//   3. `MOUNT_HEIGHT_RANGE` der Kategorie — grober Default.
//
// Alle Verbraucher (Sidebar-Regler, 2D-/3D-Darstellung, Machbarkeitsrechnung)
// fragen hier, damit sie nicht auseinanderlaufen.
import { MOUNT_HEIGHT_RANGE, type CameraMountType, type TravelShape, type VenueCamera } from '../types';
import { getRigById, type CameraRig } from '../data/rigs';

/**
 * Montagen, die auf einer gelegten Schiene fahren. Bei ihnen ist die
 * Laengenangabe die Schiene selbst, nicht der Weg in eine Richtung.
 */
const RAIL_TYPES = new Set<CameraMountType>(['dolly', 'slider']);
const CRANE_TYPES = new Set<CameraMountType>(['jib', 'technocrane']);

/** Schwenkbereich eines Kranarms ohne eigene Angabe (Grad). */
export const DEFAULT_SWING_DEG = 180;

/**
 * Welche Fahrweg-Formen eine Montage haben kann (#235). Ein Kran schwenkt um
 * seinen Drehpunkt, eine Schiene oder ein Fahrzeug faehrt auch im Bogen; ein
 * Slider ist ein starres Profil. Ohne Fahrweg: keine.
 */
export function travelShapes(type: CameraMountType, travelM: number): TravelShape[] {
  if (!(travelM > 0)) return [];
  if (CRANE_TYPES.has(type)) return ['line', 'swing'];
  if (type === 'slider') return ['line'];
  return ['line', 'arc'];
}

export interface RigLimits {
  /** Kategorie der Montage. */
  type: CameraMountType;
  /** Gewaehltes Rig, falls eines gesetzt ist. */
  rig?: CameraRig;
  minHeightM: number;
  maxHeightM: number;
  /** Starting height on this rig, inside min/max (#228). */
  standardHeightM: number;
  /** Empfohlener Hoehen-Schritt (Pedestal-Pump, Jib-Stufe). */
  pumpM: number;
  /**
   * Rohwert der Fahrstrecke (m): bei Schienen-Rigs die GELEGTE SCHIENENLAENGE,
   * sonst der Fahrweg des Rigs (Jib-Schwenk, Teleskopweg, Flugstrecke).
   */
  trackM: number;
  /**
   * Fahrweg in EINE Richtung ab der Parkposition (m); 0 = starres Rig.
   * Bei Schienen ist das die halbe Schienenlaenge — die Schiene liegt
   * symmetrisch um die Parkposition, der Wagen faehrt nach beiden Seiten.
   */
  travelM: number;
  /** Gelegte Schienenlaenge (m); 0 bei Rigs ohne Schiene. */
  railLengthM: number;
  /** true, wenn die Laenge vom Nutzer gesetzt ist (nicht vom Rig/Default). */
  trackIsCustom: boolean;
  armLengthM?: number;
  telescopeM?: number;
  payloadKg?: number;
  footprintM?: { w: number; d: number };
  /** Form des Fahrwegs; `line`, wenn die Montage die gewaehlte nicht kann. */
  pathShape: TravelShape;
  /** Radius bei `arc` (mit Vorzeichen) und `swing` (m). */
  pathRadiusM?: number;
}

type LimitInput = Pick<VenueCamera, 'mountType' | 'rigId' | 'trackLengthM'> &
  Partial<Pick<VenueCamera, 'travelShape' | 'travelRadiusM' | 'swingDeg'>>;

export function rigLimits(cam: LimitInput): RigLimits {
  const type = cam.mountType ?? 'tripod';
  const base = MOUNT_HEIGHT_RANGE[type] ?? MOUNT_HEIGHT_RANGE.tripod;
  const rig = getRigById(cam.rigId);

  // Ein Rig darf nur greifen, wenn es zur Kategorie passt — sonst bleibt ein
  // alter rigId-Wert nach dem Umschalten der Montage haengen und liefert
  // unsinnige Grenzen.
  const fits = rig?.type === type ? rig : undefined;

  const trackFromRig = fits?.trackLengthM ?? base.track ?? 0;
  const custom = typeof cam.trackLengthM === 'number' && cam.trackLengthM > 0;
  const trackM = custom ? (cam.trackLengthM as number) : trackFromRig;
  const onRail = RAIL_TYPES.has(type);
  let travelM = onRail ? trackM / 2 : trackM;
  const shapes = travelShapes(type, travelM);
  const pathShape: TravelShape = cam.travelShape && shapes.includes(cam.travelShape) ? cam.travelShape : 'line';
  let pathRadiusM: number | undefined;
  if (pathShape === 'swing') {
    const r = cam.travelRadiusM;
    pathRadiusM = typeof r === 'number' && r >= 0.5 ? r : fits?.armLengthM ?? Math.max(1.5, travelM * 1.4);
    const sweep = Math.max(5, Math.min(360, cam.swingDeg ?? DEFAULT_SWING_DEG));
    travelM = (pathRadiusM * sweep * Math.PI) / 360;
  } else if (pathShape === 'arc') {
    const r = cam.travelRadiusM;
    pathRadiusM = typeof r === 'number' && Math.abs(r) >= 0.5 ? r : Math.max(2, 2 * travelM);
    travelM = Math.min(travelM, Math.PI * Math.abs(pathRadiusM));
  }

  const minHeightM = fits?.minHeightM ?? base.min;
  const maxHeightM = fits?.maxHeightM ?? base.max;

  return {
    type,
    rig: fits,
    minHeightM,
    maxHeightM,
    standardHeightM: Math.max(minHeightM, Math.min(maxHeightM, base.standard)),
    pumpM: base.pump > 0 ? base.pump : 0.05,
    trackM,
    travelM,
    railLengthM: onRail ? trackM : 0,
    trackIsCustom: custom,
    armLengthM: fits?.armLengthM,
    telescopeM: fits?.telescopeM,
    payloadKg: fits?.payloadKg,
    footprintM: fits?.footprintM,
    pathShape,
    pathRadiusM,
  };
}

/** true, wenn die Montage ueberhaupt einen Fahrweg hat (Schiene, Schwenk, Flug). */
export function hasTrack(limits: RigLimits): boolean {
  return limits.travelM > 0;
}

/** Hoehe in den erlaubten Bereich klemmen — beim Wechsel von Rig/Montage. */
export function clampHeight(limits: RigLimits, z: number): number {
  return Math.max(limits.minHeightM, Math.min(limits.maxHeightM, z));
}

/** Fahrweg-Offset in den erlaubten Bereich klemmen (symmetrisch um 0). */
export function clampTrack(limits: RigLimits, offset: number): number {
  const t = limits.travelM;
  if (t <= 0) return 0;
  return Math.max(-t, Math.min(t, offset));
}
