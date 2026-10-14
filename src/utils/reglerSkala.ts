// Rechenteil des gemeinsamen Reglers (components/ui/Regler.tsx): Position,
// Rastung, Schritte und welche Markenbeschriftungen Platz haben. Ohne React,
// damit es testbar bleibt.
import { posToValue, valueToPos } from './lensScale';

export type ReglerSkala = 'linear' | 'log';

export interface ReglerMarke {
  value: number;
  /** Fehlt sie, steht nur der Strich. */
  label?: string;
}

const istLog = (skala: ReglerSkala, min: number, max: number) => skala === 'log' && min > 0 && max > 0;

export function wertZuPos(v: number, min: number, max: number, skala: ReglerSkala): number {
  return valueToPos(v, min, max, istLog(skala, min, max));
}

export function posZuWert(p: number, min: number, max: number, skala: ReglerSkala): number {
  return posToValue(p, min, max, istLog(skala, min, max));
}

/** Auf das Raster `schritt` runden, ohne Gleitkomma-Reste wie 0.30000000000000004. */
export function aufSchritt(v: number, schritt: number | undefined, min: number): number {
  if (!schritt || !(schritt > 0)) return v;
  const n = Math.round((v - min) / schritt);
  const dez = Math.max(0, -Math.floor(Math.log10(schritt)) + 1);
  return Number((min + n * schritt).toFixed(dez));
}

/**
 * Magnetische Rastung: liegt eine Raste naeher als `tolPos` (Anteil der Bahn),
 * gewinnt sie. Gemessen in BAHNPOSITION, damit sich jede Raste gleich stark
 * anfuehlt — auf einer log-Bahn liegen die Werte sonst hinten dicht gedraengt.
 */
export function rasten(v: number, raster: readonly number[], min: number, max: number, skala: ReglerSkala, tolPos: number): number {
  if (raster.length === 0 || !(tolPos > 0)) return v;
  const p = wertZuPos(v, min, max, skala);
  let best = v;
  let bestD = Infinity;
  for (const r of raster) {
    if (r < min - 1e-9 || r > max + 1e-9) continue;
    const d = Math.abs(wertZuPos(r, min, max, skala) - p);
    if (d < bestD) { bestD = d; best = r; }
  }
  return bestD <= tolPos ? best : v;
}

/**
 * Ein Tastaturschritt. `fein` ist der kleinste sinnvolle Schritt (Pfeiltaste),
 * grob das Zehnfache (Shift). Auf einer log-Bahn wird in Bahnposition
 * geschritten: 1/200 bzw. 1/20 der Bahn — sonst waere ein Pfeildruck bei
 * 8 mm ein Riesensprung und bei 800 mm nichts.
 */
export function schrittWert(
  v: number,
  dir: 1 | -1,
  grob: boolean,
  min: number,
  max: number,
  skala: ReglerSkala,
  schritt: number | undefined,
): number {
  let next: number;
  if (istLog(skala, min, max)) {
    const p = wertZuPos(v, min, max, skala) + dir * (grob ? 1 / 20 : 1 / 200);
    next = posZuWert(p, min, max, skala);
  } else {
    const s = schritt && schritt > 0 ? schritt : (max - min) / 100;
    next = aufSchritt(v + dir * s * (grob ? 10 : 1), schritt, min);
  }
  return Math.min(max, Math.max(min, next));
}

export interface PlatzierteMarke extends ReglerMarke {
  /** Bahnposition 0..1. */
  pos: number;
  /** Beschriftung zeigen? Der Strich bleibt immer. */
  zeigen: boolean;
  /** Ausrichtung der Beschriftung, damit die Enden nicht ueber die Bahn ragen. */
  ausrichtung: 'start' | 'mitte' | 'ende';
}

/**
 * Welche Beschriftungen passen nebeneinander?
 *
 * Vorher wurden alle Beschriftungen gesetzt und ueberlappten bei schmaler
 * Bahn („100mm176mm"), oder zwei Marken trugen dieselbe gerundete Zahl
 * („2.82.8", f/2.75 neben f/2.8). Hier gilt: Anfang und Ende stehen immer,
 * dazwischen von links nach rechts nur, was mit Abstand `luftPx` neben die
 * zuletzt gesetzte und vor das Ende passt. Gleiche Texte erscheinen einmal.
 * Die Breite einer Beschriftung wird geschaetzt (`zeichenPx` je Zeichen, bei
 * Ziffern mit tabular-nums nahe an der Wahrheit) — ein Messen im DOM waere
 * genauer, kostet aber bei jedem Ziehen ein Layout.
 */
export function platziereMarken(
  marken: readonly ReglerMarke[],
  min: number,
  max: number,
  skala: ReglerSkala,
  bahnPx: number,
  zeichenPx = 6.6,
  luftPx = 8,
): PlatzierteMarke[] {
  const sortiert = marken
    .filter((m) => m.value >= min - 1e-9 && m.value <= max + 1e-9)
    .map((m) => ({ ...m, pos: wertZuPos(m.value, min, max, skala) }))
    .sort((a, b) => a.pos - b.pos);
  const n = sortiert.length;
  const breite = (m: ReglerMarke) => (m.label ? m.label.length * zeichenPx : 0);
  const out: PlatzierteMarke[] = sortiert.map((m, i) => ({
    ...m,
    zeigen: false,
    ausrichtung: i === 0 && m.pos < 0.02 ? 'start' : i === n - 1 && m.pos > 0.98 ? 'ende' : 'mitte',
  }));
  if (n === 0 || !(bahnPx > 0)) return out;

  const spanne = (m: PlatzierteMarke): [number, number] => {
    const x = m.pos * bahnPx;
    const w = breite(m);
    if (m.ausrichtung === 'start') return [x, x + w];
    if (m.ausrichtung === 'ende') return [x - w, x];
    return [x - w / 2, x + w / 2];
  };

  const erste = out[0];
  const letzte = out[n - 1];
  if (erste.label) erste.zeigen = true;
  let rechtsBelegt = erste.zeigen ? spanne(erste)[1] : -Infinity;
  let letzterText = erste.zeigen ? erste.label : undefined;

  const endeLinks = n > 1 && letzte.label ? spanne(letzte)[0] : Infinity;
  for (let i = 1; i < n - 1; i++) {
    const m = out[i];
    if (!m.label || m.label === letzterText || m.label === letzte.label) continue;
    const [l, r] = spanne(m);
    if (l < rechtsBelegt + luftPx || r > endeLinks - luftPx || l < 0 || r > bahnPx) continue;
    m.zeigen = true;
    rechtsBelegt = r;
    letzterText = m.label;
  }
  if (n > 1 && letzte.label && letzte.label !== erste.label) {
    // Passt das Ende nicht hinter den Anfang (sehr schmale Bahn), bleibt der Anfang.
    letzte.zeigen = endeLinks >= (erste.zeigen ? spanne(erste)[1] + luftPx : 0);
  }
  return out;
}
