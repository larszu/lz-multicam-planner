// ───────────────────────────────────────────────────────────────────────────
// EIN Look fuer alle 3D-Bilder (#192).
//
// Die 3D-Ansicht (frei und im Kamerablick), die gerenderte Vorschau und das
// Multiview zeigen dieselbe Szene durch dieselbe Pipeline mit denselben
// Werten. Vorher renderte der Kamerabild-Host ohne Pipeline direkt auf den
// Bildschirm: Dunstkegel wurden NACH dem Tonemapping addiert und brannten
// aus, die 3D-Ansicht dagegen legte einen kraeftigen Bloom-Schleier ueber
// Gesichter. Jetzt summiert alles in HDR, das Tonemapping (AgX) rollt die
// Spitzen weich ab, und Bloom glimmt nur noch an echten Lichtquellen.
//
// Wer hier dreht, dreht fuer alle Ansichten.
// ───────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Qualitaet, SzenenPipeline, Tiefenschaerfe, Tonemapping } from '../../avplan/scene3d';
import type { View3DQuality } from '../Venue3D/view3dPrefs';

export interface RenderLook {
  tonemapping: Tonemapping;
  belichtung: number;
  bloomStaerke: number;
  /** Schwelle vor dem Tonemapping (HDR-Wert). */
  bloomSchwelle: number;
}

/**
 * `show`: Showlicht an. `tagBelichtung`: Belichtung des Tageslichts (Himmel
 * misst sie selbst), sonst ohne.
 */
export function renderLook(show: boolean, tagBelichtung?: number): RenderLook {
  if (tagBelichtung !== undefined) {
    // Tags bleibt Bloom fast aus — der Schein um jede besonnte Flaeche sah
    // aus wie Nebel. Die Schwelle liegt um den Kehrwert der Belichtung hoeher.
    const b = Math.min(1, tagBelichtung);
    return { tonemapping: 'agx', belichtung: tagBelichtung, bloomStaerke: 0.35 * b * b, bloomSchwelle: 1.4 / b };
  }
  if (show) return { tonemapping: 'agx', belichtung: 1.1, bloomStaerke: 0, bloomSchwelle: 1.6 };
  return { tonemapping: 'neutral', belichtung: 1, bloomStaerke: 0.08, bloomSchwelle: 1.4 };
}

export function wendeLookAn(p: SzenenPipeline, look: RenderLook): void {
  p.setTonemapping(look.tonemapping);
  p.setBelichtung(look.belichtung);
  p.setBloom(look.bloomStaerke, look.bloomSchwelle);
}

const TONEMAPPING: Record<Tonemapping, THREE.ToneMapping> = {
  agx: THREE.AgXToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  neutral: THREE.NeutralToneMapping,
};

/** Einfache Ansicht ohne Pipeline: Tonemapping direkt im Material. */
export function stelleEinfachEin(gl: THREE.WebGLRenderer, look: RenderLook): void {
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = TONEMAPPING[look.tonemapping];
  gl.toneMappingExposure = look.belichtung;
}

/** Pipeline-Stufe aus der Wahl des Nutzers; `simple` laeuft ohne Pipeline. */
export function pipelineQualitaet(q: View3DQuality): Qualitaet {
  return q === 'simple' ? 'low' : q;
}

/** Schaerfentiefe des Objektivs — im Kamerablick und im gerenderten Kamerabild gleich. */
export function tiefenschaerfeVon(
  cam: { focusDistance: number; aperture: number; focalLength: number; extenderActive?: number },
  sensorBreiteMm: number,
): Tiefenschaerfe {
  return {
    fokusM: Math.max(0.3, cam.focusDistance),
    blende: cam.aperture,
    brennweiteMm: cam.focalLength * (cam.extenderActive || 1),
    sensorBreiteMm,
  };
}
