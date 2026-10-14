export interface ExportRegistry {
  capture2DExport: (() => HTMLCanvasElement | null) | null;
  capturePreviewCanvas: (() => HTMLCanvasElement | null) | null;
  /**
   * Rendert die Preview in einen frisch erzeugten Canvas fester Breite —
   * unabhaengig davon, ob der Preview-Tab gerade sichtbar ist. Gebraucht fuer
   * Shotlist-Framegrabs (#62 Punkt 5): `capturePreviewCanvas` kopiert den
   * sichtbaren Canvas und liefert nichts, wenn dessen Tab versteckt (0 px) ist.
   */
  renderPreviewOffscreen: ((cssWidth?: number) => HTMLCanvasElement | null) | null;
  prepareForExport: (() => Promise<{ restore: () => void } | null>) | null;
  framing3D: {
    save: () => FramingState;
    apply: (s: FramingState) => void;
    fitVenue: (w: number, h: number) => void;
  } | null;
}

export interface FramingState {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
}

const registry: ExportRegistry = {
  capture2DExport: null,
  capturePreviewCanvas: null,
  renderPreviewOffscreen: null,
  prepareForExport: null,
  framing3D: null,
};

export function getExportRegistry(): ExportRegistry {
  return registry;
}
