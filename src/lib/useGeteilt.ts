// Ein gespeicherter Wert, den mehrere Instanzen einer Komponente TEILEN.
//
// Der Kamerablick steht zweimal in der App (Vorschau-Reiter und 3D-Ansicht).
// Mit `useState(loadJSON(...))` hielte jede Instanz ihre eigene Kopie: ein
// Preset, das im 3D-Blick entsteht, fehlte in der Vorschau — und das naechste
// Speichern dort wuerfe es weg. Hier gibt es den Wert einmal, gespeichert,
// und jede Instanz sieht jede Aenderung.
import { useCallback, useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from '../utils/storage';

const stand = new Map<string, unknown>();
const hoerer = new Map<string, Set<() => void>>();

function lesen<T>(key: string, start: T): T {
  if (!stand.has(key)) stand.set(key, loadJSON<T>(key, start));
  return stand.get(key) as T;
}

export function setzeGeteilt<T>(key: string, wert: T): void {
  stand.set(key, wert);
  saveJSON(key, wert);
  hoerer.get(key)?.forEach((fn) => fn());
}

export function useGeteilt<T>(key: string, start: T): [T, (wert: T | ((alt: T) => T)) => void] {
  const abonnieren = useCallback((fn: () => void) => {
    let set = hoerer.get(key);
    if (!set) hoerer.set(key, (set = new Set()));
    set.add(fn);
    return () => { set.delete(fn); };
  }, [key]);
  const wert = useSyncExternalStore(abonnieren, () => lesen(key, start), () => lesen(key, start));
  const setzen = useCallback((w: T | ((alt: T) => T)) => {
    const alt = lesen(key, start);
    setzeGeteilt(key, typeof w === 'function' ? (w as (a: T) => T)(alt) : w);
  }, [key, start]);
  return [wert, setzen];
}
