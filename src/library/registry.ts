// Die abgeglichenen Bibliothekseintraege als Katalogquelle — ausserhalb von
// React lesbar, damit `getCameraById` / `getLensById` sie finden, ohne dass
// jede der zwanzig Aufrufstellen eine dritte Liste durchreichen muss.
//
// Zwei Schichten: der Cache des Abgleichs und die Eintraege, die das offene
// Projekt in seiner Datei mitbringt (`libraryCameras` / `libraryLenses`).
// Die Datei fuellt nur Luecken — steht dieselbe Id im Cache, gilt der Cache.
// Umgekehrt schreibt die Datei nie in den Cache: sie kann aelter sein als er.
//
// Nur Typ-Importe: `cameras.ts` / `lenses.ts` importieren diese Datei, und
// `npm run katalog:cable-ids` liest jene mit Node-Type-Stripping.
import type { Camera, Lens } from '../types';

let cache: { cameras: Camera[]; lenses: Lens[] } = { cameras: [], lenses: [] };
let ausDatei: { cameras: Camera[]; lenses: Lens[] } = { cameras: [], lenses: [] };
let vereint: { cameras: Camera[]; lenses: Lens[] } = { cameras: [], lenses: [] };

function vereinen() {
  const kIds = new Set(cache.cameras.map((c) => c.id));
  const oIds = new Set(cache.lenses.map((l) => l.id));
  vereint = {
    cameras: [...cache.cameras, ...ausDatei.cameras.filter((c) => !kIds.has(c.id))],
    lenses: [...cache.lenses, ...ausDatei.lenses.filter((l) => !oIds.has(l.id))],
  };
}

export const libraryCameras = (): readonly Camera[] => vereint.cameras;
export const libraryLenses = (): readonly Lens[] => vereint.lenses;

/** Nur aus der Projektdatei, nicht (mehr) im Cache. */
export const isCarriedByProject = (id: string): boolean =>
  !cache.cameras.some((c) => c.id === id) && !cache.lenses.some((l) => l.id === id) &&
  (ausDatei.cameras.some((c) => c.id === id) || ausDatei.lenses.some((l) => l.id === id));

export function setLibraryCatalog(next: { cameras: Camera[]; lenses: Lens[] }): void {
  cache = next;
  vereinen();
}

export function setProjectLibraryEntries(next: { cameras: Camera[]; lenses: Lens[] }): void {
  ausDatei = next;
  vereinen();
}
