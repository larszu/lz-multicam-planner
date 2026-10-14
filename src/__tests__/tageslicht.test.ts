import { describe, expect, it } from 'vitest';
import { HIMMEL_STANDARD, himmelZeitpunkt, uhrzeit, zeitMarken } from '../utils/tageslicht';

describe('Tageslicht', () => {
  const sommer = { ...HIMMEL_STANDARD, datum: '2026-06-21' };

  it('setzt den Zeitpunkt aus Datum und Minuten in Ortszeit', () => {
    const d = himmelZeitpunkt({ ...sommer, minuten: 20 * 60 + 30 });
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 5, 21, 20, 30]);
  });

  it('nimmt ohne Datum den heutigen Tag', () => {
    const jetzt = new Date(2026, 9, 14, 9, 0);
    expect(himmelZeitpunkt({ ...HIMMEL_STANDARD, minuten: 60 }, jetzt).getDate()).toBe(14);
  });

  it('markiert Auf- und Untergang, goldene und blaue Stunde in der richtigen Reihenfolge', () => {
    const m = zeitMarken(sommer);
    expect(m.aufgang).not.toBeNull();
    expect(m.untergang).not.toBeNull();
    expect(m.untergang! - m.aufgang!).toBeGreaterThan(15 * 60);
    expect(m.gold).toHaveLength(2);
    expect(m.blau).toHaveLength(2);
    const [, goldAbend] = m.gold;
    const [, blauAbend] = m.blau;
    expect(goldAbend[0]).toBeLessThan(m.untergang!);
    expect(blauAbend[0]).toBeGreaterThanOrEqual(goldAbend[1] - 1);
  });

  it('schreibt Uhrzeiten zweistellig', () => {
    expect(uhrzeit(65)).toBe('01:05');
    expect(uhrzeit(1439)).toBe('23:59');
  });
});
