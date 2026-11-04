// LED-Wand als Pixelkarte (#227) und Moiré je Kamera (#213).
//
// Eine LED-Wand ist zweierlei: eine Flaeche im Raum und ein Ausschnitt aus der
// Leinwand des Medienservers. Beides folgt aus Modulgroesse, Pixelabstand und
// Modulanzahl — Breite, Hoehe und Aufloesung werden nie getrennt eingegeben.
//
// Moiré entsteht, wenn das Pixelraster der Wand auf dem Sensor feiner abgebildet
// wird als die halbe Abtastfrequenz des Sensors (Nyquist). Ob man es sieht,
// entscheidet der Kontrast, mit dem das Raster dort noch ankommt: Unschaerfe
// (Wand ausserhalb der Schaerfe), Beugung an der Blende und die Flaeche der
// Sensorpixel daempfen es. Gerechnet wird mit der Grundwelle des Rasters und
// ohne optischen Tiefpass — der ist je Kamera unbekannt, die Zahl ist also die
// Obergrenze.
import type { VenueVideoWall } from '../avplan/floorplan';
import { videowandNormal } from '../avplan/floorplan';
import { kameraProjektion, BILD_SEITENVERHAELTNIS } from './bildwinkel';

export type LedInhalt = 'show' | 'testbild' | 'pixelkarte' | 'medien';
export const LED_INHALTE: LedInhalt[] = ['show', 'testbild', 'pixelkarte', 'medien'];

export interface LedWandDaten {
  pitchMm: number;
  moduleWmm: number;
  moduleHmm: number;
  modulesX: number;
  modulesY: number;
  /** Lage der Flaeche in der Leinwand des Medienservers, Pixel. */
  canvasX: number;
  canvasY: number;
  inhalt?: LedInhalt;
  /** Bild oder Video (http/https/data). Lokale Dateien bleiben nur in der Sitzung. */
  medienUrl?: string;
  medienArt?: 'bild' | 'video';
}

export type LedVideoWall = VenueVideoWall & { led?: LedWandDaten };

/** Freie Vorgabe ohne Produktbezug: 500-mm-Kachel, 3,9 mm Abstand. */
export const LED_VORGABE: Omit<LedWandDaten, 'modulesX' | 'modulesY' | 'canvasX' | 'canvasY'> = {
  pitchMm: 3.9,
  moduleWmm: 500,
  moduleHmm: 500,
};

const zahl = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};

export function istVideoUrl(url: string): boolean {
  return /^data:video\//i.test(url) || /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url);
}

/** Wand aus einer Datei: eine Sitzungs-Datei (blob:) gibt es nach dem Laden nicht mehr. */
export function ledAusDatei(w: LedVideoWall): LedVideoWall {
  const d = w.led ? ledNormal(w.led) : null;
  if (!d) {
    if (!('led' in w)) return w;
    const rest = { ...w };
    delete rest.led;
    return rest;
  }
  if (d.medienUrl?.startsWith('blob:')) {
    delete d.medienUrl;
    delete d.medienArt;
  }
  return { ...w, led: d };
}

/** LED-Angaben aus unbekannter Quelle; ohne brauchbaren Eintrag `null`. */
export function ledNormal(roh: unknown): LedWandDaten | null {
  if (!roh || typeof roh !== 'object') return null;
  const r = roh as Record<string, unknown>;
  const inhalt = typeof r.inhalt === 'string' && (LED_INHALTE as string[]).includes(r.inhalt) ? (r.inhalt as LedInhalt) : undefined;
  const url = typeof r.medienUrl === 'string' && /^(https?:|data:|blob:)/i.test(r.medienUrl) ? r.medienUrl : undefined;
  return {
    pitchMm: zahl(r.pitchMm, LED_VORGABE.pitchMm, 0.5, 100),
    moduleWmm: zahl(r.moduleWmm, LED_VORGABE.moduleWmm, 50, 2000),
    moduleHmm: zahl(r.moduleHmm, LED_VORGABE.moduleHmm, 50, 2000),
    modulesX: Math.round(zahl(r.modulesX, 12, 1, 500)),
    modulesY: Math.round(zahl(r.modulesY, 7, 1, 500)),
    canvasX: Math.round(zahl(r.canvasX, 0, 0, 1e6)),
    canvasY: Math.round(zahl(r.canvasY, 0, 0, 1e6)),
    ...(inhalt ? { inhalt } : {}),
    ...(url ? { medienUrl: url, medienArt: r.medienArt === 'video' || (r.medienArt !== 'bild' && istVideoUrl(url)) ? 'video' : 'bild' } : {}),
  };
}

export interface LedMasse {
  pxModulX: number;
  pxModulY: number;
  breitePx: number;
  hoehePx: number;
  breiteM: number;
  hoeheM: number;
  /** Tatsaechlicher Abstand aus Modulmass durch ganze Pixel je Modul. */
  pitchXmm: number;
  pitchYmm: number;
}

export function ledMasse(d: LedWandDaten): LedMasse {
  const pxModulX = Math.max(1, Math.round(d.moduleWmm / d.pitchMm));
  const pxModulY = Math.max(1, Math.round(d.moduleHmm / d.pitchMm));
  return {
    pxModulX,
    pxModulY,
    breitePx: pxModulX * d.modulesX,
    hoehePx: pxModulY * d.modulesY,
    breiteM: (d.moduleWmm * d.modulesX) / 1000,
    hoeheM: (d.moduleHmm * d.modulesY) / 1000,
    pitchXmm: d.moduleWmm / pxModulX,
    pitchYmm: d.moduleHmm / pxModulY,
  };
}

/** Aenderung an den LED-Daten samt der daraus folgenden Wandgroesse. */
export function ledAenderung(d: LedWandDaten): Partial<LedVideoWall> {
  const m = ledMasse(d);
  return { led: d, widthM: Math.round(m.breiteM * 1000) / 1000, heightM: Math.round(m.hoeheM * 1000) / 1000 };
}

/**
 * Aenderung an einer Wand. Zieht jemand eine LED-Wand im 2D-Plan breiter,
 * rastet sie auf ganze Module; die Hoehe bleibt bei ihrer Modulzahl.
 */
export function ledWandAendern(w: LedVideoWall, updates: Partial<LedVideoWall>): LedVideoWall {
  const neu = { ...w, ...updates };
  const d = ledNormal(neu.led);
  if (!d || 'led' in updates || (updates.widthM === undefined && updates.heightM === undefined)) return neu;
  const modulesX = updates.widthM !== undefined ? Math.max(1, Math.round((updates.widthM * 1000) / d.moduleWmm)) : d.modulesX;
  return { ...neu, ...ledAenderung({ ...d, modulesX }) };
}

/** LED einschalten: Modulzahl aus der bisherigen Wandgroesse, Lage rechts neben den anderen Flaechen. */
export function ledEinschalten(w: VenueVideoWall, alle: LedVideoWall[]): Partial<LedVideoWall> {
  const n = videowandNormal(w);
  const rechts = alle.reduce((max, a) => {
    const d = a.id === w.id ? null : ledNormal(a.led);
    return d ? Math.max(max, d.canvasX + ledMasse(d).breitePx) : max;
  }, 0);
  return ledAenderung({
    ...LED_VORGABE,
    modulesX: Math.max(1, Math.round((n.widthM * 1000) / LED_VORGABE.moduleWmm)),
    modulesY: Math.max(1, Math.round((n.heightM * 1000) / LED_VORGABE.moduleHmm)),
    canvasX: rechts,
    canvasY: 0,
    inhalt: 'pixelkarte',
  });
}

export const PIXELKARTE_FARBEN = ['#2b6bff', '#e0503a', '#2fa36b', '#c8892b', '#8a4fd8', '#2bb3c8', '#d84f9a', '#7a8a2b'];

export interface LeinwandFlaeche {
  id: string;
  label: string;
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  pxModulX: number;
  pxModulY: number;
  farbe: string;
}

export interface Leinwand {
  breitePx: number;
  hoehePx: number;
  /** Summe der Pixel aller Flaechen (das, was der Prozessor treiben muss). */
  pixel: number;
  flaechen: LeinwandFlaeche[];
  /** Zwei Flaechen belegen dieselben Leinwand-Pixel. */
  ueberlappt: boolean;
}

export function leinwand(walls: LedVideoWall[], fallbackName: (i: number) => string = (i) => `LED ${i + 1}`): Leinwand {
  const flaechen: LeinwandFlaeche[] = [];
  walls.forEach((w) => {
    const d = ledNormal(w.led);
    if (!d) return;
    const m = ledMasse(d);
    const i = flaechen.length;
    flaechen.push({
      id: w.id,
      label: w.label?.trim() || fallbackName(i),
      x: d.canvasX,
      y: d.canvasY,
      breite: m.breitePx,
      hoehe: m.hoehePx,
      pxModulX: m.pxModulX,
      pxModulY: m.pxModulY,
      farbe: PIXELKARTE_FARBEN[i % PIXELKARTE_FARBEN.length],
    });
  });
  const ueberlappt = flaechen.some((a, i) => flaechen.some((b, j) => j > i && a.x < b.x + b.breite && b.x < a.x + a.breite && a.y < b.y + b.hoehe && b.y < a.y + a.hoehe));
  return {
    breitePx: flaechen.reduce((m, f) => Math.max(m, f.x + f.breite), 0),
    hoehePx: flaechen.reduce((m, f) => Math.max(m, f.y + f.hoehe), 0),
    pixel: flaechen.reduce((s, f) => s + f.breite * f.hoehe, 0),
    flaechen,
    ueberlappt,
  };
}

/**
 * Horizontale Abtastung des Sensors aus dem hoechsten Aufzeichnungsformat.
 * „4K"/„8K" sind bei Broadcast und Video UHD (3840/7680), die Kino-Angaben
 * („6K", „4.6K") zaehlen in 1024er-Schritten — auf wenige Prozent genau.
 */
export function sensorPixelBreite(resolutions: string[]): number {
  let best = 1920;
  for (const r of resolutions) {
    const s = r.trim().toUpperCase();
    let px = 0;
    if (s.includes('UHD') || s === '4K') px = 3840;
    else if (s === '8K') px = 7680;
    else if (s.endsWith('HD')) px = 1920;
    else {
      const m = /^(\d+(?:\.\d+)?)K$/.exec(s);
      if (m) px = Math.round(parseFloat(m[1]) * 1024);
    }
    best = Math.max(best, px);
  }
  return best;
}

function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a1 / a2;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const a1 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const a2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
  return x < 0 ? -ans : ans;
}

const WELLENLAENGE_MM = 0.00055;

/** Kontrast eines Rasters mit `nu` Perioden/mm nach Optik und Sensorpixel. */
export function rasterKontrast(nu: number, o: { unschaerfeMm: number; blende: number; sensorPitchMm: number }): number {
  const xd = Math.PI * o.unschaerfeMm * nu;
  const defokus = xd < 1e-6 ? 1 : Math.abs((2 * besselJ1(xd)) / xd);
  const q = nu * WELLENLAENGE_MM * o.blende;
  const beugung = q >= 1 ? 0 : (2 / Math.PI) * (Math.acos(q) - q * Math.sqrt(1 - q * q));
  const xp = Math.PI * o.sensorPitchMm * nu;
  const pixel = xp < 1e-9 ? 1 : Math.abs(Math.sin(xp) / xp);
  return defokus * beugung * pixel;
}

/** Durchmesser des Unschaerfekreises auf dem Sensor (mm) fuer ein Objekt in `abstandM`. */
export function unschaerfeKreisMm(brennweiteMm: number, blende: number, fokusM: number, abstandM: number): number {
  const f = brennweiteMm;
  const S = Math.max(fokusM * 1000, f * 1.01);
  const D = Math.max(abstandM * 1000, f * 1.01);
  return ((f * f) / blende) * Math.abs(D - S) / (D * (S - f));
}

export interface MoireKamera {
  x: number;
  y: number;
  z: number;
  pan: number;
  tilt: number;
  hDeg: number;
  /** Brennweite mal Extender. */
  brennweiteMm: number;
  blende: number;
  fokusM: number;
  sensorBreiteMm: number;
  sensorPx: number;
}

export type MoireStufe = 'offFrame' | 'behind' | 'grid' | 'low' | 'possible' | 'likely';
export type WandAnsicht = 'frontal' | 'angled' | 'grazing';

export interface MoireErgebnis {
  stufe: MoireStufe;
  ansicht: WandAnsicht | null;
  /** Winkel zwischen Sehstrahl und Flaechennormale, Grad. */
  winkelDeg: number;
  abstandM: number;
  /** Sensorpixel je LED-Pixel an der ungünstigsten Stelle im Bild. */
  sensorPxJeLed: number;
  /** Restkontrast des Rasters 0..1 an dieser Stelle. */
  kontrast: number;
  /** Abstand der Moiré-Baender im Bild, Pixel; `null` ohne Aliasing. */
  baenderPx: number | null;
}

export const MOIRE_SCHWELLE = { likely: 0.2, possible: 0.05 } as const;

const DEG = Math.PI / 180;

/**
 * Moiré einer Kamera an einer LED-Wand. Abgetastet werden 5 × 3 Punkte der
 * Flaeche; gewertet wird der ungünstigste, der im Bild liegt.
 */
export function moireFuerKamera(k: MoireKamera, wandRoh: LedVideoWall): MoireErgebnis | null {
  const d = ledNormal(wandRoh.led);
  if (!d) return null;
  const w = videowandNormal(wandRoh);
  const m = ledMasse(d);
  const r = w.rotationDeg * DEG;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  const n = { x: -Math.sin(r), y: Math.cos(r) };
  const proj = kameraProjektion(k, k.hDeg, 1, 1 / BILD_SEITENVERHAELTNIS);
  const sensorPitchMm = k.sensorBreiteMm / k.sensorPx;
  const nyquist = 1 / (2 * sensorPitchMm);

  const mitte = { x: w.x, y: w.y, z: w.bottomM + w.heightM / 2 };
  const zurMitte = { x: k.x - mitte.x, y: k.y - mitte.y, z: k.z - mitte.z };
  const abstandMitte = Math.hypot(zurMitte.x, zurMitte.y, zurMitte.z);
  const cosMitte = (zurMitte.x * n.x + zurMitte.y * n.y) / Math.max(1e-9, abstandMitte);
  if (cosMitte <= 0) {
    return { stufe: 'behind', ansicht: null, winkelDeg: Math.acos(Math.max(-1, Math.min(1, cosMitte))) / DEG, abstandM: abstandMitte, sensorPxJeLed: 0, kontrast: 0, baenderPx: null };
  }

  let schlimmste: MoireErgebnis | null = null;
  let note = -1;
  let raster: MoireErgebnis | null = null;
  for (const fu of [0.02, 0.26, 0.5, 0.74, 0.98]) {
    for (const fv of [0.04, 0.5, 0.96]) {
      const p = {
        x: w.x + u.x * (fu - 0.5) * w.widthM,
        y: w.y + u.y * (fu - 0.5) * w.widthM,
        z: w.bottomM + fv * w.heightM,
      };
      const kp = proj.zuKamera(p.x, p.y, p.z);
      if (kp.z <= 0.05) continue;
      const b = proj.zuBild(kp);
      if (b.sx < 0 || b.sx > 1 || b.sy < 0 || b.sy > 1 / BILD_SEITENVERHAELTNIS) continue;
      const v = { x: p.x - k.x, y: p.y - k.y, z: p.z - k.z };
      const dist = Math.hypot(v.x, v.y, v.z);
      const vu = (v.x * u.x + v.y * u.y) / dist;
      const vw = v.z / dist;
      const cosN = -(v.x * n.x + v.y * n.y) / dist;
      const massstab = k.brennweiteMm / Math.max(1, dist * 1000 - k.brennweiteMm);
      const unschaerfeMm = unschaerfeKreisMm(k.brennweiteMm, k.blende, k.fokusM, dist);
      for (const [pitch, verkuerzung] of [[m.pitchXmm, Math.sqrt(Math.max(0, 1 - vu * vu))], [m.pitchYmm, Math.sqrt(Math.max(0, 1 - vw * vw))]]) {
        const bildPitch = pitch * massstab * verkuerzung;
        if (!(bildPitch > 0)) continue;
        const nu = 1 / bildPitch;
        const kontrast = rasterKontrast(nu, { unschaerfeMm, blende: k.blende, sensorPitchMm });
        const winkelDeg = Math.acos(Math.max(-1, Math.min(1, cosN))) / DEG;
        const basis = { ansicht: ansichtAus(winkelDeg), winkelDeg, abstandM: dist, sensorPxJeLed: bildPitch / sensorPitchMm, kontrast };
        if (nu < nyquist) {
          if (!raster || kontrast > raster.kontrast) raster = { ...basis, stufe: 'grid', baenderPx: null };
          continue;
        }
        const phase = nu * sensorPitchMm;
        const rest = Math.abs(phase - Math.round(phase));
        const baenderPx = rest < 1e-6 ? Infinity : 1 / rest;
        if (kontrast > note) {
          note = kontrast;
          schlimmste = { ...basis, stufe: stufeAus(kontrast), baenderPx };
        }
      }
    }
  }
  if (schlimmste) return schlimmste;
  if (raster) return raster.kontrast < MOIRE_SCHWELLE.possible ? { ...raster, stufe: 'low' } : raster;
  const winkelDeg = Math.acos(Math.max(-1, Math.min(1, cosMitte))) / DEG;
  return { stufe: 'offFrame', ansicht: ansichtAus(winkelDeg), winkelDeg, abstandM: abstandMitte, sensorPxJeLed: 0, kontrast: 0, baenderPx: null };
}

function stufeAus(kontrast: number): MoireStufe {
  if (kontrast >= MOIRE_SCHWELLE.likely) return 'likely';
  if (kontrast >= MOIRE_SCHWELLE.possible) return 'possible';
  return 'low';
}

export function ansichtAus(winkelDeg: number): WandAnsicht {
  if (winkelDeg < 25) return 'frontal';
  if (winkelDeg < 60) return 'angled';
  return 'grazing';
}
