// Waechter fuer die Oberflaechen-Regeln (lzm-web, Oktober 2026; davor ADR-007
// der av-planner-suite). Lauf: `npm run brand:check`
//
// Seit 2026-10-13: Flaechen und Text sind neutral (Dunkel = Anthrazit), die
// Marke steckt im Akzent, im Signal und im Logo. Geprueft wird deshalb, dass
// Akzent, Signal und Status die Markenwerte tragen und die Flaechen nicht in
// Navy oder Near-Black zurueckfallen.
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

const token = (name) => {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : '';
};

// ── 1. Neutral traegt, Markenblau akzentuiert ─────────────────────────────
assert.equal(token('--color-bc-dark'), '#1E1F23', 'Grund ist Anthrazit');
assert.equal(token('--color-bc-panel'), '#28292E', 'Panel ist Anthrazit, eine Stufe heller');
assert.equal(token('--color-bc-accent'), '#B9C7D8', 'Akzent auf Dunkel ist helles Markenblau');
assert.equal(token('--color-bc-accent-text'), '#132040', 'darauf steht Deep Navy');
assert.match(css, /--color-bc-accent:\s*#1D324F;/, 'Akzent auf Hell ist Zumpe Navy');
for (const navy of ['#132040', '#1D324F']) {
  assert.ok(
    !new RegExp(`--color-bc-(?:dark|panel|sunken|panel-raised):\\s*${navy}`, 'i').test(css),
    `Flaeche in Navy ${navy} — Blau ist nur Akzent`,
  );
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
assert.ok(
  rotZeilen.every((z) => z.startsWith('--color-bc-signal:')),
  `Tally-Rot steht ausserhalb von --color-bc-signal: ${rotZeilen.join(' | ')}`,
);

// ── 4. Der Fokusring ist das Signal ───────────────────────────────────────
assert.ok(css.includes('outline: 2px solid var(--color-bc-signal)'), 'Fokusring fehlt');
assert.ok(css.includes('outline-offset: 3px'), 'Fokus-Abstand fehlt');

// ── 5. Formen nur ueber Token, keine Fremd-Palette ───────────────────────
for (const t of ['--radius-bc-control', '--radius-bc-card', '--radius-bc-modal', '--shadow-bc-1']) {
  assert.ok(token(t), `Token ${t} fehlt`);
}
for (const alt of ['#0f1117', '#1a1d27', '#2a2d3a', '#3b82f6', '#12141c', '#1e2030']) {
  assert.ok(!css.toLowerCase().includes(alt), `alter Near-Black-Wert ${alt} steht noch da`);
}

// ── 6. Der Rahmen: Kopfzeile 40 px ────────────────────────────────────────
//
// ADR-007 Abschnitt 6 nennt Zahlen, und Zahlen kann man messen. Vorher stand
// hier `h-14` am Element — 56 px, eine Tailwind-Stufe, die niemand
// entschieden hat. Als benannte Klasse ist die Zahl eine Zusage; ohne diesen
// Check waere sie beim naechsten Umbau still wieder ein Zufall.
const regel = (klasse) => {
  const m = css.match(new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `Regel .${klasse} fehlt in src/index.css`);
  return m[1];
};
assert.match(regel('bc-topbar'), /height:\s*40px/, 'Kopfzeile ist 40 px');
assert.match(regel('bc-topbar'), /flex:\s*none/, 'Kopfzeile schrumpft nicht mit');

// Eine Regel, die niemand anwendet, ist Dekoration in einer CSS-Datei.
const header = readFileSync(resolve(hier, '..', 'src/components/Layout/Header.tsx'), 'utf8');
assert.ok(header.includes('<header className="bc-topbar'), 'Kopfzeile benutzt .bc-topbar nicht');

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

console.log('brand:check ok — Oberflaechen-Regeln (lzm-web) eingehalten');
