import { useCallback } from 'react';
import { useStore } from '../store/useStore';
import { getView3DPrefs, updateView3DPrefs, useView3DPrefs } from '../components/Venue3D/view3dPrefs';
import type { HimmelPrefs } from '../utils/tageslicht';

/**
 * Ort, Datum und Uhrzeit des Tageslichts liegen im Projekt (#226). Ein
 * Projekt ohne eigene Angabe nimmt die zuletzt gewaehlte; wer sie aendert,
 * schreibt sie ins Projekt und merkt sie sich fuer das naechste.
 */
export function useProjektHimmel(): [HimmelPrefs, (patch: Partial<HimmelPrefs>) => void] {
  const [prefs] = useView3DPrefs();
  const eigen = useStore((s) => s.venue.sky);
  const setze = useCallback((patch: Partial<HimmelPrefs>) => {
    const { venue, setVenue } = useStore.getState();
    const sky = { ...(venue.sky ?? getView3DPrefs().sky), ...patch };
    setVenue({ ...venue, sky });
    updateView3DPrefs({ sky });
  }, []);
  return [eigen ?? prefs.sky, setze];
}
