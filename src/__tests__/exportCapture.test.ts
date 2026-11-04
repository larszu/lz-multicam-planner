import { describe, it, expect, vi } from 'vitest';
import { capturePlanAtWorldScale, withTemporaryView, type PlanStage } from '../utils/exportCapture';

function fakeStage(scale: number, x: number, y: number) {
  const st = { scale, x, y };
  const seen: Array<{ scale: number; x: number; y: number }> = [];
  const canvas = {} as HTMLCanvasElement;
  const stage: PlanStage = {
    scaleX: () => st.scale,
    scaleY: () => st.scale,
    x: () => st.x,
    y: () => st.y,
    scale: (s) => { st.scale = s.x; },
    position: (p) => { st.x = p.x; st.y = p.y; },
    toCanvas: vi.fn(() => { seen.push({ ...st }); return canvas; }),
  };
  return { stage, st, seen, canvas };
}

describe('Export-Aufnahme ohne Ansichtssprung (#249)', () => {
  it('nimmt den ganzen Plan ohne Zoom und Verschiebung auf und stellt die Ansicht zurueck', () => {
    const f = fakeStage(0.3, 412, -87);
    expect(capturePlanAtWorldScale(f.stage, 800, 600)).toBe(f.canvas);
    expect(f.seen).toEqual([{ scale: 1, x: 0, y: 0 }]);
    expect(f.stage.toCanvas).toHaveBeenCalledWith({ x: 0, y: 0, width: 800, height: 600, pixelRatio: 2 });
    expect(f.st).toEqual({ scale: 0.3, x: 412, y: -87 });
  });

  it('stellt auch zurueck, wenn die Aufnahme wirft', () => {
    const f = fakeStage(2.5, 10, 20);
    f.stage.toCanvas = () => { throw new Error('tainted'); };
    expect(() => capturePlanAtWorldScale(f.stage, 800, 600)).toThrow('tainted');
    expect(f.st).toEqual({ scale: 2.5, x: 10, y: 20 });
  });

  it('ohne Flaeche keine Aufnahme', () => {
    const f = fakeStage(1, 0, 0);
    expect(capturePlanAtWorldScale(f.stage, 0, 600)).toBeNull();
    expect(f.stage.toCanvas).not.toHaveBeenCalled();
  });

  it('withTemporaryView liefert das Ergebnis und raeumt in jedem Fall auf', () => {
    const restore = vi.fn();
    expect(withTemporaryView(() => restore, () => 42)).toBe(42);
    expect(() => withTemporaryView(() => restore, () => { throw new Error('x'); })).toThrow('x');
    expect(restore).toHaveBeenCalledTimes(2);
  });
});
