// Publikumsabdeckung (#221): welcher Teil der Publikumsflaechen kommt im Bild
// vor und welcher nie?
//
// Je Flaeche ein Raster (Vorgabe 0,5 m). Eine Zelle gilt als erfasst, wenn
// ihr Kopfpunkt (sitzend 1,2 m, stehend 1,7 m ueber der Stufe) im
// horizontalen UND vertikalen Bildwinkel einer Kamera liegt und keine feste
// Wand dazwischen steht. Glasfronten verdecken nicht. Optional und nur fuer
// die Anzeige — gerechnet wird nur, wenn die Waermekarte an ist.
import { sitzblockNormal, sitzblockPunkt, sitzblockTiefe, type VenueSeatingBlock } from '../avplan/floorplan';
import type { Wall } from '../types';

export type CoverageMode = 'off' | 'all' | 'selected' | 'gaps';

export interface CoverageCamera {
  id: string;
  x: number;
  y: number;
  z: number;
  pan: number;
  tilt: number;
  hFovDeg: number;
  vFovDeg: number;
}

export interface BlockCoverage {
  id: string;
  cols: number;
  rows: number;
  cellW: number;
  cellD: number;
  /** Je Zelle (Zeile fuer Zeile) die Zahl der Kameras. */
  counts: Uint8Array;
  /** Je Zelle: erfasst von der gewaehlten Kamera. */
  selected: Uint8Array;
}

export interface CoverageReport {
  blocks: BlockCoverage[];
  /** Anteil der Zellen, die mindestens eine Kamera erfasst (0..1); null ohne Flaechen. */
  share: number | null;
  shareSelected: number | null;
}

const SITZ_KOPF_M = 1.2;
const STEH_KOPF_M = 1.7;

const winkelDiff = (a: number, b: number) => {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

function schneidet(ax: number, ay: number, bx: number, by: number, w: Wall): boolean {
  const d = (bx - ax) * (w.y2 - w.y1) - (by - ay) * (w.x2 - w.x1);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((w.x1 - ax) * (w.y2 - w.y1) - (w.y1 - ay) * (w.x2 - w.x1)) / d;
  const u = ((w.x1 - ax) * (by - ay) - (w.y1 - ay) * (bx - ax)) / d;
  return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1;
}

/** Sieht die Kamera den Punkt? */
export function cameraSees(cam: CoverageCamera, p: { x: number; y: number; z: number }, walls: readonly Wall[] = []): boolean {
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.3) return false;
  const az = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (Math.abs(winkelDiff(az, cam.pan)) > cam.hFovDeg / 2) return false;
  const el = (Math.atan2(p.z - cam.z, dist) * 180) / Math.PI;
  if (Math.abs(el - cam.tilt) > cam.vFovDeg / 2) return false;
  for (const w of walls) {
    if (w.kind === 'glass') continue;
    if (schneidet(cam.x, cam.y, p.x, p.y, w)) return false;
  }
  return true;
}

export function coverageReport(
  blocks: readonly VenueSeatingBlock[],
  cameras: readonly CoverageCamera[],
  walls: readonly Wall[] = [],
  selectedId: string | null = null,
  cellM = 0.5,
): CoverageReport {
  let total = 0;
  let hit = 0;
  let hitSel = 0;
  const out: BlockCoverage[] = [];
  for (const b of blocks) {
    const n = sitzblockNormal(b);
    const tiefe = sitzblockTiefe(b);
    const cols = Math.max(1, Math.round(n.width / cellM));
    const rows = Math.max(1, Math.round(tiefe / cellM));
    const cellW = n.width / cols;
    const cellD = tiefe / rows;
    const counts = new Uint8Array(cols * rows);
    const selected = new Uint8Array(cols * rows);
    const kopf = n.standing ? STEH_KOPF_M : SITZ_KOPF_M;
    for (let j = 0; j < rows; j++) {
      const v = -tiefe / 2 + (j + 0.5) * cellD;
      const reihe = Math.min(n.rows - 1, Math.floor((v + tiefe / 2) / n.rowSpacingM));
      const z = n.baseHeightM + (n.standing ? 0 : reihe * n.riseM) + kopf;
      for (let i = 0; i < cols; i++) {
        const u = -n.width / 2 + (i + 0.5) * cellW;
        const p = { ...sitzblockPunkt(n, u, v), z };
        let c = 0;
        for (const cam of cameras) {
          if (!cameraSees(cam, p, walls)) continue;
          c++;
          if (cam.id === selectedId) selected[j * cols + i] = 1;
        }
        counts[j * cols + i] = Math.min(255, c);
        total++;
        if (c > 0) hit++;
        if (selected[j * cols + i]) hitSel++;
      }
    }
    out.push({ id: n.id, cols, rows, cellW, cellD, counts, selected });
  }
  return {
    blocks: out,
    share: total ? hit / total : null,
    shareSelected: total && selectedId ? hitSel / total : null,
  };
}

/**
 * Deckkraft einer Zelle (0..1) je Modus. Heller mit jeder weiteren Kamera,
 * gesaettigt ab vier; bei „Luecken" nur die nie erfassten Zellen.
 */
export function cellAlpha(mode: CoverageMode, count: number, selected: boolean): number {
  switch (mode) {
    case 'off': return 0;
    case 'all': return count === 0 ? 0 : 0.18 + 0.14 * Math.min(4, count);
    case 'selected': return selected ? 0.55 : 0;
    case 'gaps': return count === 0 ? 0.6 : 0;
  }
}
