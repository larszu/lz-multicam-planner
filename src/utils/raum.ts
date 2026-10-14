// Raum in MultiCam: Publikumsflaechen und Videowaende anlegen, Projekte
// abwaertskompatibel einlesen. Das Schema und die Platzrechnung kommen aus
// `@avplan/floorplan`; hier stehen nur MultiCams Vorgaben.
import { raumAus, sitzblockNormal, sitzblockPlaetzeListe, sitzblockTiefe, type VenueSeatingBlock, type VenueVideoWall } from '../avplan/floorplan';
import { poseFuer, type PublikumsPlatz, type TribuenenForm } from '../avplan/scene3d';
import type { Stage, Venue } from '../types';
import { stageTopZ } from './stageBody';
import { audienceSeats, type AudienceInput } from './view3dScene';

const RAUM_SCHLUESSEL = ['ceilingHeightM', 'floorMaterial', 'wallMaterial', 'seatingBlocks', 'videoWalls'] as const;

/**
 * Venue aus einer Projektdatei: bekannte Felder wie gelesen, Raum-Felder nur,
 * wenn sie brauchbar sind. Eine Datei von vor den Raum-Feldern ergibt genau
 * den alten Stand.
 */
export function venueAusDatei(roh: Venue, stages: Stage[]): Venue {
  const basis: Record<string, unknown> = { ...roh };
  for (const k of RAUM_SCHLUESSEL) delete basis[k];
  return { ...(basis as unknown as Venue), stages, ...raumAus(roh) };
}

/** Groesste Buehne — an ihr richten sich neue Flaechen und Waende aus. */
export function hauptbuehne(venue: Venue): Stage | null {
  return venue.stages.reduce<Stage | null>((best, s) => (!best || s.width * s.height > best.width * best.height ? s : best), null);
}

let zaehler = 0;
export function raumId(art: 'seat' | 'wall'): string {
  zaehler++;
  return `${art}-${Date.now().toString(36)}-${zaehler}`;
}

/**
 * Neue Publikumsflaeche: vor der Hauptbuehne, mit Blick auf sie, so breit
 * wie die Buehne mal 1,6 und so tief, wie der Raum hergibt. Sitzend als
 * Vorgabe; umschalten ist eine Entscheidung, keine Pflicht.
 */
export function neueSitzflaeche(venue: Venue, standing = false): VenueSeatingBlock {
  const b = hauptbuehne(venue);
  const spacing = 0.9;
  if (!b) {
    const rows = Math.max(2, Math.min(20, Math.floor((venue.heightM * 0.5) / spacing)));
    return { id: raumId('seat'), label: '', x: venue.widthM / 2, y: venue.heightM / 2, width: Math.max(2, venue.widthM * 0.6), rows, rowSpacingM: spacing, standing };
  }
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const obenBuehne = cy < venue.heightM / 2;
  const abstand = 2.5;
  const frei = obenBuehne ? venue.heightM - (b.y + b.height) - abstand - 1 : b.y - abstand - 1;
  const rows = Math.max(2, Math.min(30, Math.floor(Math.max(2, frei) / spacing)));
  const tiefe = rows * spacing;
  const width = Math.max(2, Math.min(venue.widthM - 2, b.width * 1.6));
  const y = obenBuehne ? b.y + b.height + abstand + tiefe / 2 : b.y - abstand - tiefe / 2;
  return { id: raumId('seat'), label: '', x: cx, y, width, rows, rowSpacingM: spacing, rotationDeg: obenBuehne ? 0 : 180, standing };
}

/** Neue Videowand: hinter der Hauptbuehne, Bild zum Publikum, Unterkante 1 m ueber dem Podest. */
export function neueVideowand(venue: Venue): VenueVideoWall {
  const b = hauptbuehne(venue);
  if (!b) return { id: raumId('wall'), label: '', x: venue.widthM / 2, y: 0.5, widthM: 6, heightM: 3.375, bottomM: 1, rotationDeg: 0 };
  const obenBuehne = b.y + b.height / 2 < venue.heightM / 2;
  const widthM = Math.max(2, Math.min(24, Math.round(b.width * 0.6 * 2) / 2));
  return {
    id: raumId('wall'),
    label: '',
    x: b.x + b.width / 2,
    y: obenBuehne ? b.y + 0.3 : b.y + b.height - 0.3,
    widthM,
    heightM: Math.round((widthM * 9) / 16 * 100) / 100,
    bottomM: Math.round((stageTopZ(b) + 1) * 100) / 100,
    rotationDeg: obenBuehne ? 0 : 180,
  };
}

/** Tiefe einer Flaeche fuer Anzeige und Griffe. */
export const flaechenTiefe = sitzblockTiefe;

export interface PublikumsBild {
  menschen: PublikumsPlatz[];
  sitze: Pick<PublikumsPlatz, 'x' | 'y' | 'z' | 'blickDeg'>[];
  tribuenen: TribuenenForm[];
}

/** So viel Platz bleibt um Kamera und Referenzperson frei. */
const FREI_UM_KAMERA_M = 1.1;
const FREI_UM_PERSON_M = 0.7;

/**
 * Wer in der 3D-Ansicht sitzt und steht. Mit Publikumsflaechen: deren
 * Plaetze, belegt nach Anteil; ohne: die bisherige Fuellung der freien
 * Flaeche als stehende Menge. Um Kameras und gesetzte Personen bleibt Platz —
 * sonst stuende jemand im Stativ.
 */
export function publikumsBild(input: AudienceInput & { blocks?: VenueSeatingBlock[] }): PublikumsBild {
  const frei = (x: number, y: number) =>
    !input.cameras.some((c) => Math.hypot(c.x - x, c.y - y) < FREI_UM_KAMERA_M)
    && !input.persons.some((p) => Math.hypot(p.x - x, p.y - y) < FREI_UM_PERSON_M);
  const blocks = input.blocks ?? [];
  if (blocks.length === 0) {
    const main = input.stages.reduce<AudienceInput['stages'][number] | null>((b, s) => (!b || s.width * s.height > b.width * b.height ? s : b), null);
    const ziel = main ? { x: main.x + main.width / 2, y: main.y + main.height / 2 } : { x: input.widthM / 2, y: 0 };
    return {
      menschen: audienceSeats(input).map((s) => ({
        x: s.x, y: s.y, z: 0, r: s.r,
        blickDeg: (Math.atan2(ziel.y - s.y, ziel.x - s.x) * 180) / Math.PI,
        pose: poseFuer(true, s.r, 0.1),
      })),
      sitze: [],
      tribuenen: [],
    };
  }
  const bild: PublikumsBild = { menschen: [], sitze: [], tribuenen: [] };
  for (const roh of blocks) {
    const b = sitzblockNormal(roh);
    const plaetze = sitzblockPlaetzeListe(b);
    if (!b.standing) bild.tribuenen.push(b);
    for (const p of plaetze) {
      if (!frei(p.x, p.y)) continue;
      if (!b.standing) bild.sitze.push(p);
      if (p.belegt) bild.menschen.push({ x: p.x, y: p.y, z: p.z, blickDeg: p.blickDeg, r: p.r, pose: poseFuer(b.standing, p.r, 0.18) });
    }
  }
  return bild;
}

/**
 * Wohin eine neue Person ohne Ortsangabe kommt: auf die Hauptbuehne,
 * nebeneinander statt uebereinander. Ohne Buehne in die Raummitte.
 */
export function platzFuerPerson(venue: Venue, schon: number): { x: number; y: number } {
  const b = hauptbuehne(venue);
  if (!b || (Math.max(b.width, b.height) > 30 && stageTopZ(b) <= 0.2)) return { x: venue.widthM / 2, y: venue.heightM / 2 };
  const schritt = Math.min(1.6, b.width / 6);
  const k = schon % 7;
  const seite = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2);
  return {
    x: Math.min(b.x + b.width - 0.4, Math.max(b.x + 0.4, b.x + b.width / 2 + seite * schritt)),
    y: b.y + b.height * (0.5 + 0.12 * Math.floor(schon / 7)),
  };
}
