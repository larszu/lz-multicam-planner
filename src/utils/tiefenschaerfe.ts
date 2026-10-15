// ───────────────────────────────────────────────────────────────────────────
// TIEFENUNSCHAERFE: Bild und Zahlen aus derselben Rechnung.
//
// Die Zahlen neben dem Bild (DoF nah/fern) kommen aus `computeDof` — aus
// Brennweite mal Extender, Blende, Fokusabstand und dem Zerstreuungskreis des
// Sensors (Diagonale/1500). Das Bild zeichnet die Pipeline mit einem
// Bokeh-Pass, dessen Unschaerfe LINEAR mit dem Abstand zur Schaerfeebene
// waechst, waehrend die Physik mit (D−s)/D waechst.
//
// `bokehStaerke` im Paket gleicht beide bei D = 2·s an. Am NAHEN Rand der
// Schaerfentiefe ist die gezeichnete Unschaerfe damit nur etwa halb so stark
// wie in Wirklichkeit: der scharfe Bereich im Bild waere rund doppelt so tief
// wie die Zahl daneben. Darum wird hier die Blende, mit der die Pipeline
// rechnet, so gewaehlt, dass die gezeichnete Unschaerfe am nahen Rand genau
// den Zerstreuungskreis erreicht. Dort stimmt die Grenze dann auf den Meter;
// hinter der Schaerfeebene bleibt der gezeichnete scharfe Bereich etwas
// kuerzer als die Physik — lieber zu wenig Schaerfe zeigen als zu viel.
//
// `Tiefenschaerfe.blende` und `.sensorBreiteMm` sind deshalb Regelwerte fuer
// den Renderer, keine Angaben zum Anzeigen. Angezeigt wird, was am Objektiv
// und am Sensor steht.
// ───────────────────────────────────────────────────────────────────────────
import { bokehStaerke, type Tiefenschaerfe } from '../avplan/scene3d';
import type { SensorSize, VenueCamera } from '../types';
import { circleOfConfusion, computeDof } from './fov';

/** Kamerawerte, aus denen die Unschaerfe entsteht. */
export type UnschaerfeKamera = Pick<VenueCamera, 'focusDistance' | 'aperture' | 'focalLength'> & { extenderActive?: number };

/**
 * Werte fuer die Pipeline — eine Stelle fuer Kamerablick, Vorschau und
 * Multiview. `null`, wenn es nichts zu rechnen gibt (kein Fokusabstand).
 */
export function tiefenschaerfeFuerBild(cam: UnschaerfeKamera, sensor: SensorSize): Tiefenschaerfe | null {
  const brennweiteMm = cam.focalLength * (cam.extenderActive || 1);
  const fokusM = Math.max(0.3, cam.focusDistance);
  if (!(brennweiteMm > 0) || !(cam.aperture > 0)) return null;
  const roh: Tiefenschaerfe = { fokusM, blende: cam.aperture, brennweiteMm, sensorBreiteMm: sensor.widthMm };
  const { nearLimit } = computeDof(sensor, cam.focalLength, cam.aperture, fokusM, cam.extenderActive);
  const tiefeNah = fokusM - nearLimit;
  if (!(tiefeNah > 0)) return roh;
  // Gesuchte Steigung: am nahen Rand genau ein Zerstreuungskreis, in Bildbreiten.
  const ziel = circleOfConfusion(sensor.widthMm, sensor.heightMm) / sensor.widthMm / tiefeNah;
  if (!(ziel > 0)) return roh;
  // `bokehStaerke` ist umgekehrt zu Blende mal Sensorbreite; gesucht ist also
  // nur deren Produkt. Die Blende darf dort nicht unter 0.7 fallen (die
  // Rechnung klemmt sie), der Rest geht ueber die Sensorbreite.
  const produkt = (bokehStaerke(roh) * Math.max(0.7, roh.blende) * roh.sensorBreiteMm) / ziel;
  if (!(produkt > 0) || !Number.isFinite(produkt)) return roh;
  const blende = Math.max(0.7, produkt / roh.sensorBreiteMm);
  return { ...roh, blende, sensorBreiteMm: Math.max(1, produkt / blende) };
}

/** Unschaerfe, die die Pipeline bei diesem Abstand zeichnet — in Bildbreiten. */
export function unschaerfeImBild(t: Tiefenschaerfe, abstandM: number): number {
  return bokehStaerke(t) * Math.abs(abstandM - t.fokusM);
}

/** Scharfer Bereich des gezeichneten Bildes: wo die Unschaerfe unter `cocMm` bleibt. */
export function scharfeZoneImBild(t: Tiefenschaerfe, sensor: SensorSize): { nah: number; fern: number } {
  const halb = circleOfConfusion(sensor.widthMm, sensor.heightMm) / sensor.widthMm / bokehStaerke(t);
  return { nah: Math.max(0, t.fokusM - halb), fern: t.fokusM + halb };
}
