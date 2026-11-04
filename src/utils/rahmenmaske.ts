import type { FrameMask, SensorSize, VenueCamera } from '../types';
import { BILD_SEITENVERHAELTNIS } from './bildwinkel';

/**
 * Rahmenmasken im 16:9-Bild (#224): welcher Teil des Bildes bleibt, wenn das
 * Ergebnis hochkant, quadratisch oder im Kinoformat ausgespielt wird.
 * Dieselben Masken gehoeren als Angabe auch zur Kamera (#217,
 * `VenueCamera.frameMask`) — getrennt vom Aufnahmeformat.
 */
export type Rahmenmaske = 'none' | FrameMask;

/** Die Auswahl im Kamerablick. */
export const RAHMENMASKEN: FrameMask[] = ['9:16', '4:5', '1:1', '2.39'];

/** Die Auswahl je Kamera. */
export const FRAME_MASKS: readonly FrameMask[] = ['2.39', '2.00', '1.85', '4:3', '1:1', '4:5', '9:16'];

/** Breite durch Hoehe. */
export function maskenVerhaeltnis(m: FrameMask): number {
  const [w, h] = m.split(':').map(Number);
  return h ? w / h : w;
}

export interface Rechteck { x: number; y: number; w: number; h: number }

/** Groesstes mittiges Rechteck mit diesem Seitenverhaeltnis in W × H. */
export function maskenRechteck(W: number, H: number, verhaeltnis: number): Rechteck {
  if (!(W > 0) || !(H > 0) || !(verhaeltnis > 0)) return { x: 0, y: 0, w: Math.max(0, W), h: Math.max(0, H) };
  if (verhaeltnis >= W / H) {
    const h = W / verhaeltnis;
    return { x: 0, y: (H - h) / 2, w: W, h };
  }
  const w = H * verhaeltnis;
  return { x: (W - w) / 2, y: 0, w, h: H };
}

/** Abgedunkelter Rand ausserhalb der Maske, duenne Linie an der Kante. */
export function zeichneRahmenmaske(ctx: CanvasRenderingContext2D, W: number, H: number, m: Rahmenmaske): void {
  if (m === 'none') return;
  const r = maskenRechteck(W, H, maskenVerhaeltnis(m));
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, r.y);
  ctx.fillRect(0, r.y + r.h, W, H - r.y - r.h);
  ctx.fillRect(0, r.y, r.x, r.h);
  ctx.fillRect(r.x + r.w, r.y, W - r.x - r.w, r.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '600 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(m, r.x + 6, r.y + 6);
  ctx.restore();
}

/** Bild- und Titelsicherheit (3,5 % und 5 % Rand). */
export function zeichneSicherheitsrahmen(ctx: CanvasRenderingContext2D, W: number, H: number, alpha = 0.15): void {
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  for (const rand of [0.035, 0.05]) {
    const m = W * rand;
    ctx.strokeRect(m, m * (H / W), W - m * 2, H - m * 2 * (H / W));
  }
  ctx.restore();
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Bildwinkel des Maskenausschnitts aus dem horizontalen Winkel des 16:9-Bildes. */
export function maskedFov(hDeg: number, mask: FrameMask, aspect = BILD_SEITENVERHAELTNIS): { hDeg: number; vDeg: number } {
  const r = maskenVerhaeltnis(mask);
  const tanH = Math.tan(rad(hDeg) / 2);
  if (r >= aspect) return { hDeg, vDeg: deg(2 * Math.atan(tanH / r)) };
  const tanV = tanH / aspect;
  return { hDeg: deg(2 * Math.atan(tanV * r)), vDeg: deg(2 * Math.atan(tanV)) };
}

export function isFrameMask(v: unknown): v is FrameMask {
  return typeof v === 'string' && (FRAME_MASKS as readonly string[]).includes(v);
}

export function normaliseFrameMask(raw: unknown): Pick<VenueCamera, 'frameMask'> {
  const v = (raw as { frameMask?: unknown } | null)?.frameMask;
  return { frameMask: isFrameMask(v) ? v : undefined };
}

/** „S35 (24.6×13.8) · 4096×2160 px" — Pixel nur, wenn das Datenblatt sie nennt. */
export function formatLabel(s: SensorSize): string {
  return s.pixelsW && s.pixelsH ? `${s.name} · ${s.pixelsW}×${s.pixelsH} px` : s.name;
}
