#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Die FORM der Oberflaeche — Rundungen und Schatten NUR ueber die Haus-Token.
// Lauf: `npm run form:check`.
//
// ─── SEIT 2026-10-13 ──────────────────────────────────────────────────────
//
// `lzm-web` (Oktober 2026) hebt „keine Rundungen, keine Schatten" fuer die
// Oberflaeche auf: weiche Rundungen (6/10/20/24 px, Pill) und sehr weiche
// Schatten gehoeren zum heutigen Erscheinungsbild. Was bleibt, ist der Grund
// fuer diesen Lauf: EINE Stelle entscheidet. Erlaubt sind die Token
// `rounded-bc-chip/-control/-card/-modal`, `rounded-full`, `shadow-bc-1/2/3`
// und im Stilblatt `var(--radius-bc-*)` / `var(--shadow-bc-*)`. Ein rohes
// `rounded-md` oder `0 8px 30px …` ist eine zweite Wahrheit und faellt.
//
// Die Geschichte darunter erklaert, warum der Lauf ueberhaupt existiert.
//
// ─── WARUM ES DIESEN LAUF ERST SEIT HEUTE GIBT ────────────────────────────
//
// `brand:check` gab es hier laengst — er las aber NUR `src/index.css`. Die
// Rundungen standen nicht dort, sondern als Tailwind-Utilities im JSX, und
// dorthin sah er nicht. Ein Waechter, der die eine Haelfte prueft und die
// andere nicht erwaehnt, liest sich wie eine Zusage fuer beide.
//
// Gemessen am 2026-09-11, nur in Klassenlisten und ohne Kommentare:
//
//   cable-planner              1854 Rundungen, 74 Schatten
//   multicam-planner            237 Rundungen, 10 Schatten
//   light-planner                 0             0
//   inventory-planner             0             0
//   larszu-facility-planner       0             0
//
// Drei von fuenf hielten die Regel genau ein; die beiden, die sie brachen,
// waren die beiden mit den grossen Oberflaechen. Hier waren es 237 rohe
// `rounded`-Utilities, die Tailwind mit 4 px aufloest — dazu ein
// Schlagschatten am FlexLayout-Ueberlaufmenue, die letzte Stelle im
// Stilblatt, an der eine Flaeche ueber einer anderen zu schweben behauptete.
//
// ─── WAS ER PRUEFT ────────────────────────────────────────────────────────
//
//   TSX/TS   Klassenlisten (`className=…`, `class=…`) auf rohe
//            `rounded*`/`shadow*`-Utilities.
//   CSS      `border-radius` mit einem anderen Wert als 0, und `box-shadow`
//            mit Unschaerfe oder Versatz.
//
// ─── UND WAS AUSDRUECKLICH ERLAUBT IST ────────────────────────────────────
//
//   rounded-bc-control/-card/-modal   Haus-Token. Ihr Wert ist null; ADR-007
//                                     sagt ausdruecklich, dass die NAMEN
//                                     bleiben, damit kein Aufrufer umgebaut
//                                     werden muss.
//   rounded-none / shadow-none        eine Verneinung ist kein Verstoss.
//   ring-*                            der Fokusring ist Pflicht, nicht Dekor.
//   box-shadow: 0 0 0 Npx <farbe>     ein RING ohne Unschaerfe und ohne
//                                     Versatz. Er traegt eine Meldung (der
//                                     abgelehnte Zug blitzt rot), er
//                                     behauptet keine Tiefe. Sobald eine
//                                     Unschaerfe oder ein Versatz dazukommt,
//                                     ist es ein Schlagschatten und faellt.
//
// ─── WAS ER NICHT SIEHT, UND DAS IST WICHTIG ──────────────────────────────
//
// Er liest NUR Klassenlisten. `light.shadow.mapSize` einer 3D-Szene ist ein
// Schatten im BILD und keine Flaeche der Oberflaeche — ein Waechter, der ihn
// mitzaehlt, beschuldigt den Inhalt und wird nach dem zweiten Fehlalarm
// abgeschaltet. Genau daran ist die erste Fassung der Messung gescheitert:
// sie meldete 15 „Schatten" im `light-planner`, und alle fuenfzehn waren
// Three.js.
//
// Er sieht auch keine Rundung, die zur Laufzeit entsteht — ein Stil aus einer
// Bibliothek, ein `style={{ borderRadius }}` aus einer Variablen. Was er
// zusagt, ist der Quelltext dieses Repos.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')

export const BEHALTEN = /^(?:rounded-(?:bc-(?:chip|control|card|modal)|none|full)|shadow-(?:bc-[123]|none))$/
export const UTILITY = /(?<![\w-])(?:rounded|shadow)(?:-[a-z0-9/.%]+)*(?:-\[[^\]]*\])?(?![\w-])/g

const alle = (d, out = []) => {
  for (const e of readdirSync(d)) {
    if (['node_modules', 'dist', 'build', 'release'].includes(e)) continue
    const p = join(d, e)
    const s = statSync(p)
    if (s.isDirectory()) alle(p, out)
    else if (/\.(tsx?|css)$/.test(e)) out.push(p)
  }
  return out
}

/** Kommentare weg — ein Beleg, der eine Klasse NENNT, ist kein Verstoss. */
export const ohneKommentare = (q) =>
  q.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/[^\n]*/gm, ' ')

/**
 * Der Inhalt aller Klassen-Attribute einer Datei, aneinandergehaengt.
 *
 * Absichtlich grob: eine `className={…}`-Klammer kann Code enthalten, und der
 * darf hier mitgelesen werden — eine Klasse steht darin genauso als Zeichen.
 * Was NICHT mitgelesen wird, ist alles ausserhalb.
 */
export function klassenListen(quelle) {
  const raus = []
  const ATTR = /\bclass(?:Name)?\s*=\s*/g
  let i = 0
  for (;;) {
    ATTR.lastIndex = i
    const m = ATTR.exec(quelle)
    if (!m) break
    const start = m.index + m[0].length
    const c = quelle[start]
    if (c === '"' || c === "'") {
      const e = quelle.indexOf(c, start + 1)
      if (e < 0) break
      raus.push(quelle.slice(start + 1, e))
      i = e
    } else if (c === '{') {
      let tiefe = 0
      let e = start
      for (; e < quelle.length; e += 1) {
        if (quelle[e] === '{') tiefe += 1
        else if (quelle[e] === '}') {
          tiefe -= 1
          if (tiefe === 0) break
        }
      }
      raus.push(quelle.slice(start + 1, e))
      i = e
    } else {
      i = start
    }
  }
  return raus
}

/**
 * Werte einer CSS-Eigenschaft.
 *
 * `!important` faellt vorher weg. Sonst waere `border-radius: 0 !important`
 * ein anderer Wert als `border-radius: 0` — und der Lauf meldete eine
 * Rundung, wo ausdruecklich keine steht. Eine falsche Anschuldigung kostet
 * einen Waechter sein Ansehen schneller als ein Durchrutscher; gemessen im
 * `multicam-planner`, wo die FlexLayout-Regeln durchweg `!important`
 * tragen und drei von vier Meldungen Fehltreffer waren.
 */
export const werte = (quelle, eigenschaft) =>
  [...quelle.matchAll(new RegExp(`${eigenschaft}\\s*:\\s*([^;}]+)`, 'g'))].map((m) =>
    m[1].replace(/!important/g, '').trim(),
  )

/**
 * Ist dieser `box-shadow` ein Ring (erlaubt) oder ein Schlagschatten?
 *
 * Ring heisst: kein Versatz, keine Unschaerfe — `0 0 0 <n> <farbe>`. Sobald
 * eine der ersten drei Laengen ungleich null ist, behauptet der Wert Tiefe.
 */
export const RUNDUNG_OK = (w) =>
  /^(?:0|0px|999px|50%|inherit)$/.test(w) || /^var\(--radius-bc-[a-z]+\)$/.test(w)
export const SCHATTEN_OK = (w) => istRing(w) || /^var\(--shadow-bc-[123]\)$/.test(w)

export function istRing(wert) {
  if (wert === 'none') return true
  const teile = wert.trim().split(/\s+/)
  if (teile.length < 4) return false
  const [x, y, weich] = teile
  return [x, y, weich].every((v) => v === '0' || v === '0px')
}

const funde = []
let klassenGeprueft = 0
let cssGeprueft = 0

for (const f of alle(join(WURZEL, 'src'))) {
  const kurz = relative(WURZEL, f)
  const quelle = ohneKommentare(readFileSync(f, 'utf8'))
  if (f.endsWith('.css')) {
    cssGeprueft += 1
    for (const w of werte(quelle, 'border-radius')) {
      if (!RUNDUNG_OK(w)) funde.push(`${kurz}  border-radius: ${w}`)
    }
    for (const w of werte(quelle, 'box-shadow')) {
      if (!SCHATTEN_OK(w)) funde.push(`${kurz}  box-shadow: ${w}`)
    }
  } else {
    for (const liste of klassenListen(quelle)) {
      klassenGeprueft += 1
      for (const t of liste.match(UTILITY) ?? []) {
        if (!BEHALTEN.test(t)) funde.push(`${kurz}  ${t}`)
      }
    }
  }
}

// ─── Gegenproben ───────────────────────────────────────────────────────────

// 0. Es wurde ueberhaupt gelesen. Ein leerer Pfad waere still gruen — die
//    schlimmste Sorte gruen, weil sie nach Arbeit aussieht.
assert.ok(klassenGeprueft > 400, `nur ${klassenGeprueft} Klassenlisten gelesen — der Scan ist kaputt`)
assert.ok(cssGeprueft >= 1, `keine CSS-Datei gelesen`)

// 1. Das Muster faengt wirklich, wonach es sucht.
const trifft = (s) => (s.match(UTILITY) ?? []).filter((t) => !BEHALTEN.test(t)).length
assert.equal(trifft('p-2 rounded border'), 1, 'bare rounded faellt nicht auf')
assert.equal(trifft('rounded-md'), 1)
assert.equal(trifft('shadow-2xl'), 1)
assert.equal(trifft('rounded-[3px]'), 1, 'ein Wert in eckigen Klammern faellt nicht auf')
assert.equal(trifft('rounded-bc-control rounded-bc-card rounded-full rounded-none shadow-bc-2 shadow-none'), 0, 'die Token greifen nicht')
assert.equal(trifft('ring-2 ring-sky-400'), 0, 'der Fokusring wird beschuldigt')
assert.equal(trifft('surrounded rounder'), 0, 'das Muster liest aus laengeren Woertern heraus')

// 2. Der Ring-Test unterscheidet Meldung von Tiefe.
assert.ok(istRing('0 0 0 2px var(--color-bc-signal)'), 'ein Ring wird abgelehnt')
assert.ok(istRing('none'))
assert.ok(!istRing('0 2px 6px rgba(0,0,0,0.4)'), 'ein Schlagschatten kommt durch')
assert.ok(!istRing('0 0 16px #ef444488'), 'eine Unschaerfe kommt durch')
// `0 0 0 2px` ohne Farbe ist ebenfalls ein Ring — die Farbe faellt dann auf
// `currentColor` zurueck. Was ihn zum Schatten macht, ist Versatz oder
// Unschaerfe, nicht die fehlende Farbe.
assert.ok(istRing('0 0 0 2px'), 'ein Ring ohne Farbangabe wird abgelehnt')
assert.ok(!istRing('0 0 6px var(--color-bc-signal)'), 'eine Unschaerfe ohne Versatz kommt durch')
assert.ok(!istRing('inset 0 0 0 2px red'), 'ein Wert mit Schluesselwort ist kein geprueftes Muster')

// Token sind erlaubt, rohe Werte nicht.
assert.ok(RUNDUNG_OK('var(--radius-bc-card)') && RUNDUNG_OK('999px') && !RUNDUNG_OK('8px'))
assert.ok(SCHATTEN_OK('var(--shadow-bc-2)') && !SCHATTEN_OK('0 8px 30px rgba(0,0,0,.4)'))

// `!important` darf den Wert nicht zu einem anderen machen.
assert.deepEqual(werte('a { border-radius: 0 !important; }', 'border-radius'), ['0'])
assert.deepEqual(werte('a { box-shadow: none !important; }', 'box-shadow'), ['none'])
assert.deepEqual(werte('a { border-radius: 8px; }', 'border-radius'), ['8px'])

// 3. Klassenlisten werden gefunden, und NUR sie.
{
  assert.deepEqual(klassenListen('<a className="x y" />'), ['x y'])
  assert.deepEqual(klassenListen('<a class=\'x\' />'), ['x'])
  assert.deepEqual(klassenListen('<a className={`x ${b} y`} />'), ['`x ${b} y`'])
  assert.deepEqual(klassenListen('light.shadow.mapSize = 2048'), [], 'ausserhalb wird gelesen')
}

// 4. Kommentare zaehlen nicht mit — sonst duerfte dieser Kopf die Klassen
//    nicht beim Namen nennen, und ein Waechter, den man nicht erklaeren darf,
//    wird abgeschaltet.
assert.equal(trifft(ohneKommentare('/* rounded-full */ p-2')), 0)
assert.equal(trifft(ohneKommentare('  // shadow-lg\n  p-2')), 0)

if (funde.length) {
  console.error(`\n${funde.length} rohe Rundung(en)/Schatten in der Oberflaeche:`)
  for (const f of funde.slice(0, 40)) console.error(`  ${f}`)
  if (funde.length > 40) console.error(`  … ${funde.length - 40} weitere`)
  console.error(
    '\nRundungen und Schatten nur ueber Token: rounded-bc-chip/-control/-card/-modal, ' +
      'rounded-full, shadow-bc-1/2/3 bzw. var(--radius-bc-*) / var(--shadow-bc-*).',
  )
  process.exit(1)
}

console.log(
  `form:check ok — Rundungen und Schatten nur ueber Token ` +
    `(${klassenGeprueft} Klassenlisten, ${cssGeprueft} Stilblatt-Datei(en) geprueft).`,
)
console.log(
  'NICHT gemessen: Rundungen, die zur Laufzeit entstehen (Bibliotheks-Stile, ' +
    '`style={{ borderRadius }}` aus einer Variablen) und alles ausserhalb von ' +
    'Klassenlisten — ein Schatten in einer 3D-Szene ist Inhalt, keine Flaeche.',
)
