import { describe, expect, it } from 'vitest';
import { timecodeOfDay } from '../components/Multiview/timecode';
import { useStore } from '../store/useStore';

describe('multiview', () => {
  it('formats the time of day as HH:MM:SS:FF at 25 fps', () => {
    expect(timecodeOfDay(new Date(2026, 9, 13, 9, 5, 7, 960))).toBe('09:05:07:24');
  });

  it('drops the program source when its camera is removed', () => {
    useStore.getState().addCamera();
    const id = useStore.getState().selectedCameraId!;
    useStore.getState().setProgramCamera(id);
    useStore.getState().removeCamera(id);
    expect(useStore.getState().programCameraId).toBeNull();
  });
});

// #172: Das Multiview zeichnete ueber einen Renderer, den nur die gemountete
// Vorschau bereitstellte. Jetzt muss jede Kamera ohne Vorschau zu zeichnen sein.
describe('Kamerabild ohne Vorschau (#172)', () => {
  // Ein 2D-Kontext, der jeden Aufruf schluckt — gemessen wird nur, DASS
  // gezeichnet wird, nicht was.
  const schlucker = (): unknown => new Proxy(() => {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : schlucker()),
    set: () => true,
    apply: () => schlucker(),
  });
  const leinwand = () => {
    const ctx = schlucker();
    return { width: 0, height: 0, style: {} as Record<string, string>, getContext: () => ctx } as unknown as HTMLCanvasElement;
  };

  it('zeichnet eine Kamera aus dem Store, ohne dass eine Vorschau gemountet ist', async () => {
    const { renderCamera } = await import('../components/Preview/cameraViewRenderer');
    const { getExportRegistry } = await import('../store/exportRegistry');
    expect(getExportRegistry().renderPreviewOffscreen).toBeNull();
    useStore.getState().addCamera();
    const id = useStore.getState().selectedCameraId!;
    const canvas = leinwand();
    expect(renderCamera(id, canvas, 320, 1)).toBe(true);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
  });

  it('meldet false fuer eine Kamera, die es nicht gibt', async () => {
    const { renderCamera } = await import('../components/Preview/cameraViewRenderer');
    expect(renderCamera('gibt-es-nicht', leinwand(), 320)).toBe(false);
  });
});
