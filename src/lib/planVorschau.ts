// Vorschau der Plan-Erkennung: was „Übernehmen" anlegen wuerde, in
// Welt-Metern (Venue-Koordinaten). Lebt nur im Speicher — nicht im Projekt,
// nicht in der Historie: erst „Übernehmen" ist eine Handlung.
import type { Rahmen, UebernahmeWand, UebernahmeBuehne } from '../avplan/floorplan';

export interface PlanVorschau {
  waende: UebernahmeWand[];
  buehnen: UebernahmeBuehne[];
  /** Raumumrisse nur zur Anzeige. */
  raeume: { umriss: { x: number; y: number }[]; label: string }[];
  /** Gewaehlter Ausschnitt in Welt-Metern; ohne: ganzer Plan. */
  bereich?: Rahmen;
}

export const imRahmen = (b: Rahmen | undefined, x: number, y: number) =>
  !b || (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY);

/** Was im Ausschnitt liegt (Mitte entscheidet). */
export function vorschauImBereich(v: PlanVorschau): { waende: UebernahmeWand[]; buehnen: UebernahmeBuehne[] } {
  return {
    waende: v.waende.filter((w) => imRahmen(v.bereich, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2)),
    buehnen: v.buehnen.filter((b) => imRahmen(v.bereich, b.x + b.breite / 2, b.y + b.tiefe / 2)),
  };
}
