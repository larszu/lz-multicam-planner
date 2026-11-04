// Blickpunkte der 3D-Ansicht: der zuletzt gesehene (lebt im Store, damit ihn
// der Wechsel zu 2D, ein anderer Reiter oder ein neues Layout nicht loescht)
// und die fixierten je Modus (liegen im Projekt, der Export nimmt sie).
// Ohne three.js, damit direkt testbar.
import { VIEW3D_FOV_DEG } from './view3d';

/** Die beiden freien Modi der 3D-Ansicht; der Kamerablick hat keinen eigenen Blickpunkt. */
export type Ansicht3DModus = 'top' | 'perspective';

/** Ein Blickpunkt der freien 3D-Kamera. */
export interface Ansicht3D {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  /** Vertikaler Bildwinkel in Grad (Zoom). */
  fovDeg: number;
  /** Seitenverhaeltnis beim Fixieren — damit der Export dieselbe Breite zeigt. */
  aspect?: number;
}

/** Fixierte Ausschnitte im Projekt (`venue.views3d`). */
export type FixierteAnsichten = Partial<Record<Ansicht3DModus, Ansicht3D>>;

const zahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ein Blickpunkt aus einer Datei — oder `undefined`, wenn er nicht brauchbar ist. */
export function ansicht3DAusDatei(roh: unknown): Ansicht3D | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const r = roh as Record<string, unknown>;
  const pos = r.pos;
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(zahl)) return undefined;
  if (!zahl(r.yaw) || !zahl(r.pitch)) return undefined;
  const fovDeg = zahl(r.fovDeg) && r.fovDeg > 1 && r.fovDeg < 170 ? r.fovDeg : VIEW3D_FOV_DEG;
  const a: Ansicht3D = { pos: [pos[0], pos[1], pos[2]], yaw: r.yaw, pitch: r.pitch, fovDeg };
  if (zahl(r.aspect) && r.aspect > 0) a.aspect = r.aspect;
  return a;
}

/** Fixierte Ausschnitte aus einer Datei; leer → `undefined`, damit alte Dateien gleich bleiben. */
export function fixierteAnsichtenAusDatei(roh: unknown): FixierteAnsichten | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const r = roh as Record<string, unknown>;
  const out: FixierteAnsichten = {};
  for (const m of ['top', 'perspective'] as const) {
    const a = ansicht3DAusDatei(r[m]);
    if (a) out[m] = a;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Setzt (oder mit `undefined` loescht) den fixierten Ausschnitt eines Modus. */
export function mitFixierung(alt: FixierteAnsichten | undefined, modus: Ansicht3DModus, a: Ansicht3D | undefined): FixierteAnsichten | undefined {
  const neu: FixierteAnsichten = { ...(alt ?? {}) };
  if (a) neu[modus] = a;
  else delete neu[modus];
  return Object.keys(neu).length > 0 ? neu : undefined;
}

/**
 * Welchen Ausschnitt das 3D-Bild im Export zeigt: den fixierten der
 * Perspektive, sonst den der Draufsicht, sonst die Startansicht.
 */
export function exportAnsicht(fixiert: FixierteAnsichten | undefined, start: Ansicht3D): Ansicht3D {
  return fixiert?.perspective ?? fixiert?.top ?? start;
}

/**
 * Vertikaler Bildwinkel fuer ein anderes Seitenverhaeltnis, so dass der
 * fixierte Ausschnitt ganz drin bleibt: war die Ansicht breiter als das
 * Exportbild, waechst der Winkel, bis dieselbe Breite hineinpasst; war sie
 * schmaler, bleibt er (oben/unten zeigt dann dasselbe, seitlich kommt etwas dazu).
 */
export function fovFuerSeitenverhaeltnis(a: Ansicht3D, zielAspect: number): number {
  const quelle = a.aspect;
  if (!quelle || !(zielAspect > 0) || quelle <= zielAspect) return a.fovDeg;
  const halb = Math.tan((a.fovDeg * Math.PI) / 360) * (quelle / zielAspect);
  return Math.min(170, (Math.atan(halb) * 360) / Math.PI);
}

/** Gleich bis auf Rundungsrauschen — sonst schriebe jedes Bild den Store neu. */
export function gleicheAnsicht(a: Ansicht3D | null | undefined, b: Ansicht3D | null | undefined): boolean {
  if (!a || !b) return a === b;
  const nah = (x: number, y: number, eps: number) => Math.abs(x - y) < eps;
  return a.pos.every((v, i) => nah(v, b.pos[i], 1e-3)) && nah(a.yaw, b.yaw, 1e-4) && nah(a.pitch, b.pitch, 1e-4) && nah(a.fovDeg, b.fovDeg, 1e-3);
}
