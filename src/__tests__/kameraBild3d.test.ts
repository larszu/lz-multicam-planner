import { describe, expect, it } from 'vitest';
import { MAX_BREITE, RenderMessung, bildPixel, bereit3D, render3D } from '../components/Render3D/kameraBild3d';

describe('gerenderte Kamerabilder (#167, #168)', () => {
  it('Kacheln bleiben klein und ohne HiDPI, grosse Fenster bekommen bis 1,5-fach', () => {
    expect(bildPixel('kachel', 320, 2)).toEqual({ w: 320, h: 180 });
    expect(bildPixel('kachel', 900, 2).w).toBe(MAX_BREITE.kachel);
    expect(bildPixel('gross', 640, 2)).toEqual({ w: 960, h: 540 });
    expect(bildPixel('gross', 2000, 1).w).toBe(MAX_BREITE.gross);
  });

  it('die gesenkte Stufe rendert kleiner', () => {
    expect(bildPixel('gross', 800, 1, 0.6).w).toBe(480);
  });

  it('Auto senkt einmal bei dauerhaft langsamen Bildern, nicht beim Aufwaermen', () => {
    const m = new RenderMessung(20, 3);
    expect([100, 100, 100].some((ms) => m.bild(ms))).toBe(false);
    let gesenkt = false;
    for (let i = 0; i < 30; i++) gesenkt = m.bild(40) || gesenkt;
    expect(gesenkt).toBe(true);
    expect(m.bild(40)).toBe(false);
  });

  it('bleibt bei schnellen Bildern hoch', () => {
    const m = new RenderMessung(20, 3);
    for (let i = 0; i < 50; i++) expect(m.bild(8)).toBe(false);
  });

  it('ohne geladenen Renderer faellt die Anfrage zurueck statt zu werfen', () => {
    expect(bereit3D()).toBe(false);
    expect(render3D('x', {} as HTMLCanvasElement, 320, 1, 'kachel')).toBe(false);
  });
});
