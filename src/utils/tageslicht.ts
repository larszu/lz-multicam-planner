// Tageslicht fuer die 3D-Ansicht: Zeitpunkt, Ort und die Marken fuer den
// Uhrzeit-Regler. Uhrzeit und Datum gelten in der Zeitzone des Rechners.
import { ORTE, WETTER, sonnenstand, sonnenzeiten, tagesphase, type OrtArt, type Tagesphase, type WetterArt, type Zeitraum } from '../avplan/scene3d';

export interface HimmelPrefs {
  /** JJJJ-MM-TT; leer = heute. */
  datum: string;
  /** Minuten seit Mitternacht. */
  minuten: number;
  ort: OrtArt | 'eigen';
  lat: number;
  lon: number;
  /** Wohin Norden im Grundriss zeigt, im Uhrzeigersinn von oben (90 = rechts). */
  nordDeg: number;
  wetter: WetterArt;
}

export const HIMMEL_STANDARD: HimmelPrefs = {
  datum: '',
  minuten: 15 * 60,
  ort: 'berlin',
  lat: ORTE.berlin.lat,
  lon: ORTE.berlin.lon,
  nordDeg: 0,
  wetter: 'klar',
};

/**
 * Lux je Szeneneinheit. Die Showscheinwerfer sind auf Belichtung ≈ 1 gebaut
 * (eine Einheit ≈ ein gut ausgeleuchtetes Gesicht). Physikalisch (1 lx = 1)
 * saehe man sie neben 100 000 lx Sonne nie; mit 8000 lx je Einheit steht die
 * Mittagssonne bei ~12 Einheiten, die Belichtung bei ~0,2 — eine Bühnen-
 * Front bleibt als Licht erkennbar. Zusammen mit `TAG_BELICHTUNG_MAX`
 * wird die Nacht genau so belichtet wie der Showlook in der Halle.
 */
export const LUX_PRO_EINHEIT = 8000;

/** Die Kamera oeffnet nie weiter als im Showlook; darunter wird es dunkel wie in echt. */
export const TAG_BELICHTUNG_MAX = 1.05;

export function himmelOrt(p: HimmelPrefs): { lat: number; lon: number } {
  return p.ort === 'eigen' ? { lat: p.lat, lon: p.lon } : ORTE[p.ort];
}

export function himmelTag(p: HimmelPrefs, jetzt = new Date()): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.datum);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
}

export function himmelZeitpunkt(p: HimmelPrefs, jetzt = new Date()): Date {
  const d = himmelTag(p, jetzt);
  d.setMinutes(Math.round(p.minuten));
  return d;
}

const minutenVon = (tag: Date, d: Date) => Math.round((d.getTime() - tag.getTime()) / 60000);
const spanne = (tag: Date, z: Zeitraum): [number, number] | null => (z ? [minutenVon(tag, z[0]), minutenVon(tag, z[1])] : null);

export interface ZeitMarken {
  aufgang: number | null;
  untergang: number | null;
  gold: [number, number][];
  blau: [number, number][];
}

/** Auf-/Untergang, goldene und blaue Stunde als Minuten des gewaehlten Tages. */
export function zeitMarken(p: HimmelPrefs, jetzt = new Date()): ZeitMarken {
  const tag = himmelTag(p, jetzt);
  const { lat, lon } = himmelOrt(p);
  const z = sonnenzeiten(new Date(tag.getTime() + 12 * 3600000), lat, lon);
  const liste = (a: Zeitraum, b: Zeitraum) => [spanne(tag, a), spanne(tag, b)].filter((x): x is [number, number] => !!x);
  return {
    aufgang: z.aufgang ? minutenVon(tag, z.aufgang) : null,
    untergang: z.untergang ? minutenVon(tag, z.untergang) : null,
    gold: liste(z.goldeneStunde.morgens, z.goldeneStunde.abends),
    blau: liste(z.blaueStunde.morgens, z.blaueStunde.abends),
  };
}

export function uhrzeit(minuten: number): string {
  const m = ((Math.round(minuten) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const zahl = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

/** Tageslicht aus einer Projektdatei; unbrauchbare Felder fallen auf den Standard. */
export function himmelAusDatei(roh: unknown): HimmelPrefs | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const o = roh as Record<string, unknown>;
  const ort = o.ort === 'eigen' || (typeof o.ort === 'string' && o.ort in ORTE) ? (o.ort as HimmelPrefs['ort']) : HIMMEL_STANDARD.ort;
  return {
    datum: typeof o.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.datum) ? o.datum : '',
    minuten: zahl(o.minuten, 0, 1440) ?? HIMMEL_STANDARD.minuten,
    ort,
    lat: zahl(o.lat, -90, 90) ?? HIMMEL_STANDARD.lat,
    lon: zahl(o.lon, -180, 180) ?? HIMMEL_STANDARD.lon,
    nordDeg: zahl(o.nordDeg, 0, 360) ?? 0,
    wetter: typeof o.wetter === 'string' && o.wetter in WETTER ? (o.wetter as WetterArt) : HIMMEL_STANDARD.wetter,
  };
}

/** Himmelsrichtung im Grundriss: Plan-x nach rechts, Plan-y nach unten (Norden oben bei nordDeg 0). */
export function planRichtung(azimutDeg: number, nordDeg: number): { x: number; y: number } {
  const b = ((nordDeg + azimutDeg) * Math.PI) / 180;
  return { x: Math.sin(b), y: -Math.cos(b) };
}

/** Schattenlaenge je Meter Objekthoehe; `null`, solange die Sonne unter dem Horizont steht. */
export function schattenProMeter(elevationDeg: number): number | null {
  return elevationDeg > 0.5 ? 1 / Math.tan((elevationDeg * Math.PI) / 180) : null;
}

export interface BahnPunkt {
  minuten: number;
  azimutDeg: number;
  elevationDeg: number;
  phase: Tagesphase;
}

/** Sonnenbahn des gewaehlten Tages ueber dem Horizont, alle `schritt` Minuten. */
export function sonnenBahn(p: HimmelPrefs, schritt = 10, jetzt = new Date()): BahnPunkt[] {
  const tag = himmelTag(p, jetzt);
  const { lat, lon } = himmelOrt(p);
  const out: BahnPunkt[] = [];
  for (let m = 0; m <= 1440; m += schritt) {
    const s = sonnenstand(new Date(tag.getTime() + m * 60000), lat, lon);
    if (s.elevationDeg > 0) out.push({ minuten: m, azimutDeg: s.azimutDeg, elevationDeg: s.elevationDeg, phase: tagesphase(s.elevationDeg) });
  }
  return out;
}

/** Stand der Sonne zur gewaehlten Uhrzeit. */
export function sonneJetzt(p: HimmelPrefs, jetzt = new Date()): { azimutDeg: number; elevationDeg: number; phase: Tagesphase } {
  const { lat, lon } = himmelOrt(p);
  const s = sonnenstand(himmelZeitpunkt(p, jetzt), lat, lon);
  return { azimutDeg: s.azimutDeg, elevationDeg: s.elevationDeg, phase: tagesphase(s.elevationDeg) };
}
