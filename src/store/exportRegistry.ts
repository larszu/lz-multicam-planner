export interface ExportRegistry {
  capture2DExport: (() => HTMLCanvasElement | null) | null;
  /** 3D-Bild in fester Ansicht, ohne die Kamera des Nutzers zu bewegen (#249). */
  capture3DExport: (() => HTMLCanvasElement | null) | null;
  /**
   * Die 3D-Ansicht entsteht erst, wenn ihr Reiter einmal sichtbar war. Holt
   * ihn kurz nach vorn (ohne das Layout neu aufzubauen) und liefert das
   * Zuruecksetzen; `null`, wenn nichts zu tun war.
   */
  reveal3DForExport: (() => (() => void) | null) | null;
  capturePreviewCanvas: (() => HTMLCanvasElement | null) | null;
  /**
   * Rendert die Preview in einen frisch erzeugten Canvas fester Breite —
   * unabhaengig davon, ob der Preview-Tab gerade sichtbar ist. Gebraucht fuer
   * Shotlist-Framegrabs (#62 Punkt 5): `capturePreviewCanvas` kopiert den
   * sichtbaren Canvas und liefert nichts, wenn dessen Tab versteckt (0 px) ist.
   */
  renderPreviewOffscreen: ((cssWidth?: number) => HTMLCanvasElement | null) | null;
}

const registry: ExportRegistry = {
  capture2DExport: null,
  capture3DExport: null,
  reveal3DForExport: null,
  capturePreviewCanvas: null,
  renderPreviewOffscreen: null,
};

export function getExportRegistry(): ExportRegistry {
  return registry;
}
