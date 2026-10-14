// ───────────────────────────────────────────────────────────────────────────
// Die Kopfzeile bleibt im Schnitt der Suite (ADR-007 Abschnitt 6).
// Lauf: `npm run kopfzeile:check`
//
// NUTZER-AUFTRAG 2026-09-11: „Stelle sicher das in allen repos uebergreifend
// das Einstellungen Menue an der gleichen Stelle ist wie im Cable planner und
// das die obere Menueleiste gleich aufgebaut ist. Passe an den Cable planner
// stand an, wenn noetig und vereinheitliche Komponenten."
//
// ─── WARUM ES DAS GIBT — Stand 2026-10-13 ─────────────────────────────────
//
// Mit dem Design-Vertrag 2026-10 (ADR-007 der lz-planner-suite, geaendert
// 2026-10-13) aendert sich die OPTIK der Kopfzeile (Glas, Pills), nicht ihre
// Struktur — alle Zusicherungen unten bleiben. Neu: der Thema-Umschalter
// Auto · Hell · Dunkel steht SICHTBAR in der rechten Gruppe, vor den
// Einstellungen. Die Kopflinie (Akzentlinie unter Panel-Koepfen) ist
// entfallen; dieser Lauf hat sie nie geprueft, `brand:check` prueft jetzt,
// dass sie nicht zurueckkommt.
//
// ─── WOGEGEN DIESER LAUF STEHT ────────────────────────────────────────────
//
// Nicht gegen das Bauen — das ist einmal passiert und steht im Diff. Gegen
// das ZURUECKRUTSCHEN: gegen den naechsten losen Knopf, der neben die Menues
// in die Kopfzeile wandert, weil dort gerade Platz war; gegen die Reiter, die
// wieder in dieselbe Zeile rutschen; gegen einen Einstellungen-Einstieg, der
// nicht mehr der letzte Punkt der Zeile ist. Das faellt niemandem auf, der
// nur diese App benutzt — es faellt dem auf, der zwischen zwei Werkzeugen der
// Suite wechselt und die Bedienung an derselben Stelle sucht.
//
// ─── WARUM ALS NODE-SKRIPT UND NICHT ALS VITEST-DATEI ─────────────────────
//
// Weil er ein STILBLATT lesen muss. Als `*.test.ts` gibt es dafuer keinen
// verlaesslichen Weg: `node:fs` faellt nicht im Test, sondern im BUILD
// (`tsc -b` ueber `tsconfig.app.json` kennt keine Node-Typen) — und lokal
// auch das nur, wenn die `tsbuildinfo` nicht gerade sagt, es sei schon alles
// geprueft; genau so war diese Pruefung am 2026-09-11 lokal gruen und in der
// CI rot. Und `import '../index.css?raw'` liefert unter vitest eine LEERE
// Zeichenkette — also eine Messung, die immer gruen ist, und das ist das
// Schlimmere von beidem. Ein Node-Skript liest die Datei einfach.
//
// ─── WAS ER NICHT KANN ────────────────────────────────────────────────────
//
// Er liest Quelltext. Ob der Knopf im gerenderten Fenster wirklich rechts
// aussen sitzt, sieht er nicht: ein `order-last` an einem anderen Kind wuerde
// ihn taeuschen. Und er misst die REIHENFOLGE der Menues im Markup, nicht die
// im Bild — ein `flex-row-reverse` an der Kopfzeile bliebe ihm verborgen.
//
// Der uebergreifende Massstab liegt in der Suite
// (`scripts/chrome-parity.mjs`) und misst alle sechs Apps im selben Baum;
// dieser Lauf ist die Haelfte, die MITWANDERT und schon vor dem Vendorieren
// faellt.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lies = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const kopf = lies('src/components/Layout/Header.tsx');
const css = lies('src/index.css');
const menu = lies('src/components/Layout/Menu.tsx');
const einstellungen = lies('src/components/Settings/SettingsDialog.tsx');

// ── 0. Gegenprobe zum Lauf selbst ────────────────────────────────────────
for (const [name, inhalt] of Object.entries({ kopf, css, menu, einstellungen })) {
  assert.ok(inhalt.length > 400, `${name} ist leer — dieser Lauf misst nichts`);
}

// ── 1. Das Mass ──────────────────────────────────────────────────────────
const i = css.indexOf('.bc-topbar {');
assert.ok(i > 0, 'keine .bc-topbar-Regel im Stilblatt');
const block = css.slice(i, i + 300);
assert.ok(block.includes('height: 40px'), '.bc-topbar ist nicht 40 px hoch');
// `flex: none` gehoert dazu: ohne das schrumpft die Zeile, sobald der Inhalt
// darunter waechst, und die 40 waeren eine Wunschzahl.
assert.ok(block.includes('flex: none'), '.bc-topbar darf nicht schrumpfen duerfen');

// ── 2. Die Einstellungen als LETZTER Bedienpunkt der Zeile ───────────────
const rechts = kopf.indexOf('ml-auto flex shrink-0 items-center');
const knopf = kopf.indexOf("title={t('settings.title', 'Settings')}");
const ende = kopf.indexOf('</header>');
assert.ok(rechts > 0, 'keine rechte Gruppe in der Kopfzeile');
assert.ok(knopf > rechts, 'kein Einstellungen-Knopf in der rechten Gruppe');
assert.ok(knopf < ende, 'der Einstellungen-Knopf steht nicht mehr in der Kopfzeile');
// Der Thema-Umschalter steht in der rechten Gruppe, VOR den Einstellungen.
const umschalter = kopf.indexOf('<ThemaUmschalter />');
assert.ok(umschalter > rechts && umschalter < knopf, 'der Thema-Umschalter steht nicht rechts vor den Einstellungen');
// Ab dem `title`-Attribut bis zum Ende der Kopfzeile darf KEIN weiterer
// `<button` mehr aufgehen. Was danach kommt, sind die drei versteckten
// Datei-Felder — die sind keine Bedienpunkte, sie haben kein Bild.
assert.ok(
  !kopf.slice(knopf, ende).includes('<button'),
  'nach den Einstellungen steht noch ein Bedienpunkt — sie sind nicht mehr rechts aussen',
);

// ── 3. Die Menues und ihre Reihenfolge ───────────────────────────────────
const ROLLEN = ['file', 'edit', 'tools', 'view', 'help'];
const stellen = ROLLEN.map((r) => {
  const p = kopf.indexOf(`t('app.menu.${r}'`);
  assert.ok(p > 0, `es gibt kein ${r}-Menue`);
  return p;
});
assert.deepEqual(
  stellen,
  [...stellen].sort((a, b) => a - b),
  'die Menues stehen nicht in der Folge des Cable Planners (File · Edit · Tools · View · Help)',
);
// Der gemeinsame Grundstock — an den SCHLUESSELN gemessen und nicht an den
// uebersetzbaren Woertern.
for (const k of ['header.new', 'header.open', 'header.save', 'header.saveAs']) {
  assert.ok(kopf.includes(`'${k}'`), `das Datei-Menue fuehrt kein '${k}'`);
}
assert.ok(kopf.includes("'header.about'"), 'das Hilfe-Menue fuehrt kein Ueber');
// Ein Menue, das es nicht gibt, wird auch nicht gefunden.
assert.equal(kopf.indexOf("t('app.menu.gibtEsNicht'"), -1, 'der Lauf findet Menues, die es nicht gibt');

// ── 4. Die Datei-Eintraege tun, was auf ihnen steht ──────────────────────
//
// OHNE KOMMENTARZEILEN gemessen — sonst besaenftigt eine Begruendung, die die
// alte Zeile woertlich nennt, genau den Lauf, der sie finden soll (dieselbe
// Falle wie bei B-69).
const ohneKommentare = kopf
  .split('\n')
  .filter((z) => !z.trimStart().startsWith('//'))
  .join('\n');
//
// ZWEI SCHREIBWEISEN, EINE ZUSAGE. Eigenstaendig fragt die App mit
// `window.confirm`; in der Suite-Kopie steht dort `confirmDialog` aus
// `@avplan/ui` (dort misst `scripts/native-dialogs.mjs`, dass kein natives
// Fenster mitten in der Shell aufgeht). Der Lauf misst deshalb nicht EINE
// Schreibweise, sondern die Zusage dahinter: die Tat haengt am JA.
//
// Ein Lauf, der nur `if (!window.confirm(` sucht, faellt in der vendorten
// Kopie ueber eine Zeile, die genau richtig ist — und wer ihn dort anpasst,
// hat den Waechter zweimal, in zwei Fassungen, mit zwei Meinungen.
const verneintNativ = ohneKommentare.includes('if (!window.confirm(');
const positivImDialog = /confirmDialog\([\s\S]{0,600}?\.then\(\((\w+)\) => \{\s*if \(\1\)/.test(ohneKommentare);
assert.ok(
  verneintNativ || positivImDialog,
  '„Neues Projekt" haengt nicht am JA — weder `if (!window.confirm(` noch `confirmDialog(…).then((ja) => { if (ja)`',
);
assert.ok(
  !/if \(window\.confirm\(/.test(ohneKommentare),
  'die Rueckfrage steht unverneint — Abbrechen wuerde das Projekt loeschen',
);
assert.ok(
  !/\.then\(\((\w+)\) => \{\s*if \(!\1\)/.test(ohneKommentare),
  'die Dialog-Rueckfrage ist verneint — Abbrechen wuerde das Projekt loeschen',
);
for (const s of ['saveProject()', 'handleSaveAs()', 'saveProject(name)']) {
  assert.ok(kopf.includes(s), `„Speichern unter" ist nicht eigenstaendig: ${s} fehlt`);
}
// Wieder zwei Schreibweisen, eine Zusage: „Speichern unter" HOLT den Namen.
// Eigenstaendig mit `window.prompt`, in der Suite-Kopie mit `promptDialog`
// aus `@avplan/ui`. Was beide gemeinsam haben, ist die Frage — und die misst
// dieser Lauf, statt eine der beiden Fassungen zu bevorzugen.
assert.ok(
  /window\.prompt\(|promptDialog\(/.test(kopf),
  '„Speichern unter" fragt nicht nach dem Dateinamen und ist damit ein zweites „Speichern"',
);

// ── 5. Reiter und Menueleiste sind zwei Zeilen ───────────────────────────
assert.ok(css.includes('.bc-tabbar {'), 'keine eigene Reiter-Leiste im Stilblatt');
assert.ok(kopf.indexOf('className="bc-tabbar"') > ende, 'die Reiter-Leiste steht nicht unter der Kopfzeile');
assert.ok(!kopf.slice(0, ende).includes('TABS.map'), 'die Reiter stehen wieder in der Kopfzeile');

// ── 6. Die Klappen sind EINE Mechanik, nicht vier Abschriften ────────────
assert.ok(
  !kopf.includes("document.addEventListener('mousedown'"),
  'die Kopfzeile haelt wieder eigene Aussenklick-Effekte (vorher waren es vier Abschriften einer Sache)',
);
assert.ok(menu.includes("document.addEventListener('mousedown'"), 'die eine Mechanik schliesst nicht auf Klick daneben');
assert.ok(menu.includes("e.key === 'Escape'"), 'die eine Mechanik kennt Escape nicht');

// ── 7. Der Dialog fuehrt den GANZEN Grundstock der Suite ─────────────────
//
// Sprache, Thema, Ueber. Bis zum 2026-09-11 standen hier zwei davon, und
// diese Stelle verlangte ausdruecklich, dass das Thema FEHLT — mit Messung
// (406 rohe Farb-Utilities in 17 Dateien, dazu der Canvas des 2D-Plans) und
// mit dem Satz: „Faellt diese Zeile, weil jemand die Umstellung gebaut hat:
// dann gehoert der Umschalter hinein, und sie wird GEAENDERT statt
// geloescht."
//
// Genau das ist passiert (B-70), und genau so ist es gemacht. Der Waechter
// hat beim Bau angeschlagen — er stand an der richtigen Tuer.
assert.ok(einstellungen.includes("t('settings.language'"), 'der Dialog fuehrt keine Sprache');
assert.ok(einstellungen.includes("t('settings.about'"), 'der Dialog fuehrt kein Ueber');
assert.ok(einstellungen.includes("t('settings.theme'"), 'der Dialog fuehrt kein Thema');

// DREI ZUSTAENDE, nicht zwei. „System" ist keine Umschreibung fuer „dunkel":
// wer nichts gewaehlt hat, folgt dem Betriebssystem. Ein Schalter mit zwei
// Stellungen muesste beim ersten Oeffnen eine Wahl erfinden.
for (const zustand of ['settings.theme.system', 'settings.theme.dark', 'settings.theme.light']) {
  assert.ok(einstellungen.includes(`t('${zustand}'`), `der Thema-Schalter kennt ${zustand} nicht`);
}

// Und er schaltet WIRKLICH: ein Knopf, der nur einen lokalen Zustand setzt,
// faerbt sich selbst um und sonst nichts. Das ist die Sorte Schalter, gegen
// die dieser ganze Abschnitt steht.
assert.ok(einstellungen.includes('setzeThema('), 'der Thema-Schalter ruft setzeThema nicht auf');

// ── Die Statusleiste ─────────────────────────────────────────────────────
//
// ADR-007 Abschnitt 6 nennt sie im Rahmen: „Statusleiste 24 px". Bis zum
// 2026-09-12 gab es sie hier nicht — und der Satz dazu im Stilblatt war
// ehrlich („wo keine ist, wird auch keine erfunden"), aber niemand hat
// gemessen, ob sie inzwischen da ist. Jetzt schon.
//
// DIESELBE BEGRUENDUNG WIE OBEN BEI DEN 40 px: die Zahl steht als benannte
// Klasse im Stilblatt und nicht als `h-6` am Element. Am Element waere sie
// dieselbe Zahl, aber keine Regel.
const j = css.indexOf('.bc-statusbar {');
assert.ok(j > 0, 'keine .bc-statusbar-Regel im Stilblatt');
const sblock = css.slice(j, j + 400);
assert.ok(sblock.includes('height: calc(24px'), '.bc-statusbar ist nicht 24 px hoch');
assert.ok(sblock.includes('flex: none'), '.bc-statusbar darf nicht schrumpfen duerfen');

// Und sie wird auch GERENDERT. Eine Klasse im Stilblatt ohne Element ist
// dasselbe wie die Regel ohne Klasse: eine Absichtserklaerung.
const app = lies('src/App.tsx');
assert.ok(/<StatusBar\s*\/>/.test(app), 'die Statusleiste wird nirgends gerendert');
// GEGEN DEN ARBEITSBEREICH UND NICHT GEGEN `<Layout`: der erste Anlauf
// verglich mit `app.indexOf('<Layout')` und blieb GRUEN, als die Leiste
// versuchsweise ueber den Arbeitsbereich geschoben wurde — denn weiter oben
// steht `useState<LayoutMode>(…)`, und darin findet `indexOf` sein `<Layout`.
// Dieselbe Falle wie beim Register-Unterstrich im `chrome:parity`: ein
// Teilstring, der zufaellig passt, bestaetigt die falsche Stelle.
// `flexlayout-custom-theme` steht genau einmal und nur am Arbeitsbereich.
assert.ok(
  app.indexOf('<StatusBar />') > app.indexOf('flexlayout-custom-theme'),
  'die Statusleiste steht nicht unter dem Arbeitsbereich',
);

console.log('kopfzeile:check ok — 40 px, File/Edit/Tools/View/Help, Thema-Umschalter + Einstellungen rechts aussen, eine Klappen-Mechanik, Statusleiste 24 px');
