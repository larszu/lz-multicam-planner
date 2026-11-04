import { kontrastText } from './color';
import type { Rechteck } from './rahmenmaske';

/**
 * Standbild der Multiview-Wand als PNG (#220, #236): Preview und Program
 * oben, darunter alle Kacheln, unten eine Fusszeile mit Projekt, Datum,
 * Bildrate und Aufloesung je Kachel.
 */
export const BILDRATEN = [23.976, 24, 25, 29.97, 50, 59.94] as const;

/** Aufloesung der Kacheln relativ zu ihrer Groesse am Schirm. */
export const KACHEL_AUFLOESUNGEN = [1, 0.5, 0.25] as const;
export type KachelAufloesung = (typeof KACHEL_AUFLOESUNGEN)[number];

export function formatBildrate(fps: number): string {
  return Number.isInteger(fps) ? String(fps) : String(Math.round(fps * 1000) / 1000);
}

const ABSTAND = 8;
const FUSS_H = 36;

export interface WandLayout {
  breite: number;
  hoehe: number;
  pvw: Rechteck;
  pgm: Rechteck;
  kacheln: Rechteck[];
  fuss: Rechteck;
}

export function wandLayout(anzahl: number, breite = 1920, spalten = Math.min(4, Math.max(1, anzahl))): WandLayout {
  const g = ABSTAND;
  const busW = (breite - 3 * g) / 2;
  const busH = (busW * 9) / 16;
  const pvw = { x: g, y: g, w: busW, h: busH };
  const pgm = { x: 2 * g + busW, y: g, w: busW, h: busH };
  const kW = (breite - (spalten + 1) * g) / spalten;
  const kH = (kW * 9) / 16;
  const oben = 2 * g + busH;
  const kacheln = Array.from({ length: Math.max(0, anzahl) }, (_, i) => ({
    x: g + (i % spalten) * (kW + g),
    y: oben + Math.floor(i / spalten) * (kH + g),
    w: kW,
    h: kH,
  }));
  const reihen = Math.ceil(Math.max(0, anzahl) / spalten);
  const fussY = oben + reihen * (kH + g);
  return { breite, hoehe: fussY + FUSS_H, pvw, pgm, kacheln, fuss: { x: 0, y: fussY, w: breite, h: FUSS_H } };
}

function zweistellig(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDatum(d: Date): string {
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())} ${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`;
}

export interface Fussdaten { projekt: string; datum: Date; fps: number; kachelW: number; kachelH: number }

export function fusszeile(
  t: (key: string, en: string) => string,
  f: Fussdaten,
): string {
  return [
    f.projekt,
    formatDatum(f.datum),
    `${formatBildrate(f.fps)} fps`,
    `${t('multiview.png.tile', 'Tile')} ${Math.round(f.kachelW)}×${Math.round(f.kachelH)} px`,
  ].join(' · ');
}

export type Tally = 'pgm' | 'pvw' | null;

export interface WandKachel {
  bild: CanvasImageSource | null;
  nummer: number;
  farbe: string;
  label: string;
  tally: Tally;
}

const TALLY_FARBE = { pgm: '#e5322d', pvw: '#1fa64a' } as const;

function zeichneFenster(ctx: CanvasRenderingContext2D, r: Rechteck, k: WandKachel | null, titel: string) {
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (k?.bild) ctx.drawImage(k.bild, r.x, r.y, r.w, r.h);
  const leiste = Math.max(16, Math.round(r.h * 0.09));
  ctx.fillStyle = k?.tally ? TALLY_FARBE[k.tally] : 'rgba(0,0,0,0.65)';
  ctx.fillRect(r.x, r.y + r.h - leiste, r.w, leiste);
  const rad = leiste * 0.42;
  let textX = r.x + 6;
  if (k) {
    ctx.fillStyle = k.farbe;
    ctx.beginPath();
    ctx.arc(r.x + 6 + rad, r.y + r.h - leiste / 2, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kontrastText(k.farbe);
    ctx.font = `700 ${Math.round(rad * 1.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(k.nummer), r.x + 6 + rad, r.y + r.h - leiste / 2 + 1);
    textX += rad * 2 + 6;
  }
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(leiste * 0.6)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(titel, textX, r.y + r.h - leiste / 2 + 1);
  if (k?.tally) {
    ctx.strokeStyle = TALLY_FARBE[k.tally];
    ctx.lineWidth = 4;
    ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  }
}

export function zeichneWand(args: {
  layout: WandLayout;
  pvw: { kachel: WandKachel | null; titel: string };
  pgm: { kachel: WandKachel | null; titel: string };
  kacheln: WandKachel[];
  fuss: string;
}): HTMLCanvasElement {
  const { layout } = args;
  const out = document.createElement('canvas');
  out.width = Math.round(layout.breite);
  out.height = Math.round(layout.hoehe);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.fillStyle = '#101216';
  ctx.fillRect(0, 0, out.width, out.height);
  zeichneFenster(ctx, layout.pvw, args.pvw.kachel && { ...args.pvw.kachel, tally: 'pvw' }, args.pvw.titel);
  zeichneFenster(ctx, layout.pgm, args.pgm.kachel && { ...args.pgm.kachel, tally: 'pgm' }, args.pgm.titel);
  args.kacheln.forEach((k, i) => {
    const r = layout.kacheln[i];
    if (r) zeichneFenster(ctx, r, k, k.label);
  });
  ctx.fillStyle = '#c9ccd2';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(args.fuss, 12, layout.fuss.y + layout.fuss.h / 2);
  return out;
}

export function pngSpeichern(canvas: HTMLCanvasElement, dateiname: string): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function dateinameTeil(s: string): string {
  return s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'multicam';
}
