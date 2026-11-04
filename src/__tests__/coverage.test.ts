import { describe, it, expect } from 'vitest';
import { cameraSees, cellAlpha, coverageReport, type CoverageCamera } from '../utils/coverage';
import type { Wall } from '../types';

const cam = (o: Partial<CoverageCamera> = {}): CoverageCamera => ({ id: 'a', x: 0, y: 10, z: 1.5, pan: 0, tilt: 0, hFovDeg: 40, vFovDeg: 24, ...o });
const block = { id: 'b', x: 20, y: 10, width: 10, rows: 10, rowSpacingM: 1 };

describe('audience coverage', () => {
  it('sees a point inside both angles of view and not behind it', () => {
    expect(cameraSees(cam(), { x: 20, y: 10, z: 1.5 })).toBe(true);
    expect(cameraSees(cam({ pan: 180 }), { x: 20, y: 10, z: 1.5 })).toBe(false);
    expect(cameraSees(cam({ tilt: -60 }), { x: 20, y: 10, z: 1.5 })).toBe(false);
  });

  it('a solid wall blocks the view, a glass front does not', () => {
    const wall: Wall = { id: 'w', x1: 10, y1: 0, x2: 10, y2: 20, label: '' };
    expect(cameraSees(cam(), { x: 20, y: 10, z: 1.5 }, [wall])).toBe(false);
    expect(cameraSees(cam(), { x: 20, y: 10, z: 1.5 }, [{ ...wall, kind: 'glass' }])).toBe(true);
  });

  it('reports the share of the audience seen by at least one camera', () => {
    const none = coverageReport([block], [cam({ pan: 180 })]);
    expect(none.share).toBe(0);
    const wide = coverageReport([block], [cam({ hFovDeg: 120, vFovDeg: 90 })]);
    expect(wide.share).toBe(1);
    const narrow = coverageReport([block], [cam({ hFovDeg: 10 })]);
    expect(narrow.share).toBeGreaterThan(0);
    expect(narrow.share).toBeLessThan(1);
    expect(coverageReport([], [cam()]).share).toBeNull();
  });

  it('counts overlapping cameras and marks the selected one', () => {
    const r = coverageReport([block], [cam({ hFovDeg: 120, vFovDeg: 90 }), cam({ id: 'b', y: 9, hFovDeg: 120, vFovDeg: 90 })], [], 'b');
    expect(Math.max(...r.blocks[0].counts)).toBe(2);
    expect(r.shareSelected).toBe(1);
  });

  it('shades by mode', () => {
    expect(cellAlpha('off', 3, true)).toBe(0);
    expect(cellAlpha('all', 2, false)).toBeGreaterThan(cellAlpha('all', 1, false));
    expect(cellAlpha('gaps', 0, false)).toBeGreaterThan(0);
    expect(cellAlpha('gaps', 1, false)).toBe(0);
    expect(cellAlpha('selected', 1, false)).toBe(0);
  });
});
