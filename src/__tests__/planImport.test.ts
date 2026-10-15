import { describe, expect, it } from 'vitest';
import { dxfLesen, istDxfDatei, planErkennen } from '../avplan/floorplan';
import { vorschauAusPlan } from '../lib/planLauf';
import { vorschauImBereich } from '../lib/planVorschau';
import { wandDicke, wandStuecke } from '../utils/wallOpenings';
import type { BackgroundPlan, Wall } from '../types';

// Ein DXF in Millimetern: Raum 6,00 × 4,00 m lichte Weite, 24 cm Wand, eine
// Tuer mit Schwenkbogen. Reicht, um den Weg Datei → Erkennung → Vorschau →
// Welt-Meter zu messen, ohne einen fremden Plan ins Repo zu legen.
const g = (...p: (string | number)[]) => {
  const z: string[] = [];
  for (let i = 0; i < p.length; i += 2) z.push(String(p[i]), String(p[i + 1]));
  return z.join('\n');
};
const lw = (ebene: string, pts: [number, number][]) =>
  g(0, 'LWPOLYLINE', 8, ebene, 90, pts.length, 70, 1, ...pts.flatMap(([x, y]) => [10, x, 20, y]));

const DXF = [
  g(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC'),
  g(0, 'SECTION', 2, 'ENTITIES'),
  // Aussen- und Innenkante der umlaufenden Wand
  lw('A-WALL', [[-240, -240], [6240, -240], [6240, 4240], [-240, 4240]]),
  lw('A-WALL', [[0, 0], [6000, 0], [6000, 4000], [0, 4000]]),
  g(0, 'TEXT', 8, 'A-ROOM', 10, 2000, 20, 2200, 40, 200, 1, 'Saal'),
  g(0, 'TEXT', 8, 'A-ROOM', 10, 2000, 20, 2000, 40, 200, 1, 'F: 24,00 m²'),
  g(0, 'ENDSEC', 0, 'EOF'),
].join('\n');

const planBild = (breitePx: number, hoehePx: number, mjePx: number): BackgroundPlan => ({
  dataUrl: 'data:image/png;base64,x',
  scaleX: mjePx,
  scaleY: mjePx,
  offsetX: 2,
  offsetY: 1,
  opacity: 0.3,
  widthPx: breitePx,
  heightPx: hoehePx,
});

describe('DXF erkennen und in Welt-Meter legen', () => {
  const zeichnung = dxfLesen(DXF);
  const plan = planErkennen(zeichnung);

  it('erkennt die vier Wände mit 24 cm Stärke', () => {
    const lang = plan.waende.filter((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 3);
    expect(lang).toHaveLength(4);
    for (const w of lang) expect(w.dickeM).toBeCloseTo(0.24, 3);
  });

  it('legt die Vorschau maßstäblich ins Venue, wenn der Maßstab übernommen wird', () => {
    // Planbild doppelt so breit wie nötig: der übernommene Maßstab korrigiert das.
    const bild = planBild(1000, 700, 0.02);
    const e = vorschauAusPlan(plan, bild, { walls: true, columns: true, stages: true, applyScale: true }, 0);
    expect(e.plan!.scaleX).toBeCloseTo(zeichnung.breite * 0.001 / 1000, 6);
    const breiten = e.vorschau.waende.map((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1));
    // Die längste Wand ist die Aussenlänge 6,48 m abzüglich nichts, Mittellinie 6,24 m
    expect(Math.max(...breiten)).toBeCloseTo(6.24, 2);
  });

  it('macht das Venue so gross wie das Gebäude, nicht wie das Blatt', () => {
    const bild = planBild(1000, 700, 0.02);
    const e = vorschauAusPlan(plan, bild, { walls: true, columns: true, stages: true, applyScale: true }, 0);
    // Gebäude 6,24 × 4,24 m (Wandmittellinien) plus 2 m Rand auf jeder Seite
    expect(e.venueGroesse).toEqual({ widthM: 11, heightM: 9 });
    // Der Plan wird so geschoben, dass das Gebäude mit dem Rand darin liegt
    expect(Math.min(...e.vorschau.waende.map((w) => Math.min(w.x1, w.x2)))).toBeCloseTo(2, 2);
    expect(Math.min(...e.vorschau.waende.map((w) => Math.min(w.y1, w.y2)))).toBeCloseTo(2, 2);
    // Der Plan selbst rueckt um den Rand abzueglich der Lage des Gebaeudes
    // auf dem Blatt — die Wände landen damit genau auf dem Rand.
    expect(e.plan!.offsetX).toBeCloseTo(2 - plan.gebaeude!.minX, 6);
  });

  it('staucht die Zeichnung auf die Kalibrierung, wenn der Maßstab nicht übernommen wird', () => {
    const bild = planBild(1000, 700, 0.02); // Plan ist 20 m breit im Venue
    const e = vorschauAusPlan(plan, bild, { walls: true, columns: true, stages: true, applyScale: false }, 0);
    expect(e.plan).toBeUndefined();
    const faktor = 20 / (zeichnung.breite * 0.001);
    expect(Math.max(...e.vorschau.waende.map((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1)))).toBeCloseTo(6.24 * faktor, 1);
  });

  it('schiebt den Ausschnitt mit, wenn der Plan maßstäblich gelegt wird', () => {
    const bild = planBild(1000, 700, 0.02);
    // Ausschnitt über der linken Hälfte des Plans, wie er gerade liegt
    const bereich = { minX: bild.offsetX, minY: bild.offsetY, maxX: bild.offsetX + 10, maxY: bild.offsetY + 14 };
    const e = vorschauAusPlan(plan, bild, { walls: true, columns: true, stages: true, applyScale: true, bereich }, 0);
    // Der Plan rückt; der Ausschnitt deckt danach dieselbe Stelle der Zeichnung
    const faktor = 1 / ((bild.widthPx * bild.scaleX) / (zeichnung.breite * 0.001));
    expect(e.vorschau.bereich!.maxX - e.vorschau.bereich!.minX).toBeCloseTo(10 * faktor, 6);
    expect(e.vorschau.bereich!.minX).toBeCloseTo(e.plan!.offsetX, 6);
  });

  it('nimmt nur, was im gewählten Ausschnitt liegt', () => {
    const bild = planBild(1000, 700, 0.02);
    const e = vorschauAusPlan(plan, bild, { walls: true, columns: true, stages: true, applyScale: true }, 0);
    const halb = { ...e.vorschau, bereich: { minX: 0, minY: 0, maxX: 100, maxY: 3 } };
    const teil = vorschauImBereich(halb);
    expect(teil.waende.length).toBeGreaterThan(0);
    expect(teil.waende.length).toBeLessThan(e.vorschau.waende.length);
    expect(teil.waende.every((w) => (w.y1 + w.y2) / 2 <= 3)).toBe(true);
  });
});

describe('Wand mit Öffnungen als Quader', () => {
  const wand = (o: Wall['openings']): Wall => ({ id: 'w1', x1: 0, y1: 0, x2: 4, y2: 0, label: 'Wall', openings: o });

  it('bleibt ohne Öffnung ein einziger Quader', () => {
    const s = wandStuecke(wand(undefined), 3);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ x: 2, y: 0, unten: 0, hoehe: 3, laenge: 4 });
  });

  it('lässt für eine Tür Pfosten und Sturz stehen', () => {
    const s = wandStuecke(wand([{ offset: 1, width: 1, bottom: 0, top: 2.1 }]), 3);
    expect(s).toHaveLength(3);
    const sturz = s.find((x) => x.unten > 0)!;
    expect(sturz.unten).toBeCloseTo(2.1, 6);
    expect(sturz.hoehe).toBeCloseTo(0.9, 6);
    expect(sturz.laenge).toBeCloseTo(1, 6);
    expect(s.filter((x) => x.unten === 0).map((x) => x.laenge).sort()).toEqual([1, 2]);
  });

  it('lässt für ein Fenster auch die Brüstung stehen', () => {
    const s = wandStuecke(wand([{ offset: 0, width: 4, bottom: 0.9, top: 2.3, kind: 'window' }]), 3);
    // ganze Länge offen: Brüstung unten, Sturz oben, keine Pfosten
    expect(s).toHaveLength(2);
    expect(s.map((x) => [x.unten, +x.hoehe.toFixed(2)])).toEqual([[0, 0.9], [2.3, 0.7]]);
  });

  it('ignoriert Öffnungen, die höher als die Wand liegen', () => {
    expect(wandStuecke(wand([{ offset: 1, width: 1, bottom: 4, top: 5 }]), 3)).toHaveLength(1);
  });

  it('fällt ohne Angabe auf die bisherige Wandstärke zurück', () => {
    expect(wandDicke({})).toBeCloseTo(0.15, 3);
    expect(wandDicke({ thicknessM: 0.24 })).toBeCloseTo(0.24, 3);
  });
});

describe('DXF-Dateien erkennen', () => {
  it('erkennt sie an Endung und MIME-Typ', () => {
    expect(istDxfDatei({ name: 'EG.DXF', type: '' } as File)).toBe(true);
    expect(istDxfDatei({ name: 'plan.pdf', type: 'application/pdf' } as File)).toBe(false);
  });
});
