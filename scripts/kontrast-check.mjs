// ───────────────────────────────────────────────────────────────────────────
// Lesbarkeit — gemessen, nicht geschaetzt.
//
// WARUM ES DAS GIBT — Stand 2026-10-13: seit dem Design-Vertrag 2026-10
// (ADR-007, lz-planner-suite) gibt es zwei gleichrangige Modi auf neutralen
// Flaechen; dieser Lauf misst beide (Block 0 = @theme/dunkel, Block 1 = hell)
// gegen ALLE Flaechenstufen. Die Geschichte darunter ist die vom 2026-09-12.
//
// NUTZER-MELDUNG 2026-09-12: „in der av planner suite sieht der multicam
// planner besser aus als der multicam planner einzeln, aber man kann manche
// texte nicht lesen."
//
// NACHGEMESSEN, und es war kein Eindruck. Der WCAG-Kontrast der drei
// Meta-Toene gegen den Grund, auf dem sie stehen (#1D324F, `bc-panel`):
//
//   muted   4.64   knapp
//   dim     3.17   unter 4.5
//   faint   2.19   unter DREI
//
// 2.19:1 ist kein blasser Ton. Das ist kaum sichtbar — und genau dieser stand
// an achtzehn Stellen unter `text-[9px]`, an Hinweisen, die etwas erklaeren
// sollten. Zwei Fehler, die sich gegenseitig verstaerken: zu klein UND zu
// blass.
//
// ─── WAS DIESER LAUF MISST ────────────────────────────────────────────────
//
//   1. Jeder Text-Ton haelt 4.5:1 gegen die Gruende, auf denen Text steht —
//      in BEIDEN Themen. 4.5 ist die Zahl aus WCAG 2.1 AA fuer normalen Text.
//   2. Keine Schriftgroesse unter 11 px im Markup.
//
// ─── WAS ER NICHT KANN, UND DAS GEHOERT DAZU ──────────────────────────────
//
// Er liest die TOKENS und die Klassen im Quelltext, nicht das Bild. Welcher
// Ton am Ende auf welchem Grund landet, entscheidet das Markup; dieser Lauf
// prueft alle Paarungen, die vorkommen KOENNTEN, und nicht die, die
// vorkommen. Ein Ton auf einem Grund, der hier nicht steht (ein Farbverlauf,
// ein Bild, ein `rgba()` ueber allem), faellt ihm nicht auf.
//
// Und er misst NICHT die Groesse, mit der ein Ton gesetzt ist: WCAG erlaubt
// 3.0 fuer grossen Text (>= 24 px, oder 18.66 px fett). Hier gilt die
// strengere Zahl fuer alles — in dieser App gibt es keinen 24-px-Fliesstext,
// und eine Ausnahme, die nichts betrifft, waere nur eine Luecke.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(WURZEL, 'src/index.css'), 'utf8')

/** Der Wert eines Tokens im n-ten Block (0 = dunkel, 1 = hell). */
/**
 * Der Wert eines Tokens im n-ten Block (0 = dunkel/@theme, 1 = hell,
 * 2 = hell per Medienabfrage „Auto"), als #rrggbb.
 *
 * Steht ein Token nur im @theme (Statusfarben), gilt es in allen Bloecken.
 * `var(--color-…)` und `color-mix(in srgb, A N%, B)` werden aufgeloest —
 * die Status-Textfarben sind so gebaut, und ein Lauf, der sie nicht
 * ausrechnen kann, misst sie nicht (Stand 2026-10-14).
 */
const rohwert = (name, block) => {
  const treffer = [...css.matchAll(new RegExp(`--color-${name}:\\s*([^;]+);`, 'g'))]
  return (treffer[block] ?? treffer[0])?.[1].trim()
}
const hexZuRgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1).slice(i, i + 2), 16))
const rgbZuHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
function aufloesen(wert, block, tiefe = 0) {
  if (!wert || tiefe > 6) return undefined
  if (/^#[0-9A-Fa-f]{6}$/.test(wert)) return wert
  const v = /^var\(--color-([\w-]+)\)$/.exec(wert)
  if (v) return aufloesen(rohwert(v[1], block), block, tiefe + 1)
  const m = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(wert)
  if (m) {
    const a = aufloesen(m[1], block, tiefe + 1)
    const b = aufloesen(m[3], block, tiefe + 1)
    if (!a || !b) return undefined
    const p = Number(m[2]) / 100
    const [ra, rb] = [hexZuRgb(a), hexZuRgb(b)]
    return rgbZuHex(ra.map((x, i) => x * p + rb[i] * (1 - p)))
  }
  return undefined
}
function token(name, block) {
  return aufloesen(rohwert(name, block), block)
}

const kanal = (c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const leuchte = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
}
export const kontrast = (a, b) => {
  const [x, y] = [leuchte(a), leuchte(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const GRENZE = 4.5
/**
 * Welcher Ton auf welchem Grund geprueft wird — Stand 2026-10-13
 * (Design-Vertrag 2026-10, ADR-007 der lz-planner-suite).
 *
 * Mit den neutralen Flaechen geht die Rampe wieder auf: der gedaempfte Ton
 * haelt jetzt auch auf Flaeche 2 (`bc-panel-raised`, Felder und Chips) und
 * auf erhobenen Flaechen (Menues, Dialoge). Bis 2026-10-13 stand
 * `panel-raised` hier nur bei den hellen Toenen, weil Stahlblau auf Navy
 * bei 3.81 lag.
 *
 * Dazu der Akzent: Text AUF dem Akzent (Hauptknopf) und der Akzent als
 * Schrift (Links, Auswahl) auf den Gruenden.
 */
const ALLE = ['bc-dark', 'bc-panel', 'bc-panel-raised', 'bc-elevated', 'bc-sunken']
const PAARE = [
  ['bc-text', ALLE],
  ['bc-text-bright', ALLE],
  ['bc-muted', ALLE],
  ['bc-dim', ALLE],
  ['bc-faint', ALLE],
  ['bc-accent', ['bc-dark', 'bc-panel', 'bc-elevated']],
  ['bc-accent-text', ['bc-accent']],
  // Status als TEXT (seit 2026-10-14): die Statusfarben selbst sind fuer
  // Flaechen, Punkte und Rahmen; Schrift nimmt die -text-Variante.
  // Gemessen vorher: #B04A3F auf Anthrazit 2.9:1.
  ['bc-red-text', ALLE],
  ['bc-yellow-text', ALLE],
  ['bc-green-text', ALLE],
]

const befunde = []
for (const [block, thema] of [[0, 'dunkel'], [1, 'hell'], [2, 'hell (Auto)']]) {
  for (const [vorn, gruende] of PAARE) {
    const f = token(vorn, block)
    if (!f) {
      befunde.push(`${thema}: Token --color-${vorn} nicht gefunden — dieser Lauf misst es nicht`)
      continue
    }
    for (const g of gruende) {
      const bg = token(g, block)
      if (!bg) {
        befunde.push(`${thema}: Grund --color-${g} nicht gefunden`)
        continue
      }
      const k = kontrast(f, bg)
      if (k < GRENZE) befunde.push(`${thema}: ${vorn} auf ${g} = ${k.toFixed(2)} (Grenze ${GRENZE})`)
    }
  }
}

// ── Schriftgroessen ───────────────────────────────────────────────────────
const alle = (d, out = []) => {
  for (const e of readdirSync(d)) {
    if (['node_modules', 'dist'].includes(e)) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) alle(p, out)
    else if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}
/**
 * Die Untergrenze. ZEHN und nicht elf, und der Unterschied ist begruendet:
 *
 * Gemessen am 2026-09-12 standen in dieser App 1x 8 px, 18x 9 px, 4x 10.5 px
 * und 109x 10 px. Die 19 Stellen unter 10 px sind hochgesetzt — sie waren mit
 * `bc-faint` (2.19:1) gepaart und damit doppelt unlesbar.
 *
 * Die 113 Stellen auf 10/10.5 px sind GEBLIEBEN. Sie auf 11 zu heben waere
 * kein Lesbarkeits-Fix, sondern ein Umbau der Dichte: die Seitenspalte ist
 * 264-420 px breit und traegt Zahlenfelder in Rastern, die dann umbrechen.
 * Der `light-planner` setzt seine Abschnitts-Ueberschriften ebenfalls mit
 * 10 px; der `cable-planner` faengt bei 12 an. Welche der drei Zahlen die
 * der Suite ist, gehoert entschieden und nicht nebenbei gesetzt — im Backlog
 * steht es als offener Punkt, mit diesen Zahlen.
 */
const MINDEST = 10
for (const f of alle(join(WURZEL, 'src'))) {
  const q = readFileSync(f, 'utf8')
  for (const m of q.matchAll(/(?<![\w-])text-bc-(red|yellow|green)(?![\w/-])/g)) {
    befunde.push(`${relative(WURZEL, f)}: ${m[0]} als Schrift — dafuer gibt es ${m[0]}-text (Kontrast)`)
  }
  for (const m of q.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    const px = Number(m[1])
    if (px < MINDEST) befunde.push(`${relative(WURZEL, f)}: text-[${m[1]}px] — unter ${MINDEST} px`)
  }
}

if (befunde.length) {
  for (const b of befunde) console.error(`✗ ${b}`)
  console.error(`\n${befunde.length} Befund(e).`)
  process.exit(1)
}
console.log(
  `kontrast:check ok — alle Text-Toene halten ${GRENZE}:1 in beiden Themen, keine Schrift unter ${MINDEST} px.`,
)
console.log(
  'NICHT gemessen: das gerenderte Bild. Geprueft sind die Token-Paarungen aus der Liste und die Klassen im Quelltext — nicht, welcher Ton im Fenster wirklich auf welchem Grund landet.',
)
