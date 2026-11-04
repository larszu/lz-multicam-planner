// Pixelkarte fuer den Medienserver: jede LED-Flaeche als Feld in Leinwand-
// Pixeln, mit Modulraster, Name, Aufloesung und Lage. Dieselbe Zeichnung
// liegt als Inhalt auf der Wand im 3D-Plan.
import { kontrastText } from './color';
import type { Leinwand, LeinwandFlaeche } from './ledWand';

/** Groesste Kantenlaenge, die ein Canvas ueberall sicher annimmt. */
export const PIXELKARTE_MAX_KANTE = 8192;

export function pixelkarteMassstab(breitePx: number, hoehePx: number, maxKante = PIXELKARTE_MAX_KANTE): number {
  const groesste = Math.max(1, breitePx, hoehePx);
  return Math.min(1, maxKante / groesste);
}

function zeichneFlaeche(ctx: CanvasRenderingContext2D, f: LeinwandFlaeche, s: number, ox: number, oy: number): void {
  const x = ox + f.x * s;
  const y = oy + f.y * s;
  const w = f.breite * s;
  const h = f.hoehe * s;
  ctx.fillStyle = f.farbe;
  ctx.fillRect(x, y, w, h);
  const mx = f.pxModulX * s;
  const my = f.pxModulY * s;
  if (mx >= 6 && my >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = x + mx; gx < x + w - 0.5; gx += mx) { ctx.moveTo(Math.round(gx) + 0.5, y); ctx.lineTo(Math.round(gx) + 0.5, y + h); }
    for (let gy = y + my; gy < y + h - 0.5; gy += my) { ctx.moveTo(x, Math.round(gy) + 0.5); ctx.lineTo(x + w, Math.round(gy) + 0.5); }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.006);
  ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();

  const schrift = Math.max(10, Math.min(h / 7, w / 12));
  ctx.fillStyle = kontrastText(f.farbe);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(schrift)}px sans-serif`;
  ctx.fillText(f.label, x + w / 2, y + h / 2 - schrift * 0.7);
  ctx.font = `500 ${Math.round(schrift * 0.6)}px sans-serif`;
  ctx.fillText(`${f.breite}×${f.hoehe} px`, x + w / 2, y + h / 2 + schrift * 0.35);
  ctx.fillText(`x ${f.x}, y ${f.y}`, x + w / 2, y + h / 2 + schrift * 1.05);
}

/** Ganze Leinwand: schwarzer Grund, alle Flaechen an ihrer Lage. */
export function zeichnePixelkarte(ctx: CanvasRenderingContext2D, lw: Leinwand, s: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, Math.max(1, Math.round(lw.breitePx * s)), Math.max(1, Math.round(lw.hoehePx * s)));
  for (const f of lw.flaechen) zeichneFlaeche(ctx, f, s, 0, 0);
}

export function pixelkarteCanvas(lw: Leinwand): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || lw.flaechen.length === 0) return null;
  const s = pixelkarteMassstab(lw.breitePx, lw.hoehePx);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(lw.breitePx * s));
  c.height = Math.max(1, Math.round(lw.hoehePx * s));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  zeichnePixelkarte(ctx, lw, s);
  return c;
}

/** Nur eine Flaeche — als Inhalt der Wand im 3D-Plan. */
export function flaecheCanvas(f: LeinwandFlaeche, maxKante = 2048): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const s = pixelkarteMassstab(f.breite, f.hoehe, maxKante);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(f.breite * s));
  c.height = Math.max(1, Math.round(f.hoehe * s));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  zeichneFlaeche(ctx, f, s, -f.x * s, -f.y * s);
  return c;
}
