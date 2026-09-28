// ───────────────────────────────────────────────────────────────────────────
// Abgleich mit der Geraetebibliothek — rein, ohne fetch und ohne Speicher.
//
// Inkrementell: der Server liefert alles mit `seq > after`, dazu `latestSeq`.
// Der Cache merkt sich den hoechsten gesehenen Stand und fragt beim naechsten
// Mal nur danach. Ein Geraet kommt immer als GANZES in seiner neuesten
// Fassung, also ersetzt es den Eintrag; `removed` loescht ihn.
//
// Ein Facet, das die Pruefung des Planners nicht besteht, wird uebersprungen
// und gezaehlt. Stand dasselbe Geraet schon im Cache, faellt es heraus: die
// Bibliothek sagt ueber die alte Fassung nichts mehr, und eine Kamera, deren
// aktuelle Fassung wir nicht lesen koennen, als gueltig weiterzufuehren,
// hiesse Daten zu zeigen, die es so nicht mehr gibt.
//
// Ein Cache gehoert zu EINEM Server — Slugs und Sequenznummern sind nur
// innerhalb eines Servers eindeutig. Gespeichert werden aber die Staende ALLER
// Server nebeneinander (`CacheAblage`): ein Wechsel der Adresse loescht den
// alten Stand nicht, und wer zurueckwechselt, hat ihn wieder (Vertrag Punkt 2
// in `syncFrom`, `deviceLibraryClient.ts`).
// ───────────────────────────────────────────────────────────────────────────
import type { SyncDevice, SyncResponse } from '../utils/deviceLibraryClient';
import { facetToItem, type LibraryItem } from './facet';

export type LibraryEntry = LibraryItem & {
  slug: string;
  version: number;
  seq: number;
  status: SyncDevice['status'];
  confirmations: number;
};

export interface LibraryCache {
  server: string;
  latestSeq: number;
  entries: LibraryEntry[];
}

export interface SyncStats {
  added: number;
  updated: number;
  removed: number;
  invalid: number;
}

export const emptyCache = (server: string): LibraryCache => ({ server, latestSeq: 0, entries: [] });

export function mergeSync(cache: LibraryCache, response: SyncResponse): { cache: LibraryCache; stats: SyncStats } {
  const stats: SyncStats = { added: 0, updated: 0, removed: 0, invalid: 0 };
  const map = new Map(cache.entries.map((e) => [e.slug, e]));
  for (const d of response.devices) {
    const vorher = map.has(d.slug);
    if (d.removed) {
      if (map.delete(d.slug)) stats.removed += 1;
      continue;
    }
    const item = facetToItem(d);
    if (!item) {
      stats.invalid += 1;
      map.delete(d.slug);
      continue;
    }
    map.set(d.slug, {
      ...item,
      slug: d.slug,
      version: d.version,
      seq: d.seq,
      status: d.status,
      confirmations: d.confirmations,
    });
    if (vorher) stats.updated += 1;
    else stats.added += 1;
  }
  const seqs = response.devices.map((d) => d.seq);
  return {
    cache: {
      server: cache.server,
      latestSeq: Math.max(cache.latestSeq, response.latestSeq, ...seqs),
      entries: [...map.values()],
    },
    stats,
  };
}

const istCache = (v: unknown): v is LibraryCache => {
  if (!v || typeof v !== 'object') return false;
  const c = v as Partial<LibraryCache>;
  return typeof c.server === 'string' && typeof c.latestSeq === 'number' && Array.isArray(c.entries);
};

/**
 * Die Staende aller Server unter einem Speicher-Schluessel.
 *
 * Bis 2026-09-28 lag dort genau EIN Cache, und eine andere Adresse hiess:
 * leer anfangen und ueberschreiben. Wer auf einen Ersatzserver umstellte,
 * weil devices.zumpelars.de gerade nicht lief, und zurueckwechselte, hatte
 * danach eine leere Bibliothek. Ein alter Einzelstand wird beim Lesen als
 * Platz seines Servers verstanden — nichts geht verloren.
 */
export interface CacheAblage {
  format: 'multicam-device-library-caches';
  version: 1;
  byServer: Record<string, LibraryCache>;
}

const leereAblage = (): CacheAblage => ({ format: 'multicam-device-library-caches', version: 1, byServer: {} });

/** Liest den Speicher-Inhalt — neue Ablage oder alter Einzelstand; Unlesbares
 *  ergibt eine leere Ablage. */
export function readAblage(raw: unknown): CacheAblage {
  if (istCache(raw)) return { ...leereAblage(), byServer: { [raw.server]: raw } };
  const a = raw as Partial<CacheAblage> | null;
  if (a && typeof a === 'object' && a.format === 'multicam-device-library-caches' && a.version === 1 && a.byServer && typeof a.byServer === 'object') {
    const byServer: Record<string, LibraryCache> = {};
    for (const [server, c] of Object.entries(a.byServer)) if (istCache(c) && c.server === server) byServer[server] = c;
    return { ...leereAblage(), byServer };
  }
  return leereAblage();
}

/** Der Stand fuer DIESEN Server aus dem Speicher-Inhalt; keiner ergibt einen leeren. */
export function readCache(raw: unknown, server: string): LibraryCache {
  const c = readAblage(raw).byServer[server];
  return c ? { server, latestSeq: c.latestSeq, entries: c.entries } : emptyCache(server);
}

/** Legt `cache` auf seinen Platz; die Staende der anderen Server bleiben. */
export function writeCache(raw: unknown, cache: LibraryCache): CacheAblage {
  const a = readAblage(raw);
  return { ...a, byServer: { ...a.byServer, [cache.server]: cache } };
}
