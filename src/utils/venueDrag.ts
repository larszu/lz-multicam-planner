/**
 * Wer hat da gezogen? — die Frage, an der der 2D-Grundriss gescheitert ist.
 *
 * NUTZER-MELDUNG (2026-09-07): „wenn man im 2D-Plan ne Kamera schwenkt per
 * Mausbewegung springt die Kamera an ne falsche Stelle."
 *
 * ─── WAS PASSIERT IST ──────────────────────────────────────────────────────
 *
 * Die Kamera-Marke ist eine ziehbare Konva-`Group`. IN dieser Gruppe sitzt der
 * Schwenk-Griff, ein eigener ziehbarer Kreis: man zieht ihn um die Marke
 * herum und richtet damit die Blickrichtung aus.
 *
 * Konva-Ereignisse STEIGEN AUF. `DragAndDrop._endDragAfter` feuert `dragend`
 * ausdruecklich mit `bubble = true` — das Ende des Griff-Drags erreicht also
 * auch den `onDragEnd` der Gruppe. Dort wurde bedingungslos gerechnet:
 *
 *     const dropX = e.target.x() / ppm
 *
 * `e.target` war in diesem Fall aber der GRIFF, und dessen Koordinaten sind
 * gruppen-LOKAL: rund dreissig Pixel neben dem Ursprung. Durch `ppm` geteilt
 * ergab das eine Position von wenigen Zentimetern — die Kamera sprang in die
 * Ecke des Grundrisses. Genau die gemeldete Bewegung.
 *
 * `onDragStart` und `onDragMove` des Griffs setzten `cancelBubble` bereits;
 * bei `onDragEnd` fehlte es. Das ist die Sorte Fehler, die wiederkommt, sobald
 * jemand einen zweiten Griff anlegt und die eine Zeile vergisst.
 *
 * ─── DIE REGEL, DIE NICHT ZU VERGESSEN IST ─────────────────────────────────
 *
 * Deshalb steht die Abwehr NICHT (nur) beim Griff, sondern beim Empfaenger:
 * ein Drag-Handler rechnet ausschliesslich mit dem Knoten, an dem er haengt.
 * Konva setzt `currentTarget` beim Aufsteigen auf jeden Knoten neu (`_fire`),
 * `target` bleibt der Ausloeser — die beiden auseinanderzuhalten ist die ganze
 * Pruefung, und sie gilt fuer jeden kuenftigen Griff mit.
 *
 * REIN: keine Uhr, kein Konva, kein React — nur Rechnung und Vergleich.
 */

/**
 * Kommt dieses Zieh-Ereignis vom Knoten selbst, oder ist es von einem Kind
 * aufgestiegen?
 *
 * Absichtlich strukturell getippt statt gegen `KonvaEventObject`: die Regel
 * ist eine Identitaetspruefung und soll ohne Konva-Instanz pruefbar sein.
 */
export const dragIsOwn = (e: { target: unknown; currentTarget: unknown }): boolean =>
  e.target === e.currentTarget;

export interface DropInput {
  /** Wo die Marke losgelassen wurde, in Metern. */
  dropX: number;
  dropY: number;
  /** Ausrichtung der Rig-Achse in Grad (nicht die Blickrichtung). */
  rigYawDeg: number;
  /** Versatz der Marke gegenueber der Parkposition, in Metern. */
  trackOffset: number;
  /** Versatz auf gebogener Strecke (#235); ersetzt die gerade Rechnung. */
  shift?: { dx: number; dy: number };
  venueWidthM: number;
  venueHeightM: number;
}

export interface DropResult {
  /** Die gespeicherte Parkposition — auf den Grundriss begrenzt. */
  parkedX: number;
  parkedY: number;
  /** Wohin die Marke danach gehoert (Parkposition plus Versatz). */
  markerX: number;
  markerY: number;
}

/**
 * Parkposition und Marken-Position aus einem Drop.
 *
 * Der Fahrweg laeuft entlang der RIG-Achse, nicht entlang der Blickrichtung —
 * sonst verschoebe sich die Parkposition, sobald das Rig eine eigene
 * Ausrichtung bekommt. Das Begrenzen auf den Grundriss passiert VOR dem
 * Zurueckrechnen der Marke, damit Marke und gespeicherter Wert nicht
 * auseinanderlaufen.
 */
export const dropToParked = (input: DropInput): DropResult => {
  const yawRad = (input.rigYawDeg * Math.PI) / 180;
  const dx = input.shift?.dx ?? Math.cos(yawRad) * input.trackOffset;
  const dy = input.shift?.dy ?? Math.sin(yawRad) * input.trackOffset;
  const parkedX = Math.max(0, Math.min(input.venueWidthM, input.dropX - dx));
  const parkedY = Math.max(0, Math.min(input.venueHeightM, input.dropY - dy));
  return { parkedX, parkedY, markerX: parkedX + dx, markerY: parkedY + dy };
};

/**
 * Das Planbild an eine neue linke obere Ecke gezogen (#247). Gerundet auf
 * Millimeter, damit die Versatzfelder keine Rechenreste zeigen.
 */
export const planVerschoben = <P extends { offsetX: number; offsetY: number }>(plan: P, xM: number, yM: number): P => ({
  ...plan,
  offsetX: Math.round(xM * 1000) / 1000,
  offsetY: Math.round(yM * 1000) / 1000,
});
