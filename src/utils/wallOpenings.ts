// Eine Wand mit Tür- und Fensteröffnungen als Quader (#205).
//
// WARUM STÜCKE UND KEIN LOCH. Three.js kann ein Loch nur über CSG oder eine
// Extrusion mit Innenring — beides zieht eine Abhängigkeit oder baut die
// Geometrie bei jeder Änderung neu. Eine Wand mit Öffnungen ist aber nur die
// Summe weniger Quader: links daneben, rechts daneben, Brüstung darunter,
// Sturz darüber. Das sind dieselben Box-Geometrien, die die 3D-Ansicht
// ohnehin zeichnet, und es bleibt richtig, wenn jemand die Wandhöhe ändert.
import type { Wall } from '../types';

export interface WandStueck {
  /** Mitte des Quaders in Plan-Metern. */
  x: number;
  y: number;
  /** Unterkante über dem Boden und Höhe. */
  unten: number;
  hoehe: number;
  /** Länge entlang der Wand. */
  laenge: number;
  /** Winkel der Wand (Radiant, mathematisch). */
  winkel: number;
}

export const WAND_DICKE_M = 0.15;

/** Wandstärke dieser Wand; ohne Angabe die bisherige Vorgabe. */
export const wandDicke = (w: Pick<Wall, 'thicknessM'>): number =>
  typeof w.thicknessM === 'number' && w.thicknessM > 0.01 ? w.thicknessM : WAND_DICKE_M;

/**
 * Die Quader einer Wand. Ohne Öffnungen ist es genau einer — dieselbe Lage
 * wie bisher, damit sich an bestehenden Projekten nichts verschiebt.
 */
export function wandStuecke(w: Wall, hoeheM: number): WandStueck[] {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const laenge = Math.hypot(dx, dy);
  if (laenge < 1e-6) return [];
  const winkel = Math.atan2(dy, dx);
  const mitte = (von: number, bis: number, unten: number, hoch: number): WandStueck => ({
    x: w.x1 + (dx * (von + bis)) / 2 / laenge,
    y: w.y1 + (dy * (von + bis)) / 2 / laenge,
    unten,
    hoehe: hoch,
    laenge: bis - von,
    winkel,
  });
  const oeffnungen = (w.openings ?? [])
    .map((o) => ({
      von: Math.max(0, Math.min(laenge, o.offset)),
      bis: Math.max(0, Math.min(laenge, o.offset + o.width)),
      unten: Math.max(0, Math.min(hoeheM, o.bottom)),
      oben: Math.max(0, Math.min(hoeheM, o.top)),
    }))
    .filter((o) => o.bis - o.von > 0.01 && o.oben - o.unten > 0.01)
    .sort((a, b) => a.von - b.von);
  if (!oeffnungen.length) return [mitte(0, laenge, 0, hoeheM)];

  const stuecke: WandStueck[] = [];
  let x = 0;
  for (const o of oeffnungen) {
    if (o.von > x + 0.01) stuecke.push(mitte(x, o.von, 0, hoeheM));
    if (o.unten > 0.01) stuecke.push(mitte(o.von, o.bis, 0, o.unten));
    if (hoeheM - o.oben > 0.01) stuecke.push(mitte(o.von, o.bis, o.oben, hoeheM - o.oben));
    x = Math.max(x, o.bis);
  }
  if (laenge - x > 0.01) stuecke.push(mitte(x, laenge, 0, hoeheM));
  return stuecke;
}
