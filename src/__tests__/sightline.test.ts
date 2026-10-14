import { describe, expect, it } from 'vitest';
import { aimPoint, conflictText, conflictsForCamera, sightlineConflicts } from '../utils/sightline';
import type { ReferencePerson, Stage, VenueCamera, Wall } from '../types';
import quelle from '../utils/sightline.ts?raw';
import sidebarQuelle from '../components/Sidebar/Sidebar.tsx?raw';

// ---------------------------------------------------------------------------
// Bedarf 12 -- Sichtlinien-Konflikte.
//
//   > the lectern blocking the camera line, the confidence monitor sitting in
//   > the wrong place, ... truss or speaker stack across the sightline
//
// Der teuerste Fehler waere hier eine 2D-Pruefung: sie meldete auf jedem
// realen Plan ein Dutzend Treffer, von denen keiner blockiert, und nach dem
// zweiten Mal liest sie niemand mehr. Der groesste Teil dieser Tests haelt
// deshalb fest, was NICHT gemeldet wird.
// ---------------------------------------------------------------------------

const kamera = (over: Partial<VenueCamera> = {}): VenueCamera =>
  ({
    id: 'c1',
    label: 'CAM 1',
    cameraId: 'x',
    lensId: 'l',
    x: 0,
    y: 0,
    z: 2,
    pan: 0, // nach rechts (+x)
    tilt: 0,
    focalLength: 50,
    aperture: 2.8,
    focusDistance: 10,
    color: '#fff',
    extenderActive: 1,
    ...over,
  }) as VenueCamera;

const wand = (over: Partial<Wall> = {}): Wall =>
  ({ id: 'w1', x1: 5, y1: -3, x2: 5, y2: 3, height: 1, label: 'Balustrade', ...over }) as Wall;

const objekt = (over: Partial<ReferencePerson> = {}): ReferencePerson =>
  ({ id: 'o1', x: 5, y: 0, width: 1, height: 1.2, label: 'Pult', objectType: 'lectern', ...over }) as ReferencePerson;

const podest = (over: Partial<Stage> = {}): Stage =>
  ({ id: 's1', x: 4, y: -2, width: 2, height: 4, label: 'Riser', elevationM: 0.6, ...over }) as Stage;

const leer = { cameras: [], walls: [], persons: [], stages: [] };

describe('die Zielrichtung', () => {
  it('nimmt die Fokusentfernung als Strecke ENTLANG DER ACHSE, nicht als Grundriss', () => {
    // Bei -30 Grad Tilt sind das 13 % Unterschied im Grundriss -- und das
    // entscheidet, ob das Pult noch in der Linie liegt.
    const { to } = aimPoint(kamera({ tilt: -30, focusDistance: 10 }));
    expect(to.x).toBeCloseTo(10 * Math.cos((-30 * Math.PI) / 180), 5);
    expect(to.z).toBeCloseTo(2 + 10 * Math.sin((-30 * Math.PI) / 180), 5);
  });

  it('geht vom GEFAHRENEN Standort aus, nicht vom geparkten', () => {
    // Eine Kamera auf Dolly oder Kran steht dort, wo sie gefahren ist.
    const { from } = aimPoint(kamera({ trackOffset: 3, rigRotation: 90 }));
    expect(from.x).toBeCloseTo(0, 5);
    expect(from.y).toBeCloseTo(3, 5);
  });
});

describe('was NICHT gemeldet wird', () => {
  it('eine Wand, über die die Linie hinweggeht', () => {
    // Der wichtigste Fall. Kamera auf 2 m, waagerecht, Wand 1 m hoch: sie
    // steht in der Linie und blockiert nichts. Eine 2D-Pruefung meldete sie.
    expect(sightlineConflicts({ ...leer, cameras: [kamera()], walls: [wand({ height: 1 })] })).toEqual([]);
  });

  it('ein Podest auf dem Boden -- auch wenn die Linie unter den Boden zielt', () => {
    // Eine Flaeche ohne Hoehe steht in keiner Linie. Der Fall ist nur dann
    // nicht selbstverstaendlich, wenn die Sichtlinie UNTER null faellt: eine
    // steil nach unten gerichtete Kamera. Ohne die ausdrueckliche Ausnahme
    // meldete sie dort ein Podest von 0 m Hoehe als Hindernis.
    //
    // Der erste Anlauf dieses Tests nahm eine waagerechte Kamera -- und blieb
    // gruen, als die Ausnahme entfernt wurde: die Hoehenpruefung fing den Fall
    // schon ab. Ein Test, der die Regel nicht erreicht, bewacht sie nicht.
    const flach = podest({ elevationM: 0 });
    expect(sightlineConflicts({ ...leer, cameras: [kamera({ z: 0.5 })], stages: [flach] })).toEqual([]);
    // Grundriss-Weg = 10 * cos(-60°) = 5 m, also von x=0 bis x=5 -- die
    // vordere Kante des Podests bei x=4 wird bei t=0,8 gekreuzt, und dort
    // liegt die Linie bei z = 1 - 0,8 * 8,66 = -5,9 m, also unter dem Boden.
    const steil = kamera({ z: 1, tilt: -60, focusDistance: 10 });
    expect(sightlineConflicts({ ...leer, cameras: [steil], stages: [flach] })).toEqual([]);
  });

  it('das Podest, auf dem die Kamera selbst steht', () => {
    // Ohne diese Ausnahme meldete jede Kamera auf einem Riser sich selbst.
    const auf = podest({ x: -1, y: -1, width: 2, height: 2, elevationM: 1.5 });
    expect(sightlineConflicts({ ...leer, cameras: [kamera({ z: 0.5 })], stages: [auf] })).toEqual([]);
  });

  it('das Motiv am Ende der Linie', () => {
    // Was am Ende der Linie steht, ist das, WORAUF die Kamera schaut.
    const motiv = objekt({ x: 10, y: 0, height: 3 });
    expect(sightlineConflicts({ ...leer, cameras: [kamera()], persons: [motiv] })).toEqual([]);
  });

  it('ein Objekt HINTER dem Motiv', () => {
    const dahinter = objekt({ x: 18, y: 0, height: 3 });
    expect(sightlineConflicts({ ...leer, cameras: [kamera()], persons: [dahinter] })).toEqual([]);
  });

  it('ein Objekt NEBEN der Linie', () => {
    expect(sightlineConflicts({ ...leer, cameras: [kamera()], persons: [objekt({ y: 5, height: 3 })] })).toEqual([]);
  });

  it('ein Objekt ohne Breite', () => {
    // Ein Punkt ohne Standflaeche verdeckt nichts. Ihm eine Mindestbreite zu
    // geben hiesse, eine Zahl zu erfinden.
    expect(sightlineConflicts({ ...leer, cameras: [kamera()], persons: [objekt({ width: 0, height: 3 })] })).toEqual([]);
  });

  it('eine Kamera, die senkrecht schaut', () => {
    expect(sightlineConflicts({ ...leer, cameras: [kamera({ tilt: -90 })], walls: [wand({ height: 5 })] })).toEqual([]);
  });
});

describe('was gemeldet wird', () => {
  it('eine Wand, die in die Linie ragt -- mit Tiefe und Entfernung', () => {
    const k = sightlineConflicts({ ...leer, cameras: [kamera()], walls: [wand({ height: 3 })] });
    expect(k).toEqual([
      {
        cameraId: 'c1',
        cameraLabel: 'CAM 1',
        kind: 'wall',
        obstacleId: 'w1',
        obstacleLabel: 'Balustrade',
        intrusionM: 1,
        atDistanceM: 5,
      },
    ]);
  });

  it('das Pult vor der Kamera', () => {
    const k = sightlineConflicts({ ...leer, cameras: [kamera({ z: 1 })], persons: [objekt({ height: 1.2 })] });
    expect(k).toHaveLength(1);
    expect(k[0].kind).toBe('object');
    expect(k[0].obstacleLabel).toBe('Pult');
  });

  it('ein erhöhtes Podest quer in der Linie', () => {
    const k = sightlineConflicts({ ...leer, cameras: [kamera({ z: 0.2 })], stages: [podest({ elevationM: 1 })] });
    expect(k).toHaveLength(1);
    expect(k[0].kind).toBe('stage');
    // Am NAECHSTEN Rand gemessen: das ist die Kante, an der die Sicht endet.
    expect(k[0].atDistanceM).toBe(4);
  });

  it('rechnet die Höhe an der KREUZUNGSSTELLE, nicht am Motiv', () => {
    // Kamera auf 3 m, Tilt -20 Grad, Wand 2 m hoch bei 5 m. Am Motiv (10 m)
    // ist die Linie tief, an der Wand noch hoch genug.
    const hoch = kamera({ z: 3, tilt: -20, focusDistance: 10 });
    expect(sightlineConflicts({ ...leer, cameras: [hoch], walls: [wand({ height: 1 })] })).toEqual([]);
    // Dieselbe Kamera, eine hoehere Wand: jetzt blockiert sie.
    expect(
      sightlineConflicts({ ...leer, cameras: [hoch], walls: [wand({ height: 3 })] }),
    ).toHaveLength(1);
  });

  it('sortiert nach Kamera und dann nach Entfernung', () => {
    // Das naechste Hindernis raeumt man zuerst weg.
    const k = sightlineConflicts({
      ...leer,
      cameras: [kamera()],
      walls: [wand({ id: 'w-fern', x1: 8, x2: 8, height: 3, label: 'Fern' }), wand({ height: 3 })],
    });
    expect(k.map((c) => c.atDistanceM)).toEqual([5, 8]);
  });

  it('trennt die Kameras', () => {
    const zwei = [kamera(), kamera({ id: 'c2', label: 'CAM 2', y: 20 })];
    const k = sightlineConflicts({ ...leer, cameras: zwei, walls: [wand({ height: 3 })] });
    expect(k.map((c) => c.cameraId)).toEqual(['c1']);
    expect(conflictsForCamera({ ...leer, cameras: zwei, walls: [wand({ height: 3 })] }, 'c2')).toEqual([]);
  });
});

describe('der Klartext', () => {
  it('nennt Hindernis, Entfernung und Tiefe', () => {
    const [c] = sightlineConflicts({ ...leer, cameras: [kamera()], walls: [wand({ height: 3 })] });
    const text = conflictText(c);
    expect(text).toContain('Balustrade');
    expect(text).toContain('5 m');
    expect(text).toContain('1 m');
    expect(text).toContain('CAM 1');
  });
});

describe('was die Datei NICHT tut', () => {
  it('holt sich die Zeit nicht und liest keinen Store', () => {
    expect(quelle).not.toMatch(/new Date\(\)|Date\.now\(\)|useStore/);
  });

  it('nimmt für ein Bühnenobjekt genau die Breite aus dem Datensatz', () => {
    // Als Kreis mit `width` als DURCHMESSER genaehert: der Planer fuehrt nur
    // eine Breite und keine Tiefe, ein Rechteck bekaeme seine zweite Kante
    // frei erfunden. Der erste Versuch dieses Tests verbot Woerter im
    // Quelltext -- und fiel ueber den Kommentar, der die Entscheidung
    // erklaert. Geprueft wird jetzt die Grenze selbst.
    const knappDrin = objekt({ x: 5, y: 0.49, width: 1, height: 3 });
    const knappDraussen = objekt({ x: 5, y: 0.51, width: 1, height: 3 });
    expect(sightlineConflicts({ ...leer, cameras: [kamera()], persons: [knappDrin] })).toHaveLength(1);
    expect(sightlineConflicts({ ...leer, cameras: [kamera()], persons: [knappDraussen] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ERREICHBARKEIT. Eine Warnung, die man erst suchen muss, wird in der Probe
// gefunden statt in der Planung -- genau das, was der Bedarf beklagt.
// ---------------------------------------------------------------------------
describe('Erreichbarkeit', () => {
  it('steht an der Kamera, aus der der Konflikt entsteht', () => {
    expect(sidebarQuelle).toContain("from '../../utils/sightline'");
    expect(sidebarQuelle).toMatch(/conflictsForCamera\(/);
    expect(sidebarQuelle).toContain('conflictText(k)');
  });

  it('steht OFFEN da und nicht in einer aufklappbaren Gruppe', () => {
    // Der Block haengt an `sichtKonflikte.length > 0` und nicht an einem
    // `Group`-Element: eine Sichtlinien-Sperre ist kein Detail, das man sucht.
    expect(sidebarQuelle).toMatch(/\{sichtKonflikte\.length > 0 && \(\s*\n\s*<Note tone="warn">/);
  });

  it('rechnet gegen den GESAMTEN Aufbau, nicht nur gegen Wände', () => {
    // Der Befund nennt Pult, Monitor, Traverse und Lautsprecherstapel -- nur
    // Waende zu pruefen liesse genau die Faelle liegen, die er aufzaehlt.
    expect(sidebarQuelle).toContain('{ cameras: [cam], walls, persons, stages: venue.stages, defaultWallHeightM: venue.defaultWallHeightM }');
  });
});
