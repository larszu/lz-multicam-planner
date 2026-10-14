import { describe, expect, it } from 'vitest';
import { aufSchritt, platziereMarken, posZuWert, rasten, schrittWert, wertZuPos } from '../utils/reglerSkala';
import { niceTicks } from '../utils/lensScale';

// Der gemeinsame Regler (components/ui/Regler.tsx): Bahn, Rasten, Schritte
// und die Markenbeschriftung, die nicht mehr ueberlappen darf.

describe('Bahn', () => {
  it('linear und log sind umkehrbar', () => {
    for (const skala of ['linear', 'log'] as const) {
      for (const v of [2, 17.5, 400, 1000]) {
        expect(posZuWert(wertZuPos(v, 2, 1000, skala), 2, 1000, skala)).toBeCloseTo(v, 6);
      }
    }
  });
  it('faellt bei Grenzen ≤ 0 auf linear zurueck', () => {
    expect(wertZuPos(0, -180, 180, 'log')).toBeCloseTo(0.5, 9);
  });
});

describe('aufSchritt', () => {
  it('rundet ohne Gleitkomma-Reste', () => {
    expect(aufSchritt(0.30000000000000004, 0.05, 0)).toBe(0.3);
    expect(aufSchritt(37, 5, 10)).toBe(35);
  });
});

describe('rasten', () => {
  it('zieht nur innerhalb der Toleranz an', () => {
    expect(rasten(2.75, [2.8, 4], 1, 22, 'log', 0.02)).toBe(2.8);
    expect(rasten(3.3, [2.8, 4], 1, 22, 'log', 0.02)).toBe(3.3);
  });
});

describe('schrittWert', () => {
  it('schreitet log-Bahnen in Bahnposition, nicht im Wert', () => {
    const kurz = schrittWert(8, 1, false, 8, 800, 'log', undefined) - 8;
    const lang = schrittWert(400, 1, false, 8, 800, 'log', undefined) - 400;
    // Gleicher Bahnweg: das Verhaeltnis bleibt, der Millimeterweg waechst.
    expect(schrittWert(8, 1, false, 8, 800, 'log', undefined) / 8).toBeCloseTo(schrittWert(400, 1, false, 8, 800, 'log', undefined) / 400, 6);
    expect(lang).toBeGreaterThan(kurz * 10);
  });
  it('Shift geht zehnfach, linear auf dem Raster', () => {
    expect(schrittWert(0, 1, false, -180, 180, 'linear', 1)).toBe(1);
    expect(schrittWert(0, -1, true, -180, 180, 'linear', 1)).toBe(-10);
    expect(schrittWert(179, 1, true, -180, 180, 'linear', 1)).toBe(180);
  });
});

describe('platziereMarken', () => {
  const zeigt = (m: ReturnType<typeof platziereMarken>) => m.filter((x) => x.zeigen).map((x) => x.label);

  it('laesst keine Beschriftungen ueberlappen (vorher „100mm176mm")', () => {
    const ticks = niceTicks(28, 176).map((v) => ({ value: v, label: `${Math.round(v)}mm` }));
    for (const breite of [180, 260, 400, 900]) {
      const m = platziereMarken(ticks, 28, 176, 'log', breite);
      const sichtbar = m.filter((x) => x.zeigen);
      for (let i = 1; i < sichtbar.length; i++) {
        const links = sichtbar[i - 1];
        const rechts = sichtbar[i];
        const ende = (x: typeof links) => x.pos * breite + (x.ausrichtung === 'start' ? x.label!.length * 6.6 : x.ausrichtung === 'mitte' ? (x.label!.length * 6.6) / 2 : 0);
        const anfang = (x: typeof links) => x.pos * breite - (x.ausrichtung === 'ende' ? x.label!.length * 6.6 : x.ausrichtung === 'mitte' ? (x.label!.length * 6.6) / 2 : 0);
        expect(anfang(rechts)).toBeGreaterThanOrEqual(ende(links));
      }
      expect(sichtbar[0].label).toBe('28mm');
      expect(sichtbar[sichtbar.length - 1].label).toBe('176mm');
    }
  });

  it('zeigt gleiche Texte nur einmal (vorher „2.82.8")', () => {
    const m = platziereMarken(
      [{ value: 2.75, label: '2.8' }, { value: 2.8, label: '2.8' }, { value: 4, label: '4.0' }, { value: 22, label: '22' }],
      2.75, 22, 'log', 600,
    );
    expect(zeigt(m)).toEqual(['2.8', '4.0', '22']);
    // Die Striche bleiben alle.
    expect(m).toHaveLength(4);
  });

  it('richtet die Enden buendig aus', () => {
    const m = platziereMarken([{ value: 0, label: '0' }, { value: 10, label: '10' }], 0, 10, 'linear', 300);
    expect(m[0].ausrichtung).toBe('start');
    expect(m[1].ausrichtung).toBe('ende');
  });
});
