// Portables Lager-Format — App-übergreifender Austausch (cable/light/multicam).
// Schema-identisch zu cable-planner src/renderer/lib/inventoryPortable.ts.
import type { InventoryItem, StorageNode, InventorySet, InventoryUnit, FristArtDef } from './types';

export const INVENTORY_FORMAT = 'avplan-inventory';
// Version 2 (ADR-002): `InventoryItem.deviceTypeId`.
//
// ADR-005, Inkrement 4 — hier stand als Begruendung, ein Stand ohne das Feld
// wuerde es beim Re-Export verlieren. Das ist aus dem cable-planner kopiert
// und trifft HIER nicht zu: dort baut `healItem` jeden Artikel Feld fuer Feld
// neu auf, hier reicht die Kette parse -> Store -> serialize die Objekte
// unveraendert durch, ein unbekanntes Feld ueberlebt also.
//
// Was die Version hier wirklich leistet: sie weist eine ZU NEUE Datei ab,
// statt sie halb zu lesen. Die andere Richtung — eine zu ALTE Datei, die beim
// Zusammenfuehren etwas WEGNIMMT — deckt sie nicht ab; dafuer ist `merge.ts`
// da. Aeltere Dateien lesen wir unveraendert weiter.
//
// Version 3 (Bedarf 107): `InventoryUnit.houseRef` — die haus-eigene Referenz
// neben der Hersteller-Seriennummer. Die Erhoehung ist hier nicht optional,
// auch wenn dieser Planer Felder unveraendert durchreicht: sie steht in
// ALLEN DREI Apps auf demselben Wert, und bliebe sie hier auf 2, wiese dieser
// Planer jede Datei ab, die der cable-planner ab jetzt schreibt.
//
// Version 4 (Bedarf 118): `InventoryUnit.anschaffung`,
// `InventoryUnit.versicherungswert` und `InventoryItem.ursprungsland` — die
// Angaben, aus denen im cable-planner Versicherungsliste und Carnet-Datenblatt
// entstehen. Dieser Planer wertet sie nicht aus; er FUEHRT sie, damit eine
// Datei mit Versicherungswerten hier durchlaeuft, ohne sie zu verlieren.
// Aeltere Dateien (v1-v3) lesen wir unveraendert weiter.
//
// Version 5 (B-65): `InventoryItem.mindestmenge` -- ab wann das Haus
// nachbestellt oder sub-hired. Gepflegt wird sie im Lager-Werkzeug
// (`inventory-planner`), das sie in seiner Kachel „Unter Ziel" auswertet.
// Dieser Planer wertet sie nicht aus; er FUEHRT sie, damit eine Datei mit
// Mindestmengen hier durchlaeuft, ohne sie zu verlieren.
//
// Die Erhoehung ist auch hier nicht optional, aus demselben Grund wie bei
// Version 3: die Zahl steht in ALLEN Repos, die ein Lager anfassen, auf
// demselben Wert. Bliebe sie hier auf 4, wiese dieser Planer jede Datei ab,
// die das Lager-Werkzeug und der cable-planner ab jetzt schreiben.
// Aeltere Dateien (v1-v4) lesen wir unveraendert weiter.
//
// Version 6 (B-65): `InventoryUnit.fristen` -- was an einer Einheit
// turnusmaessig faellig ist (DGUV-V3-Pruefung, Kalibrierung, Wartung,
// Akku). Ausgewertet wird das im Lager-Werkzeug; dieser Planer FUEHRT es,
// damit eine Datei mit Pruefterminen hier durchlaeuft, ohne sie zu
// verlieren.
//
// Die Erhoehung ist auch hier nicht optional, aus demselben Grund wie bei
// Version 3: die Zahl steht in ALLEN Repos, die ein Lager anfassen, auf
// demselben Wert. Bliebe sie hier auf 5, wiese dieser Planer jede Datei ab,
// die das Lager-Werkzeug und der cable-planner ab jetzt schreiben.
// Aeltere Dateien (v1-v5) lesen wir unveraendert weiter.
// Version 7 (Eigentuemer-Entscheidung 2026-09-10): `fristArten` -- die
// Fristarten, die das HAUS selbst angelegt hat, und die eingebaute Art
// `haltbarkeit` fuer Verbrauchsmaterial mit Ablaufdatum.
//
// Der Verlust, den diese Version verhindert, ist ein anderer als bei 3 bis 6.
// Dort ging ein FELD verloren; hier ginge die BEDEUTUNG verloren. `Frist.art`
// war eine feste Aufzaehlung, und jeder Leser zog eine unbekannte Art auf
// `sonstige` -- gut gemeint, damit ein Termin nicht verschwindet. Sobald ein
// Haus eigene Arten fuehrt (Anschlagmittel, Leiterpruefung, Feuerloescher,
// Nebelfluid-Charge), macht dieselbe Zeile aus jeder davon „Sonstige": der
// Termin steht noch auf der Liste, aber ohne den Grund, aus dem ihn jemand
// eingetragen hat. Wer die Liste abarbeitet, weiss nicht mehr, was zu tun ist.
//
// Deshalb zwei Dinge zusammen: die Liste reist mit, UND eine unbekannte Art
// bleibt stehen, wie sie ist. Die Anzeige sagt dann, dass sie die Art nicht
// kennt -- das ist eine Auskunft, „Sonstige" waere eine Behauptung.
//
// Aeltere Dateien (v1-v6) lesen wir unveraendert weiter; ihre Fristen tragen
// eingebaute Arten, und eine Liste eigener Arten haben sie schlicht nicht.
//
// Version 8 (Ladeplanung): `transport` an `InventoryCase` und an `StorageNode`
// -- Rollen, Rollenteller, zulaessige Lagen, Nachgeben (`types/transport.ts`).
// Dieselbe Begruendung wie bei Version 2 und 3: die `heal*`-Funktionen bauen
// jeden Knoten Feld fuer Feld neu auf, ein Stand ohne dieses Feld wuerde es
// beim Re-Export STILL verlieren. Mit der Version weigert sich ein aelterer
// Planer stattdessen.
//
// Die Felder stehen bewusst NICHT in `PhysicalDimensions`. Das liegt
// byte-gleich in den Planern; es zu erweitern waere ein Versionssprung in
// allen Repos fuer etwas, das nur die Ladeplanung braucht. Als eigener
// optionaler Nachbar bleibt `PhysicalDimensions` unveraendert.
//
// Ebenfalls Version 8: `StorageNode.stellplatz` -- die Lage eines festen
// Lagerplatzes im Hallen-Grundriss. Das Feld kam im Lager-Werkzeug OHNE
// eigenen Sprung dazu (2026-09-18) und wurde erst beim Abgleich aller Kopien
// am 2026-09-24 gefunden. Kein Schaden entstanden: bis dahin las kein Planer
// Version 8, jeder lehnte die Datei also ab statt sie zu kuerzen. Es gehoert
// damit zu 8 und nicht zu 9 -- jede Kopie, die 8 liest, kennt beide Felder.
//
// ABGEGLICHEN AM 2026-09-24 in allen Kopien: inventory-planner,
// cable-planner, light-planner, multicam-planner, und in der Suite
// `packages/inventory-core`, `apps/cable-planner`, `apps/inventory-planner`.
export const INVENTORY_FORMAT_VERSION = 8;

export interface InventorySnapshot {
  items: InventoryItem[];
  nodes: StorageNode[];
  sets: InventorySet[];
  units: InventoryUnit[];
  /**
   * Die selbst angelegten Fristarten des Hauses (Version 7).
   *
   * Optional heisst: die Datei stammt aus einem Haus, das keine eigenen
   * fuehrt -- nicht, dass es keine gibt. Die eingebauten Arten stehen
   * hier NIE drin; sie kennt jede App.
   */
  fristArten?: FristArtDef[];
}

interface PortableFile extends InventorySnapshot {
  format: typeof INVENTORY_FORMAT;
  version: number;
  exportedAt?: string;
  app?: string;
}

export function serializeInventory(snap: InventorySnapshot, meta?: { exportedAt?: string; app?: string }): string {
  const file: PortableFile = {
    format: INVENTORY_FORMAT,
    version: INVENTORY_FORMAT_VERSION,
    exportedAt: meta?.exportedAt,
    app: meta?.app,
    items: snap.items,
    nodes: snap.nodes,
    sets: snap.sets,
    units: snap.units,
    fristArten: snap.fristArten,
  };
  return JSON.stringify(file, null, 2);
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Die eigenen Fristarten heilen.
 *
 * Eine Art ohne Id oder ohne Namen ist keine: unter ihr stuende in der Liste
 * nichts, und ein Termin, dessen Art nichts sagt, ist ein Termin ohne Grund.
 * Doppelte Ids fallen weg -- die erste gilt, wie ueberall in diesem Format.
 */
const heileFristArten = (raw: unknown): FristArtDef[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const gesehen = new Set<string>()
  const aus: FristArtDef[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const d = e as Partial<FristArtDef>
    const id = typeof d.id === 'string' ? d.id.trim() : ''
    const name = typeof d.name === 'string' ? d.name.trim() : ''
    if (!id || !name || gesehen.has(id)) continue
    gesehen.add(id)
    aus.push({
      id,
      name,
      ...(typeof d.standardIntervallMonate === 'number' && d.standardIntervallMonate > 0
        ? { standardIntervallMonate: Math.round(d.standardIntervallMonate) }
        : {}),
      ...(typeof d.grundlage === 'string' && d.grundlage.trim() ? { grundlage: d.grundlage.trim() } : {}),
    })
  }
  return aus.length > 0 ? aus : undefined
}

export function parseInventory(json: string): InventorySnapshot | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const f = data as Partial<PortableFile>;
  if (f.format !== INVENTORY_FORMAT) return null;
  if (typeof f.version !== 'number' || f.version > INVENTORY_FORMAT_VERSION) return null;
  return {
    items: arr<InventoryItem>(f.items),
    nodes: arr<StorageNode>(f.nodes),
    sets: arr<InventorySet>(f.sets),
    units: arr<InventoryUnit>(f.units),
    ...(heileFristArten(f.fristArten) ? { fristArten: heileFristArten(f.fristArten) } : {}),
  };
}

/** Code (QR/Barcode/Seriennr.) → Artikel/Lagerort/Einheit. */
export type ScanMatch =
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'node'; node: StorageNode }
  | { kind: 'unit'; unit: InventoryUnit };

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

export function resolveInventoryCode(
  raw: string,
  src: { items: InventoryItem[]; nodes: StorageNode[]; units: InventoryUnit[] },
): ScanMatch | null {
  const needle = norm(raw);
  if (!needle) return null;
  // Bedarf 107 — die Hausreferenz ist die wahrscheinlichste Eingabe von allen:
  // sie klebt auf dem Case und wird abgetippt, wenn der Aufkleber unlesbar
  // geworden ist.
  const unit = src.units.find(
    (u) => norm(u.code) === needle || norm(u.houseRef) === needle || norm(u.serial) === needle,
  );
  if (unit) return { kind: 'unit', unit };
  const node = src.nodes.find((n) => norm(n.code) === needle);
  if (node) return { kind: 'node', node };
  const item = src.items.find((it) => norm(it.code) === needle);
  if (item) return { kind: 'item', item };
  return null;
}

/**
 * Wie eine Einheit auf einem Blatt dieses Planers heisst (Bedarf 107).
 *
 * Dieser Planer zeigt Einheiten nur intern an — Scan-Treffer, Bestandsliste —
 * also gilt hier durchgehend die HAUS-Sicht: die Hausreferenz vorne, weil sie
 * die Nummer ist, die auf dem Case klebt. Fehlt sie, wird die Herstellernummer
 * genommen und BENANNT: „S0134-77 (Herstellernummer)" ist eine Auskunft,
 * dieselbe Nummer nackt waere eine Verwechslung.
 *
 * Die volle Regel mit beiden Lese-Richtungen steht im cable-planner
 * (`lib/unitIdentity.ts`); dort werden auch Versicherungs- und Sub-Hire-Blätter
 * gedruckt. Hier steht bewusst nur die Haelfte, die dieser Planer braucht —
 * dieselbe Duplikation wie beim Format selbst, und mit demselben Grund.
 */
export function unitLabel(unit: InventoryUnit): string {
  const house = unit.houseRef?.trim();
  if (house) return house;
  const serial = unit.serial?.trim();
  if (serial) return `${serial} (Herstellernummer)`;
  const code = unit.code?.trim();
  if (code) return code;
  return 'ohne Nummer';
}
