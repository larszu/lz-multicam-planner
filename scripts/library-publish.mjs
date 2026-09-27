// ───────────────────────────────────────────────────────────────────────────
// Den eingebauten Katalog (src/data/cameras.ts, src/data/lenses.ts) in die
// Geraetebibliothek veroeffentlichen — `npm run library:publish`.
//
// WARUM. Lars' Ziel: alle Daten aller Planner stehen auch auf
// devices.zumpelars.de. Eigene Eintraege laedt die App selbst hoch; der
// eingebaute Katalog lebt nur im Repo und kommt ueber diesen Lauf dorthin —
// aus CI (`library-publish.yml`) nach jedem Push, der ihn aendert.
//
// Umgebung:
//   DEVICE_LIBRARY_KEY  API-Schluessel `dlk_…` eines Admins (Konto >
//                       Sicherheit). Admin-Uploads gehen sofort live.
//   DEVICE_LIBRARY_URL  Server; Vorgabe https://devices.zumpelars.de
//   --dry-run           nichts senden, nur zaehlen und auflisten
//
// Dasselbe Facet-Format und dieselbe Abbildung wie in der App
// (src/library/facet.ts, src/library/upload.ts) — keine zweite Fassung.
// Eintraege ohne Datenblattlink (`manufacturerUrl`) gehen NICHT mit: der
// Server blockierte sie ohnehin (`no-source`). Sie werden aufgelistet, damit
// die Luecke sichtbar bleibt.
//
// Node liest die .ts-Dateien direkt (Type-Stripping, Node >= 22.18). Darum
// importieren die beteiligten Module ihre Werte mit `.ts`-Endung — fehlt sie,
// bricht dieser Lauf (und `katalog:cable-ids`); CI faehrt ihn mit --dry-run.
// ───────────────────────────────────────────────────────────────────────────
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const { CAMERAS } = await imp('src/data/cameras.ts');
const { LENSES } = await imp('src/data/lenses.ts');
const { toUploadItem } = await imp('src/library/upload.ts');
const { DEFAULT_DEVICE_LIBRARY_URL, upload } = await imp('src/utils/deviceLibraryClient.ts');

const dryRun = process.argv.includes('--dry-run');
const server = (process.env.DEVICE_LIBRARY_URL || DEFAULT_DEVICE_LIBRARY_URL).trim();
const key = (process.env.DEVICE_LIBRARY_KEY || '').trim();

const items = [
  ...CAMERAS.map((camera) => ({ kind: 'camera', camera })),
  ...LENSES.map((lens) => ({ kind: 'lens', lens })),
];
const entry = (i) => (i.kind === 'camera' ? i.camera : i.lens);
const ohneBeleg = items.filter((i) => !entry(i).manufacturerUrl);
const mitBeleg = items.filter((i) => entry(i).manufacturerUrl);

console.log(`Katalog: ${CAMERAS.length} Kameras, ${LENSES.length} Objektive — ${mitBeleg.length} mit Datenblattlink, ${ohneBeleg.length} ohne.`);
if (ohneBeleg.length > 0) {
  console.log('\nOhne Datenblattlink (nicht veroeffentlicht):');
  for (const i of ohneBeleg) console.log(`  ${i.kind === 'camera' ? 'Kamera ' : 'Objektiv'}  ${entry(i).id}  ${entry(i).manufacturer} ${entry(i).model}`);
}

const payload = mitBeleg.map(toUploadItem).map((u) => ({ localId: u.localId, core: u.core, facet: u.facet }));

if (dryRun) {
  console.log(`\n--dry-run: ${payload.length} Eintraege waeren an ${server} gegangen.`);
  process.exit(0);
}
if (!key) {
  console.error('\nDEVICE_LIBRARY_KEY fehlt — ein API-Schluessel `dlk_…` eines Admins (Konto > Sicherheit).');
  process.exit(1);
}

const ergebnis = await upload(server, key, 'multicam', payload);
const nachZustand = {};
for (const r of ergebnis) (nachZustand[r.state] ??= []).push(r);
console.log(`\n${server}: ${ergebnis.length} Eintraege`);
for (const [state, rs] of Object.entries(nachZustand)) console.log(`  ${state}: ${rs.length}`);
for (const r of [...(nachZustand.blocked ?? []), ...(nachZustand.error ?? [])]) {
  const befunde = Array.isArray(r.findings) ? r.findings.map((f) => f?.kind ?? f?.message ?? JSON.stringify(f)).join(', ') : '';
  console.log(`  ${r.state}  ${r.localId}  ${befunde || r.error || ''}`);
}
// Blockiert ist ein Datenbefund, kein Lauf-Fehler; ein `error` dagegen heisst,
// der Server konnte einen Eintrag nicht verarbeiten.
process.exit(nachZustand.error ? 1 : 0);
