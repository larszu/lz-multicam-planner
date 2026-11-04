// Grundriss drehen und DXF-Ebenen ein-/ausblenden (#223).
//
// Beides wird ins Planbild eingerechnet: 2D, 3D, Teilplan und Austausch lesen
// weiter nur Bild, Massstab und Versatz. Gedreht wird immer aus dem Bild vor
// der ersten Drehung dieser Sitzung, damit mehrfaches Drehen nicht unscharf
// wird.
import { PLAN_MAX_KANTE, vektorAlsPlan, type VektorZeichnung } from '../avplan/floorplan';
import type { BackgroundPlan } from '../types';
import { setPlanBild } from './planQuelle';

/** Lage eines um `deg` gedrehten Plans: neue Pixelmasse und Versatz, Mitte bleibt. */
export function gedrehteLage(
  plan: Pick<BackgroundPlan, 'widthPx' | 'heightPx' | 'scaleX' | 'scaleY' | 'offsetX' | 'offsetY'>,
  deg: number,
  maxKante = PLAN_MAX_KANTE,
): { widthPx: number; heightPx: number; scale: number; offsetX: number; offsetY: number } {
  const w = plan.widthPx * plan.scaleX;
  const h = plan.heightPx * plan.scaleY;
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const bw = w * c + h * s;
  const bh = w * s + h * c;
  const scale = Math.max(Math.min(plan.scaleX, plan.scaleY), Math.max(bw, bh) / maxKante);
  return {
    widthPx: Math.max(1, Math.round(bw / scale)),
    heightPx: Math.max(1, Math.round(bh / scale)),
    scale,
    offsetX: plan.offsetX + w / 2 - bw / 2,
    offsetY: plan.offsetY + h / 2 - bh / 2,
  };
}

/** Winkel auf 0..360. */
export const winkelNorm = (deg: number) => ((deg % 360) + 360) % 360;

let ursprung: { plan: BackgroundPlan; bild: string } | null = null;

function ladeBild(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error('image'));
    img.src = src;
  });
}

/** Dreht den Plan um `deg` weiter; liefert den neuen Plan. */
export async function drehePlan(plan: BackgroundPlan, deg: number): Promise<BackgroundPlan> {
  const basis = ursprung && ursprung.bild === plan.dataUrl ? ursprung.plan : { ...plan, rotationDeg: plan.rotationDeg ?? 0 };
  const ziel = winkelNorm((plan.rotationDeg ?? 0) + deg);
  const relativ = ziel - (basis.rotationDeg ?? 0);
  const lage = gedrehteLage(basis, relativ);
  const img = await ladeBild(basis.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = lage.widthPx;
  canvas.height = lage.heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.translate(lage.widthPx / 2, lage.heightPx / 2);
  ctx.rotate((relativ * Math.PI) / 180);
  const w = (basis.widthPx * basis.scaleX) / lage.scale;
  const h = (basis.heightPx * basis.scaleY) / lage.scale;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  const bild = canvas.toDataURL('image/png');
  ursprung = { plan: basis, bild };
  return {
    ...plan,
    dataUrl: bild,
    widthPx: lage.widthPx,
    heightPx: lage.heightPx,
    scaleX: lage.scale,
    scaleY: lage.scale,
    offsetX: Math.round(lage.offsetX * 1000) / 1000,
    offsetY: Math.round(lage.offsetY * 1000) / 1000,
    rotationDeg: ziel || undefined,
  };
}

// ── DXF-Ebenen ──

let dxf: { zeichnung: VektorZeichnung; name: string; bild: string } | null = null;

export function setDxfZeichnung(zeichnung: VektorZeichnung | null, name = '', bild = '') {
  dxf = zeichnung ? { zeichnung, name, bild } : null;
}

export interface DxfEbene {
  name: string;
  linien: number;
}

/** Ebenen der Zeichnung, zu der das gezeigte Planbild gehoert — sonst null. */
export function dxfEbenen(bild: string | undefined): DxfEbene[] | null {
  if (!dxf || !bild || dxf.bild !== bild) return null;
  return ebenenListe(dxf.zeichnung);
}

export function ebenenListe(z: VektorZeichnung): DxfEbene[] {
  const zahl = new Map<string, number>();
  for (const p of z.pfade) zahl.set(p.ebene ?? '0', (zahl.get(p.ebene ?? '0') ?? 0) + 1);
  return [...zahl].map(([name, linien]) => ({ name, linien })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Die Zeichnung ohne die ausgeblendeten Ebenen — Masse und Lage bleiben. */
export function ohneEbenen(z: VektorZeichnung, aus: readonly string[]): VektorZeichnung {
  if (aus.length === 0) return z;
  const weg = new Set(aus);
  return { ...z, pfade: z.pfade.filter((p) => !weg.has(p.ebene ?? '0')) };
}

/** Plan mit neu gezeichneten Ebenen; null, wenn die DXF nicht mehr in der Sitzung liegt. */
export function planMitEbenen(plan: BackgroundPlan, aus: string[]): BackgroundPlan | null {
  if (!dxf || dxf.bild !== plan.dataUrl) return null;
  const neu = vektorAlsPlan(ohneEbenen(dxf.zeichnung, aus), dxf.name);
  dxf = { ...dxf, bild: neu.src };
  setPlanBild(plan.dataUrl, neu.src);
  return { ...plan, dataUrl: neu.src, hiddenLayers: aus.length ? aus : undefined };
}
