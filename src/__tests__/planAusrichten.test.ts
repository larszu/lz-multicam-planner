// #247 — erkannte Wände liegen auf dem Plan, aus dem sie stammen, und der
// Plan lässt sich danach an sie heranziehen.
import { describe, expect, it } from 'vitest';
import { dxfLesen, planErkennen } from '../avplan/floorplan';
import { seitenBasis, textInhaltLesen } from '../avplan/floorplan/pdfVektor';
import { rahmenUmlegen, vorschauAusPlan } from '../lib/planLauf';
import { planVerschoben } from '../utils/venueDrag';
import type { BackgroundPlan } from '../types';

const g = (...p: (string | number)[]) => {
  const z: string[] = [];
  for (let i = 0; i < p.length; i += 2) z.push(String(p[i]), String(p[i + 1]));
  return z.join('\n');
};
const lw = (pts: [number, number][]) =>
  g(0, 'LWPOLYLINE', 8, 'A-WALL', 90, pts.length, 70, 1, ...pts.flatMap(([x, y]) => [10, x, 20, y]));
// 10 × 5 m Raum, 20 cm Wand, in Millimetern
const DXF = [
  g(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC'),
  g(0, 'SECTION', 2, 'ENTITIES'),
  lw([[-200, -200], [10200, -200], [10200, 5200], [-200, 5200]]),
  lw([[0, 0], [10000, 0], [10000, 5000], [0, 5000]]),
  g(0, 'ENDSEC', 0, 'EOF'),
].join('\n');

const zeichnung = dxfLesen(DXF);
const erkannt = planErkennen(zeichnung);

const bild = (o: Partial<BackgroundPlan> = {}): BackgroundPlan => ({
  dataUrl: 'data:image/png;base64,x',
  scaleX: 0.01,
  scaleY: 0.01,
  offsetX: 3,
  offsetY: 1,
  opacity: 0.3,
  widthPx: 1040,
  heightPx: 540,
  ...o,
});

const huelle = (w: { x1: number; y1: number; x2: number; y2: number }[]) => ({
  minX: Math.min(...w.flatMap((x) => [x.x1, x.x2])),
  maxX: Math.max(...w.flatMap((x) => [x.x1, x.x2])),
  minY: Math.min(...w.flatMap((x) => [x.y1, x.y2])),
  maxY: Math.max(...w.flatMap((x) => [x.y1, x.y2])),
});

describe('Vorschau und Plan liegen übereinander', () => {
  it('gibt der Vorschau das Planbild mit, wie es nach „Übernehmen" liegt', () => {
    const e = vorschauAusPlan(erkannt, bild(), { walls: true, columns: true, stages: true, applyScale: true }, 0);
    expect(e.vorschau.plan).toEqual(e.plan);
    // Die Wandmittellinie liegt 10 cm innerhalb der Zeichnungskante — auf dem Bild,
    // das nach der Übernahme bei offsetX beginnt.
    const h = huelle(e.vorschau.waende);
    expect(h.minX - e.plan!.offsetX).toBeCloseTo(0.1, 2);
    expect(h.minY - e.plan!.offsetY).toBeCloseTo(0.1, 2);
  });

  it('ohne Maßstab-Übernahme bleibt das Bild liegen und die Vorschau trägt keines', () => {
    const e = vorschauAusPlan(erkannt, bild(), { walls: true, columns: true, stages: true, applyScale: false }, 0);
    expect(e.vorschau.plan).toBeUndefined();
  });

  it('folgt getrennt kalibrierten Achsen', () => {
    // Bild in Y doppelt gestreckt: die Wände müssen es auch sein.
    const p = bild({ scaleY: 0.02 });
    const e = vorschauAusPlan(erkannt, p, { walls: true, columns: true, stages: true, applyScale: false }, 0);
    const h = huelle(e.vorschau.waende);
    const breiteBild = p.widthPx * p.scaleX;
    const hoeheBild = p.heightPx * p.scaleY;
    expect((h.maxX - h.minX) / breiteBild).toBeCloseTo(10.2 / 10.4, 2);
    expect((h.maxY - h.minY) / hoeheBild).toBeCloseTo(5.2 / 5.4, 2);
    expect(h.minY - p.offsetY).toBeCloseTo(0.1 * (hoeheBild / 5.4), 2);
  });

  it('legt einen Ausschnitt von der Vorschau-Lage zurück auf das liegende Bild', () => {
    const von = bild({ scaleX: 0.02, scaleY: 0.02, offsetX: 5, offsetY: 7 });
    const nach = bild();
    const r = { minX: 5, minY: 7, maxX: 15, maxY: 12 };
    const zurueck = rahmenUmlegen(r, von, nach);
    expect(zurueck).toEqual({ minX: 3, minY: 1, maxX: 8, maxY: 3.5 });
    const hin = rahmenUmlegen(zurueck, nach, von);
    expect(hin.maxX).toBeCloseTo(15, 9);
    expect(hin.maxY).toBeCloseTo(12, 9);
  });
});

describe('PDF-Seiten mit /Rotate', () => {
  const MM = 25.4 / 72;
  it('nimmt ohne Viewport die alte Abbildung (y gespiegelt)', () => {
    const b = seitenBasis({ view: [0, 0, 100, 50], getOperatorList: async () => ({ fnArray: [], argsArray: [] }), getTextContent: async () => ({ items: [] }) });
    expect(b.breite).toBeCloseTo(100 * MM, 9);
    expect(b.hoehe).toBeCloseTo(50 * MM, 9);
    expect(b.basis).toEqual([MM, 0, 0, -MM, -0, 50 * MM]);
  });

  it('dreht mit der Seite, wie der Renderer sie zeichnet', () => {
    // pdf.js-Viewport einer Seite 100 × 50 pt mit /Rotate 90 bei Maßstab MM
    const seite = {
      view: [0, 0, 100, 50],
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      getTextContent: async () => ({ items: [] }),
      getViewport: ({ scale }: { scale: number }) => ({ width: 50 * scale, height: 100 * scale, transform: [0, scale, scale, 0, 0, 0] }),
    };
    const b = seitenBasis(seite);
    expect(b.breite).toBeCloseTo(50 * MM, 9);
    expect(b.hoehe).toBeCloseTo(100 * MM, 9);
    // Waagerechter Text im PDF steht auf dem gedrehten Blatt senkrecht.
    const [t] = textInhaltLesen([{ str: 'Saal', transform: [10, 0, 0, 10, 20, 30] }], b.basis as never);
    expect(t.x).toBeCloseTo(30 * MM, 9);
    expect(t.y).toBeCloseTo(20 * MM, 9);
    expect(t.winkel).toBeCloseTo(90, 9);
  });

  it('lässt den Winkel ungedrehter Seiten wie bisher', () => {
    const b = seitenBasis({ view: [0, 0, 100, 50], getOperatorList: async () => ({ fnArray: [], argsArray: [] }), getTextContent: async () => ({ items: [] }) });
    const [t] = textInhaltLesen([{ str: 'A', transform: [0, 10, -10, 0, 20, 30] }], b.basis as never);
    expect(t.winkel).toBeCloseTo(-90, 9);
  });
});

describe('Plan per Ziehen verschieben', () => {
  it('setzt nur den Versatz, auf Millimeter gerundet', () => {
    const p = bild();
    const n = planVerschoben(p, 4.12345, -0.5004);
    expect(n).toEqual({ ...p, offsetX: 4.123, offsetY: -0.5 });
  });
});
