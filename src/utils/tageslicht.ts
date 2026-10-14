// Tageslicht fuer die 3D-Ansicht: Zeitpunkt, Ort und die Marken fuer den
// Uhrzeit-Regler. Uhrzeit und Datum gelten in der Zeitzone des Rechners.
import { ORTE, sonnenzeiten, type OrtArt, type WetterArt, type Zeitraum } from '../avplan/scene3d';

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
