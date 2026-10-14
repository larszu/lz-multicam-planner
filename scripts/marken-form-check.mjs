#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Die FORM der Oberflaeche — Rundungen und Schatten NUR ueber Tokens.
// Lauf: `npm run form:check`.
//
// ─── WARUM ES DAS GIBT — Stand 2026-10-13 ─────────────────────────────────
//
// ADR-007 (lz-planner-suite) wurde am 2026-10-13 mit dem Design-Vertrag
// 2026-10 geaendert: die Oberflaeche ist weich gerundet (Radius s/m/l/xl/full)
// und trennt Ebenen mit weichen Schatten (1/2/3). Bis dahin verlangte dieser
// Lauf „keine Rundungen, keine Schatten" und zaehlte jede `rounded`-Utility
// als Verstoss (gemessen 2026-09-11: 237 Rundungen, 10 Schatten).
//
// Der Lauf wird NICHT abgeschaltet, sondern umgedreht: die Gefahr ist jetzt
// nicht die Rundung, sondern die ZUFAELLIGE Rundung — `rounded` (4 px),
// `rounded-lg`, `borderRadius: 8`, `shadow-2xl`: Werte, die niemand
// entschieden hat und die neben den Token-Werten wie ein Fehler aussehen.
// Rundung und Schatten gibt es deshalb nur noch ueber die Tokens.
//
// ─── WAS ER PRUEFT ────────────────────────────────────────────────────────
//
//   TSX/TS   Klassenlisten UND Zeichenketten (Klassen stehen hier oft in
//            Konstanten wie `const feld = '…'`) auf `rounded*`/`shadow*`:
//            erlaubt sind nur rounded-bc-*, rounded-{t,b,l,r,…}-bc-*,
//            shadow-bc-*, rounded-none, shadow-none.
//            Style-Objekte: `borderRadius`/`boxShadow` nur mit `var(--…)`.
//   CSS      `border-radius` nur 0 oder `var(--radius-bc-*)`; `box-shadow`
//            nur none, ein Ring (`0 0 0 Npx …`) oder `var(--…)`-Schatten.
//            Ausnahme: die Token-Definitionen selbst (`--bc-schatten-*`) und
//            der Pill-Hauptknopf, dessen Schein aus `--color-bc-glow-1`
//            kommt (`0 Npx Npx var(--color-bc-glow-1), var(--shadow-bc-1)`).
//
// ─── WAS ER NICHT SIEHT ───────────────────────────────────────────────────
//
// Inhalt: `cornerRadius` einer Konva-Form, `light.shadow` einer 3D-Szene —
// das ist Bild, keine Flaeche. Und Rundungen, die zur Laufzeit aus einer
// Bibliothek kommen.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')

export const BEHALTEN = /^(?:rounded-(?:(?:[trblse]|tl|tr|bl|br|ss|se|es|ee)-)?(?:bc-(?:s|m|l|xl|full)|none)|shadow-(?:bc-[123]|none))$/
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
export function istRing(wert) {
  if (wert === 'none') return true
  const teile = wert.trim().split(/\s+/)
  if (teile.length < 4) return false
  const [x, y, weich] = teile
  return [x, y, weich].every((v) => v === '0' || v === '0px')
}

/** Zeichenketten-Literale — Klassen stehen oft in Konstanten. */
export const zeichenketten = (q) =>
  [...q.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((z) => /(?:^|\s)(?:rounded|shadow)/.test(z))

export const radiusErlaubt = (w) => w === '0' || w === '0px' || /^var\(--radius-bc-[a-z]+\)$/.test(w)

export function schattenErlaubt(w) {
  if (istRing(w)) return true
  if (/^var\(--(?:shadow-bc-[123]|bc-schatten-[123])\)( !important)?$/.test(w)) return true
  // Der Akzent-Schein des Pill-Hauptknopfs.
  if (/^0 \d+px \d+px var\(--color-bc-glow-1\), var\(--shadow-bc-1\)$/.test(w)) return true
  return false
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
      if (!radiusErlaubt(w)) funde.push(`${kurz}  border-radius: ${w}`)
    }
    for (const w of werte(quelle, 'box-shadow')) {
      if (!schattenErlaubt(w)) funde.push(`${kurz}  box-shadow: ${w}`)
    }
  } else {
    for (const liste of [...klassenListen(quelle), ...zeichenketten(quelle)]) {
      klassenGeprueft += 1
      for (const t of liste.match(UTILITY) ?? []) {
        if (!BEHALTEN.test(t)) funde.push(`${kurz}  ${t}`)
      }
    }
    for (const m of quelle.matchAll(/\b(borderRadius|boxShadow)\s*:\s*([^,}\n]+)/g)) {
      const w = m[2].trim()
      if (!/^['"`]?var\(--/.test(w) && !/^['"`]0 0 0 /.test(w) && !/^['"`]none['"`]$/.test(w)) funde.push(`${kurz}  ${m[1]}: ${w}`)
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
assert.equal(trifft('rounded-full'), 1)
assert.equal(trifft('shadow-2xl'), 1)
assert.equal(trifft('rounded-[3px]'), 1, 'ein Wert in eckigen Klammern faellt nicht auf')
assert.equal(trifft('rounded-bc-m rounded-bc-full rounded-t-bc-l shadow-bc-2 rounded-none shadow-none'), 0, 'die Token-Utilities werden beschuldigt')
assert.equal(trifft('rounded-lg shadow-md'), 2, 'Tailwind-Standardstufen kommen durch')
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

// Token statt Literal.
assert.ok(radiusErlaubt('var(--radius-bc-l)'))
assert.ok(!radiusErlaubt('8px'), 'ein roher Radius kommt durch')
assert.ok(schattenErlaubt('var(--shadow-bc-2)'))
assert.ok(!schattenErlaubt('0 10px 30px rgba(0,0,0,0.45)'), 'ein roher Schatten kommt durch')
assert.deepEqual(zeichenketten("const k = 'px-2 rounded border'"), ['px-2 rounded border'])

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
    '\nDesign-Vertrag 2026-10 (ADR-007, geaendert 2026-10-13): Rundung und Schatten ' +
      'nur ueber Tokens — rounded-bc-s/m/l/xl/full, shadow-bc-1/2/3, ' +
      'var(--radius-bc-*), var(--shadow-bc-*).',
  )
  process.exit(1)
}

console.log(
  `form:check ok — Rundungen und Schatten nur ueber Tokens ` +
    `(${klassenGeprueft} Klassenlisten, ${cssGeprueft} Stilblatt-Datei(en) geprueft).`,
)
console.log(
  'NICHT gemessen: Rundungen, die zur Laufzeit entstehen (Bibliotheks-Stile, ' +
    '`style={{ borderRadius }}` aus einer Variablen) — und Inhalt: ein Schatten ' +
    'in einer 3D-Szene oder ein `cornerRadius` im Canvas ist Bild, keine Flaeche.',
)
