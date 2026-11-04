import { describe, it, expect } from 'vitest';
import { describeStand, formatStandDate, projectStand } from '../utils/projectStand';

const t = (_key: string, en: string) => en;
const at = '2026-11-04T13:32:00.000Z';

describe('Projektstand (#251)', () => {
  it('ein nie gespeichertes Projekt sagt das, statt eine Zahl zu zeigen', () => {
    const s = projectStand({ savedRevision: 0, savedAt: null, projectVersion: 1847, lastSavedVersion: 1 });
    expect(describeStand(s, t)).toBe('Not saved yet');
  });

  it('nennt Revision und Zeitpunkt, unabhaengig vom Aenderungszaehler', () => {
    const a = projectStand({ savedRevision: 3, savedAt: at, projectVersion: 12, lastSavedVersion: 12 });
    const b = projectStand({ savedRevision: 3, savedAt: at, projectVersion: 9000, lastSavedVersion: 9000 });
    expect(describeStand(a, t)).toBe(`Revision 3 · saved ${formatStandDate(at)}`);
    expect(describeStand(b, t)).toBe(describeStand(a, t));
  });

  it('meldet ungespeicherte Aenderungen nur, wenn gefragt', () => {
    const s = projectStand({ savedRevision: 2, savedAt: at, projectVersion: 14, lastSavedVersion: 12 });
    expect(describeStand(s, t)).not.toContain('unsaved');
    expect(describeStand(s, t, { withChanges: true })).toBe(`Revision 2 · saved ${formatStandDate(at)} + unsaved changes`);
  });

  it('eine Datei von vor der Revision zeigt nur den Speicherzeitpunkt', () => {
    const s = projectStand({ savedRevision: 0, savedAt: at, projectVersion: 5, lastSavedVersion: 5 });
    expect(describeStand(s, t)).toBe(`Saved ${formatStandDate(at)}`);
  });
});
