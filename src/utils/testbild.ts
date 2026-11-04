import { kontrastText } from './color';
import { maskenRechteck } from './rahmenmaske';

/**
 * Testbild einer Multiview-Kachel (#236): Ausschnitt, Seitenverhaeltnis und
 * Beschriftung pruefen, ohne dass die 3D-Szene gerechnet werden muss.
 */
export interface TestbildDaten {
  nummer: number;
  farbe: string;
  label: string;
}

/** Seitenverhaeltnisse, deren Kanten im Testbild markiert sind. */
export const TESTBILD_MARKEN: { name: string; verhaeltnis: number }[] = [
  { name: '4:3', verhaeltnis: 4 / 3 },
  { name: '1:1', verhaeltnis: 1 },
  { name: '2.39', verhaeltnis: 2.39 },
];

/** Gitterlinien: 16 × 9 Felder, damit jede Zelle quadratisch ist. */
export function testbildGitter(W: number, H: number): { xs: number[]; ys: number[] } {
  const xs = Array.from({ length: 15 }, (_, i) => (W * (i + 1)) / 16);
  const ys = Array.from({ length: 8 }, (_, i) => (H * (i + 1)) / 9);
  return { xs, ys };
}

export function zeichneTestbild(ctx: CanvasRenderingContext2D, W: number, H: number, d: TestbildDaten): void {
  ctx.save();
  ctx.fillStyle = '#1b1e24';
  ctx.fillRect(0, 0, W, H);

  const { xs, ys } = testbildGitter(W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xs) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
  for (const y of ys) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = 'rgba(255,214,10,0.7)';
  ctx.fillStyle = 'rgba(255,214,10,0.85)';
  const schrift = Math.max(8, Math.round(H / 22));
  ctx.font = `600 ${schrift}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (const m of TESTBILD_MARKEN) {
    const r = maskenRechteck(W, H, m.verhaeltnis);
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillText(m.name, r.x + 3, r.y + 3);
  }
  ctx.setLineDash([]);

  const cx = W / 2;
  const cy = H / 2;
  const k = Math.min(W, H) * 0.08;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx - k, cy); ctx.lineTo(cx + k, cy);
  ctx.moveTo(cx, cy - k); ctx.lineTo(cx, cy + k);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, H * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  const r = H * 0.16;
  const mx = W * 0.14;
  const my = H * 0.24;
  ctx.fillStyle = d.farbe;
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kontrastText(d.farbe);
  ctx.font = `700 ${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(d.nummer), mx, my + r * 0.04);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `600 ${schrift}px sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(d.label, cx, H * 0.78);
  ctx.restore();
}

/** Testbild in eine Kachel zeichnen; der Canvas wird 16:9 so breit wie `cssW`. */
export function renderTestbild(canvas: HTMLCanvasElement, cssW: number, dpr: number, d: TestbildDaten): void {
  const cssH = Math.round((cssW * 9) / 16);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  zeichneTestbild(ctx, cssW, cssH, d);
}
