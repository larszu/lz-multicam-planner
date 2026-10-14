// Waechter fuer die Oberflaechen-Regeln (ADR-007 der lz-planner-suite, geaendert 2026-10-13).
// Lauf: `npm run brand:check`
//
// ─── WARUM EIN SKRIPT UND KEIN VITEST-TEST ─────────────────────────────────
//
// Zuerst stand das hier als `src/__tests__/markenTokens.test.ts`. Vitest lief
// gruen, `tsc -b` brach ab: die App-tsconfig kennt keine Node-Typen, und ein
// Waechter, der die CSS-Datei lesen muss, braucht `node:fs` — `?raw` liefert
// fuer Stylesheets einen leeren String, weil Vite sie gesondert behandelt.
// Die tsconfig fuer eine Pruefdatei aufzubohren waere der falsche Weg: dann
// haette der ganze `src`-Baum Node-Typen, die er nicht haben soll.
//
// Als Skript neben `docs-reachable.mjs` und `actions-node-runtime.mjs` ist es
// dort, wo die uebrigen Repo-Pruefungen liegen — und es laeuft in derselben
// CI-Stufe.
//
// ─── WARUM DIE WERTE HIER EIN ZWEITES MAL STEHEN ───────────────────────────
//
// Sie stehen maschinenlesbar in `@avplan/ui` (`src/brand.ts`) — aber der
// MultiCam-Planer haengt nicht an diesem Paket: er wird in die Suite
// vendoriert, nicht umgekehrt. Ohne diesen Check waere der Rueckweg in die
// alte Near-Black-Welt eine Zeile, die niemandem auffaellt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(hier, '..', 'src/index.css'), 'utf8');

// ─── WARUM ES DAS GIBT — Stand 2026-10-13 (Design-Vertrag 2026-10) ─────────
//
// ADR-007 (lz-planner-suite) wurde am 2026-10-13 geaendert: neutrale
// Flaechen, Markenblau nur als Akzent, Hell UND Dunkel mit sichtbarem
// Umschalter Auto · Hell · Dunkel, weiche Rundungen und Schatten ueber
// Tokens. Bis dahin hielt dieser Lauf die Navy-Welt fest (Grund #132040,
// Panel #1D324F) — die Werte unten sind die des Vertrags, in BEIDEN Modi.

/** Wert eines Tokens im n-ten Block, in dem es vorkommt (0 = dunkel/@theme, 1 = hell). */
const token = (name, block = 0) => {
  const t = [...css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))];
  return t[block] ? t[block][1].trim() : '';
};

// ── 1. Die Palette, beide Modi ─────────────────────────────────────────────
const VERTRAG = {
  '--color-bc-dark': ['#1E1F23', '#FAFAF8'],
  '--color-bc-panel': ['#28292E', '#FFFFFF'],
  '--color-bc-panel-raised': ['#33343A', '#F1F1EE'],
  '--color-bc-elevated': ['#3B3C42', '#FFFFFF'],
  '--color-bc-sunken': ['#19191D', '#F4F4F1'],
  '--color-bc-text-bright': ['#F6F5F0', '#16181D'],
  '--color-bc-text': ['#E6E6E3', '#2B2E35'],
  '--color-bc-muted': ['#A9ACB4', '#6A6E77'],
  '--color-bc-border': ['rgba(246, 245, 240, 0.09)', 'rgba(22, 24, 29, 0.08)'],
  '--color-bc-border-strong': ['rgba(246, 245, 240, 0.20)', 'rgba(22, 24, 29, 0.18)'],
  '--color-bc-accent': ['#B9C7D8', '#1D324F'],
  '--color-bc-accent-text': ['#132040', '#F6F5F0'],
  '--color-bc-accent-soft': ['rgba(185, 199, 216, 0.12)', 'rgba(29, 50, 79, 0.10)'],
  '--color-bc-logo': ['#F6F5F0', '#1D324F'],
  '--color-bc-glow-1': ['rgba(185, 199, 216, 0.16)', 'rgba(29, 50, 79, 0.10)'],
  '--color-bc-glow-2': ['rgba(200, 137, 43, 0.10)', 'rgba(200, 137, 43, 0.10)'],
};
for (const [name, [dunkel, hell]] of Object.entries(VERTRAG)) {
  assert.equal(token(name, 0), dunkel, `${name} dunkel`);
  assert.equal(token(name, 1), hell, `${name} hell`);
  // Der zweite Hell-Block (Medienabfrage fuer „Auto") traegt dieselben Werte.
  assert.equal(token(name, 2), hell, `${name} hell (Auto)`);
}

// ── 2. Status ist nicht Signal ────────────────────────────────────────────
assert.equal(token('--color-bc-green'), '#2F7D5C');
assert.equal(token('--color-bc-red'), '#B04A3F');
assert.equal(token('--color-bc-yellow'), '#C8892B');
assert.equal(token('--color-bc-signal'), '#D6402E', 'Tally-Rot ist das Signal');
assert.notEqual(token('--color-bc-red'), token('--color-bc-signal'), 'zwei Toene, zwei Zwecke');

// ── 3. Rot kommt genau einmal vor: in der Definition des Signals ─────────
const rotZeilen = css
  .split('\n')
  .map((z) => z.trim())
  .filter((z) => z.toUpperCase().includes('#D6402E'));
assert.equal(rotZeilen.length, 1, `Tally-Rot steht ${rotZeilen.length}x im Stilblatt`);
assert.ok(rotZeilen[0].startsWith('--color-bc-signal:'), `Tally-Rot steht ausserhalb von --color-bc-signal: ${rotZeilen[0]}`);

// ── 4. Der Fokusring ist das Signal ───────────────────────────────────────
assert.ok(css.includes('outline: 2px solid var(--color-bc-signal)'), 'Fokusring fehlt');
assert.ok(css.includes('outline-offset: 2px'), 'Fokus-Abstand fehlt');

// ── 5. Form-Token und keine Fremd-Palette ────────────────────────────────
for (const [n, w] of Object.entries({ s: '6px', m: '10px', l: '20px', xl: '24px', full: '999px' })) {
  assert.equal(token(`--radius-bc-${n}`), w, `Radius ${n}`);
}
assert.equal(token('--bc-schatten-1', 0), '0 1px 2px rgba(0, 0, 0, 0.30)');
assert.equal(token('--bc-schatten-1', 1), '0 1px 2px rgba(22, 24, 29, 0.06)');
const cssOhneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
for (const alt of ['#0f1117', '#1a1d27', '#2a2d3a', '#3b82f6', '#12141c', '#1e2030']) {
  assert.ok(!cssOhneKommentare.toLowerCase().includes(alt.toLowerCase()), `alter Wert ${alt} steht noch da`);
}
// Deep Navy darf nur noch Text AUF dem Akzent sein, keine Flaeche.
assert.ok(!/--color-bc-(dark|panel|sunken|panel-raised|elevated):\s*#(132040|1D324F)/i.test(css), 'Navy-Flaeche gefunden');

// ── 6. Der Rahmen: Kopfzeile 40 px, Glas; Panel-Kopf ohne Kopflinie ──────
const regel = (klasse) => {
  const m = css.match(new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `Regel .${klasse} fehlt in src/index.css`);
  return m[1];
};
assert.match(regel('bc-topbar'), /height:\s*40px/, 'Kopfzeile ist 40 px');
assert.match(regel('bc-topbar'), /flex:\s*none/, 'Kopfzeile schrumpft nicht mit');
assert.match(regel('bc-topbar::before'), /backdrop-filter:\s*blur\(16px\) saturate\(1\.4\)/, 'Kopfzeile ist kein Glas');
assert.doesNotMatch(regel('bc-panel-head'), /border-bottom/, 'die Kopflinie ist zurueck');

// ── 7. Logo in Kit-Farben, Umschalter sichtbar ───────────────────────────
const signet = readFileSync(resolve(hier, '..', 'src/components/Layout/Signet.tsx'), 'utf8');
assert.ok(signet.includes('fill-bc-logo') && signet.includes('fill-bc-signal'), 'Signet nicht an --logo/--signal');
assert.ok(!/fill-bc-accent/.test(signet), 'Signet haengt am Akzent');
const umschalter = readFileSync(resolve(hier, '..', 'src/components/Layout/ThemaUmschalter.tsx'), 'utf8');
for (const z of ["'system'", "'hell'", "'dunkel'"]) assert.ok(umschalter.includes(z), `Umschalter kennt ${z} nicht`);
assert.ok(umschalter.includes('setzeThema('), 'Umschalter schaltet nicht');

// Eine Regel, die niemand anwendet, ist Dekoration in einer CSS-Datei.
const header = readFileSync(resolve(hier, '..', 'src/components/Layout/Header.tsx'), 'utf8');
assert.ok(header.includes('<header className="bc-topbar'), 'Kopfzeile benutzt .bc-topbar nicht');
assert.ok(header.includes('<ThemaUmschalter />'), 'der Thema-Umschalter steht nicht in der Kopfzeile');
assert.ok(header.includes('<Signet'), 'die Kopfzeile traegt das Signet nicht');

// ── 7. Die Kommandopalette liegt auf Strg/Cmd + K ────────────────────────
//
// „Derselbe Griff ueberall" ist die halbe Zusage; die andere Haelfte ist,
// dass die Palette dieselben Ansichten anbietet wie die Reiter. Deshalb
// prueft der Waechter beides: die Tastenkombination UND dass die Liste aus
// `tabs.ts` kommt statt ein zweites Mal getippt zu sein.
const palette = readFileSync(resolve(hier, '..', 'src/components/Layout/CommandPalette.tsx'), 'utf8');
assert.match(palette, /ctrlKey \|\| e\.metaKey/, 'Palette hoert nicht auf Strg/Cmd');
assert.match(palette, /e\.key === 'k' \|\| e\.key === 'K'/, 'Palette hoert nicht auf K');
const app = readFileSync(resolve(hier, '..', 'src/App.tsx'), 'utf8');
assert.match(app, /\.\.\.TABS\.map/, 'Palette baut die Ansichten nicht aus TABS');
assert.ok(app.includes('<CommandPalette commands={commands} />'), 'Palette ist nicht gemountet');

console.log('brand:check ok — Design-Vertrag 2026-10 (ADR-007) in Hell und Dunkel eingehalten');
