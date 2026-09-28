// ───────────────────────────────────────────────────────────────────────────
// GENERIERT von scripts/cable-kamera-ids.mjs — nicht von Hand aendern.
//
// Eingefrorener Abzug der Kamera-Identitaeten aus dem cable-planner:
// src/renderer/lib/cameraCatalog.ts (CAMERA_CATALOG). Je Eintrag die GUID, die dort
// als `deviceTypeId` steht, und der Name des Katalog-Templates.
//
// Die GUIDs sind im Katalog von Hand vergebene, opake Literale (GDTF-analog:
// FixtureTypeID) — nicht aus dem Namen abgeleitet und versionsstabil. Traegt
// eine exportierte Kamera eine davon, loest der cable-planner sie autoritativ
// auf Datenblatt und Ports auf, statt ueber den Modellnamen zu raten.
//
// `manufacturer`/`model` stehen im Katalog nicht als Felder; der Lauf trennt
// den Hersteller vorn vom Namen ab, und nur einen, den MultiCam kennt. Fehlen
// beide, trifft der Eintrag per Namen nie — er bleibt als Anschluss-Vorlage
// fuer eigene Kameras waehlbar.
//
// Auffrischen: `npm run katalog:cable-ids` (cable-planner-Checkout neben
// diesem Repo, oder Pfad als Argument), danach `npm test` —
// cableCameraIds.test.ts nennt jede Kamera in cameras.ts, deren GUID
// nachzutragen oder zu entfernen ist.
// ───────────────────────────────────────────────────────────────────────────

export interface CableCameraIdentity {
  deviceTypeId: string;
  /** Der Name des Katalog-Templates, woertlich. */
  name: string;
  manufacturer?: string;
  model?: string;
}

/** Stand des Abzugs: die letzte Aenderung an der Katalog-Datei. */
export const CABLE_CAMERA_CATALOG_SOURCE = {
  file: 'larszu/cable-planner src/renderer/lib/cameraCatalog.ts',
  commit: 'bc133221ac5fd717566aeb5eeb550f18dbb18747',
  date: '2026-09-12',
} as const;

export const CABLE_CAMERA_IDS: readonly CableCameraIdentity[] = [
  { deviceTypeId: 'eb02ca7e-856c-40ab-9a73-d1e98110f003', name: 'Sony PMW-F55', manufacturer: 'Sony', model: 'PMW-F55' },
  { deviceTypeId: 'f54cdfa3-1708-4b05-9179-4a8769c0b891', name: 'Sony PMW-F5', manufacturer: 'Sony', model: 'PMW-F5' },
  { deviceTypeId: '05d88e97-2f3d-4b16-868c-f13f202754c5', name: 'Sony PXW-FX9', manufacturer: 'Sony', model: 'PXW-FX9' },
  { deviceTypeId: 'ff69e6b9-7a72-4eb2-ba53-df17fd8bfdf7', name: 'Sony PXW-FS7 Mk II', manufacturer: 'Sony', model: 'PXW-FS7 Mk II' },
  { deviceTypeId: 'd82a344a-ba04-4b38-99da-fb7aa1df9a39', name: 'Sony PXW-Z280', manufacturer: 'Sony', model: 'PXW-Z280' },
  { deviceTypeId: '3257348e-003e-4f17-9231-464248c3a72d', name: 'Sony PXW-Z90', manufacturer: 'Sony', model: 'PXW-Z90' },
  { deviceTypeId: '49e01b95-3c47-4e2d-b871-134f12fd305d', name: 'Sony PMW-EX3', manufacturer: 'Sony', model: 'PMW-EX3' },
  { deviceTypeId: 'a823f2ff-3be9-4c45-af4e-bd4f6b13f7d7', name: 'Sony FX6', manufacturer: 'Sony', model: 'FX6' },
  { deviceTypeId: '3cd5dd2d-7d51-4af9-ad59-25860aa4baa2', name: 'Sony FX3', manufacturer: 'Sony', model: 'FX3' },
  { deviceTypeId: '1b94e2d9-f987-4b76-8827-f555d88a2e10', name: 'Blackmagic URSA Mini Pro 12K', manufacturer: 'Blackmagic', model: 'URSA Mini Pro 12K' },
  { deviceTypeId: '841e8039-0e83-4734-904f-bf4ffcdb8882', name: 'Blackmagic URSA Mini Pro 4.6K G2', manufacturer: 'Blackmagic', model: 'URSA Mini Pro 4.6K G2' },
  { deviceTypeId: '26557b2a-6df5-449c-bcef-29a24e4a811e', name: 'Blackmagic URSA Mini Pro', manufacturer: 'Blackmagic', model: 'URSA Mini Pro' },
  { deviceTypeId: 'd073d39d-9d61-492c-8022-93676460c668', name: 'Blackmagic Pocket Cinema Camera 6K G2', manufacturer: 'Blackmagic', model: 'Pocket Cinema Camera 6K G2' },
  { deviceTypeId: 'ea3ea3d8-3a1c-4087-ab03-1ce394ec1ea5', name: 'Blackmagic Pocket Cinema Camera 4K', manufacturer: 'Blackmagic', model: 'Pocket Cinema Camera 4K' },
  { deviceTypeId: 'ca069b86-a1ce-438e-a390-28c3445254c0', name: 'Blackmagic Studio Camera 4K Pro G2', manufacturer: 'Blackmagic', model: 'Studio Camera 4K Pro G2' },
  { deviceTypeId: '57621414-690f-4cd4-b43c-0cd7ccca6acf', name: 'Blackmagic Studio Camera 4K Plus G2', manufacturer: 'Blackmagic', model: 'Studio Camera 4K Plus G2' },
  { deviceTypeId: '87fc07c8-7327-466d-9fd1-eac259af154e', name: 'Canon EOS C500 Mark II', manufacturer: 'Canon', model: 'EOS C500 Mark II' },
  { deviceTypeId: 'bfdc4077-32b8-4f1b-b9a5-6f875b37816c', name: 'Canon EOS C300 Mark III', manufacturer: 'Canon', model: 'EOS C300 Mark III' },
  { deviceTypeId: 'fd8fdb1a-0927-4d70-9c8b-f40ef5ef0fdb', name: 'Canon EOS C70', manufacturer: 'Canon', model: 'EOS C70' },
  { deviceTypeId: 'a05f82be-4c8d-4ffd-8124-3f8b366c5d57', name: 'Canon EOS C200', manufacturer: 'Canon', model: 'EOS C200' },
];
