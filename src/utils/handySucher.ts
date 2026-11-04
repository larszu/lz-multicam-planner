import type { Camera, FrameMask, Lens, VenueCamera } from '../types';
import { getCameraById, getEffectiveSensor } from '../data/cameras';
import { getLensById } from '../data/lenses';
import { computeFov } from './fov';
import { bildVDeg } from './bildwinkel';
import { kompatibleObjektive, objektivSet } from './sucherSchild';

/**
 * Handy als Sucher (#237): der Plan gibt Kameras und Objektivsaetze als Link
 * mit, das Handy zeigt den Ausschnitt ueber dem Livebild und gibt einen
 * Austauschcode zurueck. Alles laeuft im Link selbst — kein Server.
 */

export const PLANER_WEB_URL = 'https://larszu.github.io/lz-multicam-planner/';
export const SUCHER_PARAM = 'sucher';
const RUECK_PRAEFIX = 'MCV1.';
/** Darueber wird der QR-Code am Bildschirm zu dicht zum Scannen. */
export const QR_GRENZE = 1800;

const DEG = Math.PI / 180;

export interface PaketObjektiv { id: string; name: string; min: number; max: number; sq?: number }
export interface PaketKamera {
  id: string;
  label: string;
  farbe: string;
  nr: number;
  modell: string;
  format: string;
  /** Sensor je Objektiv aus dem Set: [Objektivindex, Breite mm, Hoehe mm]. */
  set: [number, number, number][];
  lens: number;
  f: number;
  ext: number;
  z: number;
  pan: number;
  tilt: number;
  dist: number;
  maske?: FrameMask;
}
export interface SucherPaket { v: 1; l: 'de' | 'en'; sel: number; o: PaketObjektiv[]; k: PaketKamera[] }

interface Katalog { customCameras: Camera[]; customLenses: Lens[]; bibliothek: readonly Lens[]; favoriten: string[] }

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function paketKamera(cam: VenueCamera, nr: number, kat: Katalog, objektive: PaketObjektiv[], index: Map<string, number>, maxSet?: number): PaketKamera | null {
  const camDef = getCameraById(cam.cameraId, kat.customCameras);
  const aktuell = getLensById(cam.lensId, kat.customLenses);
  if (!camDef || !aktuell) return null;
  let set = objektivSet(kompatibleObjektive(camDef, cam.activeMount, kat.customLenses, kat.bibliothek), kat.favoriten, cam.lensId);
  if (!set.some((l) => l.id === aktuell.id)) set = [aktuell, ...set];
  if (maxSet && set.length > maxSet) {
    const i = set.findIndex((l) => l.id === aktuell.id);
    const start = Math.max(0, Math.min(set.length - maxSet, i - Math.floor(maxSet / 2)));
    set = set.slice(start, start + maxSet);
  }
  const eintraege: [number, number, number][] = set.map((l) => {
    let i = index.get(l.id);
    if (i === undefined) {
      i = objektive.length;
      index.set(l.id, i);
      objektive.push({ id: l.id, name: `${l.manufacturer} ${l.model}`.trim(), min: l.focalLengthMin, max: l.focalLengthMax, ...(l.squeeze && l.squeeze !== 1 ? { sq: l.squeeze } : {}) });
    }
    const s = getEffectiveSensor(camDef, l, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount, cam.lensAdapterId);
    return [i, r2(s.widthMm), r2(s.heightMm)];
  });
  const sensor = getEffectiveSensor(camDef, aktuell, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount, cam.lensAdapterId);
  return {
    id: cam.id,
    label: cam.label,
    farbe: cam.color,
    nr,
    modell: `${camDef.manufacturer} ${camDef.model}`.trim(),
    format: sensor.name,
    set: eintraege,
    lens: index.get(aktuell.id)!,
    f: r1(cam.focalLength),
    ext: cam.extenderActive,
    z: r2(cam.z),
    pan: r1(cam.pan),
    tilt: r1(cam.tilt),
    dist: r1(cam.focusDistance),
    ...(cam.frameMask ? { maske: cam.frameMask } : {}),
  };
}

/** Paket fuer das Handy; `nur` beschraenkt auf eine Kamera, `maxSet` kuerzt die Objektivsaetze. */
export function paketBauen(cameras: VenueCamera[], kat: Katalog, sprache: 'de' | 'en', ausgewaehlt: string | null, opt: { nur?: string; maxSet?: number } = {}): SucherPaket {
  const o: PaketObjektiv[] = [];
  const index = new Map<string, number>();
  const k: PaketKamera[] = [];
  cameras.forEach((c, i) => {
    if (opt.nur && c.id !== opt.nur) return;
    const p = paketKamera(c, i + 1, kat, o, index, opt.maxSet);
    if (p) k.push(p);
  });
  return { v: 1, l: sprache, sel: Math.max(0, k.findIndex((c) => c.id === ausgewaehlt)), o, k };
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function vonBase64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function strom(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const antwort = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(t));
  return new Uint8Array(await antwort.arrayBuffer());
}

/** „z…" gepackt, „j…" ungepackt, falls der Browser nicht packen kann. */
export async function paketKodieren(p: SucherPaket): Promise<string> {
  const roh = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream === 'undefined') return `j${base64url(roh)}`;
  return `z${base64url(await strom(roh, new CompressionStream('deflate-raw')))}`;
}

export async function paketLesen(text: string): Promise<SucherPaket | null> {
  try {
    const s = text.replace(/^#/, '');
    const art = s[0];
    let roh = vonBase64url(s.slice(1));
    if (art === 'z') roh = await strom(roh, new DecompressionStream('deflate-raw'));
    else if (art !== 'j') return null;
    const p = JSON.parse(new TextDecoder().decode(roh)) as SucherPaket;
    return p?.v === 1 && Array.isArray(p.k) && Array.isArray(p.o) ? p : null;
  } catch {
    return null;
  }
}

/** Link zur Handy-Ansicht: im Web die eigene Adresse, in der Desktop-App die Webseite. */
export function sucherLink(code: string, ort: { protocol: string; origin: string; pathname: string } | null): string {
  const basis = ort && ort.protocol === 'https:' ? `${ort.origin}${ort.pathname}` : PLANER_WEB_URL;
  return `${basis}?${SUCHER_PARAM}#${code}`;
}

export function istSucherAufruf(search: string): boolean {
  return new URLSearchParams(search).has(SUCHER_PARAM);
}

// ── Bildwinkel ─────────────────────────────────────────────────────────────

export interface Winkel { hDeg: number; vDeg: number }

/** Ausschnitt der Planer-Kamera: horizontal aus Sensor und Brennweite, vertikal aus 16:9. */
export function zielWinkel(sensorW: number, sensorH: number, f: number, ext: number, sq = 1): Winkel {
  const fov = computeFov({ name: '', widthMm: sensorW, heightMm: sensorH, cropFactor: 1 }, f, 1, ext, sq);
  return { hDeg: fov.horizontalDeg, vDeg: bildVDeg(fov.horizontalDeg) };
}

/** Breite des Kleinbild-Aequivalents an der langen Seite eines 4:3-Sensors (Diagonale 43,27 mm). */
const KB_LANG_MM = 43.27 * 0.8;

/** Bildwinkel der langen Bildseite aus der Aequivalenzbrennweite der Handykamera. */
export function handyLangGrad(aequivMm: number): number {
  return (2 * Math.atan(KB_LANG_MM / (2 * aequivMm))) / DEG;
}

/** Eichung: Gegenstand der Breite `breiteM` in `abstandM` fuellt `anteil` der langen Bildseite. */
export function geeichtLangGrad(breiteM: number, abstandM: number, anteil: number): number | null {
  if (!(breiteM > 0) || !(abstandM > 0) || !(anteil > 0) || anteil > 1) return null;
  return (2 * Math.atan(breiteM / (2 * abstandM) / anteil)) / DEG;
}

/** Winkel des angezeigten Videos: die lange Seite traegt `langDeg`. */
export function videoWinkel(videoW: number, videoH: number, langDeg: number): Winkel {
  const tanLang = Math.tan((langDeg * DEG) / 2);
  const kurz = (2 * Math.atan((tanLang * Math.min(videoW, videoH)) / Math.max(videoW, videoH))) / DEG;
  return videoW >= videoH ? { hDeg: langDeg, vDeg: kurz } : { hDeg: kurz, vDeg: langDeg };
}

export interface ZielRahmen { w: number; h: number; zuWeit: boolean; sichtbar: number }

/** Rahmen des Ziel-Ausschnitts in einem Video von `breite` × `hoehe` Pixeln. */
export function zielRahmen(ziel: Winkel, video: Winkel, breite: number, hoehe: number): ZielRahmen {
  const t = (d: number) => Math.tan((d * DEG) / 2);
  const w = (breite * t(ziel.hDeg)) / t(video.hDeg);
  const h = (hoehe * t(ziel.vDeg)) / t(video.vDeg);
  const zuWeit = w > breite + 0.5 || h > hoehe + 0.5;
  const sichtbar = zuWeit ? (Math.min(w, breite) * Math.min(h, hoehe)) / (w * h) : 1;
  return { w, h, zuWeit, sichtbar };
}

// ── Lage des Handys ────────────────────────────────────────────────────────

/**
 * Blickrichtung der Rueckkamera aus `deviceorientation` (alpha/beta/gamma
 * nach W3C): Neigung nach oben positiv, Kurs im Uhrzeigersinn — gleich,
 * ob das Handy hoch oder quer gehalten wird.
 */
export function blickAusLage(alpha: number, beta: number, gamma: number): { neigung: number; kurs: number } {
  const [sA, cA, sB, cB, sG, cG] = [alpha, alpha, beta, beta, gamma, gamma].map((v, i) => (i % 2 ? Math.cos(v * DEG) : Math.sin(v * DEG)));
  const dx = -(cG * sA * sB + cA * sG);
  const dy = -(sA * sG - cA * cG * sB);
  const dz = -cB * cG;
  const neigung = Math.asin(Math.max(-1, Math.min(1, dz))) / DEG;
  const kurs = ((Math.atan2(dx, dy) / DEG) + 360) % 360;
  return { neigung, kurs };
}

/** Auf (-180, 180]. */
export function winkelNorm(d: number): number {
  const r = ((d % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

/** Plan-Pan aus dem Kurs: beim Nullen zeigte das Handy in die geplante Richtung. Plan und Kompass drehen beide im Uhrzeigersinn. */
export function panAusKurs(planPan: number, kursNull: number, kurs: number): number {
  return Math.round(winkelNorm(planPan + (kurs - kursNull)) * 10) / 10;
}

// ── Rueckweg ───────────────────────────────────────────────────────────────

export interface RueckDaten { cam: string; lens: string; f: number; z?: number; tilt?: number; pan?: number; notiz?: string }

export function rueckCodeBauen(d: RueckDaten): string {
  return RUECK_PRAEFIX + base64url(new TextEncoder().encode(JSON.stringify(d)));
}

/** Nimmt den Code auch mitten aus einem Text (Messenger, Mail). */
export function rueckCodeLesen(text: string): RueckDaten | null {
  const m = text.match(/MCV1\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(vonBase64url(m[1]))) as RueckDaten;
    if (typeof d?.cam !== 'string' || typeof d.lens !== 'string' || !(Number(d.f) > 0)) return null;
    const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    return { cam: d.cam, lens: d.lens, f: d.f, z: zahl(d.z), tilt: zahl(d.tilt), pan: zahl(d.pan), notiz: typeof d.notiz === 'string' ? d.notiz.slice(0, 500) : undefined };
  } catch {
    return null;
  }
}

/** Was der Code an der Kamera aendert. Ein unbekanntes Objektiv laesst Objektiv und Brennweite stehen. */
export function rueckAnwenden(cam: VenueCamera, d: RueckDaten, lens: Lens | undefined): Partial<VenueCamera> {
  const out: Partial<VenueCamera> = {};
  if (lens) {
    out.lensId = lens.id;
    out.focalLength = Math.min(lens.focalLengthMax, Math.max(lens.focalLengthMin, d.f));
  }
  if (d.z !== undefined) out.z = Math.max(0, d.z);
  if (d.tilt !== undefined) out.tilt = Math.max(-90, Math.min(90, d.tilt));
  if (d.pan !== undefined) out.pan = winkelNorm(d.pan);
  if (d.notiz?.trim()) out.notes = cam.notes?.trim() ? `${cam.notes.trim()}\n${d.notiz.trim()}` : d.notiz.trim();
  return out;
}
