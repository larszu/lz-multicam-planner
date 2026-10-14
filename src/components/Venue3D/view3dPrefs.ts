import { useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from '../../utils/storage';
import type { Qualitaet } from '../../avplan/scene3d';
import { HIMMEL_STANDARD, type HimmelPrefs } from '../../utils/tageslicht';

/** Was die 3D-Ansicht zeigt. Gilt fuer alle Projekte, nicht je Plan. */
export interface View3DPrefs {
  coverage: boolean;
  labels: boolean;
  audience: boolean;
  /** Showlicht: Scheinwerfer, Lichtkegel, Dunst. Aus = gleichmaessig hell zum Planen. */
  showLight: boolean;
  /** Showlicht unter freiem Himmel statt in der Halle: Sonne, Himmel, Wetter. */
  daylight: boolean;
  sky: HimmelPrefs;
  videoBoard: boolean;
  /** Grundriss-Bild auf dem Boden (nur wenn eines geladen ist). */
  floorPlan: boolean;
  /** Kamerafrau bzw. Kameramann an Stativ, Pedestal, Dolly und Schulterkamera. */
  operators: boolean;
  /** Kameraliste rechts ein- oder ausgeklappt. */
  listOpen: boolean;
  /**
   * Bildqualitaet; Auto senkt selbst, wenn der Rechner nicht mitkommt.
   * `simple` ist die einfache 3D-Ansicht (#167): ohne Render-Pipeline,
   * Schatten und Showlicht — fuer schwache Rechner und reines Planen.
   */
  quality: View3DQuality;
}

export type View3DQuality = Qualitaet | 'simple';

const KEY = 'multicam-3d-view-prefs';

export const DEFAULT_VIEW3D_PREFS: View3DPrefs = {
  coverage: true,
  labels: true,
  audience: true,
  showLight: true,
  daylight: false,
  sky: HIMMEL_STANDARD,
  videoBoard: false,
  floorPlan: true,
  operators: false,
  listOpen: true,
  quality: 'auto',
};

// Ein Stand fuer alle Leser: die 3D-Ansicht schaltet, die gerenderten
// Kamerabilder in Vorschau und Multiview (#167, #168) folgen sofort.
let stand: View3DPrefs | null = null;
const hoerer = new Set<() => void>();

function laden(): View3DPrefs {
  const roh = loadJSON<Partial<View3DPrefs>>(KEY, {});
  const p = { ...DEFAULT_VIEW3D_PREFS, ...roh, sky: { ...HIMMEL_STANDARD, ...roh.sky } };
  return ['auto', 'high', 'low', 'simple'].includes(p.quality) ? p : { ...p, quality: 'auto' };
}

export function getView3DPrefs(): View3DPrefs {
  stand ??= laden();
  return stand;
}

export function updateView3DPrefs(patch: Partial<View3DPrefs>): void {
  stand = { ...getView3DPrefs(), ...patch };
  saveJSON(KEY, stand);
  hoerer.forEach((fn) => fn());
}

function abonnieren(fn: () => void): () => void {
  hoerer.add(fn);
  return () => { hoerer.delete(fn); };
}

export function useView3DPrefs(): [View3DPrefs, (patch: Partial<View3DPrefs>) => void] {
  const prefs = useSyncExternalStore(abonnieren, getView3DPrefs, getView3DPrefs);
  return [prefs, updateView3DPrefs];
}
