// ───────────────────────────────────────────────────────────────────────────
// Kamera-Liste (`camera-list` v3, liest v1 bis v3)
//
// Neutrales Format, um in MultiCam platzierte Kameras an den Cable-Planner zu
// uebergeben: dort werden sie zu Equipment-Nodes (Kategorie "Kameras"), die man
// verkabeln kann. Das schliesst die Bruecke "Wo stehen die Kameras?" (MultiCam)
// ↔ "Wie sind sie verkabelt?" (Cable-Planner).
//
// v2 (cable-planner#910) traegt zusaetzlich die Optik — Objektiv, Zoombereich,
// eingestellte Brennweite, Extender, aktiver Mount — und die Hoehe, dazu im
// Umschlag die stabile Projekt-Id (fuer den Abgleich statt Anhaengen). Alles
// davon ist optional und steht nur da, wenn MultiCam es WEISS: eine fehlende
// Angabe bleibt aus, keine Vorgabe, die drueben wie eine Messung aussaehe.
// v1 ist die Teilmenge ohne diese Felder und wird weiter gelesen.
//
// v3 (2026-09-27) traegt die AUSRICHTUNG der Kamera (`pan`, `tilt` in Grad,
// MultiCams Konvention: Pan 0 = nach rechts im Grundriss, Tilt negativ =
// nach unten) und ihre gespeicherten PTZ-PRESETS (Bedarf 14). Der Grund ist
// die Uebergabe einer Festinstallation: das Kamera-Positionsblatt entsteht im
// Cable-Planner, und ein Preset, das nur im Kamerakopf lebt, ist nach dem
// ersten Tausch weg. Ein Preset wird mit dem Stand exportiert, an dem es
// gespeichert wurde — nicht mit den heutigen Werten der Kamera.
//
// Ein Versionssprung und kein stilles Zusatzfeld, weil der Vertrag das so
// verlangt (`__tests__/cameraListContract.test.ts`): ein Leser, der v3 nicht
// kennt, lehnt die Datei benannt ab, statt die Presets still zu verlieren.
//
// Schema-identisch zum Cable-Planner (src/renderer/lib/multicamCameraImport.ts).
// Reine Daten, headless testbar.
// ───────────────────────────────────────────────────────────────────────────
import type { VenueCamera, Camera, Lens } from '../types';
import { geraetetypIdVon } from '../data/geraetetypIds';

export const CAMERA_LIST_KIND = 'camera-list' as const;
export const CAMERA_LIST_VERSION = 3 as const;
export const CAMERA_LIST_READABLE_VERSIONS: readonly number[] = [1, 2, 3];

/** Ein gespeichertes PTZ-Preset, wie es in die Liste geht (v3). */
export interface CameraListPreset {
  number: number; // Preset-Nummer im Geraet, ganze Zahl >= 0
  name: string; // benannter Shot, darf leer sein
  segment?: string;
  pan: number; // Grad
  tilt: number; // Grad
  focalMm: number; // endlich > 0
  focusM: number; // endlich >= 0
  savedAt: string; // ISO — wann das Preset gespeichert wurde
}

/** Das Objektiv an einer Kamera, wie der Katalog es beschreibt. */
export interface CameraListLens {
  manufacturer?: string;
  model?: string;
  focalMinMm?: number; // endlich > 0
  focalMaxMm?: number; // endlich > 0
  mount?: string;
}

export interface CameraListEntry {
  id: string;
  label: string;
  manufacturer?: string;
  model?: string;
  /** Stabile Geraetetyp-Identitaet (GUID, GDTF-analog). Wenn gesetzt, loest der
   *  Cable-Planner die Kamera AUTORITATIV auf ihr Datenblatt/ihre Ports auf,
   *  statt ueber Hersteller/Modell-Namen zu raten. */
  deviceTypeId?: string;
  x?: number; // Meter im Venue (von links)
  y?: number; // Meter im Venue (von oben)
  z?: number; // Meter, Kamerahoehe
  mount?: string; // aktiver Mount am Body
  focalMm?: number; // eingestellte Brennweite, endlich > 0
  extender?: number; // tatsaechlich eingeschalteter Extender-Faktor; fehlt bei keinem/1
  lens?: CameraListLens;
  pan?: number; // v3: Grad, 0 = nach rechts im Grundriss
  tilt?: number; // v3: Grad, negativ = nach unten
  presets?: CameraListPreset[]; // v3: nach Nummer sortiert
}
export interface CameraListExchange {
  kind: typeof CAMERA_LIST_KIND;
  formatVersion: 1 | 2 | 3;
  app: string;
  appVersion: string;
  exportedAt: string;
  projectId?: string; // stabile Id des MultiCam-Projekts
  cameras: CameraListEntry[];
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;
const zahl = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const positiv = (v: unknown): number | undefined => {
  const n = zahl(v);
  return n !== undefined && n > 0 ? n : undefined;
};

/** Ein Objekt ohne die Felder, die nicht bekannt sind. Ein `undefined`-Feld
 *  faellt beim Serialisieren zwar ohnehin weg — aber wer die Liste im
 *  Speicher weiterreicht (der .avplan-Slot), sieht sonst Schluessel ohne Wert. */
function nurBekannt<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Die Presets der Kamera, nach Nummer — oder nichts, wenn sie keine hat. */
function presetsVon(c: VenueCamera): CameraListPreset[] | undefined {
  const liste = [...(c.presets ?? [])]
    .sort((a, b) => a.number - b.number)
    .map((p) =>
      nurBekannt<CameraListPreset>({
        number: p.number,
        name: p.name,
        segment: text(p.segment),
        pan: p.pan,
        tilt: p.tilt,
        focalMm: p.focalLength,
        focusM: p.focusDistance,
        savedAt: p.savedAt,
      }),
    );
  return liste.length > 0 ? liste : undefined;
}

function objektiv(lens: Lens | undefined): CameraListLens | undefined {
  if (!lens) return undefined;
  const o = nurBekannt<CameraListLens>({
    manufacturer: text(lens.manufacturer),
    model: text(lens.model),
    focalMinMm: positiv(lens.focalLengthMin),
    focalMaxMm: positiv(lens.focalLengthMax),
    mount: text(lens.mount),
  });
  return Object.keys(o).length > 0 ? o : undefined;
}

/** Platzierte MultiCam-Kameras → neutrale Kamera-Liste. */
export function toCameraList(
  cameras: VenueCamera[],
  resolveCamera: (cameraId: string) => Camera | undefined,
  meta: { appVersion: string; exportedAt: string; projectId?: string },
  resolveLens: (lensId: string) => Lens | undefined = () => undefined,
): CameraListExchange {
  return nurBekannt<CameraListExchange>({
    kind: CAMERA_LIST_KIND,
    formatVersion: CAMERA_LIST_VERSION,
    app: 'multicam-planner',
    appVersion: meta.appVersion,
    exportedAt: meta.exportedAt,
    projectId: text(meta.projectId),
    cameras: cameras.map((c) => {
      const def = resolveCamera(c.cameraId);
      // Der Extender ist ein Faktor; 1 heisst „keiner". Ein Wahrheitswert aus
      // aelteren Dateien ist kein Faktor und wird nicht zu einem gemacht.
      const extender = positiv(c.extenderActive);
      return nurBekannt<CameraListEntry>({
        id: c.id, label: c.label,
        manufacturer: text(def?.manufacturer), model: text(def?.model),
        // ─── WARUM HIER EIN RUECKFALL STEHT (2026-09-24) ───────────────────
        //
        // `def.deviceTypeId` ist an NEUN der 377 Kameras von Hand gesetzt — an
        // denen, deren echte I/O im Kamera-Katalog des Cable-Planers liegt. Bei
        // den uebrigen 368 stand hier `undefined`, und der Cable-Planer musste
        // wieder ueber Hersteller + Modellnamen raten. Genau das sollte die
        // GUID abschaffen.
        //
        // `geraetetypIdVon` liefert die abgeleitete Id aus der erzeugten
        // Tabelle. Die von Hand gesetzte gewinnt weiter: sie ist aelter, und
        // gespeicherte Plaene zeigen auf sie.
        deviceTypeId: text(def?.deviceTypeId) ?? geraetetypIdVon('camera', def?.id),
        x: zahl(c.x), y: zahl(c.y), z: zahl(c.z),
        // Ohne gewaehlten Wechsel-Mount sitzt der native am Body — das ist
        // die Bedeutung von `activeMount === undefined`, keine Annahme.
        mount: text(c.activeMount) ?? text(def?.mount),
        focalMm: positiv(c.focalLength),
        extender: extender !== undefined && extender !== 1 ? extender : undefined,
        lens: objektiv(resolveLens(c.lensId)),
        pan: zahl(c.pan),
        tilt: zahl(c.tilt),
        presets: presetsVon(c),
      });
    }),
  });
}

/**
 * Ein Eintrag, so wie das Format ihn meint — nicht nur, wie er heisst.
 *
 * BEFUND (Defektformen-Sweep, Form `vertrag-nur-feldnamen`, gemessen
 * 2026-09-07). `parseCameraList` prüfte den Marker, die Version und dass
 * `cameras` ein Array ist — und gab dann `data as CameraListExchange` zurück.
 * Der Cast war die ganze Zusicherung: was in dem Array stand, hat nie jemand
 * angesehen. `cameras: [null, 42, {}, { id: 5, x: "links" }]` kam als
 * wohlgeformte `CameraListExchange` beim Aufrufer an.
 *
 * Der Guard daneben (`__tests__/cameraListContract.test.ts`) fror genau das
 * ein, was auch schon stimmte: die FELDNAMEN, auf beiden Seiten, sogar aus
 * dem Interface-Rumpf gelesen. Über die BEDEUTUNG eines Feldes stand dort
 * nichts — und die Ablehnungs-Fälle deckten nur fremdes `kind`, fremde
 * Version, fehlendes Array und kaputtes JSON ab. Ein Vertrag, der nur Namen
 * kennt, ist beim Empfänger nichts wert: der Cable-Planner baut aus jedem
 * Eintrag einen Equipment-Knoten, und ein Eintrag ohne `id` ergibt einen
 * Knoten ohne Identität, ein `x: "links"` eine Position bei NaN.
 *
 * Deshalb wird hier geprüft, was die Felder BEDEUTEN: `id` und `label` sind
 * Pflicht und nicht leer, `x`/`y`/`z` sind — wenn gesetzt — endliche Zahlen,
 * Brennweiten und Extender-Faktor endlich und größer als 0, `lens` ist ein
 * Objekt, und die optionalen Textfelder sind Text. Abgelehnt wird die DATEI,
 * nicht der Eintrag: eine Liste, aus der stillschweigend eine Kamera fehlt,
 * ist schlimmer als eine, die gar nicht erst lädt.
 */
function pruefeEintrag(roh: unknown, index: number): CameraListEntry {
  const wo = `Kamera #${index + 1}`;
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Error(`${wo}: kein Objekt.`);
  }
  const e = roh as Record<string, unknown>;
  for (const feld of ['id', 'label'] as const) {
    if (typeof e[feld] !== 'string' || (e[feld] as string).trim() === '') {
      throw new Error(`${wo}: Feld „${feld}" fehlt oder ist leer.`);
    }
  }
  pruefeText(e, ['manufacturer', 'model', 'deviceTypeId', 'mount'], wo);
  pruefeZahl(e, ['x', 'y', 'z'], wo);
  // Eine Brennweite und ein Extender-Faktor von 0 oder darunter gibt es
  // nicht; drueben steht daraus sonst „0 mm" am Geraet.
  pruefePositiv(e, ['focalMm', 'extender'], wo);
  if (e.lens !== undefined) {
    if (!e.lens || typeof e.lens !== 'object' || Array.isArray(e.lens)) {
      throw new Error(`${wo}: Feld „lens" ist kein Objekt.`);
    }
    const l = e.lens as Record<string, unknown>;
    pruefeText(l, ['manufacturer', 'model', 'mount'], `${wo}, Objektiv`);
    pruefePositiv(l, ['focalMinMm', 'focalMaxMm'], `${wo}, Objektiv`);
  }
  pruefeZahl(e, ['pan', 'tilt'], wo);
  if (e.presets !== undefined) {
    if (!Array.isArray(e.presets)) throw new Error(`${wo}: Feld „presets" ist keine Liste.`);
    e.presets.forEach((p, i) => pruefePreset(p, `${wo}, Preset #${i + 1}`));
  }
  return roh as CameraListEntry;
}

/**
 * Ein Preset ist nur nachstellbar, wenn Nummer, Ausrichtung, Brennweite und
 * Fokus da sind. Eines ohne sie waere am Pult eine Taste, die irgendwohin
 * faehrt — deshalb sind sie Pflicht, und nur Name und Segment duerfen fehlen
 * bzw. leer sein.
 */
function pruefePreset(roh: unknown, wo: string): void {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) throw new Error(`${wo}: kein Objekt.`);
  const p = roh as Record<string, unknown>;
  if (!Number.isInteger(p.number) || (p.number as number) < 0) {
    throw new Error(`${wo}: Feld „number" ist keine ganze Zahl ab 0.`);
  }
  if (typeof p.name !== 'string') throw new Error(`${wo}: Feld „name" ist kein Text.`);
  if (typeof p.savedAt !== 'string' || p.savedAt.trim() === '') {
    throw new Error(`${wo}: Feld „savedAt" fehlt.`);
  }
  for (const feld of ['pan', 'tilt', 'focalMm', 'focusM'] as const) {
    if (p[feld] === undefined) throw new Error(`${wo}: Feld „${feld}" fehlt.`);
  }
  pruefeText(p, ['segment'], wo);
  pruefeZahl(p, ['pan', 'tilt', 'focusM'], wo);
  pruefePositiv(p, ['focalMm'], wo);
  if ((p.focusM as number) < 0) throw new Error(`${wo}: Feld „focusM" ist kleiner als 0.`);
}

function pruefeText(o: Record<string, unknown>, felder: string[], wo: string): void {
  for (const feld of felder) {
    if (o[feld] !== undefined && typeof o[feld] !== 'string') {
      throw new Error(`${wo}: Feld „${feld}" ist kein Text.`);
    }
  }
}

function pruefeZahl(o: Record<string, unknown>, felder: string[], wo: string): void {
  for (const feld of felder) {
    if (o[feld] !== undefined && !Number.isFinite(o[feld])) {
      throw new Error(`${wo}: Feld „${feld}" ist keine endliche Zahl.`);
    }
  }
}

function pruefePositiv(o: Record<string, unknown>, felder: string[], wo: string): void {
  pruefeZahl(o, felder, wo);
  for (const feld of felder) {
    if (o[feld] !== undefined && (o[feld] as number) <= 0) {
      throw new Error(`${wo}: Feld „${feld}" ist nicht größer als 0.`);
    }
  }
}

export function parseCameraList(text: string): CameraListExchange {
  const data = JSON.parse(text) as Partial<CameraListExchange>;
  if (!data || data.kind !== CAMERA_LIST_KIND) {
    throw new Error('Keine gültige Kamera-Liste (kind != camera-list).');
  }
  if (!CAMERA_LIST_READABLE_VERSIONS.includes(data.formatVersion as number)) {
    throw new Error(`Nicht unterstützte Kamera-Listen-Version: ${data.formatVersion}`);
  }
  if (!Array.isArray(data.cameras)) throw new Error('Kamera-Liste ohne cameras-Array.');
  for (const feld of ['app', 'appVersion', 'exportedAt'] as const) {
    if (typeof data[feld] !== 'string' || data[feld].trim() === '') {
      throw new Error(`Kamera-Liste ohne „${feld}".`);
    }
  }
  // Die Projekt-Id ist der Schluessel, an dem drueben der Abgleich haengt —
  // eine leere waere ein Projekt, dem jede andere leere Id gleicht.
  if (data.projectId !== undefined && (typeof data.projectId !== 'string' || data.projectId.trim() === '')) {
    throw new Error('Kamera-Liste mit leerer oder ungültiger „projectId".');
  }
  const cameras = data.cameras.map(pruefeEintrag);
  return { ...(data as CameraListExchange), cameras };
}
