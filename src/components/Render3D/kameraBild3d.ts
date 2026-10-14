// ───────────────────────────────────────────────────────────────────────────
// GERENDERTE KAMERABILDER (#167, #168)
//
// Vorschau und Multiview zeigen jede Kamera durch dieselbe 3D-Szene wie die
// 3D-Ansicht. Dafuer gibt es GENAU EINEN WebGL-Renderer mit EINER Szene
// (`KameraBildHost`), nicht einen je Kachel: Browser erlauben nur wenige
// WebGL-Kontexte, und 20 Kacheln mit je eigener Szene wuerden die Halle samt
// Publikum zwanzigmal im Speicher halten.
//
// Gezeichnet wird synchron auf Anfrage: Kamera einstellen, in eine Ecke des
// Host-Canvas rendern (Scissor/Viewport), das Stueck per `drawImage` in den
// 2D-Canvas des Aufrufers kopieren. Damit bleibt die Render-Schleife beim
// Aufrufer — das Multiview entscheidet selbst, welche Kachel wann dran ist.
//
// Diese Datei kennt kein `three` und kein React-DOM: der Host meldet sich
// hier an, Vorschau und Multiview fragen hier an. So laden sie three.js erst,
// wenn wirklich gerendert wird (der Host ist lazy).
// ───────────────────────────────────────────────────────────────────────────
import { useEffect, useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from '../../utils/storage';

/** Grosse Fenster (Vorschau, PVW/PGM) oder Multiview-Kachel. */
export type BildRolle = 'gross' | 'kachel';

/** Wie das Kamerabild entsteht: gerendert (Standard) oder die alte 2D-Zeichnung. */
export type KameraLook = 'rendered' | 'simple';

export interface Renderer3D {
  /** Rendert `camId` in `canvas` (CSS-Breite `cssW`). `false`, wenn nicht moeglich. */
  render(camId: string, canvas: HTMLCanvasElement, cssW: number, dpr: number, rolle: BildRolle): boolean;
}

let aktiv: Renderer3D | null = null;
let version = 0;
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((fn) => fn());
const abonnieren = (fn: () => void) => {
  hoerer.add(fn);
  return () => { hoerer.delete(fn); };
};

/** Vom Host: anmelden (fertig geladen) bzw. abmelden (`null`). */
export function setzeRenderer3D(r: Renderer3D | null): void {
  aktiv = r;
  version += 1;
  melden();
}

/** Vom Host: die Szene hat sich geaendert — bisherige Bilder sind alt. */
export function szene3DGeaendert(): void {
  version += 1;
  melden();
}

export function bereit3D(): boolean {
  return aktiv !== null;
}

/** Zaehlt jede Aenderung an Szene oder Renderer — als Schluessel fuers Neuzeichnen. */
export function bildVersion3D(): number {
  return version;
}

export function render3D(camId: string, canvas: HTMLCanvasElement, cssW: number, dpr: number, rolle: BildRolle): boolean {
  return aktiv ? aktiv.render(camId, canvas, cssW, dpr, rolle) : false;
}

/** Re-rendert bei jeder Szenen- oder Renderer-Aenderung. */
export function useBildVersion3D(): number {
  return useSyncExternalStore(abonnieren, bildVersion3D, bildVersion3D);
}

// ── Bedarf: der Host lebt nur, solange jemand gerenderte Bilder will ──
let bedarf = 0;
const bedarfHoerer = new Set<() => void>();
const bedarfMelden = () => bedarfHoerer.forEach((fn) => fn());
const bedarfAbonnieren = (fn: () => void) => {
  bedarfHoerer.add(fn);
  return () => { bedarfHoerer.delete(fn); };
};
const braucht = () => bedarf > 0;

/** Eine Ansicht meldet, dass sie gerenderte Bilder zeigen will. */
export function useBedarf3D(an: boolean): void {
  useEffect(() => {
    if (!an) return;
    bedarf += 1;
    bedarfMelden();
    return () => {
      bedarf -= 1;
      bedarfMelden();
    };
  }, [an]);
}

/** Fuer die App: muss der Host gemountet sein? */
export function useBraucht3D(): boolean {
  return useSyncExternalStore(bedarfAbonnieren, braucht, braucht);
}

// ── Aufloesung und Qualitaetsstufe ──

/** Groesste Renderbreite je Rolle in Pixeln; der Host-Canvas ist so breit wie `gross`. */
export const MAX_BREITE = { gross: 1280, kachel: 480 } as const;
export const HOST_BREITE = MAX_BREITE.gross;
export const HOST_HOEHE = Math.round((HOST_BREITE * 9) / 16);

/**
 * Pixelgroesse eines Bildes. Kacheln rendern hoechstens 480 px breit und ohne
 * HiDPI — als Kachel sieht man den Unterschied nicht, die GPU schon.
 * `faktor` < 1 ist die gesenkte Stufe.
 */
export function bildPixel(rolle: BildRolle, cssW: number, dpr: number, faktor = 1): { w: number; h: number } {
  const d = rolle === 'gross' ? Math.min(Math.max(dpr, 1), 1.5) : 1;
  const w = Math.max(16, Math.min(MAX_BREITE[rolle], Math.round(cssW * d * faktor)));
  return { w, h: Math.max(9, Math.round((w * 9) / 16)) };
}

/**
 * Automatische Stufe: misst die Renderzeit je Bild (gleitend). Dauert ein
 * Bild im Mittel laenger als `grenzeMs`, wird einmal gesenkt — wie in der
 * 3D-Ansicht nie von selbst zurueck, sonst flackert es zwischen den Stufen.
 */
export class RenderMessung {
  private mittel = 0;
  private anzahl = 0;
  gesenkt = false;
  constructor(private readonly grenzeMs = 22, private readonly aufwaermen = 8) {}

  /** Ein Bild hat `ms` gedauert; liefert `true`, wenn jetzt gesenkt wird. */
  bild(ms: number): boolean {
    if (this.gesenkt || !(ms >= 0)) return false;
    this.anzahl += 1;
    // Die ersten Bilder kompilieren Shader — sie sagen nichts ueber die GPU.
    if (this.anzahl <= this.aufwaermen) return false;
    this.mittel = this.mittel === 0 ? ms : this.mittel * 0.85 + ms * 0.15;
    if (this.anzahl > this.aufwaermen + 10 && this.mittel > this.grenzeMs) {
      this.gesenkt = true;
      return true;
    }
    return false;
  }
}

// ── Darstellung je Ansicht (Vorschau, Multiview), gespeichert ──

const lookStand = new Map<string, KameraLook>();
const lookHoerer = new Set<() => void>();

export function getKameraLook(key: string): KameraLook {
  let v = lookStand.get(key);
  if (!v) {
    v = loadJSON<KameraLook>(key, 'rendered') === 'simple' ? 'simple' : 'rendered';
    lookStand.set(key, v);
  }
  return v;
}

export function setKameraLook(key: string, v: KameraLook): void {
  lookStand.set(key, v);
  saveJSON(key, v);
  lookHoerer.forEach((fn) => fn());
}

export function useKameraLook(key: string): [KameraLook, (v: KameraLook) => void] {
  const v = useSyncExternalStore(
    (fn) => { lookHoerer.add(fn); return () => { lookHoerer.delete(fn); }; },
    () => getKameraLook(key),
    () => getKameraLook(key),
  );
  return [v, (n) => setKameraLook(key, n)];
}
