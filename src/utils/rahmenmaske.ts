/**
 * Rahmenmasken im 16:9-Bild (#224): welcher Teil des Bildes bleibt, wenn das
 * Ergebnis hochkant, quadratisch oder im Kinoformat ausgespielt wird.
 */
export type Rahmenmaske = 'none' | '9:16' | '4:5' | '1:1' | '2.39';

export const RAHMENMASKEN: Exclude<Rahmenmaske, 'none'>[] = ['9:16', '4:5', '1:1', '2.39'];

/** Breite durch Hoehe. */
export function maskenVerhaeltnis(m: Exclude<Rahmenmaske, 'none'>): number {
  switch (m) {
    case '9:16': return 9 / 16;
    case '4:5': return 4 / 5;
    case '1:1': return 1;
    case '2.39': return 2.39;
  }
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
