// Die Originaldatei des aktuellen Plans (PDF/DXF) fuer die Plan-Erkennung.
//
// Das Projekt speichert nur das gerenderte Bild. Die Vektoren stehen aber
// nur in der Datei — deshalb haelt der Lader sie hier fest, solange die
// Sitzung laeuft. Nach einem Neustart (Projekt geoeffnet, Datei weg) muss
// der Plan noch einmal hereingezogen werden; das sagt die Oberflaeche.

export type PlanQuellArt = 'pdf' | 'dxf' | 'bild';

export interface PlanQuelle {
  art: PlanQuellArt;
  name: string;
  daten: Uint8Array;
  seite: number;
  /** data:-URL des Planbilds, zu dem die Quelle gehoert. */
  bild: string;
}

let quelle: PlanQuelle | null = null;

export function setPlanQuelle(q: PlanQuelle | null) {
  quelle = q;
}

/** Die Quelle, wenn sie zum gezeigten Planbild gehoert. */
export function planQuelleFuer(bild: string | undefined): PlanQuelle | null {
  return quelle && bild && quelle.bild === bild ? quelle : null;
}
