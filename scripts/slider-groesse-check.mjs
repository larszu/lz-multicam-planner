#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Sind die Schieberegler zu treffen — und gibt es nur EINEN? — Lauf:
// `npm run slider:check`
//
// ─── WARUM ES DAS GIBT ────────────────────────────────────────────────────
//
// Nutzer-Meldung 2026-09-09: „Passe auch die Ui von allen slidern an sodass
// man sie gut bedienen kann." Damals war `input[type="range"]` 4 px hoch —
// die ganze Trefferflaeche. Dieser Lauf pruefte seitdem die Hoehe im
// Stilblatt (WCAG 2.2 SC 2.5.8: 24 px).
//
// Nutzer-Meldung 2026-10-14: „Passe die Slider so an, dass sie moderner und
// intuitiver bedienbar sind, auch auf Touch." Seitdem gibt es keinen
// nativen Regler mehr, sondern EINE Komponente (`src/components/ui/
// Regler.tsx`) fuer jeden Schieberegler der App: log-Bahn, Rasten,
// Zahlenfeld, Doppelklick auf Standard, Pfeiltasten, Ziehen am Namen. Der
// Lauf wurde darauf umgestellt, nicht abgeschaltet. Er prueft jetzt:
//
//   1. Die Trefferflaeche `.bc-regler`: ≥ 32 px mit Maus, ≥ 44 px auf Touch
//      (`@media (pointer: coarse)`) — die Zahlen aus lzm-web („Klickflaechen
//      ≥ 44 px auf Touch, ≥ 32 px Desktop"), beide ueber der WCAG-Grenze.
//   2. Den Griff `.bc-regler-griff`: ≥ 18 px, auf Touch ≥ 28 px.
//   3. Dass KEIN `type="range"` mehr im Quelltext steht. Ein zweiter, nativer
//      Regler waere eine zweite Bedienung — ohne Rasten, ohne Standardwert,
//      mit 6-px-Bahn auf dem Telefon. Genau der Zustand vor dem 2026-10-14.
//   4. Die Gegenprobe: der gemeinsame Regler wird ueberhaupt benutzt. Ein
//      Lauf, der nichts findet, waere sonst gruen.
//
// ─── WAS ER NICHT KANN ────────────────────────────────────────────────────
//
// Er liest Stilblatt und Quelltext, misst nicht am gerenderten Fenster. Was
// ein umgebendes `transform` oder `zoom` aus den Zahlen macht, sieht er
// nicht — das zeigen die Playwright-Aufnahmen bei 390/1024/1600 px.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(WURZEL, 'src/index.css'), 'utf8');

const NORM = {
  maus: { flaeche: 32, griff: 18 },
  touch: { flaeche: 44, griff: 28 },
};

const fehler = [];

/** Rumpf des ersten Blocks mit genau diesem Selektor, ab `ab`. */
const block = (quelle, selektor, ab = 0) => {
  const re = new RegExp(`(^|[\\s}])${selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'g');
  re.lastIndex = ab;
  const m = re.exec(quelle);
  if (!m) return null;
  const auf = quelle.indexOf('{', m.index);
  return quelle.slice(auf + 1, quelle.indexOf('}', auf));
};
const px = (rumpf, eigenschaft) => {
  const m = rumpf && new RegExp(`(?:^|[\\s;])${eigenschaft}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(rumpf);
  return m ? Number(m[1]) : null;
};

const touchAb = css.indexOf('@media (pointer: coarse)', css.indexOf('.bc-regler'));
if (touchAb < 0) fehler.push('Kein `@media (pointer: coarse)`-Zweig fuer den Regler — Touch bekaeme die Mausgroesse.');

for (const [art, ab, norm] of [['Maus', 0, NORM.maus], ['Touch', touchAb, NORM.touch]]) {
  if (ab < 0) continue;
  const quelle = art === 'Touch' ? css.slice(ab, css.indexOf('\n}', ab)) : css;
  const h = px(block(quelle, '.bc-regler'), 'height');
  if (h === null) fehler.push(`${art}: .bc-regler hat keine Hoehe in px.`);
  else if (h < norm.flaeche) fehler.push(`${art}: Trefferflaeche ${h} px, gebraucht ${norm.flaeche} px.`);
  const g = px(block(quelle, '.bc-regler-griff'), 'width');
  if (g === null) fehler.push(`${art}: .bc-regler-griff hat keine Breite in px.`);
  else if (g < norm.griff) fehler.push(`${art}: Griff ${g} px, gebraucht ${norm.griff} px.`);
}

const dateien = [];
const gehe = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') gehe(p); }
    else if (/\.tsx?$/.test(e)) dateien.push(p);
  }
};
gehe(join(WURZEL, 'src'));

let benutzt = 0;
for (const datei of dateien) {
  const quelle = readFileSync(datei, 'utf8');
  benutzt += (quelle.match(/<(Regler|ValueSlider|LensSlider)\b/g) ?? []).length;
  for (const m of quelle.matchAll(/type=["']range["']/g)) {
    const zeile = quelle.slice(0, m.index).split('\n').length;
    fehler.push(`${datei.replace(WURZEL + '/', '')}:${zeile} — nativer Regler. Bitte den gemeinsamen <Regler> nehmen.`);
  }
}
if (benutzt === 0) {
  fehler.push('Kein einziger <Regler>/<ValueSlider>/<LensSlider> gefunden — das Muster passt nicht mehr, oder die Regler sind weg.');
}

if (fehler.length > 0) {
  console.error('FEHLER: Schieberegler:\n' + fehler.map((f) => `  · ${f}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${benutzt} Regler, alle ueber die gemeinsame Komponente; Trefferflaeche ≥ ${NORM.maus.flaeche} px (Maus) / ≥ ${NORM.touch.flaeche} px (Touch).`);
console.log('Gemessen am Stilblatt und am Quelltext — nicht am gerenderten Fenster.');
