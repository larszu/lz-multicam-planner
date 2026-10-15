// Die Zeichnung aus der Plan-Datei lesen und erkennen.
//
// WARUM NICHT IM WORKER. Es lag nahe, die Erkennung in einen Web Worker zu
// schieben — ein A0-Plan traegt leicht eine Million Pfade. pdf.js laesst
// sich dort aber nicht betreiben: startet es seinen eigenen Worker, liest es
// `window.location`, das es im Worker nicht gibt; faellt es auf den „fake
// worker" zurueck, laedt es dessen Modul per dynamischem Import, und dieses
// Modul meldet sich beim Laden an dem Port an, in dem es laeuft — an
// unserem. Danach beantwortet pdf.js unsere Nachrichten und die Erkennung
// bekommt nie eine Antwort (gemessen 2026-10-15 im gebauten Bundle, mit
// Port-Uebergabe ebenso). Also laeuft sie hier, im Hauptthread; das schwere
// Zerlegen der Seite macht pdf.js ohnehin in SEINEM Worker, und vor dem
// Rest bekommt die Oberflaeche einen Bild-Takt, damit der Spinner steht.
import * as pdfjsLib from 'pdfjs-dist';
import {
  dxfLesen,
  pdfVektorLesen,
  planErkennen,
  type ErkannterPlan,
  type PdfVektorModul,
  type PlanErkennungOptionen,
} from '../avplan/floorplan';
import type { PlanQuelle } from './planQuelle';

// Derselbe Worker wie beim Laden des Plans (usePlanLaden). Er wird hier
// eigens gesetzt, damit die Erkennung auch dann laeuft, wenn der Plan aus
// einem geoeffneten Projekt stammt und der Lader nie gelaufen ist.
pdfjsLib.GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

/** DXF bis R2004 ist ANSI (meist Windows-1252), ab R2007 UTF-8. */
function dxfText(d: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(d);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(d) : utf8;
}

/**
 * Einmal Luft holen, damit der Ladezustand sichtbar wird, bevor gerechnet
 * wird. Bewusst ohne `requestAnimationFrame`: in einem Hintergrund-Tab
 * laeuft der Bildtakt nicht, und die Erkennung bliebe dort fuer immer
 * stehen (gemessen 2026-10-15 ueber die Fernsteuerung des Browsers).
 */
const atmen = () => new Promise<void>((weiter) => setTimeout(weiter, 0));

export async function planAusQuelle(q: PlanQuelle, optionen: PlanErkennungOptionen = {}): Promise<ErkannterPlan> {
  await atmen();
  const zeichnung =
    q.art === 'dxf'
      ? dxfLesen(dxfText(q.daten))
      : await pdfVektorLesen(pdfjsLib as unknown as PdfVektorModul, q.daten, q.seite);
  await atmen();
  return planErkennen(zeichnung, optionen);
}
