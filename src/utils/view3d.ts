/**
 * Startausrichtung der 3D-Ansicht.
 *
 * Position und Neigung standen als feste Zahlen im Code (Hoehe 15 m, 10 m vor
 * der Halle, Neigung -0.35 beim Einhaengen und -0.3 beim Zuruecksetzen). Damit
 * lag die hintere Hallenkante je nach Hallengroesse irgendwo im Bild — bei der
 * Standardhalle mitten drin, mit leerer oberer Bildhaelfte.
 *
 * Hier wird stattdessen gerechnet: die Halle soll das Bild fuellen, die hintere
 * Kante nahe am oberen Rand liegen. Alles ohne Three.js, also direkt testbar.
 */

/** Vertikaler Bildwinkel der 3D-Ansicht (Grad) — muss zur PerspectiveCamera passen. */
export const VIEW3D_FOV_DEG = 50;

/** Zielposition der hinteren Hallenkante, gemessen von oben (0 = Oberkante). */
export const HORIZON_TOP_FRACTION = 0.15;

/** Zielposition der vorderen Hallenkante, gemessen von oben. */
export const FRONT_BOTTOM_FRACTION = 0.85;

/** Hoehe der Blickkamera ueber dem Boden (m) bei ausreichend tiefer Halle. */
export const VIEW3D_CAM_HEIGHT_M = 15;

/**
 * Hoehe der Blickkamera fuer eine Halle dieser Tiefe.
 *
 * Aus grosser Hoehe stehen Vorder- und Hinterkante einer flachen Halle
 * winkelmaessig zu dicht beieinander — sie kann das Bild dann gar nicht
 * fuellen, egal wie weit man wegfaehrt. Bei flachen Hallen geht die Kamera
 * deshalb tiefer.
 */
export function camHeightFor(depthM: number): number {
  return Math.min(VIEW3D_CAM_HEIGHT_M, Math.max(0.5, Math.max(0.001, depthM) * 0.9));
}

/**
 * Seitenverhaeltnis, mit dem die Breite geprueft wird. Das echte Verhaeltnis
 * steht erst zur Laufzeit fest; 16:9 ist die schmalste Form, in der das Panel
 * ueblicherweise steht — bei einem breiteren Panel passt die Halle erst recht.
 */
export const VIEW3D_ASPECT = 16 / 9;

/** Grenzen, damit eine ungewoehnliche Halle die Ansicht nicht auf den Kopf stellt. */
const MIN_PITCH = -1.35; // ~77 Grad nach unten
const MAX_PITCH = -0.1; //  ~6 Grad nach unten

/**
 * Neigung (rad, negativ = nach unten), bei der ein Punkt auf dem Boden in
 * `groundDistM` Entfernung auf `topFraction` der Bildhoehe landet.
 *
 * Herleitung: der Punkt liegt um `d = atan(camHeight / groundDist)` unter der
 * Waagerechten. Auf dem Bild erscheint er um `tan(d - |pitch|) / tan(fov/2)`
 * von der Mitte versetzt; gewuenscht ist `2 * topFraction - 1`. Nach `pitch`
 * aufgeloest ergibt das die Formel unten.
 */
export function groundPitchRad(
  camHeightM: number,
  groundDistM: number,
  fovDeg: number = VIEW3D_FOV_DEG,
  topFraction: number = HORIZON_TOP_FRACTION,
): number {
  const dist = Math.max(0.001, groundDistM);
  const height = Math.max(0.001, camHeightM);
  const halfFov = (Math.max(1, fovDeg) * Math.PI) / 360;
  const f = Math.min(0.95, Math.max(0.05, topFraction));
  const depression = Math.atan(height / dist);
  const offset = Math.atan((2 * f - 1) * Math.tan(halfFov));
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, -(depression - offset)));
}

/**
 * Entfernung zur hinteren Hallenkante, bei der Vorder- und Hinterkante auf den
 * gewuenschten Bildanteilen liegen.
 *
 * Beide Bedingungen zusammen legen den Winkelabstand der beiden Kanten fest:
 *
 *   atan(h / (dist - tiefe)) - atan(h / dist) = atan(b) - atan(a)
 *
 * Die linke Seite faellt streng monoton mit `dist` — von "sehr gross" direkt
 * vor der Halle bis 0 in weiter Ferne. Deshalb Bisektion statt Formel: die
 * Umstellung waere eine quadratische mit Fallunterscheidungen, das Halbieren
 * ist kuerzer und trifft auf Millimeter.
 */
export function fitDistanceM(
  depthM: number,
  camHeightM: number = VIEW3D_CAM_HEIGHT_M,
  fovDeg: number = VIEW3D_FOV_DEG,
  topFraction: number = HORIZON_TOP_FRACTION,
  bottomFraction: number = FRONT_BOTTOM_FRACTION,
): number {
  const depth = Math.max(0.001, depthM);
  const height = Math.max(0.001, camHeightM);
  const halfFov = (Math.max(1, fovDeg) * Math.PI) / 360;
  const t = Math.tan(halfFov);
  const target =
    Math.atan((2 * Math.max(topFraction, bottomFraction) - 1) * t) -
    Math.atan((2 * Math.min(topFraction, bottomFraction) - 1) * t);

  const spread = (dist: number) => Math.atan(height / (dist - depth)) - Math.atan(height / dist);

  // Nicht dichter als eine Kamerahoehe hinter die Halle: naeher wird die
  // Vorderkante so steil, dass die Ansicht kippt.
  let lo = depth + Math.max(0.5, height * 0.3);
  let hi = depth + height * 200 + 1000; // weit weg: Winkelabstand ~ 0
  if (spread(hi) > target) return hi; // Ziel erst noch weiter hinten erreichbar
  if (spread(lo) < target) return lo; // aus dieser Hoehe nicht fuellbar — so nah wie vertretbar
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (spread(mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Mindestentfernung, damit die Halle auch in der Breite ins Bild passt.
 * Gemessen zur hinteren Kante, gerechnet wird ab der Hallenmitte.
 */
export function widthFitDistanceM(
  widthM: number,
  depthM: number,
  fovDeg: number = VIEW3D_FOV_DEG,
  aspect: number = VIEW3D_ASPECT,
): number {
  const halfFov = (Math.max(1, fovDeg) * Math.PI) / 360;
  const halfFovH = Math.atan(Math.tan(halfFov) * Math.max(0.2, aspect));
  const halfWidth = Math.max(0.001, widthM) / 2;
  // 8 % Luft, damit die Wandbeschriftung nicht am Rand klebt.
  return (halfWidth * 1.08) / Math.tan(halfFovH) + Math.max(0, depthM) / 2;
}

/**
 * Neigung, bei der beide Kanten gleich weit von der Bildmitte entfernt liegen.
 *
 * Gebraucht, wenn die Halle das Bild in der Hoehe gar nicht fuellen kann (weil
 * die Breite die Kamera weiter zurueckzwingt). Die Kante oben anzuheften wuerde
 * dann alles an den oberen Rand druecken und den Rest leer lassen.
 *
 * Gesucht ist die Nullstelle von `tan(dHinten - P) + tan(dVorne - P)`; die
 * Summe faellt streng monoton mit P, deshalb wieder Bisektion.
 */
export function centrePitchRad(
  camHeightM: number,
  farDistM: number,
  nearDistM: number,
  fovDeg: number = VIEW3D_FOV_DEG,
): number {
  const height = Math.max(0.001, camHeightM);
  const depFar = Math.atan(height / Math.max(0.001, farDistM));
  const depNear = Math.atan(height / Math.max(0.001, nearDistM));
  const sum = (p: number) => Math.tan(depFar - p) + Math.tan(depNear - p);

  let lo = 0;
  let hi = Math.PI / 2 - 0.01;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) > 0) lo = mid;
    else hi = mid;
  }
  void fovDeg; // Der Bildwinkel kuerzt sich in der Mittelbedingung heraus.
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, -(lo + hi) / 2));
}

export interface View3DFraming {
  /** Kameraposition (x, Hoehe, z) in Weltkoordinaten. */
  pos: [number, number, number];
  /** Blickneigung in rad, negativ = nach unten. */
  pitch: number;
}

/**
 * Startansicht fuer eine Halle: so weit weg, dass sie in Hoehe und Breite ins
 * Bild passt, und so geneigt, dass die hintere Kante oben sitzt.
 *
 * Die Breite kann die Kamera weiter zuruecksetzen, als es fuer die Hoehe noetig
 * waere. Dann bleibt die hintere Kante trotzdem auf ihrem Anteil — die vordere
 * rutscht hoeher, die Halle nimmt weniger Bildhoehe ein. Das ist die richtige
 * Reihenfolge: lieber Luft unten als eine Halle, die seitlich aus dem Bild
 * laeuft.
 */
export function defaultView(widthM: number, heightM: number, minCamY = 0): View3DFraming {
  const width = Math.max(0.001, widthM);
  const depth = Math.max(0.001, heightM);
  // Tribuenen am Rand: von dahinter sieht man nur ihre Rueckwand, also
  // ueber sie hinweg schauen.
  const camY = Math.max(camHeightFor(depth), minCamY);
  const fitDist = fitDistanceM(depth, camY);
  if (minCamY > 0) {
    // Ueber der hinteren Tribuene statt weit dahinter: von dort sieht man das
    // Innere, und die Seiten duerfen angeschnitten sein.
    const nah = Math.min(Math.max(fitDist, widthFitDistanceM(width, depth)), depth * 1.02);
    return { pos: [width / 2, camY, nah], pitch: groundPitchRad(camY, nah) };
  }
  const dist = Math.max(fitDist, widthFitDistanceM(width, depth));
  // Passt die Halle in der Hoehe, wird die hintere Kante nach oben geheftet.
  // Zwingt die Breite die Kamera weiter zurueck, fuellt die Halle das Bild
  // ohnehin nicht mehr — dann liegt sie mittig statt oben angeklebt.
  const pitch = dist > fitDist * 1.02
    ? centrePitchRad(camY, dist, dist - depth)
    : groundPitchRad(camY, dist);
  return {
    // Die hintere Kante liegt bei z = 0, die Kamera also bei z = dist.
    pos: [width / 2, camY, dist],
    pitch,
  };
}

/** Standardposition der Blickkamera ueber einer Halle (x, Hoehe, z). */
export function defaultCameraPos(widthM: number, heightM: number, minCamY = 0): [number, number, number] {
  return defaultView(widthM, heightM, minCamY).pos;
}

/** Startneigung fuer eine Halle mit der Standardposition der Blickkamera. */
export function defaultPitchRad(widthM: number, heightM: number, minCamY = 0): number {
  return defaultView(widthM, heightM, minCamY).pitch;
}
