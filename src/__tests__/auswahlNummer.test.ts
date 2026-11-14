import { describe, expect, it } from 'vitest';
import type { ReferencePerson } from '../types';
import { einfuegen, kopiere, naechsterName } from '../utils/auswahl';

// #269 — kopierte Stuehle trugen dieselbe Nummer wie das Original.
const stuhl = (id: string, label: string): ReferencePerson =>
  ({ id, label, x: 1, y: 1, height: 0.9, width: 0.5, objectType: 'chair' }) as ReferencePerson;

describe('Nummern beim Kopieren (#269)', () => {
  it('kopierte Stühle bekommen die nächste freie Nummer, auch beim zweiten Einfügen', () => {
    const plan = [stuhl('s1', 'Chair 1'), stuhl('s2', 'Chair 2')];
    const clip = kopiere({ cameraIds: [], personIds: ['s1', 's2'] }, [], plan);
    let n = 0;
    const ctx = { camId: () => 'c', personId: () => `p${n++}`, stufe: 1, breiteM: 20, tiefeM: 20, kameraZahl: 0, farben: ['#fff'] };
    expect(einfuegen(clip, ctx).persons.map((p) => p.label)).toEqual(['Chair 3', 'Chair 4']);
    expect(einfuegen(clip, { ...ctx, stufe: 2 }).persons.map((p) => p.label)).toEqual(['Chair 5', 'Chair 6']);
  });

  it('zählt je Stamm weiter und hängt sonst eine Nummer an', () => {
    expect(naechsterName('Chair 1', new Set(['Chair 1', 'Chair 7', 'Table 9']))).toBe('Chair 8');
    expect(naechsterName('Lectern', new Set(['Lectern']))).toBe('Lectern 2');
  });
});
