import { describe, expect, it } from 'vitest';
import {
  audienceSeats, cameraDirection, coverageWedge, povFraming, shortestAngleDelta, topFraming, vFovForHFov, videoBoardPlacement,
} from '../utils/view3dScene';

describe('Blick durch eine Kamera', () => {
  it('schaut bei Pan -90 zur Buehne oben im Plan (Plan-y kleiner)', () => {
    const f = povFraming({ x: 10, y: 20, z: 3, pan: -90, tilt: 0 }, 40, 16 / 9);
    const fwd = [-Math.sin(f.yaw), -Math.cos(f.yaw)];
    expect(fwd[0]).toBeCloseTo(0, 5);
    expect(fwd[1]).toBeLessThan(-0.99);
    expect(f.pos[1]).toBeCloseTo(3, 5);
    // Genau am Standort: 1 m im Plan ist 1 m in der Szene.
    expect(f.pos[0]).toBeCloseTo(10, 6);
    expect(f.pos[2]).toBeCloseTo(20, 6);
  });

  it('nimmt die Neigung als Pitch mit', () => {
    expect(povFraming({ x: 0, y: 0, z: 5, pan: 0, tilt: -10 }, 40, 16 / 9).pitch).toBeCloseTo((-10 * Math.PI) / 180, 6);
  });

  it('rechnet den vertikalen Bildwinkel so, dass der horizontale stimmt', () => {
    const v = vFovForHFov(60, 2);
    const h = (2 * Math.atan(Math.tan((v * Math.PI) / 360) * 2) * 180) / Math.PI;
    expect(h).toBeCloseTo(60, 6);
  });

  it('Blickrichtung: Pan 90 zeigt nach +y', () => {
    const [x, y, z] = cameraDirection(90, 0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(1, 6);
  });
});

describe('Draufsicht', () => {
  it('steht ueber der Hallenmitte und zeigt die ganze Halle', () => {
    const f = topFraming(40, 20, 50, 16 / 9);
    expect(f.pos[0]).toBe(20);
    expect(f.pos[2]).toBe(10);
    const halfV = Math.tan((50 * Math.PI) / 360) * f.pos[1];
    expect(halfV).toBeGreaterThanOrEqual(10);
    expect(halfV * (16 / 9)).toBeGreaterThanOrEqual(20);
    expect(f.pitch).toBeLessThan(-1.5);
  });
});

describe('Fahrt', () => {
  it('dreht den kurzen Weg ueber die Naht bei ±180°', () => {
    expect(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 6);
    expect(shortestAngleDelta(0, -0.5)).toBeCloseTo(-0.5, 6);
  });
});

describe('Abdeckungskeil', () => {
  it('oeffnet sich symmetrisch um die Blickrichtung bis zum Schaerfepunkt', () => {
    const [apex, l, r] = coverageWedge({ x: 0, y: 0, pan: 0, tilt: 0, focusDistance: 10 }, 60);
    expect(apex).toEqual([0, 0]);
    expect(l[0]).toBeCloseTo(10, 6);
    expect(r[0]).toBeCloseTo(10, 6);
    expect(l[1]).toBeCloseTo(-r[1], 6);
    expect(Math.abs(l[1])).toBeCloseTo(Math.tan(Math.PI / 6) * 10, 6);
  });
});

describe('Publikum', () => {
  const base = { widthM: 20, depthM: 20, stages: [{ x: 5, y: 0, width: 10, height: 4 }], cameras: [{ x: 10, y: 15 }], persons: [], walls: [] };

  it('setzt niemanden auf die Buehne, neben die Kamera oder in den Mittelgang', () => {
    const seats = audienceSeats(base);
    expect(seats.length).toBeGreaterThan(100);
    for (const s of seats) {
      // 2 m Abstand zur Buehne, abzueglich des Versatzes, der die Reihen auflockert.
      expect(s.x > 3.1 && s.x < 16.9 && s.y < 5.9).toBe(false);
      expect(Math.hypot(s.x - 10, s.y - 15)).toBeGreaterThan(1.4);
      expect(Math.abs(s.x - 10)).toBeGreaterThan(0.7);
    }
  });

  it('bleibt bei riesigen Flaechen unter der Obergrenze', () => {
    const seats = audienceSeats({ ...base, widthM: 400, depthM: 300, max: 5000 });
    expect(seats.length).toBeLessThanOrEqual(5000);
    expect(seats.length).toBeGreaterThan(2500);
  });

  it('ist bei gleichem Plan gleich (kein Flackern beim Neurendern)', () => {
    expect(audienceSeats(base)).toEqual(audienceSeats(base));
  });
});

describe('LED-Wand', () => {
  it('steht an der Buehnenkante, die den Kameras abgewandt ist, und blickt zu ihnen', () => {
    const p = videoBoardPlacement({ x: 5, y: 2, width: 10, height: 4 }, { x: 10, y: 18 });
    expect(p.y).toBe(2);
    expect(p.rotY).toBe(0);
    const side = videoBoardPlacement({ x: 5, y: 2, width: 4, height: 10 }, { x: 30, y: 7 });
    expect(side.x).toBe(5);
    expect(Math.sin(side.rotY)).toBeCloseTo(1, 6);
  });
});
