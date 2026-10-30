// Live-Pose aus LZ Camera Bridge auf geplante Kameras legen.
//
// Rahmen wie in der Bridge (`protocol/ptzPose.ts`): der Kopf kennt den Raum
// nicht, sein Pan 0 ist die Heimrichtung = geplante Blickrichtung des Rigs
// (`rigYaw`). Beide Systeme drehen im Uhrzeigersinn auf dem Plan, also
//   Raum-Pan = rigYaw + Kopf-Pan,   Tilt gleich (negativ = nach unten).
// Brennweite: `hfovDeg` der Bridge zaehlt vor `zoom`, weil die Bridge dafuer
// eine gemessene Tabelle haben kann; `zoom` 0..1 wird wie dort ohne Tabelle
// linear zwischen Weit- und Teleende gelegt.
//
// REIN: kein Netz, keine Uhr.
import type { VenueCamera } from '../types';
import { rigYaw } from './camera';

export interface BridgePose {
  pan: number;
  tilt: number;
  zoom?: number;
}

export interface LivePose {
  pose: BridgePose;
  hfovDeg?: number;
}

export interface LiveOptik {
  sensorWidthMm?: number;
  focalMin?: number;
  focalMax?: number;
}

/** Busse eines Bridge-Mischers in Eingangsnummern (0 = leer). */
export interface MixerBus {
  switcherNumber: number;
  program: number;
  preview: number;
  inTransition: boolean;
}

export type BridgeMessage =
  | { type: 'pose'; cameraNumber: number; pose: BridgePose; hfovDeg?: number }
  | { type: 'mixer'; mixers: MixerBus[] }
  | { type: 'surfaceInput'; cameraNumber?: number; joystick?: { pan: number; tilt: number } }
  | { type: 'cameras'; cameras: { cameraNumber: number; connected: boolean }[] };

const zahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Nur, was der Planer braucht; alles andere (oder Kaputtes) ist null. */
export function parseBridgeMessage(raw: string): BridgeMessage | null {
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.type === 'pose') {
    const p = o.pose as Record<string, unknown> | undefined;
    if (!zahl(o.cameraNumber) || !p || !zahl(p.pan) || !zahl(p.tilt)) return null;
    return {
      type: 'pose',
      cameraNumber: o.cameraNumber,
      pose: { pan: p.pan, tilt: p.tilt, ...(zahl(p.zoom) ? { zoom: p.zoom } : {}) },
      ...(zahl(o.hfovDeg) ? { hfovDeg: o.hfovDeg } : {}),
    };
  }
  if (o.type === 'surfaceInput') {
    const js = (o.input as { joystick?: Record<string, unknown> } | undefined)?.joystick;
    return {
      type: 'surfaceInput',
      ...(zahl(o.cameraNumber) ? { cameraNumber: o.cameraNumber } : {}),
      ...(js && zahl(js.pan) && zahl(js.tilt) ? { joystick: { pan: js.pan, tilt: js.tilt } } : {}),
    };
  }
  // Ein Mischer (`switcherState`) oder alle (`switchers`): nur die Busse.
  const bus = (num: unknown, st: unknown): MixerBus | null => {
    const s = st as Record<string, unknown> | null;
    if (!zahl(num) || !s || typeof s !== 'object') return null;
    return {
      switcherNumber: num,
      program: zahl(s.program) ? s.program : 0,
      preview: zahl(s.preview) ? s.preview : 0,
      inTransition: s.inTransition === true,
    };
  };
  if (o.type === 'switcherState') {
    const b = bus(o.switcherNumber, o.state);
    return b ? { type: 'mixer', mixers: [b] } : null;
  }
  if (o.type === 'switchers' && Array.isArray(o.switchers)) {
    const mixers = (o.switchers as Record<string, unknown>[])
      .map((x) => (x ? bus(x.switcherNumber, x.state) : null))
      .filter((b): b is MixerBus => b !== null);
    return { type: 'mixer', mixers };
  }
  if (o.type === 'cameras' && Array.isArray(o.cameras)) {
    return {
      type: 'cameras',
      cameras: (o.cameras as Record<string, unknown>[])
        .filter((c) => c && zahl(c.cameraNumber))
        .map((c) => ({ cameraNumber: c.cameraNumber as number, connected: c.connected === true })),
    };
  }
  return null;
}

/** Bridge-Nummer einer Planer-Kamera: Feld, sonst Zahl im Namen, sonst Position. */
export function bridgeNumberFor(cam: Pick<VenueCamera, 'label' | 'bridgeCameraNumber'>, index: number): number {
  if (cam.bridgeCameraNumber !== undefined && cam.bridgeCameraNumber > 0) return cam.bridgeCameraNumber;
  const imNamen = /(\d+)/.exec(cam.label)?.[1];
  return imNamen ? Number(imNamen) : index + 1;
}

const winkel = (deg: number): number => {
  const w = ((deg % 360) + 360) % 360;
  return w > 180 ? w - 360 : w;
};

const klemme = (v: number, min?: number, max?: number): number =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

export function focalFromLive(live: LivePose, optik: LiveOptik): number | undefined {
  const { sensorWidthMm, focalMin, focalMax } = optik;
  if (live.hfovDeg !== undefined && live.hfovDeg > 0 && live.hfovDeg < 180 && sensorWidthMm) {
    const f = sensorWidthMm / (2 * Math.tan((live.hfovDeg * Math.PI) / 360));
    return klemme(f, focalMin, focalMax);
  }
  if (live.pose.zoom !== undefined && focalMin !== undefined && focalMax !== undefined) {
    return focalMin + klemme(live.pose.zoom, 0, 1) * (focalMax - focalMin);
  }
  return undefined;
}

/** Die Werte, die die Live-Pose an der Planer-Kamera aendert. */
export function liveUpdates(
  cam: Pick<VenueCamera, 'pan' | 'rigRotation'>,
  live: LivePose,
  optik: LiveOptik = {},
): Pick<VenueCamera, 'pan' | 'tilt'> & { focalLength?: number } {
  const focal = focalFromLive(live, optik);
  return {
    pan: winkel(rigYaw(cam) + live.pose.pan),
    tilt: klemme(live.pose.tilt, -90, 90),
    ...(focal !== undefined ? { focalLength: Math.round(focal * 10) / 10 } : {}),
  };
}

/**
 * Kameraliste mit aufgelegter Live-Pose. Ohne Live-Daten kommt dieselbe
 * Referenz zurueck — Memo-Abhaengigkeiten bleiben ruhig.
 */
export function applyLive(
  cameras: VenueCamera[],
  live: Record<number, LivePose>,
  optikOf: (cam: VenueCamera) => LiveOptik,
): VenueCamera[] {
  if (Object.keys(live).length === 0) return cameras;
  let changed = false;
  const out = cameras.map((c, i) => {
    const l = live[bridgeNumberFor(c, i)];
    if (!l) return c;
    changed = true;
    return { ...c, ...liveUpdates(c, l, optikOf(c)) };
  });
  return changed ? out : cameras;
}

/** Planer-Kamera-Id zu einer Bridge-Nummer (erste Treffer gewinnt). */
export function cameraIdForNumber(cameras: Pick<VenueCamera, 'id' | 'label' | 'bridgeCameraNumber'>[], num: number | null | undefined): string | null {
  if (num === null || num === undefined) return null;
  const i = cameras.findIndex((c, idx) => bridgeNumberFor(c, idx) === num);
  return i >= 0 ? cameras[i].id : null;
}

/** Planer-Busse aus einem Bridge-Mischer: Eingang n = Bridge-Kamera n. */
export function bussesFromMixer(
  cameras: Pick<VenueCamera, 'id' | 'label' | 'bridgeCameraNumber'>[],
  bus: Pick<MixerBus, 'program' | 'preview'>,
): { programId: string | null; previewId: string | null } {
  return {
    programId: bus.program > 0 ? cameraIdForNumber(cameras, bus.program) : null,
    previewId: bus.preview > 0 ? cameraIdForNumber(cameras, bus.preview) : null,
  };
}

/** Bridge-Eingangsnummer einer Planer-Kamera (0 = keine). */
export function inputForCamera(cameras: Pick<VenueCamera, 'id' | 'label' | 'bridgeCameraNumber'>[], id: string | null): number {
  if (!id) return 0;
  const i = cameras.findIndex((c) => c.id === id);
  return i >= 0 ? bridgeNumberFor(cameras[i], i) : 0;
}

/** Eingangsnamen fuer den Mischer der Bridge: so beschriftet das Pult seine Tasten. */
export function mixerInputs(cameras: Pick<VenueCamera, 'label' | 'bridgeCameraNumber'>[]): { id: number; name: string }[] {
  const seen = new Set<number>();
  const out: { id: number; name: string }[] = [];
  cameras.forEach((c, i) => {
    const id = bridgeNumberFor(c, i);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, name: c.label });
  });
  return out.sort((a, b) => a.id - b.id);
}
