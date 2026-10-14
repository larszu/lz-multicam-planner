import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EDIT_GROUPS, editModeOf } from '../types';

// #169 — Gruppen einzeln sperren, ohne ins Menue zu muessen. Die Modi (#43)
// bleiben Abkuerzungen darauf, und das Menue zeigt den passenden Haken.
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});

describe('Bearbeitbare Gruppen (#169)', () => {
  it('am Anfang ist alles bearbeitbar', async () => {
    const { useStore } = await import('../store/useStore');
    expect(editModeOf(useStore.getState().editGroups)).toBe('all');
  });

  it('eine Gruppe aus- und wieder einschalten, Reihenfolge bleibt', async () => {
    const { useStore } = await import('../store/useStore');
    const s = useStore.getState();
    s.toggleEditGroup('stage');
    s.toggleEditGroup('room');
    expect(useStore.getState().editGroups).toEqual(['floorplan', 'objects', 'cameras']);
    expect(editModeOf(useStore.getState().editGroups)).toBeNull();
    s.toggleEditGroup('stage');
    expect(useStore.getState().editGroups).toEqual(['floorplan', 'stage', 'objects', 'cameras']);
  });

  it('ein Modus setzt die Gruppen, das Menue erkennt ihn wieder', async () => {
    const { useStore } = await import('../store/useStore');
    useStore.getState().setEditMode('cameras');
    expect(useStore.getState().editGroups).toEqual(['cameras']);
    expect(editModeOf(useStore.getState().editGroups)).toBe('cameras');
    useStore.getState().setEditMode('all');
    expect(useStore.getState().editGroups).toEqual([...EDIT_GROUPS]);
  });

  it('nur Raum ist kein Menue-Modus', () => {
    expect(editModeOf(['room'])).toBeNull();
    expect(editModeOf([])).toBeNull();
  });
});
