// ───────────────────────────────────────────────────────────────────────────
// Abzug der Kamera-Identitaeten aus dem cable-planner-Katalog (#145).
//
// Schreibt `src/data/cableCameraCatalogIds.ts` neu — aus einem Checkout des
// cable-planner, der standardmaessig neben diesem Repo liegt:
//
//   npm run katalog:cable-ids                        # ../cable-planner
//   npm run katalog:cable-ids -- /pfad/zu/cable-planner
//
// WARUM EIN ABZUG UND KEIN IMPORT. Die Repos teilen keinen Code; der Katalog
// lebt im cable-planner und kommt hier nur als Liste von Identitaeten an
// (GUID, Name, Hersteller, Modell). Ports braucht MultiCam nicht — die loest
// der cable-planner selbst ueber die GUID auf. Der Abzug ist eingefroren und
// aendert sich nur durch diesen Lauf, also nachvollziehbar im Diff.
//
// DANACH `npm test`. `cableCameraIds.test.ts` nennt jede Kamera in
// `src/data/cameras.ts`, die nach dem neuen Abzug eine GUID tragen muesste
// oder eine traegt, die es nicht mehr gibt. Die GUIDs selbst stehen in
// `cameras.ts` und nirgends sonst — dieser Lauf schreibt sie bewusst NICHT
// dorthin: eine zweite Stelle, die sie beim Laden nachtraegt, waere die
// zweite Wahrheit.
//
// DER HERSTELLER IST IM KATALOG KEIN FELD, er steht vorn im Namen
// („Sony PXW-Z280"). Abgetrennt wird nur ein Hersteller, den MultiCam kennt
// (laengster passender Praefix aus `cameras.ts`). Das erste Wort blind
// abzuschneiden machte aus „Grass Valley LDX 100" den Hersteller „Grass" —
// ein Name ohne bekannten Hersteller bleibt deshalb ohne `manufacturer` und
// `model` und trifft per Namen nie.
//
// Node liest die beiden .ts-Dateien direkt (Type-Stripping, Node >= 22.18).
// ───────────────────────────────────────────────────────────────────────────
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CABLE = resolve(process.argv[2] ?? join(ROOT, '..', 'cable-planner'));
const KATALOG_REL = 'src/renderer/lib/cameraCatalog.ts';
const KATALOG = join(CABLE, KATALOG_REL);
const ZIEL = join(ROOT, 'src/data/cableCameraCatalogIds.ts');

if (!existsSync(KATALOG)) {
  console.error(`Kein cable-planner-Katalog unter ${KATALOG}.`);
  console.error('Pfad zum Checkout als Argument angeben: npm run katalog:cable-ids -- /pfad/zu/cable-planner');
  process.exit(1);
}

const { CAMERA_CATALOG } = await import(pathToFileURL(KATALOG).href);
const { CAMERAS } = await import(pathToFileURL(join(ROOT, 'src/data/cameras.ts')).href);

// Dieselbe Normalisierung wie `normaliseIdentity` in src/utils/deviceTypeMatch.ts.
const norm = (s) => s.toLowerCase().replace(/[\s\-‐-―]+/g, ' ').trim();

const hersteller = [...new Set(CAMERAS.map((c) => c.manufacturer))];

const teile = (name) => {
  const passend = hersteller
    .filter((h) => norm(name).startsWith(`${norm(h)} `))
    .sort((a, b) => norm(b).length - norm(a).length)[0];
  if (!passend) return {};
  const woerter = name.trim().split(/\s+/);
  const n = norm(passend).split(' ').length;
  return { manufacturer: woerter.slice(0, n).join(' '), model: woerter.slice(n).join(' ') };
};

const eintraege = CAMERA_CATALOG.map((e) => ({
  deviceTypeId: e.deviceTypeId,
  name: e.template.name,
  ...teile(e.template.name),
}));

const doppelt = eintraege.filter((e, i) => eintraege.findIndex((x) => x.deviceTypeId === e.deviceTypeId) !== i);
if (doppelt.length) {
  console.error(`Der Katalog vergibt GUIDs doppelt: ${doppelt.map((e) => e.deviceTypeId).join(', ')}`);
  process.exit(1);
}

const git = (...args) => {
  try {
    return execFileSync('git', ['-C', CABLE, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const commit = git('log', '-1', '--format=%H', '--', KATALOG_REL);
const datum = git('log', '-1', '--format=%cs', '--', KATALOG_REL);
const lokal = git('status', '--porcelain', '--', KATALOG_REL) !== '';

const zitat = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const zeile = (e) =>
  `  { deviceTypeId: ${zitat(e.deviceTypeId)}, name: ${zitat(e.name)}` +
  (e.manufacturer !== undefined ? `, manufacturer: ${zitat(e.manufacturer)}, model: ${zitat(e.model)}` : '') +
  ' },';

const text = `// ───────────────────────────────────────────────────────────────────────────
// GENERIERT von scripts/cable-kamera-ids.mjs — nicht von Hand aendern.
//
// Eingefrorener Abzug der Kamera-Identitaeten aus dem cable-planner:
// ${KATALOG_REL} (CAMERA_CATALOG). Je Eintrag die GUID, die dort
// als \`deviceTypeId\` steht, und der Name des Katalog-Templates.
//
// Die GUIDs sind im Katalog von Hand vergebene, opake Literale (GDTF-analog:
// FixtureTypeID) — nicht aus dem Namen abgeleitet und versionsstabil. Traegt
// eine exportierte Kamera eine davon, loest der cable-planner sie autoritativ
// auf Datenblatt und Ports auf, statt ueber den Modellnamen zu raten.
//
// \`manufacturer\`/\`model\` stehen im Katalog nicht als Felder; der Lauf trennt
// den Hersteller vorn vom Namen ab, und nur einen, den MultiCam kennt. Fehlen
// beide, trifft der Eintrag per Namen nie — er bleibt als Anschluss-Vorlage
// fuer eigene Kameras waehlbar.
//
// Auffrischen: \`npm run katalog:cable-ids\` (cable-planner-Checkout neben
// diesem Repo, oder Pfad als Argument), danach \`npm test\` —
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
  file: ${zitat(`larszu/cable-planner ${KATALOG_REL}`)},
  commit: ${zitat(commit ? commit + (lokal ? ' + lokale Änderungen' : '') : 'unbekannt')},
  date: ${zitat(datum || 'unbekannt')},
} as const;

export const CABLE_CAMERA_IDS: readonly CableCameraIdentity[] = [
${eintraege.map(zeile).join('\n')}
];
`;

writeFileSync(ZIEL, text);
const ohne = eintraege.filter((e) => e.manufacturer === undefined);
console.log(`${eintraege.length} Katalog-Eintraege nach ${ZIEL.slice(ROOT.length + 1)} geschrieben.`);
if (ohne.length) {
  console.log(`Ohne bekannten Hersteller (treffen per Namen nie): ${ohne.map((e) => e.name).join(', ')}`);
}
