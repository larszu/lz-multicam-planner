import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProjectFile, VenueCamera } from '../types';

// ───────────────────────────────────────────────────────────────────────────
// Die automatische Sicherung (cable-planner#908).
//
// Vorher lebte das Projekt nur im Speicher, bis jemand „Speichern" klickte;
// ein geschlossener Tab war ein verlorener Plan. Geprueft wird hier der Weg,
// den ein Nutzer geht: bearbeiten, schliessen, wieder oeffnen — und dass
// Oeffnen und Neu die Sicherung ersetzen, statt neben ihr herzulaufen.
//
// Derselbe Aufbau wie `bibliothekStorageFull.test.ts`: ein localStorage-Stub,
// der auf Wunsch wirft, und der Store frisch je Test.
// ───────────────────────────────────────────────────────────────────────────

const speicher: Record<string, string> = {};
let quotaFull = false;

beforeEach(() => {
  for (const key of Object.keys(speicher)) delete speicher[key];
  quotaFull = false;
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => speicher[key] ?? null,
    setItem: (key: string, value: string) => {
      if (quotaFull) throw new Error('QuotaExceededError');
      speicher[key] = value;
    },
    removeItem: (key: string) => { delete speicher[key]; },
  });
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const laden = async () => {
  const { useStore } = await import('../store/useStore');
  const autosave = await import('../store/autosave');
  return { useStore, ...autosave };
};

const kamera = (id: string): VenueCamera => ({
  id, label: id.toUpperCase(), cameraId: 'sony-hdc-3500', lensId: 'fuj-ha18x7.6',
  x: 10, y: 11, z: 1.5, pan: -90, tilt: 0, focalLength: 20, aperture: 2.8,
  focusDistance: 8, color: '#ef4444', extenderActive: 1, useSpeedbooster: false,
});

const plan = (over: Partial<ProjectFile> = {}): ProjectFile => ({
  formatVersion: 1,
  appVersion: '4.3.5',
  projectVersion: 7,
  savedAt: '2026-09-24T00:00:00.000Z',
  venue: { name: 'Halle', widthM: 20, heightM: 15, stages: [] },
  cameras: [kamera('cam-1')],
  persons: [],
  walls: [],
  backgroundPlan: null,
  ...over,
});

const gesichert = () => {
  const roh = speicher['multicam-autosave'];
  return roh ? JSON.parse(roh) as { lastSavedVersion: number; project: ProjectFile } : undefined;
};

describe('automatische Sicherung', () => {
  it('sichert nach der Pause, nicht bei jeder Änderung', async () => {
    const { useStore, startAutosave, AUTOSAVE_DELAY_MS } = await laden();
    startAutosave();
    useStore.getState().addCamera();
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
    expect(gesichert()).toBeUndefined();
    // Eine weitere Aenderung schiebt die Sicherung hinaus — ein Ziehen ist
    // eine Kette von Aenderungen und soll einmal geschrieben werden.
    useStore.getState().addCamera();
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
    expect(gesichert()).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(gesichert()?.project.cameras).toHaveLength(2);
  });

  it('ohne Änderung wird nichts geschrieben', async () => {
    // Auch nicht nach einem Wiederherstellen: eine Sicherung, die sich nicht
    // lesen liess, bleibt liegen, bis jemand wirklich etwas aendert.
    const { startAutosave } = await laden();
    startAutosave();
    vi.advanceTimersByTime(60_000);
    expect(gesichert()).toBeUndefined();
  });

  it('ein Neustart holt den Stand zurück — mit Id, und ohne „gespeichert" zu behaupten', async () => {
    const erst = await laden();
    const lauf = erst.startAutosave();
    erst.useStore.getState().applyProjectFile(plan({ projectId: 'projekt-a' }));
    erst.useStore.getState().addCamera();
    vi.advanceTimersByTime(erst.AUTOSAVE_DELAY_MS);
    lauf.stop();

    vi.resetModules();
    const dann = await laden();
    expect(dann.restoreAutosave()).toBe(true);
    const s = dann.useStore.getState();
    expect(s.projectId).toBe('projekt-a');
    expect(s.cameras).toHaveLength(2);
    expect(s.projectVersion).toBe(8);
    // Die zweite Kamera lag nie in einer Datei — das muss man weiter sehen.
    expect(s.lastSavedVersion).toBe(7);
    expect(s.hasUnsavedChanges()).toBe(true);
  });

  it('Öffnen einer Datei ersetzt die Sicherung', async () => {
    const { useStore, startAutosave, AUTOSAVE_DELAY_MS } = await laden();
    startAutosave();
    useStore.getState().applyProjectFile(plan({ projectId: 'projekt-a' }));
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    useStore.getState().applyProjectFile(plan({ projectId: 'projekt-b', cameras: [] }));
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(gesichert()?.project.projectId).toBe('projekt-b');
    expect(gesichert()?.project.cameras).toEqual([]);
  });

  it('Neues Projekt ersetzt sie ebenso — mit neuer Id', async () => {
    const { useStore, startAutosave, AUTOSAVE_DELAY_MS } = await laden();
    startAutosave();
    useStore.getState().applyProjectFile(plan({ projectId: 'projekt-a' }));
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    useStore.getState().newProject();
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(gesichert()?.project.cameras).toEqual([]);
    expect(gesichert()?.project.projectId).not.toBe('projekt-a');
    expect(gesichert()?.project.projectId).toBe(useStore.getState().projectId);
  });

  it('beim Verlassen der Seite wird sofort gesichert', async () => {
    const { useStore, startAutosave } = await laden();
    const lauf = startAutosave();
    useStore.getState().addCamera();
    expect(gesichert()).toBeUndefined();
    lauf.flush();
    expect(gesichert()?.project.cameras).toHaveLength(1);
  });

  it('voller Speicher wird gemeldet, ist aber nicht fatal', async () => {
    const { useStore, startAutosave, AUTOSAVE_DELAY_MS } = await laden();
    startAutosave();
    quotaFull = true;
    useStore.getState().addCamera();
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(useStore.getState().autosaveStorageFull).toBe(true);
    // Das Projekt steht weiter im Speicher und laesst sich als Datei sichern.
    expect(useStore.getState().cameras).toHaveLength(1);

    // Und die Meldung faellt zurueck, sobald wieder Platz ist — sonst stuende
    // sie fuer immer da und niemand glaubte ihr noch.
    quotaFull = false;
    useStore.getState().addCamera();
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(useStore.getState().autosaveStorageFull).toBe(false);
    expect(gesichert()?.project.cameras).toHaveLength(2);
  });

  it('eine kaputte oder fremde Sicherung wird nicht angewandt', async () => {
    const { useStore, restoreAutosave } = await laden();
    speicher['multicam-autosave'] = '{kaputt';
    expect(restoreAutosave()).toBe(false);
    speicher['multicam-autosave'] = JSON.stringify({
      lastSavedVersion: 1, project: { ...plan(), formatVersion: 2 },
    });
    expect(restoreAutosave()).toBe(false);
    speicher['multicam-autosave'] = JSON.stringify({ project: plan() });
    expect(restoreAutosave()).toBe(false);
    expect(useStore.getState().cameras).toEqual([]);
    // Beim Start gibt es niemanden, der einen Dialog wegklicken koennte.
    expect(globalThis.alert).not.toHaveBeenCalled();
  });
});
