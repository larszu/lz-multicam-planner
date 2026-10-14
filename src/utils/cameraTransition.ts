// Kamera-Fahrten (#62 Punkt 4 + 5).
//
// Die Engine stammt aus dem Preview-Tab (Preset "anfahren") und ist hier
// herausgezogen, damit die Shotlist (#62 Punkt 5) exakt dieselbe Fahrt fuer
// Shot-zu-Shot-Wechsel nutzt statt einer zweiten Implementierung.
//
// Bewusst OHNE Store-Import: der Aufrufer reicht `apply` herein. Dadurch
// bleibt das Modul rein und ohne DOM/Store-Abhaengigkeit testbar.
import type { ShotTransition, VenueCamera } from '../types';
import { motionEase, motionJitter, type MotionProfile } from './motionProfile';

/** Sekunden je Transition-Modus. `manual` kommt vom Nutzer. */
export const TRANSITION_PRESET_SECONDS: Record<'off' | 'fast' | 'slow', number> = {
  off: 0,
  fast: 3,
  slow: 10,
};

export const TRANSITION_LABEL: Record<ShotTransition, string> = {
  off: 'OFF',
  fast: 'Schnell',
  slow: 'Langsam',
  manual: 'Manuell',
};

/** Durchklick-Reihenfolge des Transition-Buttons. */
export const TRANSITION_CYCLE: ShotTransition[] = ['off', 'fast', 'slow', 'manual'];

export function nextTransitionMode(mode: ShotTransition): ShotTransition {
  const i = TRANSITION_CYCLE.indexOf(mode);
  return TRANSITION_CYCLE[(i + 1) % TRANSITION_CYCLE.length];
}

/** Effektive Fahrtdauer. Negatives/NaN-Manuell faellt auf 0 (= harter Schnitt). */
export function transitionSeconds(mode: ShotTransition, manualSeconds = 0): number {
  if (mode === 'manual') {
    return Number.isFinite(manualSeconds) && manualSeconds > 0 ? manualSeconds : 0;
  }
  return TRANSITION_PRESET_SECONDS[mode];
}

/** Kubische Ease-in/out-Kurve: sanftes Beschleunigen + Abbremsen. */
export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Zwischenbild einer Fahrt: jeder numerische Zielwert wird einzeln von A nach B
 * interpoliert (gleiche Kurve, gleiche Dauer — wie im Issue beschrieben).
 * Nicht-numerische Felder und Felder ohne numerischen Startwert werden erst am
 * Ende der Fahrt gesetzt, damit z. B. `lockedPersonId: undefined` nicht mitten
 * in der Bewegung kippt.
 */
export function interpolateCamera(
  from: VenueCamera,
  to: Partial<VenueCamera>,
  eased: number,
): Partial<VenueCamera> {
  const patch: Partial<VenueCamera> = {};
  for (const key of Object.keys(to) as (keyof VenueCamera)[]) {
    const b = to[key];
    const a = from[key];
    if (typeof b === 'number' && typeof a === 'number') {
      (patch[key] as number) = interpolateField(key, a, b, eased);
    }
  }
  return patch;
}

// Brennweite und Schaerfe GEOMETRISCH (#159): der Bildwinkel haengt an 1/f.
// Linear liefen 20 → 200 mm zur Haelfte schon auf 110 mm — das Bild war eng,
// bevor der Schwenk ankam, und rutschte danach nach. Geometrisch liegt die
// Mitte bei 63 mm, Zoom und Schwenk kommen gemeinsam an.
const GEOMETRISCH = new Set<keyof VenueCamera>(['focalLength', 'focusDistance']);

function interpolateField(key: keyof VenueCamera, a: number, b: number, eased: number): number {
  if (GEOMETRISCH.has(key) && a > 0 && b > 0) return a * Math.pow(b / a, eased);
  if (key === 'pan') {
    // Kuerzester Weg: 350° → 10° faehrt 20° nach rechts, nicht 340° zurueck.
    const delta = ((((b - a) % 360) + 540) % 360) - 180;
    return a + delta * eased;
  }
  return a + (b - a) * eased;
}

export interface CameraTransitionOptions {
  from: VenueCamera;
  to: Partial<VenueCamera>;
  seconds: number;
  /**
   * Bewegungsstil der Montage. Bestimmt Zeitkurve und (bei Handheld/Steadicam)
   * das ueberlagerte Zittern. Ohne Profil bleibt es beim neutralen kubischen
   * Ease-in/out wie zuvor.
   */
  profile?: MotionProfile;
  /** Schreibt ein Zwischenbild bzw. am Ende die exakten Zielwerte. */
  apply: (patch: Partial<VenueCamera>) => void;
  /** Laeuft NUR bei regulaerem Ende, nicht beim Abbruch (Playback-Kette). */
  onDone?: () => void;
}

/**
 * Faehrt `from` → `to` mit Ease-in/out. Bei 0 s wird hart gesprungen.
 * Rueckgabe ist eine cancel-Funktion: sie stoppt die Fahrt und unterdrueckt
 * `onDone` — so bricht ein Klick auf einen anderen Shot die laufende
 * Playback-Kette sauber ab, statt sie im Hintergrund weiterlaufen zu lassen.
 */
export function runCameraTransition(opts: CameraTransitionOptions): () => void {
  const { from, to, seconds, apply, onDone, profile } = opts;
  const durationMs = Math.max(0, seconds) * 1000;

  if (durationMs <= 0) {
    apply(to);
    onDone?.();
    return () => {};
  }

  let raf: number | null = null;
  let cancelled = false;
  const startTs = performance.now();

  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - startTs) / durationMs);
    if (t < 1) {
      const eased = profile ? motionEase(profile, t) : easeInOut(t);
      const patch = interpolateCamera(from, to, eased);
      if (profile) {
        // Zittern nur waehrend der Fahrt aufschlagen — der Zielwert unten
        // bleibt exakt, sonst kaeme der Shot nicht dort an, wo er aufgenommen
        // wurde.
        const j = motionJitter(profile, t);
        if (typeof patch.pan === 'number') patch.pan += j.pan;
        if (typeof patch.tilt === 'number') patch.tilt += j.tilt;
      }
      apply(patch);
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
      apply(to); // exakte Endwerte + nicht-numerische Felder
      onDone?.();
    }
  };

  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  };
}
