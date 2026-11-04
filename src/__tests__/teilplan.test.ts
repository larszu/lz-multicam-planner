// #248 — ein Raum aus dem Gebäudeplan wird ein eigenes Projekt.
import { describe, expect, it } from 'vitest';
import { TEILPLAN_RAND_M, teilplanAus, teilplanZuschnitt } from '../utils/teilplan';
import { useStore } from '../store/useStore';
import type { BackgroundPlan, Venue, Wall } from '../types';

const plan: BackgroundPlan = {
  dataUrl: 'data:image/png;base64,voll',
  scaleX: 0.05, scaleY: 0.05, offsetX: 2, offsetY: 1, opacity: 0.4, widthPx: 2000, heightPx: 1000,
};
const venue: Venue = {
  name: 'Haus', widthM: 104, heightM: 52,
  stages: [
    { id: 's1', x: 12, y: 6, width: 4, height: 2, label: 'Saal A' },
    { id: 's2', x: 70, y: 30, width: 4, height: 2, label: 'Saal B' },
  ],
  seatingBlocks: [{ id: 'b1', x: 14, y: 14, width: 6, rows: 4 }, { id: 'b2', x: 80, y: 40, width: 6, rows: 4 }],
};
const walls: Wall[] = [
  { id: 'w1', x1: 10, y1: 5, x2: 30, y2: 5, label: 'A' },
  { id: 'w2', x1: 60, y1: 25, x2: 90, y2: 25, label: 'B' },
];
const rahmen = { minX: 10, minY: 4, maxX: 30, maxY: 20 };

describe('Teilplan zuschneiden', () => {
  it('rechnet den Rahmen in Planpixel und die Verschiebung zum Rand', () => {
    const z = teilplanZuschnitt(plan, rahmen)!;
    expect(z.px).toEqual({ x: 160, y: 60, breite: 400, hoehe: 320 });
    expect(z.dx).toBeCloseTo(TEILPLAN_RAND_M - 10, 9);
    expect(z.dy).toBeCloseTo(TEILPLAN_RAND_M - 4, 9);
  });

  it('begrenzt auf das Bild und meldet Rahmen daneben', () => {
    expect(teilplanZuschnitt(plan, { minX: -50, minY: -50, maxX: 3, maxY: 2 })!.px).toEqual({ x: 0, y: 0, breite: 20, hoehe: 20 });
    expect(teilplanZuschnitt(plan, { minX: 500, minY: 500, maxX: 600, maxY: 600 })).toBeNull();
  });

  it('nimmt nur, was im Rahmen liegt, und verschiebt es mit dem Bild', () => {
    const z = teilplanZuschnitt(plan, rahmen)!;
    const t = teilplanAus({ venue, walls, persons: [], backgroundPlan: plan }, rahmen, z, 'data:image/png;base64,teil', 'Haus – Saal A');
    expect(t.venue.name).toBe('Haus – Saal A');
    expect(t.venue.widthM).toBe(22);
    expect(t.venue.heightM).toBe(18);
    expect(t.venue.stages.map((s) => s.id)).toEqual(['s1']);
    expect(t.venue.stages[0]).toMatchObject({ x: 3, y: 3 });
    expect(t.venue.seatingBlocks!.map((b) => b.id)).toEqual(['b1']);
    expect(t.walls).toHaveLength(1);
    expect(t.walls[0]).toMatchObject({ x1: 1, y1: 2, x2: 21, y2: 2 });
    expect(t.backgroundPlan).toMatchObject({ dataUrl: 'data:image/png;base64,teil', widthPx: 400, heightPx: 320, offsetX: 1, offsetY: 1, scaleX: 0.05 });
    // Die Wand liegt auf derselben Stelle des Bildes wie vorher.
    const pxVorher = (walls[0].x1 - plan.offsetX) / plan.scaleX - z.px.x;
    const pxNachher = (t.walls[0].x1 - t.backgroundPlan.offsetX) / t.backgroundPlan.scaleX;
    expect(pxNachher).toBeCloseTo(pxVorher, 9);
  });

  it('öffnet als neues, ungespeichertes Projekt ohne Kameras', () => {
    const z = teilplanZuschnitt(plan, rahmen)!;
    const alteId = useStore.getState().projectId;
    useStore.getState().teilplanOeffnen(teilplanAus({ venue, walls, persons: [], backgroundPlan: plan }, rahmen, z, 'data:image/png;base64,teil', 'Haus – Saal A'));
    const s = useStore.getState();
    expect(s.projectId).not.toBe(alteId);
    expect(s.cameras).toHaveLength(0);
    expect(s.walls).toHaveLength(1);
    expect(s.venue.name).toBe('Haus – Saal A');
    expect(s.hasUnsavedChanges()).toBe(true);
  });
});
