// ───────────────────────────────────────────────────────────────────────────
// Rechenteil der 3D-Ansicht: Blickpunkte (Draufsicht, Blick durch eine
// Kamera), Abdeckungskeile am Boden, Publikumsplaetze, LED-Wand.
//
// Steht ausserhalb der Komponente, weil hier die Fehler sitzen, die man im
// Bild nicht sieht — eine Fahrt, die um 350° statt um 10° dreht, ein
// Publikum, das auf der Buehne steht, ein Keil, der in die falsche Richtung
// zeigt. Das prueft `__tests__/view3dScene.test.ts`.
//
// Koordinaten wie im Rest der App: Plan-x = Welt-x, Plan-y = Welt-z, Hoehe =
// Welt-y. Pan 0 blickt nach +x, positiver Pan dreht nach +y (Plan nach unten),
// Tilt negativ blickt nach unten. Die Blickkamera der 3D-Ansicht schaut bei
// yaw 0 nach -z, `forward = (-sin yaw, 0, -cos yaw)`.
// ───────────────────────────────────────────────────────────────────────────

export interface Framing {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  /** Vertikaler Bildwinkel der Blickkamera in Grad. */
  fovDeg: number;
}

const DEG = Math.PI / 180;

/** Vertikaler Bildwinkel, der bei `aspect` denselben horizontalen ergibt. */
export function vFovForHFov(hFovDeg: number, aspect: number): number {
  const a = aspect > 0 ? aspect : 16 / 9;
  return (2 * Math.atan(Math.tan((hFovDeg * DEG) / 2) / a)) / DEG;
}

/** Blickrichtung einer Planer-Kamera als Welt-Vektor. */
export function cameraDirection(panDeg: number, tiltDeg: number): [number, number, number] {
  const p = panDeg * DEG;
  const t = tiltDeg * DEG;
  return [Math.cos(t) * Math.cos(p), Math.sin(t), Math.cos(t) * Math.sin(p)];
}

/**
 * Blick durch das Objektiv einer Kamera. Die Blickkamera sitzt ein Stueck vor
 * dem Gehaeuse, sonst steht sie im eigenen Kasten.
 */
export function povFraming(
  cam: { x: number; y: number; z: number; pan: number; tilt: number },
  hFovDeg: number,
  aspect: number,
): Framing {
  const [dx, dy, dz] = cameraDirection(cam.pan, cam.tilt);
  const ahead = 0.35;
  return {
    pos: [cam.x + dx * ahead, cam.z + dy * ahead, cam.y + dz * ahead],
    yaw: Math.atan2(-dx, -dz),
    pitch: cam.tilt * DEG,
    fovDeg: vFovForHFov(hFovDeg, aspect),
  };
}

/**
 * Senkrechte Draufsicht, die die ganze Halle zeigt. Oben im Bild liegt
 * Plan-y = 0 — wie im 2D-Plan, damit man sich nicht umdenken muss.
 */
export function topFraming(widthM: number, depthM: number, fovDeg: number, aspect: number): Framing {
  const tanHalf = Math.tan((fovDeg * DEG) / 2);
  const a = aspect > 0 ? aspect : 16 / 9;
  const forDepth = depthM / 2 / tanHalf;
  const forWidth = widthM / 2 / (tanHalf * a);
  const h = Math.max(forDepth, forWidth) * 1.12 + 1;
  // Exakt -90° ergibt mit Euler YXZ eine Singularitaet; ein Hauch davor
  // haelt die Ausrichtung eindeutig.
  return { pos: [widthM / 2, h, depthM / 2], yaw: 0, pitch: -Math.PI / 2 + 0.001, fovDeg };
}

/** Kuerzester Weg von `from` nach `to` im Kreis (Radiant). */
export function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Ease-out wie in der Oberflaeche (`cubic-bezier(.2,.8,.2,1)` angenaehert). */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Abdeckungskeil am Boden: von der Kamera bis zum Schaerfepunkt, so breit wie
 * der horizontale Bildwinkel. Liefert [Spitze, linke Ecke, rechte Ecke] in
 * Plan-Koordinaten.
 */
export function coverageWedge(
  cam: { x: number; y: number; pan: number; tilt: number; focusDistance: number },
  hFovDeg: number,
): [[number, number], [number, number], [number, number]] {
  const reach = Math.max(0.5, cam.focusDistance * Math.cos(cam.tilt * DEG));
  const half = Math.min(89, hFovDeg / 2) * DEG;
  const edge = reach / Math.cos(half);
  const p = cam.pan * DEG;
  const left: [number, number] = [cam.x + Math.cos(p - half) * edge, cam.y + Math.sin(p - half) * edge];
  const right: [number, number] = [cam.x + Math.cos(p + half) * edge, cam.y + Math.sin(p + half) * edge];
  return [[cam.x, cam.y], left, right];
}

// ── Publikum ────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; width: number; height: number }

export interface AudienceInput {
  widthM: number;
  depthM: number;
  stages: Rect[];
  cameras: { x: number; y: number }[];
  persons: { x: number; y: number }[];
  walls: { x1: number; y1: number; x2: number; y2: number }[];
  /** Obergrenze, damit ein Fussballstadion den Rechner nicht lahmlegt. */
  max?: number;
}

export interface Seat {
  x: number;
  y: number;
  /** 0..1, deterministisch — fuer Farbe und Groesse. */
  r: number;
}

const SEAT_W = 0.6;
const ROW_D = 0.95;
const EDGE_GAP = 0.6;
const STAGE_GAP = 2;
const CAMERA_GAP = 1.6;
const PERSON_GAP = 1;
const WALL_GAP = 0.5;
const AISLE_HALF = 0.8;
const BLOCK_ROWS = 12;

function hash(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function distToSegment(px: number, py: number, w: { x1: number; y1: number; x2: number; y2: number }): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / len2)) : 0;
  return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
}

/**
 * Plaetze fuer ein angedeutetes Publikum: ueberall auf dem Boden, wo keine
 * Buehne, keine Kamera, keine Person und keine Wand steht — mit Mittelgang
 * zur Buehne und einem Quergang alle zwoelf Reihen.
 *
 * Reine Kulisse. Die Vorschau und die Sichtlinien rechnen NICHT damit — wer
 * pruefen will, ob ein Kopf im Bild steht, setzt eine Person.
 */
export function audienceSeats(input: AudienceInput): Seat[] {
  const { widthM, depthM, stages, cameras, persons, walls } = input;
  const max = input.max ?? 12000;
  if (!(widthM > 0) || !(depthM > 0)) return [];
  const main = stages.reduce<Rect | null>((best, s) => (!best || s.width * s.height > best.width * best.height ? s : best), null);
  const aisleX = main ? main.x + main.width / 2 : widthM / 2;

  // Wird es zu voll, wird der Abstand groesser statt das Publikum abgeschnitten.
  const area = widthM * depthM;
  const scale = Math.max(1, Math.sqrt((area / (SEAT_W * ROW_D)) / max));
  const sw = SEAT_W * scale;
  const rd = ROW_D * scale;

  const out: Seat[] = [];
  const rows = Math.floor((depthM - 2 * EDGE_GAP) / rd);
  const cols = Math.floor((widthM - 2 * EDGE_GAP) / sw);
  for (let j = 0; j <= rows; j++) {
    if (j % BLOCK_ROWS === BLOCK_ROWS - 1) continue;
    const y = EDGE_GAP + j * rd;
    for (let i = 0; i <= cols; i++) {
      const x = EDGE_GAP + i * sw;
      if (main && Math.abs(x - aisleX) < AISLE_HALF) continue;
      if (stages.some((s) => x > s.x - STAGE_GAP && x < s.x + s.width + STAGE_GAP && y > s.y - STAGE_GAP && y < s.y + s.height + STAGE_GAP)) continue;
      if (cameras.some((c) => Math.hypot(c.x - x, c.y - y) < CAMERA_GAP)) continue;
      if (persons.some((p) => Math.hypot(p.x - x, p.y - y) < PERSON_GAP)) continue;
      if (walls.some((w) => distToSegment(x, y, w) < WALL_GAP)) continue;
      const r = hash(i, j);
      out.push({ x: x + (r - 0.5) * 0.12 * scale, y: y + (hash(j, i) - 0.5) * 0.1 * scale, r });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// ── LED-Wand ───────────────────────────────────────────────────────────────

export interface BoardPlacement {
  /** Mittelpunkt der Unterkante in Plan-Koordinaten. */
  x: number;
  y: number;
  width: number;
  /** Drehung um die Hochachse, Radiant (Welt). Die Flaeche zeigt zu den Kameras. */
  rotY: number;
}

/**
 * Die LED-Wand steht an der Buehnenkante, die von den Kameras am weitesten
 * weg liegt — dort, wo in jeder Halle die Rueckwand ist. Ohne Kameras: an der
 * Kante, die der Hallenmitte abgewandt ist.
 */
export function videoBoardPlacement(stage: Rect, look: { x: number; y: number }): BoardPlacement {
  const cx = stage.x + stage.width / 2;
  const cy = stage.y + stage.height / 2;
  const dx = look.x - cx;
  const dy = look.y - cy;
  const width = Math.min(24, Math.max(2, (Math.abs(dy) >= Math.abs(dx) ? stage.width : stage.height) * 0.8));
  if (Math.abs(dy) >= Math.abs(dx)) {
    // Publikum vorn/hinten: Wand an der gegenueberliegenden Laengskante.
    const y = dy >= 0 ? stage.y : stage.y + stage.height;
    return { x: cx, y, width, rotY: dy >= 0 ? 0 : Math.PI };
  }
  const x = dx >= 0 ? stage.x : stage.x + stage.width;
  return { x, y: cy, width, rotY: dx >= 0 ? Math.PI / 2 : -Math.PI / 2 };
}
