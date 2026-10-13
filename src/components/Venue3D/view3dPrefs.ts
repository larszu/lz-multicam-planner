import { useCallback, useState } from 'react';
import { loadJSON, saveJSON } from '../../utils/storage';
import type { Qualitaet } from '../../avplan/scene3d';

/** Was die 3D-Ansicht zeigt. Gilt fuer alle Projekte, nicht je Plan. */
export interface View3DPrefs {
  coverage: boolean;
  labels: boolean;
  audience: boolean;
  /** Showlicht: Scheinwerfer, Lichtkegel, Dunst. Aus = gleichmaessig hell zum Planen. */
  showLight: boolean;
  videoBoard: boolean;
  /** Grundriss-Bild auf dem Boden (nur wenn eines geladen ist). */
  floorPlan: boolean;
  /** Kameraliste rechts ein- oder ausgeklappt. */
  listOpen: boolean;
  /** Bildqualitaet; Auto senkt selbst, wenn der Rechner nicht mitkommt. */
  quality: Qualitaet;
}

const KEY = 'multicam-3d-view-prefs';

export const DEFAULT_VIEW3D_PREFS: View3DPrefs = {
  coverage: true,
  labels: true,
  audience: true,
  showLight: true,
  videoBoard: false,
  floorPlan: true,
  listOpen: true,
  quality: 'auto',
};

export function useView3DPrefs(): [View3DPrefs, (patch: Partial<View3DPrefs>) => void] {
  const [prefs, setPrefs] = useState<View3DPrefs>(() => {
    const p = { ...DEFAULT_VIEW3D_PREFS, ...loadJSON<Partial<View3DPrefs>>(KEY, {}) };
    return ['auto', 'high', 'low'].includes(p.quality) ? p : { ...p, quality: 'auto' };
  });
  const update = useCallback((patch: Partial<View3DPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveJSON(KEY, next);
      return next;
    });
  }, []);
  return [prefs, update];
}
