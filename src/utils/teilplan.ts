// Teilplan aus einem Gebäudeplan (#248): ein Raum aus dem ganzen Grundriss
// wird ein eigenes Projekt mit eigenen Kameras.
//
// WARUM EIN NEUES PROJEKT UND KEINE LISTE IM PROJEKT. Je Raum eigene Kameras,
// Bühnen und Shotlists hieße, jedes dieser Felder pro Teilplan zu führen —
// ein zweites Projektmodell in dem einen. Ein Projekt je Raum hat das alles
// schon: der Gebäudeplan bleibt die Mutterdatei, jeder Raum wird daraus
// zugeschnitten und als eigene Datei gespeichert.
//
// Das Bild wird auf Planpixel zugeschnitten, also ohne Verlust; Maßstab und
// alles, was im Ausschnitt liegt (Wände, Bühnen, Publikum, Videowände,
// Personen), kommen mit. Kameras nicht — die plant man je Raum neu.
import type { BackgroundPlan, ReferencePerson, Venue, Wall } from '../types';

export interface Rahmen {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rand um den Ausschnitt im neuen Venue. */
export const TEILPLAN_RAND_M = 1;

export interface TeilplanZuschnitt {
  /** Ausschnitt in Planbild-Pixeln. */
  px: { x: number; y: number; breite: number; hoehe: number };
  /** Verschiebung Welt alt → Welt neu. */
  dx: number;
  dy: number;
}

/** Wo der Rahmen im Planbild liegt; null, wenn er das Bild nicht trifft. */
export function teilplanZuschnitt(plan: BackgroundPlan, r: Rahmen): TeilplanZuschnitt | null {
  const px = (x: number) => Math.round((x - plan.offsetX) / plan.scaleX);
  const py = (y: number) => Math.round((y - plan.offsetY) / plan.scaleY);
  const x0 = Math.max(0, Math.min(plan.widthPx, px(r.minX)));
  const x1 = Math.max(0, Math.min(plan.widthPx, px(r.maxX)));
  const y0 = Math.max(0, Math.min(plan.heightPx, py(r.minY)));
  const y1 = Math.max(0, Math.min(plan.heightPx, py(r.maxY)));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  return {
    px: { x: x0, y: y0, breite: x1 - x0, hoehe: y1 - y0 },
    dx: TEILPLAN_RAND_M - (plan.offsetX + x0 * plan.scaleX),
    dy: TEILPLAN_RAND_M - (plan.offsetY + y0 * plan.scaleY),
  };
}

export interface TeilplanQuelle {
  venue: Venue;
  walls: Wall[];
  persons: ReferencePerson[];
  backgroundPlan: BackgroundPlan;
}

export interface Teilplan {
  venue: Venue;
  walls: Wall[];
  persons: ReferencePerson[];
  backgroundPlan: BackgroundPlan;
}

/**
 * Das neue Projekt ohne das zugeschnittene Bild (das braucht ein Canvas und
 * kommt als `dataUrl` dazu). Was im Rahmen liegt, entscheidet seine Mitte.
 */
export function teilplanAus(q: TeilplanQuelle, r: Rahmen, z: TeilplanZuschnitt, dataUrl: string, name: string): Teilplan {
  const drin = (x: number, y: number) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
  const { dx, dy } = z;
  const breiteM = z.px.breite * q.backgroundPlan.scaleX;
  const hoeheM = z.px.hoehe * q.backgroundPlan.scaleY;
  const v = q.venue;
  return {
    venue: {
      ...v,
      name,
      widthM: Math.ceil(breiteM + 2 * TEILPLAN_RAND_M),
      heightM: Math.ceil(hoeheM + 2 * TEILPLAN_RAND_M),
      stages: v.stages.filter((s) => drin(s.x + s.width / 2, s.y + s.height / 2)).map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
      ...(v.seatingBlocks ? { seatingBlocks: v.seatingBlocks.filter((b) => drin(b.x, b.y)).map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })) } : {}),
      ...(v.videoWalls ? { videoWalls: v.videoWalls.filter((w) => drin(w.x, w.y)).map((w) => ({ ...w, x: w.x + dx, y: w.y + dy })) } : {}),
    },
    walls: q.walls
      .filter((w) => drin((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2))
      .map((w) => ({ ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy })),
    persons: q.persons.filter((p) => drin(p.x, p.y)).map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    backgroundPlan: {
      ...q.backgroundPlan,
      dataUrl,
      widthPx: z.px.breite,
      heightPx: z.px.hoehe,
      offsetX: TEILPLAN_RAND_M,
      offsetY: TEILPLAN_RAND_M,
    },
  };
}
