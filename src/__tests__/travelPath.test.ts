import { describe, it, expect } from 'vitest';
import type { VenueCamera } from '../types';
import { rigLimits, travelShapes, DEFAULT_SWING_DEG } from '../utils/rigLimits';
import { pathLengthM, pathPolyline, pathShift, pathSummary, pathSweepDeg, pointOnPath } from '../utils/travelPath';
import { effectiveCameraPos } from '../utils/camera';
import { rigSkeleton } from '../utils/rigGeometry';
import { dropToParked } from '../utils/venueDrag';

const cam = (o: Partial<VenueCamera> = {}): VenueCamera => ({
  id: 'c', label: 'CAM 1', cameraId: 'x', lensId: 'y', x: 10, y: 10, z: 1.5, pan: 0, tilt: 0,
  focalLength: 50, aperture: 4, focusDistance: 10, color: '#ff0000', extenderActive: 1, ...o,
});

describe('travel shapes', () => {
  it('offers curve for rails, swing for cranes, nothing for static rigs', () => {
    expect(travelShapes('dolly', 3)).toEqual(['line', 'arc']);
    expect(travelShapes('jib', 3)).toEqual(['line', 'swing']);
    expect(travelShapes('slider', 0.6)).toEqual(['line']);
    expect(travelShapes('tripod', 0)).toEqual([]);
  });

  it('falls back to a straight path when the mount cannot do the shape', () => {
    expect(rigLimits({ mountType: 'tripod', travelShape: 'arc' }).pathShape).toBe('line');
    expect(rigLimits({ mountType: 'dolly', travelShape: 'swing' }).pathShape).toBe('line');
  });
});

describe('path geometry', () => {
  it('a straight path is unchanged from before', () => {
    const c = cam({ mountType: 'dolly', trackOffset: 2, pan: 90 });
    const p = effectiveCameraPos(c);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(12);
  });

  it('an arc keeps its length and bends to the side of the radius', () => {
    const limits = rigLimits({ mountType: 'dolly', trackLengthM: 6, travelShape: 'arc', travelRadiusM: 4 });
    expect(pathLengthM(limits)).toBeCloseTo(6);
    expect(pathSweepDeg(limits)).toBeCloseTo((6 / 4) * (180 / Math.PI));
    const end = pointOnPath(limits, 3);
    expect(Math.hypot(end.f - 0, end.l - 4)).toBeCloseTo(4);
    expect(end.l).toBeGreaterThan(0);
    const left = pointOnPath(rigLimits({ mountType: 'dolly', trackLengthM: 6, travelShape: 'arc', travelRadiusM: -4 }), 3);
    expect(left.l).toBeLessThan(0);
  });

  it('an arc never runs past a full circle', () => {
    const limits = rigLimits({ mountType: 'dolly', trackLengthM: 60, travelShape: 'arc', travelRadiusM: 2 });
    expect(pathLengthM(limits)).toBeCloseTo(2 * Math.PI * 2);
  });

  it('a crane swing turns the head around the pivot behind it', () => {
    const limits = rigLimits({ mountType: 'jib', travelShape: 'swing', travelRadiusM: 5, swingDeg: 90 });
    expect(pathSweepDeg(limits)).toBeCloseTo(90);
    const quarter = pointOnPath(limits, limits.travelM);
    expect(Math.hypot(quarter.f + 5, quarter.l)).toBeCloseTo(5);
    expect(quarter.turnDeg).toBeCloseTo(45);
    expect(rigLimits({ mountType: 'jib', travelShape: 'swing' }).travelM).toBeGreaterThan(0);
    expect(DEFAULT_SWING_DEG).toBe(180);
  });

  it('the polyline runs from end 1 to end 2 through the parked point', () => {
    const limits = rigLimits({ mountType: 'dolly', trackLengthM: 4, travelShape: 'arc', travelRadiusM: 3 });
    const line = pathPolyline(limits, 10);
    expect(line).toHaveLength(11);
    expect(line[5].f).toBeCloseTo(0);
    expect(line[5].l).toBeCloseTo(0);
  });

  it('the marker follows the curve and dropping it keeps the parked point', () => {
    const c = cam({ mountType: 'dolly', trackLengthM: 6, travelShape: 'arc', travelRadiusM: 4, trackOffset: 2, pan: 0 });
    const eff = effectiveCameraPos(c);
    const shift = pathShift(c);
    expect(eff.x).toBeCloseTo(10 + shift.dx);
    expect(eff.y).toBeGreaterThan(10);
    const drop = dropToParked({ dropX: eff.x, dropY: eff.y, rigYawDeg: 0, trackOffset: 2, shift, venueWidthM: 40, venueHeightM: 40 });
    expect(drop.parkedX).toBeCloseTo(10);
    expect(drop.parkedY).toBeCloseTo(10);
  });

  it('the drawn rig sits on the curve: rails are bent, the head is where the marker is', () => {
    const c = cam({ mountType: 'dolly', trackLengthM: 6, travelShape: 'arc', travelRadiusM: 4, trackOffset: 1.5 });
    const limits = rigLimits(c);
    const skel = rigSkeleton(limits, { heightM: 1.5, offsetM: 1.5 });
    const head = pointOnPath(limits, 1.5);
    expect(skel.head.f).toBeCloseTo(head.f);
    expect(skel.head.l).toBeCloseTo(head.l);
    const rails = skel.segments.filter((s) => s.role === 'rail');
    expect(rails.length).toBeGreaterThan(4);
    expect(rails.some((s) => Math.abs(s.a.l) > 0.5)).toBe(true);
  });

  it('summarises the path for map and shotlist', () => {
    expect(pathSummary(cam())).toBeNull();
    const s = pathSummary(cam({ mountType: 'jib', travelShape: 'swing', travelRadiusM: 4, swingDeg: 120 }));
    expect(s?.shape).toBe('swing');
    expect(s?.sweepDeg).toBeCloseTo(120);
    expect(s?.heightM?.max).toBeGreaterThan(s?.heightM?.min ?? 99);
  });
});
