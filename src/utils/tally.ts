import type { Tally } from '../avplan/scene3d';

export type TallyBus = 'pgm' | 'pvw' | null;

// Bildinhalt der Szene, keine Oberflaeche: dieselben Werte wie
// --color-bc-signal und --color-bc-green in index.css (brand:check prueft das).
export const TALLY_FARBE = { pgm: '#D6402E', pvw: '#2F7D5C' } as const;

export interface TallyStand {
  an: boolean;
  programId: string | null;
  previewId: string | null;
}

/** PGM vor PVW; abgeschaltet hebt nichts hervor. */
export function tallyBus(camId: string, s: TallyStand): TallyBus {
  if (!s.an) return null;
  if (camId === s.programId) return 'pgm';
  if (camId === s.previewId) return 'pvw';
  return null;
}

/** Lampe am Kameramodell; die am Pult gewaehlte Kamera leuchtet wie Preview. */
export function tallyLampe(bus: TallyBus, amPult: boolean, an: boolean): Tally {
  if (!an) return 'aus';
  if (bus === 'pgm') return 'rot';
  return bus === 'pvw' || amPult ? 'gruen' : 'aus';
}

export function tallyFarbe(bus: TallyBus): string | null {
  return bus ? TALLY_FARBE[bus] : null;
}
