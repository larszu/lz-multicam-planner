// Ziel einer Kamera (#230) und was die Optik dort zeigt (#231).
//
// Ein Ziel ist ein Punkt im Raum: Buehnenmitte, eine Person/ein Objekt oder
// ein gesetzter Punkt. Ohne eigenes Ziel gilt die Buehnenmitte — dieselbe
// Antwort fuer die Ausrichtung und fuer die abgeleiteten Werte.
import type { AimTarget, Lens, ReferencePerson, SensorSize, Stage, VenueCamera } from '../types';
import { effectiveCameraPos } from './camera';
import { computeFov } from './fov';
import { FRAMINGS } from './lensReach';

/** Bezugsgroesse fuer die Einstellungsgroesse. */
export const PERSON_HEIGHT_M = 1.7;

export interface ZielSzene {
  persons: ReferencePerson[];
  venue: { stages: Stage[] };
}

export interface ZielPunkt {
  x: number;
  y: number;
  z: number;
}

const rund1 = (v: number) => Math.round(v * 10) / 10;

export function zielPunkt(target: AimTarget | undefined, szene: ZielSzene): ZielPunkt | null {
  const t: AimTarget = target ?? { kind: 'stage' };
  if (t.kind === 'person') {
    const p = szene.persons.find((q) => q.id === t.id);
    return p ? { x: p.x, y: p.y, z: p.height / 2 } : null;
  }
  if (t.kind === 'point') {
    return Number.isFinite(t.x) && Number.isFinite(t.y) ? { x: t.x, y: t.y, z: PERSON_HEIGHT_M / 2 } : null;
  }
  const stages = szene.venue.stages;
  const st = (t.stageId && stages.find((s) => s.id === t.stageId)) || stages[0];
  if (!st) return null;
  return { x: st.x + st.width / 2, y: st.y + st.height / 2, z: (st.elevationM ?? 0) + PERSON_HEIGHT_M / 2 };
}

/** Pan und Tilt, mit denen die Kamera auf den Punkt zeigt; `null`, wenn sie darauf steht. */
export function ausrichtungAuf(cam: VenueCamera, punkt: ZielPunkt): { pan: number; tilt: number } | null {
  let c = cam;
  let out: { pan: number; tilt: number } | null = null;
  // Die Fahrposition haengt am Rig-Winkel, der ohne eigenen Wert dem Pan
  // folgt — zwei Durchlaeufe genuegen, bis der Pan steht.
  for (let i = 0; i < 3; i++) {
    const pos = effectiveCameraPos(c);
    const dx = punkt.x - pos.x;
    const dy = punkt.y - pos.y;
    const flach = Math.hypot(dx, dy);
    if (flach < 0.01) return out;
    out = {
      pan: rund1((Math.atan2(dy, dx) * 180) / Math.PI),
      tilt: rund1((Math.atan2(punkt.z - c.z, flach) * 180) / Math.PI),
    };
    c = { ...c, pan: out.pan };
  }
  return out;
}

/** Richtet alle folgenden Kameras auf ihr Ziel aus; unveraenderte bleiben dasselbe Objekt. */
export function zielFolgen(cameras: VenueCamera[], szene: ZielSzene): VenueCamera[] {
  let geaendert = false;
  const next = cameras.map((c) => {
    if (!c.aimFollow) return c;
    const punkt = zielPunkt(c.aimTarget, szene);
    const a = punkt && ausrichtungAuf(c, punkt);
    if (!a || (Math.abs(a.pan - c.pan) < 0.05 && Math.abs(a.tilt - c.tilt) < 0.05)) return c;
    geaendert = true;
    return { ...c, pan: a.pan, tilt: a.tilt };
  });
  return geaendert ? next : cameras;
}

export type ShotSize = 'wide' | 'full' | 'medium' | 'close' | 'detail';

const STUFEN: ShotSize[] = ['wide', 'full', 'medium', 'close', 'detail'];

/** Einstellungsgroesse nach Bildhoehe gegen 1,70 m Personenhoehe — Grenzen in der Mitte zwischen den Stufen. */
export function shotSize(imageHeightM: number): ShotSize {
  const anteil = imageHeightM / PERSON_HEIGHT_M;
  for (let i = 0; i < STUFEN.length - 1; i++) {
    const grenze = Math.sqrt(FRAMINGS[STUFEN[i]].factor * FRAMINGS[STUFEN[i + 1]].factor);
    if (anteil >= grenze) return STUFEN[i];
  }
  return 'detail';
}

export interface AmZiel {
  distanceM: number;
  horizontalDeg: number;
  widthM: number;
  heightM: number;
  size: ShotSize;
}

/** Abstand zum Ziel und Bildausschnitt dort. */
export function amZiel(
  cam: VenueCamera,
  sensor: SensorSize,
  squeeze: number | undefined,
  punkt: ZielPunkt,
): AmZiel {
  const pos = effectiveCameraPos(cam);
  const distanceM = Math.hypot(punkt.x - pos.x, punkt.y - pos.y, punkt.z - cam.z);
  const fov = computeFov(sensor, cam.focalLength, distanceM, cam.extenderActive, squeeze ?? 1);
  return {
    distanceM,
    horizontalDeg: fov.horizontalDeg,
    widthM: fov.imageWidthAtDistance,
    heightM: fov.imageHeightAtDistance,
    size: shotSize(fov.imageHeightAtDistance),
  };
}

export const SHOT_SIZE_EN: Readonly<Record<ShotSize, string>> = {
  wide: 'Wide shot',
  full: 'Full figure',
  medium: 'Medium shot',
  close: 'Close-up',
  detail: 'Detail',
};

export function shotSizeLabel(t: (key: string, en: string) => string, s: ShotSize): string {
  switch (s) {
    case 'wide': return t('shotSize.wide', SHOT_SIZE_EN.wide);
    case 'full': return t('shotSize.full', SHOT_SIZE_EN.full);
    case 'medium': return t('shotSize.medium', SHOT_SIZE_EN.medium);
    case 'close': return t('shotSize.close', SHOT_SIZE_EN.close);
    case 'detail': return t('shotSize.detail', SHOT_SIZE_EN.detail);
  }
}

/** Ob die Linse eine Festbrennweite ist (Schieber gesperrt, #229). */
export function istFestbrennweite(lens: Pick<Lens, 'focalLengthMin' | 'focalLengthMax'> | null | undefined): boolean {
  return !!lens && lens.focalLengthMin === lens.focalLengthMax;
}

/**
 * Worauf scharfgestellt wird (#225): dieselben Ziele wie fuer die Ausrichtung
 * plus die vordere Kante einer Buehne.
 */
export type FokusZiel = AimTarget | { kind: 'stage-edge'; stageId: string };

/**
 * Wo die optische Achse im Grundriss in die Buehne eintritt — die Kante, die
 * der Kamera in Blickrichtung zugewandt ist. Waagerechter Lauf ab Kamera in
 * Metern; `null`, wenn die Achse die Buehne verfehlt oder die Kamera darauf steht.
 */
export function laufBisKante(cam: VenueCamera, st: Stage): number | null {
  const pos = effectiveCameraPos(cam);
  const pan = (cam.pan * Math.PI) / 180;
  const d = [Math.cos(pan), Math.sin(pan)];
  const o = [pos.x, pos.y];
  const lo = [st.x, st.y];
  const hi = [st.x + st.width, st.y + st.height];
  let ein = -Infinity;
  let aus = Infinity;
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    const a = (lo[i] - o[i]) / d[i];
    const b = (hi[i] - o[i]) / d[i];
    ein = Math.max(ein, Math.min(a, b));
    aus = Math.min(aus, Math.max(a, b));
  }
  if (ein > aus || ein <= 0) return null;
  return ein;
}

/**
 * Fokusentfernung zum Ziel. Buehnenkante: Abstand Kamera → Schnittpunkt der
 * optischen Achse mit der senkrechten Ebene ueber der Kante, also entlang der
 * Achse (so ist `focusDistance` gemeint). Sonst: Abstand zum Zielpunkt.
 */
export function fokusEntfernung(cam: VenueCamera, ziel: FokusZiel, szene: ZielSzene): number | null {
  if (ziel.kind === 'stage-edge') {
    const st = szene.venue.stages.find((s) => s.id === ziel.stageId);
    const lauf = st ? laufBisKante(cam, st) : null;
    if (lauf === null) return null;
    const cosTilt = Math.cos((cam.tilt * Math.PI) / 180);
    return cosTilt < 0.05 ? null : lauf / cosTilt;
  }
  const punkt = zielPunkt(ziel, szene);
  if (!punkt) return null;
  const pos = effectiveCameraPos(cam);
  return Math.hypot(punkt.x - pos.x, punkt.y - pos.y, punkt.z - cam.z);
}
