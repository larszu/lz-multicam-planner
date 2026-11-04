/**
 * Die Rig-Namen in der Sprache des Nutzers.
 *
 * WARUM ES DIESE DATEI GIBT. `MOUNT_TYPE_LABELS` (in `types/index.ts`) und
 * `MOTION_PROFILES[…].label` sind DATEN, keine Oberflaeche — und trotzdem
 * standen ihre Werte bis 2026-09-10 auf Deutsch in einem Repo, dessen
 * Quellsprache seit E-28 `en` ist. Der Sprachmix-Zaehler konnte das nicht
 * finden: er liest JSX-Text, sichtbare Attribute und Rueckfragen. Was als Feld
 * eines Modul-Objekts dasteht, sieht er nie.
 *
 * WARUM EIN SCHALTER UND KEINE TABELLE. `t(`mount.${type}`, …)` waere kuerzer
 * und macht den Schluessel fuer jede statische Pruefung unauffindbar — die
 * Woerterbuch-Eintraege gaelten ab sofort als unerreichbar. Der Schalter haelt
 * die Schluessel literal, und weil er `CameraMountType` vollstaendig abdecken
 * muss, faellt beim Ergaenzen eines Rigs die vergessene Uebersetzung sofort
 * auf: TypeScript besteht darauf.
 */
import type { CameraMountType, VenueCamera } from '../types';
import { pathSummary } from '../utils/travelPath';

type T = (key: string, en: string) => string;

/** Der ausgeschriebene Name, wie er in Auswahl-Listen und Kopfzeilen steht. */
export function mountTypeLabel(t: T, type: CameraMountType): string {
  switch (type) {
    case 'tripod': return t('mount.tripod', 'Tripod');
    case 'hihat': return t('mount.hihat', 'Hi-hat / floor stand');
    case 'pedestal': return t('mount.pedestal', 'Studio pedestal');
    case 'jib': return t('mount.jib', 'Jib / crane');
    case 'technocrane': return t('mount.technocrane', 'Technocrane (telescoping)');
    case 'dolly': return t('mount.dolly', 'Dolly (track)');
    case 'slider': return t('mount.slider', 'Slider');
    case 'cablecam': return t('mount.cablecam', 'Cable-cam / Spidercam');
    case 'drone': return t('mount.drone', 'Drone');
    case 'scissorlift': return t('mount.scissorlift', 'Scissor lift');
    case 'remotehead': return t('mount.remotehead', 'Remote head');
    case 'carmount': return t('mount.carmount', 'Car mount');
    case 'rickshaw': return t('mount.rickshaw', 'Rickshaw / camera cart');
    case 'gimbal': return t('mount.gimbal', 'Gimbal');
    case 'handheld': return t('mount.handheld', 'Handheld');
    case 'steadicam': return t('mount.steadicam', 'Steadicam');
    case 'fixed': return t('mount.fixed', 'Fixed mount');
  }
}

/**
 * Der kurze Name des Bewegungsprofils — dasselbe Rig, knapper geschrieben.
 *
 * Zwei Namen fuer eine Sache sind Absicht und keine Doppelung: in der
 * Kopfzeile des Rig-Pults stehen beide nebeneinander („Dolly (track) · Dolly"),
 * und in der Shotlist ist die Spalte schmal.
 */
export function motionProfileLabel(t: T, type: CameraMountType): string {
  switch (type) {
    case 'tripod': return t('motion.tripod', 'Tripod');
    case 'hihat': return t('motion.hihat', 'Hi-hat');
    case 'pedestal': return t('motion.pedestal', 'Pedestal');
    case 'jib': return t('motion.jib', 'Jib / crane');
    case 'technocrane': return t('motion.technocrane', 'Technocrane');
    case 'dolly': return t('motion.dolly', 'Dolly');
    case 'slider': return t('motion.slider', 'Slider');
    case 'cablecam': return t('motion.cablecam', 'Cable-cam');
    case 'drone': return t('motion.drone', 'Drone');
    case 'scissorlift': return t('motion.scissorlift', 'Scissor lift');
    case 'remotehead': return t('motion.remotehead', 'Remote head');
    case 'carmount': return t('motion.carmount', 'Vehicle');
    case 'rickshaw': return t('motion.rickshaw', 'Rickshaw');
    case 'gimbal': return t('motion.gimbal', 'Gimbal');
    case 'handheld': return t('motion.handheld', 'Handheld');
    case 'steadicam': return t('motion.steadicam', 'Steadicam');
    case 'fixed': return t('motion.fixed', 'Fixed mount');
  }
}

/**
 * Wie sich das Rig bewegt, in einem Satz — der Hinweis unter der
 * Bewegungsstil-Auswahl. Er stand wie die Namen als deutsches Feld in
 * `MOTION_PROFILES`.
 */
export function motionProfileHint(t: T, type: CameraMountType): string {
  switch (type) {
    case 'tripod': return t('motion.hint.tripod', 'A short, precise pan with a clean start and stop.');
    case 'hihat': return t('motion.hint.hihat', 'Low and rigid - pan and tilt only.');
    case 'pedestal': return t('motion.hint.pedestal', 'Cleanly guided, the column raises and lowers evenly.');
    case 'jib': return t('motion.hint.jib', 'A soft arc that settles gently.');
    case 'technocrane': return t('motion.hint.technocrane', 'A telescoping arm - the softest and longest move.');
    case 'dolly': return t('motion.hint.dolly', 'Heavy mass: a long run-up and a long roll-out.');
    case 'slider': return t('motion.hint.slider', 'A short, very even path - fine control.');
    case 'cablecam': return t('motion.hint.cablecam', 'Flying on ropes - wide, soft arcs with a little sway afterwards.');
    case 'drone': return t('motion.hint.drone', 'Free in space, soft acceleration, slight drift.');
    case 'scissorlift': return t('motion.hint.scissorlift', 'Lifts slowly and calmly; barely moves horizontally.');
    case 'remotehead': return t('motion.hint.remotehead', 'Motor-precise, very fast pans are possible.');
    case 'carmount': return t('motion.hint.carmount', 'Follows the vehicle - fast, with road judder.');
    case 'rickshaw': return t('motion.hint.rickshaw', 'Pushed - even, but never entirely still.');
    case 'gimbal': return t('motion.hint.gimbal', 'Softly guided, nimbler than a Steadicam.');
    case 'handheld': return t('motion.hint.handheld', 'Never entirely still - a fine tremor rides on the move.');
    case 'steadicam': return t('motion.hint.steadicam', 'Floating, overshoots a little and settles in.');
    case 'fixed': return t('motion.hint.fixed', 'Rigid - zoom and focus only, no travel.');
  }
}

/** Die Tempo-Stufe des Rig-Pults (`SPEED_STEPS`), Name und Erlaeuterung. */
export function speedStepLabel(t: T, key: string): string {
  switch (key) {
    case '1': return t('rig.speed.fine', 'Fine');
    case '2': return t('rig.speed.normal', 'Normal');
    default: return t('rig.speed.fast', 'Fast');
  }
}

export function speedStepHint(t: T, key: string): string {
  switch (key) {
    case '1': return t('rig.speed.fineHint', 'Fine correction - a quarter of the speed');
    case '2': return t('rig.speed.normalHint', 'The data-sheet speed of the rig');
    default: return t('rig.speed.fastHint', 'Repositioning - 2.5 times the speed');
  }
}

/** Der Fahrweg als kurze Zeile (#235): „Curve 6.0 m · R 8.0 m" — leer ohne Fahrweg. */
export function pathLabel(t: T, cam: VenueCamera): string {
  const p = pathSummary(cam);
  if (!p) return '';
  const len = `${p.lengthM.toFixed(1)} m`;
  switch (p.shape) {
    case 'line': return `${t('path.line', 'Straight')} ${len}`;
    case 'arc': return `${t('path.arc', 'Curve')} ${len} · R ${(p.radiusM ?? 0).toFixed(1)} m`;
    case 'swing': return `${t('path.swing', 'Swing')} ${Math.round(p.sweepDeg)}° · ${len} · ↕ ${p.heightM?.min.toFixed(1)}–${p.heightM?.max.toFixed(1)} m`;
  }
}

/** Rig, Hoehe und Fahrweg einer Kamera in einer Zeile — fuer Shotliste und Kamerakarte. */
export function rigLine(t: T, cam: VenueCamera): string {
  return [mountTypeLabel(t, cam.mountType ?? 'tripod'), `${cam.z.toFixed(2)} m`, pathLabel(t, cam)].filter(Boolean).join(' · ');
}
