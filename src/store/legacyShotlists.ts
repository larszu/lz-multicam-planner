// Shotlisten vor #200 lagen global im localStorage, nicht im Projekt. Jede
// Liste war mit jedem Projekt sichtbar und ging mit keiner Datei mit.
//
// Uebernahme: Ein Projekt, das ohne `shotlists` gespeichert wurde (also vor
// #200), bekommt beim Oeffnen bzw. Wiederherstellen die alten Listen, deren
// Shots auf seine Kameras zeigen — leere Listen ohne Bezug gehen mit dem
// ersten solchen Projekt. Uebernommene Listen verlassen den Pool, damit sie
// nicht in jedes alte Projekt kopiert werden (Kamera-Ids wie `cam-1` gibt es
// fast ueberall). Der urspruengliche Pool bleibt einmalig unter
// LEGACY_BACKUP_KEY liegen; nichts wird geloescht, was nicht in einem
// Projekt angekommen ist.
import type { Shotlist } from '../types';
import { loadJSON, saveJSONSafe } from '../utils/storage';

export const LEGACY_SHOTLISTS_KEY = 'multicam-shotlists';
export const LEGACY_BACKUP_KEY = 'multicam-shotlists-before-200';

/** Nur strukturell brauchbare Listen — eine halb geschriebene Datei oder ein
 *  handgepfuschter Speicher darf das Panel nicht zum Absturz bringen. */
export function normaliseShotlists(raw: unknown): Shotlist[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is Shotlist =>
      !!l && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.shots),
  );
}

/** Welche alten Listen zu einem Projekt mit diesen Kameras gehoeren. */
export function splitLegacyShotlists(
  pool: readonly Shotlist[],
  cameraIds: ReadonlySet<string>,
): { adopted: Shotlist[]; rest: Shotlist[] } {
  const adopted: Shotlist[] = [];
  const rest: Shotlist[] = [];
  for (const l of pool) {
    const passt = l.shots.length === 0 || l.shots.some((sh) => cameraIds.has(sh.cameraId));
    (passt ? adopted : rest).push(l);
  }
  return { adopted, rest };
}

/** Holt die passenden alten Listen aus dem localStorage und nimmt sie aus dem Pool. */
export function adoptLegacyShotlists(cameraIds: ReadonlySet<string>): Shotlist[] {
  let pool: Shotlist[];
  try {
    pool = normaliseShotlists(loadJSON<unknown>(LEGACY_SHOTLISTS_KEY, []));
  } catch {
    return [];
  }
  if (pool.length === 0) return [];
  const { adopted, rest } = splitLegacyShotlists(pool, cameraIds);
  if (adopted.length === 0) return [];
  try {
    if (localStorage.getItem(LEGACY_BACKUP_KEY) === null && !saveJSONSafe(LEGACY_BACKUP_KEY, pool)) {
      // Ohne Sicherung den Pool nicht anfassen: lieber doppelt als verloren.
      return adopted;
    }
    if (rest.length > 0) saveJSONSafe(LEGACY_SHOTLISTS_KEY, rest);
    else localStorage.removeItem(LEGACY_SHOTLISTS_KEY);
  } catch { /* Speicher nicht erreichbar — die Listen sind trotzdem im Projekt */ }
  return adopted;
}
