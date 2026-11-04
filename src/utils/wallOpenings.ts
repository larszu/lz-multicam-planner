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

export type OeffnungsArt = 'door' | 'window';

const OEFFNUNG_VORGABE: Record<OeffnungsArt, { width: number; bottom: number; top: number }> = {
  door: { width: 0.9, bottom: 0, top: 2.1 },
  window: { width: 1.2, bottom: 0.9, top: 2.3 },
};

/** Eine neue Tür oder ein neues Fenster mittig in der Wand (#248). */
export function neueOeffnung(w: Pick<Wall, 'x1' | 'y1' | 'x2' | 'y2'>, art: OeffnungsArt): NonNullable<Wall['openings']>[number] {
  const laenge = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const v = OEFFNUNG_VORGABE[art];
  const width = Math.min(v.width, Math.max(0.1, laenge - 0.2));
  return { offset: Math.max(0, (laenge - width) / 2), width, bottom: v.bottom, top: v.top, kind: art };
}

/** Anfang und Ende einer Öffnung im Grundriss. */
export function oeffnungStrecke(w: Pick<Wall, 'x1' | 'y1' | 'x2' | 'y2'>, o: { offset: number; width: number }): [number, number, number, number] {
  const laenge = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const ux = (w.x2 - w.x1) / laenge;
  const uy = (w.y2 - w.y1) / laenge;
  const a = Math.max(0, Math.min(laenge, o.offset));
  const b = Math.max(0, Math.min(laenge, o.offset + o.width));
  return [w.x1 + ux * a, w.y1 + uy * a, w.x1 + ux * b, w.y1 + uy * b];
}

/** Die Scheiben der Fenster einer Wand — Glas in der Öffnung, nicht Loch. */
export function fensterScheiben(w: Wall, hoeheM: number): WandStueck[] {
  const laenge = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  if (laenge < 1e-6) return [];
  const winkel = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
  return (w.openings ?? [])
    .filter((o) => o.kind === 'window')
    .map((o) => {
      const [ax, ay, bx, by] = oeffnungStrecke(w, o);
      const unten = Math.max(0, Math.min(hoeheM, o.bottom));
      const oben = Math.max(0, Math.min(hoeheM, o.top));
      return { x: (ax + bx) / 2, y: (ay + by) / 2, unten, hoehe: oben - unten, laenge: Math.hypot(bx - ax, by - ay), winkel };
    })
    .filter((s) => s.hoehe > 0.01 && s.laenge > 0.01);
}
