// ───────────────────────────────────────────────────────────────────────────
// Drift-Guard fuer das portable Lager-Format `avplan-inventory`.
//
// Das Format ist in ALLEN DREI Apps (cable / multicam / light) byte-identisch
// dupliziert, damit ein Lager app-uebergreifend importierbar bleibt. Diese
// Datei friert den Wire-Contract ein: Format-Marker, Versionsnummer, Envelope-
// Shape und die Feld-Namen jeder Entitaet. Aendert jemand das Schema in EINEM
// Repo, schlaegt dessen Guard fehl.
//
// !!! Wenn dieser Contract bewusst geaendert wird:
//   1. INVENTORY_FORMAT_VERSION erhoehen (Abwaertskompatibilitaet beachten),
//   2. die identische Aenderung in ALLEN DREI Repos nachziehen
//      (cable tests/, multicam src/__tests__/, light scripts/),
//   3. die eingefrorenen Key-Listen unten anpassen.
// ───────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  INVENTORY_FORMAT,
  INVENTORY_FORMAT_VERSION,
  serializeInventory,
  parseInventory,
  type InventorySnapshot,
} from '../inventory/portable';
import type { InventoryItem, StorageNode, InventorySet, InventoryUnit } from '../inventory/types';

// Eingefrorener Contract — MUSS in allen drei Repos identisch sein.
const CONTRACT = {
  format: 'avplan-inventory',
  version: 8,
  envelopeKeys: ['app', 'exportedAt', 'format', 'fristArten', 'items', 'nodes', 'sets', 'units', 'version'],
  itemKeys: ['category', 'code', 'codeType', 'createdAt', 'deviceTypeId', 'dimensions', 'id', 'locationId', 'manufacturer', 'materialKinds', 'mindestmenge', 'model', 'notes', 'ownership', 'quantity', 'rentPricePerDay', 'returnDue', 'stockLocation', 'supplier', 'updatedAt', 'ursprungsland'],
  nodeKeys: ['code', 'codeType', 'createdAt', 'dimensions', 'id', 'kind', 'name', 'notes', 'parentId', 'stellplatz', 'transport', 'updatedAt'],
  setKeys: ['components', 'createdAt', 'id', 'name', 'notes', 'updatedAt'],
  unitKeys: ['anschaffung', 'code', 'codeType', 'condition', 'createdAt', 'fristen', 'history', 'houseRef', 'id', 'itemId', 'locationId', 'notes', 'serial', 'updatedAt', 'versicherungswert'],
} as const;

// Voll besetzte Muster-Entitaeten (jedes Feld gesetzt) — TS erzwingt, dass sie
// zum Typ passen; die Key-Assertions unten erzwingen, dass kein Feld fehlt.
const item: InventoryItem = {
  id: 'i1', model: 'ULXD2', manufacturer: 'Shure', category: 'wireless', quantity: 4,
  rentPricePerDay: 25, stockLocation: 'Regal A3', supplier: 'AV GmbH', ownership: 'owned',
  returnDue: '2026-09-12',
  code: 'ITM-1', codeType: 'qr', locationId: 'n1', deviceTypeId: 'dt-0001',
  dimensions: { widthMm: 50, heightMm: 20, depthMm: 200, weightKg: 0.3 },
  // Bedarf 118 — fuers Carnet-Datenblatt.
  ursprungsland: 'JP',
  // B-65 — die Mindestmenge des Hauses. Dieser Planer wertet sie nicht aus,
  // aber sie MUSS den Round-Trip ueberleben: eine Datei, die sie unterwegs
  // verliert, laesst das Lager wie eines aussehen, in dem alles reicht.
  mindestmenge: 20,
  materialKinds: ['rental'], notes: 'x', createdAt: 't', updatedAt: 't',
};
const node: StorageNode = {
  id: 'n1', name: 'Transport-Case 1', kind: 'transportCase', parentId: 'n0',
  code: 'LOC-1', codeType: 'barcode', dimensions: { widthMm: 800, weightKg: 12 },
  // Version 8 -- beide Felder MUESSEN den Round-Trip ueberleben.
  stellplatz: { xMm: 1000, zMm: 2000, breiteMm: 1200, tiefeMm: 600, hoeheMm: 2400, drehung: 90, ebenen: 5 },
  transport: { castors: { heightMm: 100, includedInHeightMm: true, kind: 'swivel' }, maxLayers: 2 },
  notes: 'x', createdAt: 't', updatedAt: 't',
};
const set: InventorySet = {
  id: 's1', name: 'Funkset', components: [{ itemId: 'i1', quantity: 2 }],
  notes: 'x', createdAt: 't', updatedAt: 't',
};
const unit: InventoryUnit = {
  id: 'u1', itemId: 'i1', serial: 'SN-1', houseRef: 'AV-0421', code: 'UNI-1', codeType: 'qr', locationId: 'n1',
  condition: 'ok', notes: 'x', history: [{ at: 't', kind: 'created', detail: 'x' }],
  // Bedarf 118 — die zwei Werte muessen den Round-Trip ueberleben. Eine Datei,
  // die den Versicherungswert unterwegs verliert, ist die stille
  // Unterversicherung.
  anschaffung: { betrag: { cent: 249900, waehrung: 'EUR' }, am: '2024-03-12' },
  versicherungswert: { betrag: { cent: 180000, waehrung: 'EUR' }, stand: '2026-01-02' },
  // B-65 — die Pruef-Fristen. Dieser Planer wertet sie nicht aus, aber sie
  // MUESSEN den Round-Trip ueberleben: eine Datei, die sie unterwegs
  // verliert, laesst das Lager wie eines aussehen, in dem alles geprueft ist.
  fristen: [{ art: 'dguv-v3', zuletzt: '2026-03-09', intervallMonate: 12 }],
  createdAt: 't', updatedAt: 't',
};
/**
 * Eine selbst angelegte Fristart (Format-Version 7). Sie MUSS mitreisen:
 * ohne sie kommt drueben ein Termin an, dessen Art niemand benennen kann.
 */
const eigeneArt = { id: 'anschlagmittel', name: 'Anschlagmittel', standardIntervallMonate: 12 };

const snapshot: InventorySnapshot = {
  items: [item],
  nodes: [node],
  sets: [set],
  units: [unit],
  fristArten: [eigeneArt],
};

const sortedKeys = (o: object) => Object.keys(o).sort();

describe('avplan-inventory Wire-Contract (Drift-Guard)', () => {
  it('Format-Marker + Version sind eingefroren', () => {
    expect(INVENTORY_FORMAT).toBe(CONTRACT.format);
    expect(INVENTORY_FORMAT_VERSION).toBe(CONTRACT.version);
  });

  it('Envelope-Shape ist eingefroren', () => {
    const file = JSON.parse(serializeInventory(snapshot, { exportedAt: 't', app: 'multicam-planner' }));
    expect(sortedKeys(file)).toEqual(CONTRACT.envelopeKeys);
    expect(file.format).toBe(CONTRACT.format);
    expect(file.version).toBe(CONTRACT.version);
  });

  it('Feld-Namen jeder Entität sind eingefroren', () => {
    expect(sortedKeys(item)).toEqual(CONTRACT.itemKeys);
    expect(sortedKeys(node)).toEqual(CONTRACT.nodeKeys);
    expect(sortedKeys(set)).toEqual(CONTRACT.setKeys);
    expect(sortedKeys(unit)).toEqual(CONTRACT.unitKeys);
  });

  it('Round-Trip serialize -> parse ist verlustfrei', () => {
    const back = parseInventory(serializeInventory(snapshot));
    expect(back).toEqual(snapshot);
  });

  it('parse lehnt fremdes Format und höhere Version ab', () => {
    expect(parseInventory(JSON.stringify({ format: 'something-else', version: 1 }))).toBeNull();
    expect(parseInventory(JSON.stringify({ format: CONTRACT.format, version: CONTRACT.version + 1 }))).toBeNull();
    expect(parseInventory('not json')).toBeNull();
  });
});
