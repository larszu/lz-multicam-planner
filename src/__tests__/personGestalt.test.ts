import { describe, expect, it } from 'vitest';
import { personDarstellung } from '../utils/personGestalt';
import { POSEN } from '../avplan/scene3d';

describe('Referenzperson → Mensch', () => {
  it('leitet die Pose aus Objekttyp und Bezeichnung ab', () => {
    expect(personDarstellung({ id: 'a', label: 'Moderation', objectType: 'person' })?.pose).toBe('sprechen');
    expect(personDarstellung({ id: 'b', label: 'Lead vocal', objectType: 'person' })?.pose).toBe('mikrofon');
    expect(personDarstellung({ id: 'c', label: 'Gitarre', objectType: 'person-guitar' })?.pose).toBe('gitarre');
    expect(personDarstellung({ id: 'd', label: 'Gast', objectType: 'sitting-person' })?.pose).toBe('sitzen');
  });

  it('laesst Objekte Objekte sein', () => {
    expect(personDarstellung({ id: 'e', label: 'Drums', objectType: 'drums' })).toBeNull();
    expect(personDarstellung({ id: 'f', label: 'Pult', objectType: 'lectern' })).toBeNull();
  });

  it('kleidet Moderation im Sakko oder Kleid und bleibt je Id gleich', () => {
    for (let i = 0; i < 20; i++) {
      const d = personDarstellung({ id: `m${i}`, label: 'Host', objectType: 'person' });
      expect(['sakko', 'kleid']).toContain(d?.gestalt.oberteil);
      expect(POSEN).toContain(d?.pose);
    }
    const a = personDarstellung({ id: 'x', label: 'Tech', objectType: 'person' });
    expect(personDarstellung({ id: 'x', label: 'Tech', objectType: 'person' })).toEqual(a);
  });
});
