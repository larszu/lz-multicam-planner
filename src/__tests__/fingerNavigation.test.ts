// Die Gesten der 3D-Ansicht (#137) — gefuehrt durch die Ketten, die auf dem
// Geraet schiefgehen. Ein Zustandsautomat ueber mehrere Ereignisse laesst
// sich nicht durch Hinsehen pruefen; genau deshalb steht er nicht in der
// Komponente.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FingerNavigation, kneifFaktor, KEIN_ZUG, umsehen } from '../lib/fingerNavigation';

describe('FingerNavigation — ein Finger', () => {
  it('dreht die Ansicht um die gezogene Strecke', () => {
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 100, y: 100 });
    const zug = n.bewegt({ id: 1, x: 130, y: 90 });
    expect(zug.dreheX).toBe(30);
    expect(zug.dreheY).toBe(-10);
    expect(zug.fahre).toBe(0);
  });

  it('faehrt und schiebt dabei nicht', () => {
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 0, y: 0 });
    const zug = n.bewegt({ id: 1, x: 50, y: 50 });
    expect(zug.fahre).toBe(0);
    expect(zug.schiebeX).toBe(0);
    expect(zug.schiebeY).toBe(0);
  });

  it('gibt beim ersten Ereignis eines unbekannten Fingers nichts zurueck', () => {
    // Die Beruehrung begann ausserhalb der Flaeche: `runter` kam nie an.
    // Ohne diesen Fall waere der erste Zug die Strecke vom Nullpunkt — die
    // Ansicht springt dann um die halbe Bildschirmbreite.
    const n = new FingerNavigation();
    expect(n.bewegt({ id: 7, x: 400, y: 300 })).toEqual(KEIN_ZUG);
    expect(n.bewegt({ id: 7, x: 410, y: 300 }).dreheX).toBe(10);
  });
});

describe('FingerNavigation — zwei Finger', () => {
  it('kneifen faehrt vor, ohne zu drehen', () => {
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 100, y: 200 });
    n.runter({ id: 2, x: 200, y: 200 });
    const zug = n.bewegt({ id: 2, x: 260, y: 200 });
    expect(zug.fahre).toBe(60);
    expect(zug.dreheX).toBe(0);
    expect(zug.dreheY).toBe(0);
  });

  it('schieben bewegt den Mittelpunkt und faehrt unterm Strich nicht', () => {
    // Finger bewegen sich EINZELN: zwei `pointermove`, nicht eines. Zwischen
    // den beiden steht der Abstand kurz schief — das ist kein Fehler,
    // sondern die Wirklichkeit, und deshalb wird hier ueber die ganze Geste
    // aufsummiert statt ein einzelnes Ereignis befragt.
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 100, y: 100 });
    n.runter({ id: 2, x: 200, y: 100 });
    const a = n.bewegt({ id: 1, x: 140, y: 130 });
    const b = n.bewegt({ id: 2, x: 240, y: 130 });
    expect(a.fahre + b.fahre).toBeCloseTo(0, 6);
    expect(a.schiebeX + b.schiebeX).toBeCloseTo(40, 6);
    expect(a.schiebeY + b.schiebeY).toBeCloseTo(30, 6);
    expect(a.dreheX + b.dreheX).toBe(0);
  });

  it('der zweite Finger mitten im Zug springt nicht', () => {
    // Der haeufigste Fall auf dem Geraet: ein Finger zieht schon, der zweite
    // kommt dazu. Ohne Neuvermessung waere der erste Zweifinger-Zug die
    // Differenz zu einem Abstand, den es nie gab.
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 100, y: 100 });
    n.bewegt({ id: 1, x: 150, y: 100 });
    n.runter({ id: 2, x: 350, y: 100 });
    const zug = n.bewegt({ id: 2, x: 360, y: 100 });
    expect(zug.fahre).toBe(10);
    expect(Math.abs(zug.schiebeX)).toBeLessThanOrEqual(5);
  });

  it('nach dem Loslassen eines Fingers dreht der verbliebene sauber weiter', () => {
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 100, y: 100 });
    n.runter({ id: 2, x: 300, y: 100 });
    n.bewegt({ id: 2, x: 320, y: 100 });
    n.hoch(2);
    expect(n.anzahl).toBe(1);
    const zug = n.bewegt({ id: 1, x: 112, y: 100 });
    expect(zug.dreheX).toBe(12);
    expect(zug.fahre).toBe(0);
  });

  it('ein abgebrochener Finger hinterlaesst keinen Zustand', () => {
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 0, y: 0 });
    n.runter({ id: 2, x: 100, y: 0 });
    n.leeren();
    expect(n.anzahl).toBe(0);
    expect(n.bewegt({ id: 1, x: 10, y: 0 })).toEqual(KEIN_ZUG);
  });

  it('ein dritter Finger aendert die Messung nicht', () => {
    // Im Betrieb ist der dritte Finger fast immer der Handballen. Waere er
    // im Mittelpunkt, driftete das Bild, obwohl die fuehrenden Finger stehen.
    const n = new FingerNavigation();
    n.runter({ id: 1, x: 100, y: 100 });
    n.runter({ id: 2, x: 300, y: 100 });
    n.runter({ id: 3, x: 900, y: 700 });
    const zug = n.bewegt({ id: 2, x: 340, y: 100 });
    expect(zug.fahre).toBe(40);
  });
});

describe('kneifFaktor', () => {
  it('auseinander vergroessert, zusammen verkleinert', () => {
    expect(kneifFaktor(200, 100)).toBeCloseTo(1.5, 6);
    expect(kneifFaktor(200, -100)).toBeCloseTo(0.5, 6);
  });

  it('haengt am Fingerabstand und nicht an der Geraetegroesse', () => {
    // Dieselbe relative Bewegung ergibt denselben Faktor — auf dem Telefon
    // wie auf dem Tablet.
    expect(kneifFaktor(100, 50)).toBeCloseTo(kneifFaktor(400, 200), 6);
  });

  it('kippt nicht ins Negative', () => {
    expect(kneifFaktor(100, -500)).toBe(1);
    expect(kneifFaktor(0, 50)).toBe(1);
  });
});

// #174: „Wenn ich nach rechts ziehe geht die Kamera nach links." Gemessen
// wird am Bild, nicht am Vorzeichen: ein Punkt geradeaus muss nach dem Zug
// dorthin wandern, wohin die Hand gezogen hat.
describe('umsehen — Inhalt folgt der Hand (#174)', () => {
  const bildpunktNach = (dx: number, dy: number) => {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    const { dYaw, dPitch } = umsehen(dx, dy);
    cam.rotation.set(dPitch, dYaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    return new THREE.Vector3(0, 0, -10).project(cam);
  };
  it('nach rechts ziehen schiebt das Bild nach rechts', () => {
    expect(bildpunktNach(100, 0).x).toBeGreaterThan(0.05);
  });
  it('nach oben ziehen schiebt das Bild nach oben', () => {
    // Bildschirm-y waechst nach unten; NDC-y nach oben.
    expect(bildpunktNach(0, -100).y).toBeGreaterThan(0.05);
  });
});
