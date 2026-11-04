import { describe, it, expect } from 'vitest';
import { TALLY_FARBE, tallyBus, tallyFarbe, tallyLampe } from '../utils/tally';
import { DEFAULT_VIEW3D_PREFS } from '../components/Venue3D/view3dPrefs';

const stand = { an: true, programId: 'a', previewId: 'b' };

describe('Tally in der 3D-Ansicht (#244)', () => {
  it('PGM rot, PVW gruen, sonst nichts', () => {
    expect(tallyBus('a', stand)).toBe('pgm');
    expect(tallyBus('b', stand)).toBe('pvw');
    expect(tallyBus('c', stand)).toBeNull();
    expect(tallyFarbe('pgm')).toBe(TALLY_FARBE.pgm);
    expect(tallyFarbe('pvw')).toBe(TALLY_FARBE.pvw);
    expect(tallyFarbe(null)).toBeNull();
  });

  it('PVW auch ohne Program-Quelle', () => {
    expect(tallyBus('b', { ...stand, programId: null })).toBe('pvw');
  });

  it('dieselbe Kamera auf beiden Bussen ist PGM', () => {
    expect(tallyBus('a', { ...stand, previewId: 'a' })).toBe('pgm');
  });

  it('abgeschaltet hebt nichts hervor, auch keine Lampe', () => {
    const aus = { ...stand, an: false };
    expect(tallyBus('a', aus)).toBeNull();
    expect(tallyBus('b', aus)).toBeNull();
    expect(tallyLampe('pgm', true, false)).toBe('aus');
    expect(tallyLampe(null, true, false)).toBe('aus');
  });

  it('Lampe: PGM rot, PVW und am Pult gewaehlt gruen', () => {
    expect(tallyLampe('pgm', true, true)).toBe('rot');
    expect(tallyLampe('pvw', false, true)).toBe('gruen');
    expect(tallyLampe(null, true, true)).toBe('gruen');
    expect(tallyLampe(null, false, true)).toBe('aus');
  });

  it('ist ab Werk an', () => {
    expect(DEFAULT_VIEW3D_PREFS.tally).toBe(true);
  });
});
