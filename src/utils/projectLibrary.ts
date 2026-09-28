// ───────────────────────────────────────────────────────────────────────────
// Eigene Kameras und Optiken reisen mit dem Projekt (larszu/cable-planner#917).
//
// Sie lagen nur im localStorage des einen Rechners. Ein Projekt, das eine
// davon benutzt, oeffnete woanders mit einer Kamera, die es nicht gibt — ohne
// Sensor keine Bildwinkel, ohne Optik keine Brennweite. Deshalb schreibt die
// Projektdatei die BENUTZTEN Eintraege mit, und das Laden nimmt fehlende in
// die eigene Bibliothek auf.
//
// NUR DIE BENUTZTEN: die ganze Bibliothek in jede Datei zu legen, verteilte
// beim Weitergeben alles, was jemand je angelegt hat. Dazu zaehlt auch der
// „Schatten" eines eingebauten Modells (eine bearbeitete Kopie mit dessen
// Id): das Projekt rechnet mit ihm, also reist er mit — und gilt auf dem
// anderen Rechner danach wie dort angelegt.
//
// NIE STILL UEBERSCHREIBEN: steht dieselbe Id hier schon mit anderem Inhalt,
// bleibt der eigene Eintrag, und der Konflikt wird gemeldet. Das Projekt
// rechnet dann mit dem hiesigen — das muss man wissen, nicht erraten.
// Unlesbare Eintraege werden nicht aufgenommen, aber gezaehlt: eine Kamera
// ohne Sensormasse braeche jede Bildwinkel-Rechnung, die sie anfasst.
// ───────────────────────────────────────────────────────────────────────────
import type { Camera, Lens, VenueCamera } from '../types';

export interface ProjectLibrary {
  customCameras?: Camera[];
  customLenses?: Lens[];
  libraryCameras?: Camera[];
  libraryLenses?: Lens[];
}

/** Die eigenen Kameras und Optiken, die platzierte Kameras benutzen. Leere
 *  Listen fallen weg — eine Datei ohne eigene Eintraege traegt keine Felder. */
export function pickProjectLibrary(
  cameras: VenueCamera[],
  customCameras: Camera[],
  customLenses: Lens[],
  library: { cameras: readonly Camera[]; lenses: readonly Lens[] } = { cameras: [], lenses: [] },
): ProjectLibrary {
  const kameraIds = new Set(cameras.map((c) => c.cameraId));
  const optikIds = new Set(cameras.map((c) => c.lensId));
  const benutzteKameras = customCameras.filter((c) => kameraIds.has(c.id));
  const benutzteOptiken = customLenses.filter((l) => optikIds.has(l.id));
  // Bibliothekseintraege nur, wo keine eigene Kopie (gleiche Id) sie verdeckt:
  // mit der rechnet das Projekt, und die reist schon oben mit.
  const eigenK = new Set(customCameras.map((c) => c.id));
  const eigenO = new Set(customLenses.map((l) => l.id));
  const bibKameras = library.cameras.filter((c) => kameraIds.has(c.id) && !eigenK.has(c.id));
  const bibOptiken = library.lenses.filter((l) => optikIds.has(l.id) && !eigenO.has(l.id));
  return {
    ...(benutzteKameras.length > 0 ? { customCameras: benutzteKameras } : {}),
    ...(benutzteOptiken.length > 0 ? { customLenses: benutzteOptiken } : {}),
    ...(bibKameras.length > 0 ? { libraryCameras: bibKameras } : {}),
    ...(bibOptiken.length > 0 ? { libraryLenses: bibOptiken } : {}),
  };
}

/**
 * Die mitgebrachten Bibliothekseintraege einer Projektdatei, geprueft wie
 * eigene. Nur Ids der Bibliothek (`devlib-`): eine Datei soll auf diesem Weg
 * keine eingebaute oder eigene Kamera ersetzen koennen.
 */
export function readCarriedLibrary(file: { libraryCameras?: unknown; libraryLenses?: unknown }): {
  cameras: Camera[];
  lenses: Lens[];
  invalid: number;
} {
  let invalid = 0;
  const nimm = <T extends { id: string }>(liste: unknown, gueltig: (v: unknown) => v is T): T[] => {
    if (!Array.isArray(liste)) return [];
    return liste.filter((v): v is T => {
      const ok = gueltig(v) && v.id.startsWith('devlib-');
      if (!ok) invalid += 1;
      return ok;
    });
  };
  const cameras = nimm(file.libraryCameras, istKamera);
  const lenses = nimm(file.libraryLenses, istOptik);
  return { cameras, lenses, invalid };
}

export interface LibraryMerge {
  customCameras: Camera[];
  customLenses: Lens[];
  addedCameras: number;
  addedLenses: number;
  /** Eintraege, deren Id hier mit anderem Inhalt steht — als „Hersteller Modell". */
  conflicts: string[];
  /** Eintraege der Datei, die sich nicht als Kamera/Optik lesen liessen. */
  invalid: number;
}

const istObjekt = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const istText = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const istPositiv = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function istKamera(v: unknown): v is Camera {
  if (!istObjekt(v) || !istText(v.id) || typeof v.manufacturer !== 'string' ||
    typeof v.model !== 'string' || typeof v.mount !== 'string' || !istObjekt(v.sensor)) return false;
  return istPositiv(v.sensor.widthMm) && istPositiv(v.sensor.heightMm) && istPositiv(v.sensor.cropFactor);
}

export function istOptik(v: unknown): v is Lens {
  return istObjekt(v) && istText(v.id) && typeof v.manufacturer === 'string' &&
    typeof v.model === 'string' && typeof v.mount === 'string' &&
    istPositiv(v.focalLengthMin) && istPositiv(v.focalLengthMax) && istPositiv(v.maxApertureWide);
}

/** Vergleich nach Inhalt, nicht nach Schluessel-Reihenfolge: dieselbe Kamera
 *  kann auf zwei Rechnern mit anders sortierten Feldern gespeichert sein. */
const kanonisch = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    istObjekt(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);

function mische<T extends { id: string; manufacturer: string; model: string }>(
  lokal: T[],
  ausDatei: unknown,
  gueltig: (v: unknown) => v is T,
  out: { conflicts: string[]; invalid: number },
): { liste: T[]; neu: number } {
  if (!Array.isArray(ausDatei)) return { liste: lokal, neu: 0 };
  const liste = [...lokal];
  let neu = 0;
  for (const eintrag of ausDatei) {
    if (!gueltig(eintrag)) {
      out.invalid += 1;
      continue;
    }
    const vorhanden = liste.find((l) => l.id === eintrag.id);
    if (!vorhanden) {
      liste.push(eintrag);
      neu += 1;
    } else if (kanonisch(vorhanden) !== kanonisch(eintrag)) {
      out.conflicts.push(`${eintrag.manufacturer} ${eintrag.model}`.trim() || eintrag.id);
    }
  }
  return { liste: neu > 0 ? liste : lokal, neu };
}

/** Nimmt die mitgebrachten Eintraege einer Projektdatei in die eigene
 *  Bibliothek auf, soweit sie fehlen. Rein — schreiben muss der Aufrufer. */
export function mergeProjectLibrary(
  local: { customCameras: Camera[]; customLenses: Lens[] },
  file: { customCameras?: unknown; customLenses?: unknown },
): LibraryMerge {
  const befund = { conflicts: [] as string[], invalid: 0 };
  const kameras = mische(local.customCameras, file.customCameras, istKamera, befund);
  const optiken = mische(local.customLenses, file.customLenses, istOptik, befund);
  return {
    customCameras: kameras.liste,
    customLenses: optiken.liste,
    addedCameras: kameras.neu,
    addedLenses: optiken.neu,
    ...befund,
  };
}
