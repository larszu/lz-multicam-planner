// Showlicht der 3D-Ansicht als Daten: welche Traversen wo haengen und welche
// Scheinwerfer wohin zeigen. Reines Rechnen, damit testbar ist, was man im
// Bild nur ahnt — ein Kegel, der ins Leere zeigt, eine Traverse im Publikum.
//
// Kulisse, keine Lichtplanung: die Lampen kommen aus der Buehnengroesse,
// nicht aus einem Plan. Wer Licht plant, nimmt den light-planner.
import type { Stage } from '../types';
import type { VenueVideoWall } from '../avplan/floorplan';
import { stageTopZ } from './stageBody';
import { videoBoardPlacement } from './view3dScene';

export type P3 = [number, number, number];

export interface RigLampe {
  /** Plan-x, Hoehe, Plan-y — Weltreihenfolge (x, y, z). */
  von: P3;
  nach: P3;
  farbe: string;
  feldwinkelDeg: number;
  art: 'wash' | 'beam' | 'flut';
  intensitaet: number;
}

export interface Rig {
  traversen: { von: P3; nach: P3 }[];
  lampen: RigLampe[];
}

/** Ab dieser Kante gilt eine flache Buehne als Spielfeld: Flutlicht statt Traverse. */
export const FELD_AB_M = 30;

export function istSpielfeld(s: Stage): boolean {
  return Math.max(s.width, s.height) > FELD_AB_M && stageTopZ(s) <= 0.2;
}

// Lobpreis- und Konzertfarben: tiefes Blau, Magenta, Bernstein. Front immer
// warmweiss — Gesichter sollen nach Gesichtern aussehen.
const BEAM_FARBEN = ['#3f5bff', '#b23cff', '#ffae3a', '#3f5bff', '#ff4fa3', '#ffffff'];
const WASH = '#fff0e2';

/**
 * Rig fuer alle Buehnen. `blick` ist der Punkt, von dem aus geschaut wird
 * (Mitte der Kameras oder des Publikums) — vorn ist die Seite dorthin.
 */
export function showRig(stages: Stage[], blick: { x: number; y: number }, venue: { widthM: number; heightM: number }, maxLampen = 48): Rig {
  const traversen: Rig['traversen'] = [];
  const lampen: RigLampe[] = [];
  for (const s of [...stages].sort((a, b) => b.width * b.height - a.width * a.height)) {
    if (lampen.length >= maxLampen) break;
    if (istSpielfeld(s)) {
      flutlicht(s, venue, lampen);
      continue;
    }
    const top = stageTopZ(s);
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    // Vorn ist die Kante zum Blickpunkt; gerechnet entlang der Achse mit dem
    // groesseren Abstand, wie bei der LED-Wand.
    const dx = blick.x - cx;
    const dy = blick.y - cy;
    const quer = Math.abs(dy) >= Math.abs(dx);
    const vz = quer ? Math.sign(dy) || 1 : Math.sign(dx) || 1;
    const breite = quer ? s.width : s.height;
    const tiefe = quer ? s.height : s.width;
    // Punkt auf der Buehne: u entlang der Front (−breite/2..breite/2), v von hinten (0) nach vorn (tiefe).
    const punkt = (u: number, v: number, h: number): P3 => (quer
      ? [cx + u, h, cy - (vz * tiefe) / 2 + vz * v]
      : [cx - (vz * tiefe) / 2 + vz * v, h, cy + u]);
    const hoehe = top + Math.max(5, Math.min(14, breite * 0.45));
    const vorn = tiefe + 1.5;
    traversen.push({ von: punkt(-breite / 2 - 0.5, vorn, hoehe), nach: punkt(breite / 2 + 0.5, vorn, hoehe) });
    traversen.push({ von: punkt(-breite / 2, 0.6, hoehe + 1), nach: punkt(breite / 2, 0.6, hoehe + 1) });

    const nWash = Math.max(2, Math.min(10, Math.round(breite / 3)));
    for (let i = 0; i < nWash && lampen.length < maxLampen; i++) {
      const u = -breite / 2 + ((i + 0.5) / nWash) * breite;
      lampen.push({ von: punkt(u, vorn, hoehe - 0.35), nach: punkt(u * 0.85, tiefe * 0.55, top + 1.2), farbe: WASH, feldwinkelDeg: 30, art: 'wash', intensitaet: 1 });
    }
    // Rueckwaertige Beams faechern ueber die Buehne ins Publikum: das Bild,
    // das man aus jeder Halle kennt.
    const nBeam = Math.max(3, Math.min(14, Math.round(breite / 2.5)));
    const weit = Math.max(10, Math.min(40, tiefe * 2.5 + 8));
    for (let i = 0; i < nBeam && lampen.length < maxLampen; i++) {
      const t = nBeam === 1 ? 0.5 : i / (nBeam - 1);
      const u = -breite / 2 + t * breite;
      const faecher = (t - 0.5) * breite * 1.1;
      const ziel = punkt(faecher, tiefe + weit * (0.55 + 0.45 * Math.abs(t - 0.5) * 2), 0);
      lampen.push({ von: punkt(u, 0.6, hoehe + 0.65), nach: ziel, farbe: BEAM_FARBEN[i % BEAM_FARBEN.length], feldwinkelDeg: 7, art: 'beam', intensitaet: 0.6 });
    }
    // Grosse Buehne unter freiem Himmel oder in der Arena: zusaetzlich
    // schmale Strahlen schraeg nach oben, ueber das Publikum hinweg.
    if (breite >= 20) {
      const nLuft = Math.max(4, Math.min(12, Math.round(breite / 5)));
      for (let i = 0; i < nLuft && lampen.length < maxLampen; i++) {
        const t = i / (nLuft - 1);
        const u = -breite / 2 + t * breite;
        lampen.push({ von: punkt(u, 0.3, top + 0.3), nach: punkt(u + (t - 0.5) * breite * 1.6, tiefe + 18 + Math.abs(t - 0.5) * 30, hoehe + 28), farbe: i % 2 ? '#e8eeff' : '#5b74ff', feldwinkelDeg: 3.5, art: 'beam', intensitaet: 1 });
      }
    }
  }
  return { traversen, lampen: lampen.slice(0, maxLampen) };
}

/** Vier Masten an den Ecken des Feldes: je ein echtes Licht und zwei Kegel im Dunst. */
function flutlicht(s: Stage, venue: { widthM: number; heightM: number }, lampen: RigLampe[]): void {
  const h = Math.max(25, Math.min(45, Math.max(s.width, s.height) * 0.35));
  const rand = 8;
  const ecken: [number, number][] = [
    [Math.max(0, s.x - rand), Math.max(0, s.y - rand)],
    [Math.min(venue.widthM, s.x + s.width + rand), Math.max(0, s.y - rand)],
    [Math.min(venue.widthM, s.x + s.width + rand), Math.min(venue.heightM, s.y + s.height + rand)],
    [Math.max(0, s.x - rand), Math.min(venue.heightM, s.y + s.height + rand)],
  ];
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  for (const [ex, ey] of ecken) {
    // Die erste Lampe je Mast traegt das echte Licht (breiter), die anderen
    // sind Kegel im Dunst.
    lampen.push({ von: [ex, h, ey], nach: [cx + (ex - cx) * 0.15, 0, cy + (ey - cy) * 0.15], farbe: '#f4f6ff', feldwinkelDeg: 70, art: 'flut', intensitaet: 1 });
    for (let k = 0; k < 2; k++) {
      const t = (k + 0.5) / 2;
      const zx = ex + (cx - ex) * (0.35 + t * 0.9);
      const zy = ey + (cy - ey) * (0.35 + t * 0.9);
      lampen.push({ von: [ex + (k - 0.5) * 2, h, ey], nach: [zx, 0, zy], farbe: '#f4f6ff', feldwinkelDeg: 24, art: 'beam', intensitaet: 0.5 });
    }
  }
}

/** Hat der Raum ein Spielfeld? Dann ist es eine Arena unter freiem Himmel. */
export function hatSpielfeld(stages: Stage[]): boolean {
  return stages.some(istSpielfeld);
}

/** Ohne eigene Videowaende: eine angedeutete Wand je Buehne (bisheriger Schalter „Videowand"). */
export function autoVideoWalls(stages: Stage[], look: { x: number; y: number }): VenueVideoWall[] {
  return stages.filter((s) => !istSpielfeld(s)).map((s) => {
    const p = videoBoardPlacement(s, look);
    const h = Math.min(10, (p.width * 9) / 16);
    // videoBoardPlacement dreht die Flaeche zur Kamera; im Raum-Schema zeigt
    // 0° nach +y, die Welt-Drehung ist −θ — darum das Vorzeichen.
    return { id: `auto-${s.id}`, x: p.x, y: p.y, widthM: p.width, heightM: h, bottomM: stageTopZ(s) + 0.6, rotationDeg: (-p.rotY * 180) / Math.PI };
  });
}

