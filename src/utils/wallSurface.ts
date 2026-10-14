// Wandoberflaechen (#74).
//
// Vorher wurde das Muster im BILDSCHIRMRAUM gemalt: ein Raster ueber die
// projizierte Bounding-Box der Wand. Daraus folgten beide gemeldeten Fehler:
//
//   • Beim Reinzoomen wuchs die Bounding-Box, also wurden es immer mehr
//     Blumen — und jede besteht aus sechs Kreisen. Bei formatfuellender Wand
//     sind das viele Tausend Pfade pro Bild, deshalb wurde es "unfassbar
//     langsam".
//   • Ein Hintergrundbild wurde als `createPattern`-Fuellung ab dem
//     Leinwand-Ursprung gemalt. Es blieb beim Schwenken stehen, wirkte also
//     wie ein Loch in der Wand — und lief bei zwei Waenden durch.
//
// Hier liegt die Loesung: das Muster wird in WANDKOORDINATEN auf eine
// Zwischen-Leinwand gemalt (u laengs, v hoch, beide in Metern skaliert). Wie
// oft es sich wiederholt, steht am Objekt und nicht am Zoom. Die Zeichenkosten
// haengen nur noch von der Kachelzahl ab.
//
// Reines Modul bis auf die Canvas-2D-Nutzung — kein Store, kein React.
import type { Wall, WallFit, WallPattern } from '../types';
import type { ResolvedWall } from './wallHeight';

/** Default-Wiederholungen ueber die Wandhoehe. */
export const DEFAULT_PATTERN_ROWS = 6;
/** Grenzen fuer die Eingabe — 0 waere sinnlos, zu viel wieder langsam. */
export const PATTERN_ROWS_MIN = 1;
export const PATTERN_ROWS_MAX = 40;

/** Kantenlaenge der Zwischen-Leinwand in Pixeln je Meter Wandhoehe. */
const TEXTURE_PX_PER_M = 256;
/** Deckel, damit eine 40-m-Wand nicht in eine Riesen-Leinwand laeuft. */
const TEXTURE_MAX_PX = 2048;

export interface TileGrid {
  /** Wiederholungen laengs der Wand. */
  cols: number;
  /** Wiederholungen ueber die Hoehe. */
  rows: number;
}

/**
 * Wiederholungen fuer eine Wand. `imageAspect` ist Breite/Hoehe der Vorlage
 * (1 fuer die gezeichneten Muster).
 *
 * Bei `tile` folgt die Spaltenzahl aus der Wandform, damit eine Kachel nicht
 * verzerrt: gleiche Kantenlaenge in Metern quer wie hoch.
 */
export function tileGrid(
  fit: WallFit,
  wallLengthM: number,
  wallHeightM: number,
  rows: number,
  imageAspect = 1,
): TileGrid {
  // Unsinnige Eingaben (0, negativ, NaN) fallen auf den Default zurueck statt
  // auf 1 — eine Wand mit einer einzigen Riesenkachel ist selten gemeint.
  const asked = Math.round(rows);
  const safeRows =
    Number.isFinite(asked) && asked >= PATTERN_ROWS_MIN
      ? Math.min(PATTERN_ROWS_MAX, asked)
      : DEFAULT_PATTERN_ROWS;
  const len = Math.max(0.01, wallLengthM);
  const h = Math.max(0.01, wallHeightM);
  switch (fit) {
    case 'stretch':
      return { cols: 1, rows: 1 };
    case 'scale-v': {
      // Bildhoehe = Wandhoehe; waagerecht so oft, wie es der Breite entspricht.
      const tileWidthM = h * imageAspect;
      return { cols: Math.max(1, Math.round(len / tileWidthM)), rows: 1 };
    }
    case 'scale-h': {
      const tileHeightM = len / imageAspect;
      return { cols: 1, rows: Math.max(1, Math.round(h / tileHeightM)) };
    }
    case 'tile':
    default: {
      const tileHeightM = h / safeRows;
      const tileWidthM = tileHeightM * imageAspect;
      return { cols: Math.max(1, Math.round(len / tileWidthM)), rows: safeRows };
    }
  }
}

/**
 * Groesse der Zwischen-Leinwand fuer eine Wand. Der Deckel skaliert BEIDE
 * Seiten — sonst wuerde eine lange Wand gestaucht und die Kacheln waeren
 * verzerrt (genau das, was hier vermieden werden soll).
 */
export function textureSize(wallLengthM: number, wallHeightM: number): { w: number; h: number } {
  const lengthM = Math.max(0.05, wallLengthM);
  const heightM = Math.max(0.05, wallHeightM);
  let h = Math.max(1, Math.round(heightM * TEXTURE_PX_PER_M));
  let w = Math.max(1, Math.round(h * (lengthM / heightM)));
  const over = Math.max(w, h) / TEXTURE_MAX_PX;
  if (over > 1) {
    w = Math.max(1, Math.round(w / over));
    h = Math.max(1, Math.round(h / over));
  }
  return { w, h };
}

/** Schluessel, der sich genau dann aendert, wenn die Textur neu gemalt werden muss. */
export function surfaceKey(wall: ResolvedWall, lengthM: number): string {
  return [
    wall.pattern ?? 'solid',
    wall.patternFit ?? 'tile',
    wall.patternRows ?? DEFAULT_PATTERN_ROWS,
    wall.color ?? '#6b7280',
    lengthM.toFixed(2),
    wall.height.toFixed(2),
    wall.patternImage ? `img:${wall.patternImage.length}:${wall.patternImage.slice(-24)}` : 'noimg',
  ].join('|');
}

/** Eine Blume — dieselbe Form wie vorher, nur in Kachelkoordinaten. */
function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(250,204,21,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

export interface PaintOptions {
  pattern: WallPattern;
  fit: WallFit;
  rows: number;
  color: string;
  /** Vorlage fuer `pattern === 'image'`. */
  image?: CanvasImageSource & { width: number; height: number };
  lengthM: number;
  heightM: number;
}

/**
 * Malt die Wandflaeche in Wandkoordinaten auf `ctx` (Groesse `w` × `h`).
 * Die Anzahl der Motive haengt allein an `rows`/`fit` — nicht am Zoom.
 */
export function paintWallSurface(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: PaintOptions,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = opts.color;
  ctx.fillRect(0, 0, w, h);

  const aspect =
    opts.pattern === 'image' && opts.image && opts.image.height > 0
      ? opts.image.width / opts.image.height
      : 1;
  const grid = tileGrid(opts.fit, opts.lengthM, opts.heightM, opts.rows, aspect);
  const cw = w / grid.cols;
  const ch = h / grid.rows;

  if (opts.pattern === 'image' && opts.image) {
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        ctx.drawImage(opts.image, c * cw, r * ch, cw, ch);
      }
    }
    return;
  }

  if (opts.pattern === 'grid') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, h / 400);
    ctx.beginPath();
    for (let c = 0; c <= grid.cols; c++) {
      const x = c * cw;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let r = 0; r <= grid.rows; r++) {
      const y = r * ch;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    return;
  }

  if (opts.pattern === 'flowers') {
    const radius = Math.min(cw, ch) * 0.42;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        drawFlower(ctx, (c + 0.5) * cw, (r + 0.5) * ch, radius);
      }
    }
  }
}

/**
 * Anteile laengs der Wand fuer die Streifenzerlegung. Jeder Streifen wird
 * einzeln projiziert und affin gezeichnet — die klassische Naeherung fuer
 * perspektivisches Textur-Mapping auf einer 2D-Leinwand (ohne WebGL gibt es
 * nichts Besseres). Genug Streifen, und die Verzerrung ist nicht zu sehen.
 *
 * Die Zerlegung passiert in WANDkoordinaten, nicht auf dem projizierten
 * Viereck: so laesst sich jeder Streifen einzeln gegen die Near-Plane pruefen,
 * und eine Wand, die halb hinter der Kamera liegt, macht keine Rechenfehler.
 */
export function stripRanges(count: number): { t0: number; t1: number }[] {
  const n = Math.max(1, Math.round(count));
  const out: { t0: number; t1: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ t0: i / n, t1: (i + 1) / n });
  return out;
}

export type Point2 = { x: number; y: number };

/**
 * Affine Matrix [a,b,c,d,e,f], die den Quellausschnitt
 * (`sx`,0,`sw`,`texH`) auf das Streifen-Viereck legt:
 *   (sx, 0)      → topLeft
 *   (sx+sw, 0)   → topRight
 *   (sx, texH)   → botLeft
 * Die vierte Ecke ergibt sich daraus; genau darin liegt die Naeherung.
 */
export function stripTransform(
  sx: number,
  sw: number,
  texH: number,
  topLeft: Point2,
  topRight: Point2,
  botLeft: Point2,
): [number, number, number, number, number, number] {
  const a = (topRight.x - topLeft.x) / sw;
  const b = (topRight.y - topLeft.y) / sw;
  const c = (botLeft.x - topLeft.x) / texH;
  const d = (botLeft.y - topLeft.y) / texH;
  return [a, b, c, d, topLeft.x - a * sx, topLeft.y - b * sx];
}

/**
 * Streifenzahl nach Bildschirmbreite der Wand: eine schmale Wand am Horizont
 * braucht keine 64 Streifen, eine formatfuellende schon.
 */
export function stripCount(screenWidthPx: number): number {
  return Math.max(4, Math.min(64, Math.round(Math.abs(screenWidthPx) / 12)));
}
