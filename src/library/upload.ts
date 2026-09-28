// ───────────────────────────────────────────────────────────────────────────
// Eigene Kameras und Objektive in die Geraetebibliothek hochladen — rein.
//
// Hochgeladen wird jeder eigene Eintrag: selbst angelegt, oder eine
// bearbeitete Kopie („modified") eines eingebauten oder eines
// Bibliothekseintrags. Der Server ordnet ueber Hersteller + Modell zu: ein
// Geraet, das es schon gibt, bekommt die multicam-Ansicht als naechste
// Version, statt doppelt angelegt zu werden.
//
// Je Eintrag merkt sich das Protokoll den Hash dessen, was zuletzt ankam.
// Erneut geschickt wird nur, was sich seitdem geaendert hat, mit `error`
// endete oder noch in der Moderation wartet — Letzteres, damit die Anzeige
// „live" wird, sobald jemand freigegeben hat (der Server antwortet dann
// `in-sync` mit `moderation: 'approved'`). `blocked` mit gleichem Inhalt
// waere wieder blockiert. Der
// Knopf „Sync now" schickt trotzdem alles (`force`): der Server antwortet bei
// Unveraendertem mit `in-sync`, und eine inzwischen geaenderte Pruefung auf
// dem Server wird so sichtbar.
//
// Das Protokoll gehoert zu EINEM Server, wie der Cache.
// ───────────────────────────────────────────────────────────────────────────
import type { UploadItem, UploadResult, UploadState } from '../utils/deviceLibraryClient';
import { cameraToFacet, lensToFacet, proposalCore, type LibraryItem } from './facet.ts';

export interface UploadRecord {
  hash: string;
  state: UploadState;
  slug?: string;
  /** Stand in der Moderation, wie der Server ihn meldet — auch bei `in-sync`. */
  moderation?: 'pending' | 'approved';
  at: string;
  error?: string;
  /** Warum blockiert — wie der Server es sagt (`kind` je Befund). */
  findings?: string[];
}

export interface UploadLedger {
  server: string;
  records: Record<string, UploadRecord>;
}

export const emptyLedger = (server: string): UploadLedger => ({ server, records: {} });

export function readLedger(raw: unknown, server: string): UploadLedger {
  if (!raw || typeof raw !== 'object') return emptyLedger(server);
  const l = raw as Partial<UploadLedger>;
  if (l.server !== server || !l.records || typeof l.records !== 'object') return emptyLedger(server);
  return { server, records: l.records };
}

const itemId = (item: LibraryItem) => (item.kind === 'camera' ? item.camera.id : item.lens.id);

/** Schluessel-Reihenfolge egal: derselbe Eintrag, anders sortiert, ist unveraendert. */
const kanonisch = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x);

/** FNV-1a, 32 bit — reicht fuer „hat sich etwas geaendert", ist kein Schutz. */
export function hashOf(value: unknown): string {
  const s = kanonisch(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function toUploadItem(item: LibraryItem): UploadItem & { hash: string } {
  const entry = item.kind === 'camera' ? item.camera : item.lens;
  const core = proposalCore(item, entry.manufacturerUrl ?? '');
  const facet = item.kind === 'camera' ? cameraToFacet(item.camera) : lensToFacet(item.lens);
  return { localId: itemId(item), core, facet, hash: hashOf({ core, facet }) };
}

export function pendingUploads(items: LibraryItem[], ledger: UploadLedger, force = false): (UploadItem & { hash: string })[] {
  return items.map(toUploadItem).filter((u) => {
    if (force) return true;
    const r = ledger.records[u.localId];
    return !r || r.hash !== u.hash || r.state === 'error' || uploadBucket(r) === 'waiting';
  });
}

/** Wohin ein Ergebnis fuer die Anzeige gehoert. Aeltere Protokolle ohne
 *  `moderation` schliessen aus dem Zustand. */
export function uploadBucket(r: UploadRecord): 'live' | 'waiting' | 'blocked' | 'failed' {
  if (r.state === 'blocked') return 'blocked';
  if (r.state === 'error') return 'failed';
  if (r.moderation) return r.moderation === 'approved' ? 'live' : 'waiting';
  return r.state === 'approved' || r.state === 'in-sync' ? 'live' : 'waiting';
}

const befunde = (f: unknown): string[] | undefined =>
  Array.isArray(f)
    ? f.map((x) => (x && typeof x === 'object' ? String((x as { kind?: unknown; message?: unknown }).kind ?? (x as { message?: unknown }).message ?? '') : String(x))).filter(Boolean)
    : undefined;

export function applyUploadResults(
  ledger: UploadLedger,
  sent: { localId: string; hash: string }[],
  results: UploadResult[],
  at: string,
): UploadLedger {
  const records = { ...ledger.records };
  const hashes = new Map(sent.map((s) => [s.localId, s.hash]));
  for (const r of results) {
    const hash = hashes.get(r.localId);
    if (hash === undefined) continue;
    const vorher = records[r.localId];
    records[r.localId] = {
      hash,
      state: r.state,
      // `in-sync` ohne Slug (unveraendert, Server nannte ihn nicht): den alten behalten.
      ...((r.slug ?? vorher?.slug) ? { slug: r.slug ?? vorher?.slug } : {}),
      ...(r.moderation ? { moderation: r.moderation } : {}),
      at,
      ...(r.error ? { error: r.error } : {}),
      ...(befunde(r.findings)?.length ? { findings: befunde(r.findings) } : {}),
    };
  }
  return { ...ledger, records };
}

/** Eintraege, die es lokal nicht mehr gibt, fallen aus dem Protokoll. */
export function pruneLedger(ledger: UploadLedger, liveIds: Set<string>): UploadLedger {
  const records = Object.fromEntries(Object.entries(ledger.records).filter(([id]) => liveIds.has(id)));
  return Object.keys(records).length === Object.keys(ledger.records).length ? ledger : { ...ledger, records };
}
