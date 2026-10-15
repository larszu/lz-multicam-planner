// Showlicht der 3D-Ansicht als Daten: welche Traversen wo haengen und welche
// Scheinwerfer wohin zeigen. Reines Rechnen, damit testbar ist, was man im
// Bild nur ahnt — ein Kegel, der ins Leere zeigt, eine Traverse im Publikum.
//
// Kulisse, keine Lichtplanung: die Lampen kommen aus der Buehnengroesse,
// nicht aus einem Plan. Wer Licht plant, nimmt den light-planner.
import type { ShowLightMood, ShowLightSettings, Stage } from '../types';
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

// ── Einstellungen (im Projekt, alle optional) ──

export const SHOW_LICHT_STANDARD: ShowLightSettings = {
  brightness: 1,
  mood: 'blueMagenta',
  color: '#3f5bff',
  haze: 0.5,
  fixtures: 'both',
  amount: 'normal',
  aimAtStage: false,
};

const STIMMUNGEN: ShowLightMood[] = ['white', 'warm', 'blueMagenta', 'concert', 'custom'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Gelesene Einstellung (Projektdatei, Eingabe) mit Standards fuer alles Fehlende oder Unbrauchbare. */
export function showLichtAus(roh: unknown): ShowLightSettings {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Partial<Record<keyof ShowLightSettings, unknown>>;
  const zahl = (v: unknown, min: number, max: number, std: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : std);
  const d = SHOW_LICHT_STANDARD;
  return {
    brightness: zahl(r.brightness, 0.25, 2, d.brightness),
    mood: STIMMUNGEN.includes(r.mood as ShowLightMood) ? (r.mood as ShowLightMood) : d.mood,
    color: typeof r.color === 'string' && HEX.test(r.color) ? r.color.toLowerCase() : d.color,
    haze: zahl(r.haze, 0, 1, d.haze),
    fixtures: r.fixtures === 'wash' || r.fixtures === 'beams' ? r.fixtures : d.fixtures,
    amount: r.amount === 'few' || r.amount === 'many' ? r.amount : d.amount,
    aimAtStage: typeof r.aimAtStage === 'boolean' ? r.aimAtStage : d.aimAtStage,
  };
}

// Front (Wash) bleibt in den bunten Stimmungen warmweiss — Gesichter sollen
// nach Gesichtern aussehen.
const FARBEN: Record<Exclude<ShowLightMood, 'custom'>, { wash: string; beams: string[] }> = {
  white: { wash: '#f6f7ff', beams: ['#ffffff', '#eef2ff', '#ffffff', '#f4f6ff'] },
  warm: { wash: '#ffe6c7', beams: ['#ffb347', '#ffd9a8', '#ff9a3c', '#ffe2b8'] },
  blueMagenta: { wash: '#fff0e2', beams: ['#3f5bff', '#b23cff', '#5b74ff', '#ff4fa3', '#3f5bff', '#e8eeff'] },
  concert: { wash: '#fff0e2', beams: ['#ff3b3b', '#3f5bff', '#2bd96b', '#ffae3a', '#ff4fa3', '#29d3ff'] },
};

function farbenFuer(e: ShowLightSettings): { wash: string; beams: string[] } {
  return e.mood === 'custom' ? { wash: '#fff0e2', beams: [e.color] } : FARBEN[e.mood];
}

const MENGE = { few: 0.5, normal: 1, many: 1.6 } as const;

/**
 * Rig fuer alle Buehnen. `blick` ist der Punkt, von dem aus geschaut wird
 * (Mitte der Kameras oder des Publikums) — vorn ist die Seite dorthin.
 */
export function showRig(
  stages: Stage[],
  blick: { x: number; y: number },
  venue: { widthM: number; heightM: number },
  einstellung: ShowLightSettings = SHOW_LICHT_STANDARD,
  maxLampen = 48,
): Rig {
  const traversen: Rig['traversen'] = [];
  const lampen: RigLampe[] = [];
  const { wash: WASH, beams: BEAM_FARBEN } = farbenFuer(einstellung);
  const menge = MENGE[einstellung.amount];
  const mitWash = einstellung.fixtures !== 'beams';
  const mitBeams = einstellung.fixtures !== 'wash';
  const hell = einstellung.brightness;
  for (const s of [...stages].sort((a, b) => b.width * b.height - a.width * a.height)) {
    if (lampen.length >= maxLampen) break;
    if (istSpielfeld(s)) {
      flutlicht(s, venue, lampen, hell);
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

    const nWash = mitWash ? Math.max(1, Math.min(16, Math.round(Math.max(2, Math.min(10, Math.round(breite / 3))) * menge))) : 0;
    for (let i = 0; i < nWash && lampen.length < maxLampen; i++) {
      const u = -breite / 2 + ((i + 0.5) / nWash) * breite;
      lampen.push({ von: punkt(u, vorn, hoehe - 0.35), nach: punkt(u * 0.85, tiefe * 0.55, top + 1.2), farbe: WASH, feldwinkelDeg: 30, art: 'wash', intensitaet: hell });
    }
    // Rueckwaertige Beams faechern ueber die Buehne ins Publikum: das Bild,
    // das man aus jeder Halle kennt. Auf Wunsch zeigen sie auf die Buehne.
    const nBeam = mitBeams ? Math.max(1, Math.min(20, Math.round(Math.max(3, Math.min(14, Math.round(breite / 2.5))) * menge))) : 0;
    // Die Kegel enden in den vorderen Reihen: reichten sie bis zu den Kameras im
    // Publikum, schaute jede Kamera in den Strahl und saehe nur noch Schleier.
    const weit = Math.max(4, Math.min(16, tiefe * 1.2 + 2));
    for (let i = 0; i < nBeam && lampen.length < maxLampen; i++) {
      const t = nBeam === 1 ? 0.5 : i / (nBeam - 1);
      const u = -breite / 2 + t * breite;
      const ziel = einstellung.aimAtStage
        ? punkt(u * 0.7, tiefe * (0.35 + 0.4 * ((i % 3) / 2)), top)
        : punkt((t - 0.5) * breite * 1.1, tiefe + weit * (0.55 + 0.45 * Math.abs(t - 0.5) * 2), 0);
      lampen.push({ von: punkt(u, 0.6, hoehe + 0.65), nach: ziel, farbe: BEAM_FARBEN[i % BEAM_FARBEN.length], feldwinkelDeg: 7, art: 'beam', intensitaet: 0.6 * hell });
    }
    // Grosse Buehne unter freiem Himmel oder in der Arena: zusaetzlich
    // schmale Strahlen schraeg nach oben, ueber das Publikum hinweg — nicht,
    // wenn alles auf die Buehne zeigen soll.
    if (breite >= 20 && mitBeams && !einstellung.aimAtStage) {
      const nLuft = Math.max(2, Math.min(16, Math.round(Math.max(4, Math.min(12, Math.round(breite / 5))) * menge)));
      for (let i = 0; i < nLuft && lampen.length < maxLampen; i++) {
        const t = i / (nLuft - 1);
        const u = -breite / 2 + t * breite;
        lampen.push({ von: punkt(u, 0.3, top + 0.3), nach: punkt(u + (t - 0.5) * breite * 1.6, tiefe + 18 + Math.abs(t - 0.5) * 30, hoehe + 28), farbe: BEAM_FARBEN[(i + 1) % BEAM_FARBEN.length], feldwinkelDeg: 3.5, art: 'beam', intensitaet: hell });
      }
    }
  }
  return { traversen, lampen: lampen.slice(0, maxLampen) };
}

/** Vier Masten an den Ecken des Feldes: je ein echtes Licht und zwei Kegel im Dunst. */
function flutlicht(s: Stage, venue: { widthM: number; heightM: number }, lampen: RigLampe[], hell: number): void {
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
    lampen.push({ von: [ex, h, ey], nach: [cx + (ex - cx) * 0.15, 0, cy + (ey - cy) * 0.15], farbe: '#f4f6ff', feldwinkelDeg: 70, art: 'flut', intensitaet: hell });
    for (let k = 0; k < 2; k++) {
      const t = (k + 0.5) / 2;
      const zx = ex + (cx - ex) * (0.35 + t * 0.9);
      const zy = ey + (cy - ey) * (0.35 + t * 0.9);
      lampen.push({ von: [ex + (k - 0.5) * 2, h, ey], nach: [zx, 0, zy], farbe: '#f4f6ff', feldwinkelDeg: 24, art: 'beam', intensitaet: 0.5 * hell });
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

