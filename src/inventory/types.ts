/**
 * Phase 2 — Zentraler Bestand (siehe docs/inventory-rental-readiness.md).
 *
 * Ein `InventoryItem` ist ein **Lager-Artikel** (ein Modell mit Menge N) —
 * bewusst getrennt vom `EquipmentItem` (Plan-Instanz auf dem Canvas). Der
 * Bestand lebt projektübergreifend im `inventoryStore` (localStorage),
 * unabhängig vom gerade geöffneten Plan.
 *
 * Lager-Modul (projektübergreifende Codes, Maße, Cases): Anders als die
 * projektgebundenen QR-Codes auf Kabeln/Geräten (siehe `qrPayload.ts`) trägt
 * ein Lager-Artikel einen **festen** Code (QR ODER Barcode), der über alle
 * Projekte hinweg denselben Artikel meint (touring-tauglich).
 */
import type { TransportSpec } from './transport'

/** Eigentumsverhältnis — gleiche Werte wie `EquipmentItem.ownership`. */
export type InventoryOwnership = 'owned' | 'rented' | 'subhire'

/** Etiketten-Codeart eines Lager-Artikels/Cases. */
export type InventoryCodeType = 'qr' | 'barcode'

/**
 * Material-Art (orthogonal zum Eigentum): Vermietmaterial wird verliehen und
 * kommt zurück; Verbrauchsmaterial (Gaffa, Batterien, Kabelbinder) wird
 * aufgebraucht. Ein Artikel darf beides sein (z. B. Verbrauchs- UND
 * Vermietware in Mischkalkulation), daher eine Menge statt Enum.
 */
export type InventoryMaterialKind = 'rental' | 'consumable'

/** Physische Maße in mm + Gewicht in kg. Alle Felder optional (nichts erfinden). */
export interface PhysicalDimensions {
  widthMm?: number
  heightMm?: number
  depthMm?: number
  weightKg?: number
}

/**
 * Ein Geldbetrag — Betrag UND Waehrung, immer zusammen (Bedarf 118).
 *
 * OHNE WAEHRUNG KEIN BETRAG. Eine Zahl ohne Kuerzel ist in einer
 * Versicherungssumme nichts wert, und sie stillschweigend zu „EUR" zu erklaeren
 * waere eine Annahme ueber einen fremden Vertrag. Summiert wird je Waehrung
 * getrennt; ein Umrechnungskurs waere ein Wert ohne Fundstelle.
 *
 * GANZZAHLIG in der kleinsten Einheit — `0.1 + 0.2` ist in Fliesskomma nicht
 * `0.3`, und eine Versicherungssumme, die um Cent daneben liegt, ist eine Zahl,
 * der jemand widerspricht.
 *
 * DIE LISTEN DAZU STEHEN IM CABLE-PLANNER (`lager/lib/insuranceSchedule.ts`).
 * Hier stehen nur die FELDER — damit dieser Planer eine Datei mit
 * Versicherungswerten lesen und unveraendert zurueckschreiben kann, statt sie
 * still zu verlieren.
 */
export interface Geldbetrag {
  /** Betrag in der kleinsten Einheit der Waehrung (Cent, Penny, …). */
  cent: number;
  /** Waehrungskuerzel nach ISO 4217. ANGEGEBEN, nie geraten. */
  waehrung: string;
}

/** Was eine Einheit gekostet hat, und wann (Bedarf 118). */
export interface Anschaffung {
  betrag: Geldbetrag;
  /** Kaufdatum (ISO). */
  am?: string;
}

/**
 * Wofuer eine Einheit versichert ist, und mit welchem Stand (Bedarf 118).
 *
 * KEIN ZEITWERT. Anschaffungspreis und Versicherungswert werden nicht
 * auseinander gerechnet: nach welcher Regel abgeschrieben wird, entscheidet der
 * Versicherer, und diese Anwendung kennt seinen Vertrag nicht.
 */
export interface Versicherungswert {
  betrag: Geldbetrag;
  /** Stand des Werts (ISO-Datum). */
  stand?: string;
}

/**
 * Was an einer Einheit turnusmaessig faellig ist (B-65).
 *
 * Gepflegt und ausgewertet wird das im Lager-Werkzeug
 * (`inventory-planner`, Block „Fristen"); dieser Planer FUEHRT es nur,
 * damit eine Datei mit Pruefterminen hier durchlaeuft, ohne sie zu
 * verlieren -- dieselbe Rolle wie bei `mindestmenge` und den
 * Versicherungswerten aus Bedarf 118.
 *
 * Ein generischer Termin und nicht drei Felder: ein Termin ist immer
 * dieselbe Sache -- ein Datum, ab dem etwas nicht mehr gilt. Woran es
 * haengt, sagt `art`.
 */
/**
 * Die Fristarten, die jede App mitbringt.
 *
 * `haltbarkeit` ist seit 2026-09-10 dabei (Eigentuemer-Entscheidung):
 * Verbrauchsmaterial mit Ablaufdatum -- Batterien, Gaffa, Filter,
 * Nebelfluid -- ist KEIN zweites Modell, sondern eine weitere Art von
 * Termin. Ein Ablaufdatum und ein Prueftermin sind dieselbe Sache: ein
 * Datum, ab dem etwas nicht mehr gilt. Zwei Mechaniken dafuer haetten
 * geheissen, dass jede kuenftige Auswertung beide fragen muss -- und die
 * naechste fragt dann eine.
 */
export const EINGEBAUTE_FRIST_ARTEN = [
  'dguv-v3',
  'kalibrierung',
  'wartung',
  'akku',
  'haltbarkeit',
  'sonstige',
] as const

export type EingebauteFristArt = (typeof EINGEBAUTE_FRIST_ARTEN)[number]

/**
 * Die Art einer Frist: eine eingebaute Id oder eine, die das Haus selbst
 * angelegt hat.
 *
 * ─── WARUM DAS KEINE FESTE AUFZAEHLUNG MEHR IST ─────────────────────────
 *
 * Sie war eine, und die Liste war die Kenntnis ihres Autors. Was ein Haus
 * turnusmaessig prueft, weiss aber nur das Haus: Leiter- und
 * Traversenpruefung, Anschlagmittel, Feuerloescher, Erste-Hilfe-Kasten,
 * Nebelfluid-Charge, TUeV am Anhaenger. Jede dieser Fristen landete unter
 * `sonstige`, und damit war die Ampel im Lager fuer alles ausser den vier
 * eingebauten Arten eine Sammelmeldung ohne Sortierung.
 *
 * `(string & {})` statt `string`: der Typ bleibt offen, aber die
 * eingebauten Ids stehen weiter in der Vervollstaendigung. Ein blankes
 * `string` haette beides gekostet.
 */
export type FristArt = EingebauteFristArt | (string & {})

/**
 * Eine Fristart, wie das Haus sie fuehrt.
 *
 * Reist im Inventar-Datei-Format mit (`fristArten`), und zwar NUR die selbst
 * angelegten: die eingebauten kennt jede App ohnehin, und sie mitzuschicken
 * hiesse, ihre Uebersetzung in die Datei zu schreiben.
 */
export interface FristArtDef {
  /** Stabile Id. Unter ihr steht sie in `Frist.art`. */
  id: string
  /** Anzeigename, so wie das Haus sie nennt. */
  name: string
  /** Vorschlag fuer das Intervall in Monaten, wenn eine neue angelegt wird. */
  standardIntervallMonate?: number
  /**
   * Woran die Frist haengt -- nur zur Anzeige, nicht zur Rechnung.
   * Freitext: „DGUV V3", „Herstellerangabe", „Hausregel".
   */
  grundlage?: string
}

export interface Frist {
  /**
   * Eingebaute Id oder eine aus `fristArten`.
   *
   * Eine Id, die WEDER eingebaut ist NOCH in der Liste steht, bleibt
   * trotzdem stehen. Sie auf `sonstige` zu ziehen war bis 2026-09-10 die
   * Regel und ist jetzt genau der Verlust, den es zu vermeiden gilt: die
   * Datei sagt „Anschlagmittel", der Leser macht daraus „Sonstige", und der
   * Termin steht auf der Liste ohne den Grund, aus dem ihn jemand
   * eingetragen hat. Die Anzeige sagt stattdessen, dass sie die Art nicht
   * kennt.
   */
  art: FristArt
  /** Freitext, wenn `art` es nicht sagt (bei `sonstige` das Einzige). */
  bezeichnung?: string
  /** Wann sie zuletzt erledigt wurde (ISO-Datum). */
  zuletzt?: string
  /** Abstand bis zur naechsten, in Monaten. */
  intervallMonate?: number
  /** Der naechste Termin (ISO-Datum). Ohne ihn und ohne Intervall gibt es keinen. */
  faellig?: string
}

export interface InventoryItem {
  id: string
  /** Modell-/Artikelname (Pflicht, Anzeigename). */
  model: string
  /** Optionaler Hersteller. */
  manufacturer?: string
  /** Kategorie (gleiche Taxonomie wie `EquipmentItem.category`). */
  category?: string;
  /**
   * ADR-002 — stabile Geraetetyp-Identitaet, dieselbe GUID wie im Katalog des
   * cable-planners (`EquipmentItem.deviceTypeId`). Ist sie gesetzt, ist die
   * Zuordnung Plan-Geraet -> Lager-Position eine Tatsache statt eines
   * Namensvergleichs. Optional, weil ein Lager mehr enthaelt als der Katalog
   * kennt.
   */
  deviceTypeId?: string
  /** Gesamtmenge im Bestand. */
  quantity: number
  /**
   * Mindestmenge -- ab wann das Haus nachbestellt oder sub-hired (B-65).
   *
   * Gepflegt wird sie im Lager-Werkzeug (`inventory-planner`); dieser Planer
   * FUEHRT sie nur, damit eine Datei mit Mindestmengen hier durchlaeuft,
   * ohne sie zu verlieren -- dieselbe Rolle wie bei `ursprungsland` und den
   * Versicherungswerten aus Bedarf 118.
   *
   * Optional heisst UNBEWERTET und nicht 0: eine 0 waere die Aussage „darf
   * leer sein", und die trifft jemand ausdruecklich.
   */
  mindestmenge?: number
  /** Mietpreis pro Tag (Kalkulation, Phase 5). */
  rentPricePerDay?: number
  /** Lagerort (z. B. "Regal A3"). */
  stockLocation?: string
  /** Lieferant / Sub-Vermieter. */
  supplier?: string
  /** Eigentum (owned/rented/subhire). */
  ownership?: InventoryOwnership
  /**
   * Wann fremdes Material zurueckmuss (ISO-Datum, Bedarf 82).
   *
   * Der Bedarf zieht die Grenze selbst: „the achievable win is a flag on the
   * inventory unit, NOT A SUPPLIER PORTAL. […] mark ownership and return date
   * inside the job and stop there." Kein Bestellwesen — ein Datum.
   *
   * Und er sagt, warum: „the failure mode is not losing sub-hire gear, IT IS
   * KEEPING IT THREE WEEKS TOO LONG." Jeder Tag darueber ist eine weitere
   * Mietwoche.
   *
   * Ohne `ownership` ausser `owned` bedeutungslos.
   *
   * TEIL DES WIRE-CONTRACTS `avplan-inventory` und deshalb in ALLEN DREI Apps
   * identisch. Die Formatversion bleibt bei 2: ein hinzugefuegtes OPTIONALES
   * Feld ist in beide Richtungen vertraeglich (unbekannte Schluessel werden
   * beim Lesen ignoriert, ein fehlendes ist erlaubt). Eine 3 haette dagegen
   * jede aeltere App die Datei ABLEHNEN lassen — `parseInventory` verwirft
   * `f.version > INVENTORY_FORMAT_VERSION` —, und zwar so lange, bis alle
   * drei ausgeliefert sind.
   */
  returnDue?: string
  /** Fester Etiketten-Code (projektübergreifend). */
  code?: string
  /** Codeart des Etiketts (QR oder Barcode). */
  codeType?: InventoryCodeType
  /**
   * Aktueller Lagerort (Referenz auf `StorageNode.id`). Zeigt er auf einen
   * Container (case/transportCase), gilt der Artikel als DORT eingepackt —
   * „Case als Lagerort zuweisen" = einpacken. Kein separater Pack-Zustand:
   * die Zugehörigkeit ergibt sich allein aus dem Lager-Baum (LPN-Prinzip).
   */
  locationId?: string
  /** Physische Artikelmaße (für Case-Packing). */
  dimensions?: PhysicalDimensions
  /**
   * Ursprungsland nach ISO 3166-1 alpha-2 („DE", „JP") — Bedarf 118, fuer das
   * Carnet-Datenblatt im cable-planner. Am ARTIKEL, weil es eine Eigenschaft
   * des Modells ist.
   */
  ursprungsland?: string;
  /** Material-Art(en): Vermiet- und/oder Verbrauchsmaterial. */
  materialKinds?: InventoryMaterialKind[]
  /** Freie Notiz. */
  notes?: string
  /** ISO-Zeitstempel. */
  createdAt: string
  updatedAt: string
}

/** Ein in einem Case verpackter Artikel + Stückzahl. */
export interface CasePackedItem {
  /** Referenz auf `InventoryItem.id`. */
  itemId: string
  /** Anzahl dieses Artikels im Case. */
  quantity: number
}

/**
 * Ein Case/Flightcase, das Artikel aufnimmt. Trägt eigene (Außen-)Maße +
 * optionalen festen Code. Die verpackten Artikel referenzieren `InventoryItem`
 * über die id — die Artikelmaße liegen am Artikel, nicht dupliziert im Case.
 */
export interface InventoryCase {
  id: string
  /** Anzeigename (z. B. "Case 1 — Funkstrecken"). */
  name: string
  /** Außenmaße + Leergewicht des Cases. */
  dimensions?: PhysicalDimensions
  /**
   * Rollen, Rollenteller, zulässige Lagen, Nachgeben — alles, was für die
   * Ladeplanung zählt und nicht Aussenmass ist. Siehe `types/transport.ts`;
   * bewusst NICHT in `PhysicalDimensions`, weil das byte-gleich in den
   * Planern liegt.
   */
  transport?: TransportSpec
  /** Fester Etiketten-Code des Cases. */
  code?: string
  codeType?: InventoryCodeType
  /** Lagerort des Cases. */
  stockLocation?: string
  /** Verpackte Artikel. */
  contents: CasePackedItem[]
  /** Freie Notiz. */
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── LPN-Modell (License Plate Number) ────────────────────────────────────────
// Warehouse-Best-Practice: JEDE scanbare Einheit — Lagerplatz (Depot/Raum/
// Regal/Fach) UND Container (Case/Transport-Case) — ist derselbe Knotentyp im
// selben Baum. So löst sich alles aus dem Baum ab: „Case in Case in
// Transport-Case", „Artikel in Case einpacken" (= locationId auf Case-Knoten)
// und „effektiver Lagerort" (oberster Vorfahr). Quelle: LPN/Nested-LPN (WMS).

/**
 * Die Lage eines festen Lagerplatzes im Grundriss, in Millimetern.
 *
 * Ursprung ist die linke hintere Ecke der Halle; x läuft nach rechts, z in
 * die Tiefe, y nach oben — dieselben Achsen wie im Laderaum des Packers
 * (`loadPacker/typen.ts`), damit niemand zwei Systeme im Kopf halten muss.
 */
export interface Stellplatz {
  xMm: number
  zMm: number
  breiteMm: number
  tiefeMm: number
  /** Höhe des Regals. Fehlt sie, wird im 3D nichts aufgebaut. */
  hoeheMm?: number
  /** Drehung um die Hochachse in Grad. 0 = Front nach vorn (+z). */
  drehung?: number
  /** Wieviele Ebenen das Regal trägt — für die Kennung und das Bild. */
  ebenen?: number
}

/** Art eines Lager-Knotens. `case`/`transportCase` sind Container. */
export type StorageNodeKind = 'depot' | 'room' | 'shelf' | 'bin' | 'case' | 'transportCase'

/** Container-Arten (können bewegt werden + Inhalt tragen). */
export const CONTAINER_KINDS: readonly StorageNodeKind[] = ['case', 'transportCase']

/** Ein Knoten im Lager-Baum: Lagerplatz ODER Container. */
export interface StorageNode {
  id: string
  /** Anzeigename (z. B. "Regal A3", "Transport-Case 1"). */
  name: string
  kind: StorageNodeKind
  /**
   * Übergeordneter Knoten. Lagerplatz-Baum (Depot → Raum → Regal → Fach) und
   * Container-Verschachtelung (Case in Case in Transport-Case) nutzen dasselbe
   * Feld. Wurzelknoten haben keinen Parent.
   */
  parentId?: string
  /** Fester Etiketten-Code — Lagerplätze UND Cases sind scanbar. */
  code?: string
  codeType?: InventoryCodeType
  /**
   * Wo der Lagerplatz IM RAUM steht (2D-Grundriss und 3D).
   *
   * ─── WARUM DAS NICHT `dimensions` IST ────────────────────────────────────
   *
   * `dimensions` sind die Aussenmasse eines Containers — was er wiegt und
   * wie gross er ist, damit er in einen LKW passt. `stellplatz` ist etwas
   * anderes: die LAGE eines festen Lagerplatzes in der Halle. Ein Regal hat
   * beides (es ist so tief wie es ist, und es steht an einer Stelle), ein
   * Case hat nur das erste — es steht heute hier und morgen dort.
   *
   * ─── OHNE EINTRAG STEHT ES NIRGENDS ──────────────────────────────────────
   *
   * Nicht bei (0,0). Ein Punkt im Ursprung sähe im Grundriss aus wie eine
   * Angabe über die Halle; das ist dieselbe Regel, an der `belastbarkeit()`
   * im Facility-Planner `watt: null` mit Grund zurückgibt.
   */
  stellplatz?: Stellplatz

  /** Außenmaße + Leergewicht (v. a. für Container). */
  dimensions?: PhysicalDimensions
  /**
   * Rollen, Rollenteller, zulässige Lagen, Nachgeben — alles, was für die
   * Ladeplanung zählt und nicht Aussenmass ist. Siehe `types/transport.ts`;
   * bewusst NICHT in `PhysicalDimensions`, weil das byte-gleich in den
   * Planern liegt.
   */
  transport?: TransportSpec
  /** Freie Notiz. */
  notes?: string
  createdAt: string
  updatedAt: string
}

/** Eine Komponente eines logischen Sets (Artikel + Stückzahl). */
export interface SetComponent {
  itemId: string
  quantity: number
}

/**
 * Logisches Set/Kit (Vorlage) — „diese Artikel gehören zusammen". Anders als
 * ein Container (physische Kiste) ist ein Set eine Zusammenstellung; seine
 * Verfügbarkeit ergibt sich aus der knappsten Komponente (HireHop Virtual
 * Stock / Cheqroom Kits).
 */
export interface InventorySet {
  id: string
  name: string
  components: SetComponent[]
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Serialisierung (Einzel-Units mit Historie) ───────────────────────────────
// Rentmans meistgewünschter Fix: neben dem Bulk-Modell (Artikel mit Menge N)
// die EINZELNE physische Einheit — eigene Seriennr./Code, eigener Lagerort,
// eigener Zustand + Historie (wo war sie, wann repariert). Ein Unit gehört zu
// genau einem `InventoryItem` (Modell).

/** Zustand einer Einzel-Einheit. */
export type UnitCondition = 'ok' | 'defect' | 'inRepair' | 'retired'

/** Ereignis-Typ in der Unit-Historie. */
export type UnitEventKind = 'created' | 'moved' | 'condition' | 'note'

/** Ein Eintrag in der Historie einer Einheit (append-only). */
export interface UnitEvent {
  /** ISO-Zeitstempel. */
  at: string
  kind: UnitEventKind
  /** Menschlich lesbare Beschreibung (z. B. „nach Case 2", „defekt → Reparatur"). */
  detail: string
}

/** Eine serialisierte Einzel-Einheit eines Artikel-Modells. */
export interface InventoryUnit {
  id: string
  /** Referenz auf das Artikel-Modell (`InventoryItem.id`). */
  itemId: string
  /**
   * Die HERSTELLER-Seriennummer.
   *
   * Bedarf 107 — das Feld hiess „Hersteller ODER intern", und genau das ist
   * der Defekt: ein Feld fuer zwei Identitaeten zwingt das Lager zur Wahl,
   * und die andere landet mit Filzstift auf dem Case. Gebraucht werden beide,
   * von verschiedenen Leuten: die Herstellernummer fuer Versicherung,
   * Sub-Vermietung und Wartung, die Hausnummer fuer alles Interne.
   */
  serial?: string;
  /**
   * Die HAUS-EIGENE Referenz („AV-0421") — die Nummer, unter der dieses Haus
   * die Einheit fuehrt. Steht NEBEN `serial` und nicht statt ihr; ein
   * Altbestand, in dem die Hausnummer im `serial`-Feld steht, wird NICHT
   * automatisch umgeraeumt.
   */
  houseRef?: string;
  /** Fester Etiketten-Code der Einheit. */
  code?: string
  codeType?: InventoryCodeType
  /** Aktueller Lagerort (Referenz auf `StorageNode.id`) — wie beim Artikel. */
  locationId?: string
  /** Zustand (Wartung/Reparatur). */
  condition: UnitCondition
  /** Bedarf 118 — was sie gekostet hat. Siehe `Anschaffung`. */
  anschaffung?: Anschaffung;
  /** Bedarf 118 — wofuer sie versichert ist. Siehe `Versicherungswert`. */
  versicherungswert?: Versicherungswert
  /**
   * B-65 -- was an dieser Einheit turnusmaessig faellig ist. Siehe `Frist`.
   * An der EINHEIT und nicht am Artikel: geprueft und mit einer Plakette
   * beklebt wird das einzelne Geraet.
   */
  fristen?: Frist[];
  /** Freie Notiz. */
  notes?: string
  /** Append-only Historie (Bewegungen, Zustandswechsel). */
  history: UnitEvent[]
  createdAt: string
  updatedAt: string
}
