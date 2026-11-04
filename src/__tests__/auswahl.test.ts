import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReferencePerson } from '../types';
import { ablegen, einfuegen, imRahmen, kopiere, leereAuswahl, rahmenAus, sitzendeFolgen, stuhlBei, umschalten } from '../utils/auswahl';
import { sitzHub } from '../utils/personGestalt';

// #250 — mehrere Objekte markieren, kopieren, einfuegen; Personen auf Stuehle.
const speicher: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(speicher)) delete speicher[key];
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => speicher[key] ?? null,
    setItem: (key: string, value: string) => { speicher[key] = value; },
    removeItem: (key: string) => { delete speicher[key]; },
  });
});

async function frisch() {
  const store = await import('../store/useStore');
  const h = await import('../store/history');
  const stop = h.history.start();
  const spaeter = () => vi.advanceTimersByTime(h.COALESCE_MS + 1);
  return { useStore: store.useStore, ...h, stop, spaeter };
}

const person = (id: string, x: number, y: number, over: Partial<ReferencePerson> = {}): ReferencePerson => ({
  id, x, y, height: 1.8, width: 0.5, label: id, objectType: 'person', ...over,
});
const stuhl = (id: string, x: number, y: number, over: Partial<ReferencePerson> = {}) =>
  person(id, x, y, { objectType: 'chair', height: 0.9, ...over });

describe('Auswahl (rein)', () => {
  it('Shift-Klick nimmt auf und wieder heraus', () => {
    let a = umschalten(leereAuswahl(), 'camera', 'cam-1');
    a = umschalten(a, 'person', 'person-1');
    expect(a).toEqual({ cameraIds: ['cam-1'], personIds: ['person-1'] });
    expect(umschalten(a, 'camera', 'cam-1').cameraIds).toEqual([]);
  });

  it('der Rahmen faengt, was in ihm liegt, egal in welche Richtung gezogen', () => {
    const r = rahmenAus({ x: 5, y: 5 }, { x: 1, y: 1 });
    const a = imRahmen(r, [{ id: 'c1', x: 2, y: 2 }, { id: 'c2', x: 6, y: 2 }], [person('p1', 4.9, 1.1), person('p2', 0, 0)]);
    expect(a).toEqual({ cameraIds: ['c1'], personIds: ['p1'] });
  });

  it('Einfuegen vergibt neue Ids, versetzt je Stufe und laesst Verweise auf Kopien zeigen', () => {
    const clip = kopiere(
      { cameraIds: [], personIds: ['s', 'p'] },
      [],
      [stuhl('s', 2, 2), person('p', 2, 2, { objectType: 'sitting-person', seatedOn: 's', locked: true })],
    );
    let n = 10;
    const ctx = { camId: () => `cam-${n++}`, personId: () => `person-${n++}`, stufe: 2, breiteM: 20, tiefeM: 20, kameraZahl: 0, farben: ['#fff'] };
    const neu = einfuegen(clip, ctx);
    expect(neu.persons.map((p) => p.id)).toEqual(['person-10', 'person-11']);
    expect(neu.persons[0]).toMatchObject({ x: 4, y: 4 });
    expect(neu.persons[1]).toMatchObject({ seatedOn: 'person-10', locked: false });
    // Die Zwischenablage ist eine Kopie, kein Verweis auf den Plan.
    expect(clip.persons[1].seatedOn).toBe('s');
  });

  it('Kopien einer Kamera nehmen Bridge-Nummer, Mischereingang und Sperre nicht mit', () => {
    const cam = { id: 'cam-1', label: 'CAM 1', cameraId: 'x', lensId: 'y', x: 19.5, y: 1, z: 1.5, pan: 0, tilt: 0, focalLength: 10, aperture: 2, focusDistance: 5, color: '#000', extenderActive: 1, bridgeCameraNumber: 7, mixerInput: 3, locked: true };
    const neu = einfuegen({ cameras: [cam], persons: [] }, { camId: () => 'cam-9', personId: () => 'p', stufe: 1, breiteM: 20, tiefeM: 20, kameraZahl: 4, farben: ['#a', '#b'] });
    expect(neu.cameras[0]).toMatchObject({ id: 'cam-9', label: 'CAM 5', color: '#a', x: 20, y: 2, locked: false });
    expect(neu.cameras[0].bridgeCameraNumber).toBeUndefined();
    expect(neu.cameras[0].mixerInput).toBeUndefined();
  });
});

describe('Sitzplaetze (rein)', () => {
  it('eine Person nahe einem freien Stuhl setzt sich mit Sitzhoehe und Blick des Stuhls', () => {
    const persons = [stuhl('s', 3, 3, { facingDeg: 180 }), person('p', 0, 0)];
    const patch = ablegen(persons[1], 3.3, 3.2, persons);
    expect(patch).toMatchObject({ x: 3, y: 3, objectType: 'sitting-person', seatedOn: 's', seatHeight: 0.45, facingDeg: 180, height: 1.3 });
  });

  it('besetzte Stuehle, ferne Stuehle und Nicht-Personen setzen sich nicht', () => {
    const persons = [stuhl('s', 3, 3), person('a', 3, 3, { seatedOn: 's' }), person('p', 0, 0), person('t', 0, 0, { objectType: 'drums' })];
    expect(stuhlBei(persons[2], 3, 3, persons)).toBeNull();
    expect(stuhlBei(persons[3], 3, 3, [stuhl('frei', 3, 3)])).toBeNull();
    expect(stuhlBei(persons[2], 5, 5, [stuhl('frei', 3, 3)])).toBeNull();
  });

  it('weggezogen steht sie auf und blickt wieder zu den Kameras', () => {
    const persons = [stuhl('s', 3, 3), person('p', 3, 3, { objectType: 'sitting-person', seatedOn: 's', seatHeight: 0.45, facingDeg: 90 })];
    expect(ablegen(persons[1], 8, 8, persons)).toEqual({ x: 8, y: 8, seatedOn: undefined, seatHeight: undefined, facingDeg: undefined });
  });

  it('wer sitzt, geht mit dem Stuhl mit und dreht sich mit', () => {
    const alt = stuhl('s', 3, 3);
    const neu = { ...alt, x: 4, y: 5, facingDeg: 270, height: 1.0 };
    const out = sitzendeFolgen([alt, person('p', 3, 3, { seatedOn: 's' }), person('q', 1, 1)], alt, neu);
    expect(out[1]).toMatchObject({ x: 4, y: 5, facingDeg: 270, seatHeight: 0.5 });
    expect(out[2]).toMatchObject({ x: 1, y: 1 });
  });

  it('die sitzende Figur hebt sich auf die Sitzhoehe des Stuhls', () => {
    expect(sitzHub('stehen', 1.8, 0.6)).toBe(0);
    expect(sitzHub('sitzen', 1.3, undefined)).toBe(0);
    const hub = sitzHub('sitzen', 1.3, 0.6);
    expect(hub).toBeGreaterThan(0.1);
    expect(hub).toBeLessThan(0.2);
  });
});

describe('Auswahl im Store', () => {
  it('Kopieren und Einfuegen: neue Ids, je Einfuegen ein Schritt Versatz und ein Rueckgaengig-Schritt', async () => {
    const { useStore, history, spaeter } = await frisch();
    const s = () => useStore.getState();
    s().addCamera();
    s().addPerson(2, 2);
    spaeter();
    const camId = s().cameras[0].id;
    const personId = s().persons[0].id;
    s().setAuswahl({ cameraIds: [camId], personIds: [personId] });
    expect(s().auswahlKopieren()).toBe(2);
    expect(s().einfuegen()).toBe(2);
    spaeter();
    expect(s().einfuegen()).toBe(2);
    const ids = [...s().cameras.map((c) => c.id), ...s().persons.map((p) => p.id)];
    expect(new Set(ids).size).toBe(6);
    expect(s().persons.map((p) => p.x)).toEqual([2, 3, 4]);
    expect(s().auswahl.personIds).toEqual([s().persons[2].id]);
    history.undo();
    expect(s().persons).toHaveLength(2);
    expect(s().cameras).toHaveLength(2);
  });

  it('Loeschen der Auswahl laesst Gesperrtes stehen und ist ein Schritt', async () => {
    const { useStore, history, spaeter } = await frisch();
    const s = () => useStore.getState();
    s().addPerson(1, 1);
    s().addPerson(2, 2);
    s().addStageObject('chair', 3, 3);
    s().addCamera();
    spaeter();
    const [a, b, c] = s().persons;
    s().updatePerson(b.id, { locked: true });
    spaeter();
    s().setAuswahl({ cameraIds: [s().cameras[0].id], personIds: [a.id, b.id, c.id] });
    s().auswahlLoeschen();
    expect(s().persons.map((p) => p.id)).toEqual([b.id]);
    expect(s().cameras).toHaveLength(0);
    expect(s().selectedCameraId).toBeNull();
    history.undo();
    expect(s().persons).toHaveLength(3);
    expect(s().cameras).toHaveLength(1);
  });

  it('„Sitzend" ohne Ort nimmt den freien Stuhl; abgelegt setzt sich eine Person', async () => {
    const { useStore } = await frisch();
    const s = () => useStore.getState();
    s().addStageObject('chair', 3, 3);
    s().addStageObject('chair', 6, 3);
    s().addStageObject('sitting-person');
    const [s1, s2, sitzend] = s().persons;
    expect(sitzend).toMatchObject({ x: 3, y: 3, seatedOn: s1.id });
    s().addPerson(0, 0);
    const p = s().persons[3];
    s().dropPerson(p.id, 3.1, 3.1);
    expect(s().persons[3].seatedOn).toBeUndefined();
    s().dropPerson(p.id, 6.2, 3);
    expect(s().persons[3]).toMatchObject({ seatedOn: s2.id, x: 6, y: 3, objectType: 'sitting-person' });
    s().updatePerson(s2.id, { x: 7, facingDeg: 0 });
    expect(s().persons[3]).toMatchObject({ x: 7, facingDeg: 0 });
    s().removePerson(s2.id);
    expect(s().persons.find((q) => q.id === p.id)?.seatedOn).toBeUndefined();
  });

  it('Tasten: Cmd/Strg+C und +V kopieren und fuegen ein, Entf loescht, ohne Auswahl bleibt alles beim Browser', async () => {
    const { useStore } = await frisch();
    const { auswahlTaste } = await import('../lib/useAuswahlTasten');
    const s = () => useStore.getState();
    const taste = (key: string, mod = false) => auswahlTaste({ key, ctrlKey: mod, metaKey: false, altKey: false, shiftKey: false, target: null });
    s().addPerson(1, 1);
    expect(taste('c', true)).toBe(false);
    expect(taste('Delete')).toBe(false);
    s().setAuswahl({ cameraIds: [], personIds: [s().persons[0].id] });
    expect(taste('c', true)).toBe(true);
    expect(taste('v', true)).toBe(true);
    expect(s().persons).toHaveLength(2);
    expect(taste('Backspace')).toBe(true);
    expect(s().persons).toHaveLength(1);
  });
});
