/**
 * Export-Aufnahmen, ohne die Ansicht des Nutzers zu veraendern (#249): die
 * Ansicht wird fuer die Dauer EINES synchronen Aufrufs umgestellt und sofort
 * zurueckgesetzt. Dazwischen malt der Browser nicht.
 */

/** Stellt etwas um, arbeitet, stellt zurueck — auch wenn die Arbeit wirft. */
export function withTemporaryView<T>(enter: () => () => void, work: () => T): T {
  const restore = enter();
  try {
    return work();
  } finally {
    restore();
  }
}

/** Der Teil einer Konva-Stage, den die Plan-Aufnahme braucht. */
export interface PlanStage {
  scaleX(): number;
  scaleY(): number;
  x(): number;
  y(): number;
  scale(s: { x: number; y: number }): unknown;
  position(p: { x: number; y: number }): unknown;
  toCanvas(config: { x: number; y: number; width: number; height: number; pixelRatio: number }): HTMLCanvasElement;
}

/**
 * Der ganze Plan in Weltmassstab, unabhaengig von Zoom und Verschiebung.
 * `toCanvas` schneidet in Bildschirmkoordinaten aus; mit Zoom und Pan lag der
 * Ausschnitt daher irgendwo — bei kleinem Zoom winzig in leerer Flaeche.
 */
export function capturePlanAtWorldScale(stage: PlanStage, worldW: number, worldH: number, pixelRatio = 2): HTMLCanvasElement | null {
  if (!(worldW > 0) || !(worldH > 0)) return null;
  return withTemporaryView(
    () => {
      const scale = { x: stage.scaleX(), y: stage.scaleY() };
      const pos = { x: stage.x(), y: stage.y() };
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      return () => {
        stage.scale(scale);
        stage.position(pos);
      };
    },
    () => stage.toCanvas({ x: 0, y: 0, width: worldW, height: worldH, pixelRatio }),
  );
}

/** Groesse des 3D-Bildes im Export — 16:9 wie die Kachel und wie `defaultView`. */
export const EXPORT_3D_SIZE = { width: 1280, height: 720 } as const;
