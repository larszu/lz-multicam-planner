// Kamerapositionen als Text, Markdown oder CSV — hin und zurueck (#232).
//
// Spaltenfolge ist fest: Name, X, Y, Hoehe, Kamera, Objektiv, Brennweite,
// Montage. Gelesen wird nach Position, nicht nach Kopfzeile — die Kopfzeile
// steht in der Sprache dessen, der kopiert hat.
import type { Camera, CameraMountType, Lens } from '../types';

export type PositionsFormat = 'text' | 'markdown' | 'csv';

export interface PositionZeile {
  name: string;
  x: number;
  y: number;
  z: number;
  camera: string;
  lens: string;
  focalLength: number | null;
  rig: string;
}

const LEER = '–';

const zahl = (v: number, stellen: number) => String(Number(v.toFixed(stellen)));
const feld = (s: string) => s.trim() || LEER;

export function positionenAlsText(zeilen: PositionZeile[], format: PositionsFormat, kopf: readonly string[]): string {
  const werte = zeilen.map((z) => [
    feld(z.name),
    zahl(z.x, 2),
    zahl(z.y, 2),
    zahl(z.z, 2),
    feld(z.camera),
    feld(z.lens),
    z.focalLength === null ? LEER : zahl(z.focalLength, 1),
    feld(z.rig),
  ]);
  if (format === 'csv') {
    const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    return [kopf, ...werte].map((r) => r.map(q).join(';')).join('\n');
  }
  if (format === 'markdown') {
    const z = (r: readonly string[]) => `| ${r.map((s) => s.replace(/\|/g, '/')).join(' | ')} |`;
    return [z(kopf), z(kopf.map(() => '---')), ...werte.map(z)].join('\n');
  }
  return werte
    .map(([name, x, y, h, cam, lens, f, rig]) => `${name} — X ${x} m · Y ${y} m · H ${h} m · ${cam} · ${lens} · ${f === LEER ? f : `${f} mm`} · ${rig}`)
    .join('\n');
}

function leseZahl(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim().replace(/\s*(mm|m)$/i, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const ohneLeer = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t === LEER || t === '-' ? '' : t;
};

function ausZellen(zellen: string[]): PositionZeile | null {
  const [name, x, y, z, camera, lens, f, rig] = zellen;
  const nx = leseZahl(x);
  const ny = leseZahl(y);
  const nz = leseZahl(z);
  const n = ohneLeer(name);
  if (!n || nx === null || ny === null || nz === null) return null;
  return { name: n, x: nx, y: ny, z: nz, camera: ohneLeer(camera), lens: ohneLeer(lens), focalLength: leseZahl(f), rig: ohneLeer(rig) };
}

function csvZeile(zeile: string, trenner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < zeile.length; i++) {
    const ch = zeile[i];
    if (inQ) {
      if (ch === '"' && zeile[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === trenner) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const TEXT_ZEILE = /^(.+?)\s+[—–-]\s+X\s+(-?[\d.,]+)\s*m\s+·\s+Y\s+(-?[\d.,]+)\s*m\s+·\s+H\s+(-?[\d.,]+)\s*m(?:\s+·\s+(.*))?$/;

/** Liest alle drei Formate; Zeilen ohne Name und Zahlen (Kopfzeile, Trenner) fallen weg. */
export function positionenLesen(text: string): PositionZeile[] {
  const out: PositionZeile[] = [];
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (!zeile) continue;
    let z: PositionZeile | null;
    const m = TEXT_ZEILE.exec(zeile);
    if (m) {
      const rest = (m[5] ?? '').split(/\s+·\s+/);
      z = ausZellen([m[1], m[2], m[3], m[4], ...rest]);
    } else if (zeile.startsWith('|')) {
      z = ausZellen(zeile.replace(/^\||\|$/g, '').split('|'));
    } else {
      const trenner = zeile.includes('\t') ? '\t' : zeile.includes(';') ? ';' : ',';
      z = ausZellen(csvZeile(zeile, trenner));
    }
    if (z) out.push(z);
  }
  return out;
}

export interface PositionUebernahme {
  name: string;
  x: number;
  y: number;
  z: number;
  cameraId?: string;
  lensId?: string;
  focalLength?: number;
  mountType?: CameraMountType;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Namen aus dem Text auf Katalogeintraege abbilden; Unbekanntes bleibt weg. */
export function aufloesen(
  zeile: PositionZeile,
  katalog: { cameras: readonly Camera[]; lenses: readonly Lens[]; rigNamen: (typ: CameraMountType) => string[]; rigTypen: readonly CameraMountType[] },
): PositionUebernahme {
  const cam = zeile.camera
    ? katalog.cameras.find((c) => norm(`${c.manufacturer} ${c.model}`) === norm(zeile.camera) || norm(c.model) === norm(zeile.camera))
    : undefined;
  const lens = zeile.lens
    ? katalog.lenses.find((l) => norm(`${l.manufacturer} ${l.model}`) === norm(zeile.lens) || norm(l.model) === norm(zeile.lens))
    : undefined;
  const rig = zeile.rig
    ? katalog.rigTypen.find((r) => norm(r) === norm(zeile.rig) || katalog.rigNamen(r).some((n) => norm(n) === norm(zeile.rig)))
    : undefined;
  return {
    name: zeile.name,
    x: zeile.x,
    y: zeile.y,
    z: zeile.z,
    ...(cam ? { cameraId: cam.id } : {}),
    ...(lens ? { lensId: lens.id } : {}),
    ...(zeile.focalLength !== null ? { focalLength: zeile.focalLength } : {}),
    ...(rig ? { mountType: rig } : {}),
  };
}
