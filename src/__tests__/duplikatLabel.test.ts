import { describe, expect, it } from 'vitest';
import { duplikatLabel } from '../utils/duplikatLabel';

describe('duplikatLabel (#269)', () => {
  it('zaehlt die Nummer hoch statt sie zu wiederholen', () => {
    expect(duplikatLabel('Chair 3', ['Chair 1', 'Chair 2', 'Chair 3'])).toBe('Chair 4');
  });
  it('springt ueber vergebene Nummern', () => {
    expect(duplikatLabel('Chair 1', ['Chair 1', 'Chair 2', 'Chair 3'])).toBe('Chair 4');
  });
  it('haelt anderes Praefix getrennt', () => {
    expect(duplikatLabel('Chair 1', ['Chair 1', 'Table 2'])).toBe('Chair 2');
  });
  it('ohne Nummer bleibt der Anhang', () => {
    expect(duplikatLabel('Pult', ['Pult'])).toBe('Pult copy');
  });
});

import { einfuegen } from '../utils/auswahl';
import type { ReferencePerson } from '../types';

describe('Einfuegen nummeriert Stuehle weiter (#269)', () => {
  it('Kopie von Chair 1 heisst Chair 3, wenn Chair 2 schon da ist', () => {
    const stuhl = { id: 'p1', label: 'Chair 1', x: 1, y: 1, height: 0.9, width: 0.5, objectType: 'chair' } as ReferencePerson;
    let i = 0;
    const neu = einfuegen({ cameras: [], persons: [stuhl] }, {
      camId: () => 'c', personId: () => `n${i++}`, stufe: 1, breiteM: 20, tiefeM: 20, kameraZahl: 0, farben: ['#fff'],
      personLabels: ['Chair 1', 'Chair 2'],
    });
    expect(neu.persons[0].label).toBe('Chair 3');
  });
});
