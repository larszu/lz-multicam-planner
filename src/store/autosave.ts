// ───────────────────────────────────────────────────────────────────────────
// Automatische Sicherung des laufenden Projekts (cable-planner#908).
//
// Bis hierher lebte das Projekt nur im Speicher, bis jemand „Speichern"
// klickte — ein geschlossener Tab war ein verlorener Plan. „Kameras stehen
// automatisch im Canvas" setzt aber voraus, dass der Stand das Schliessen
// ueberlebt.
//
// WAS GESICHERT WIRD: genau die Projektdatei (`buildProjectFile`), dazu der
// Stand des letzten Datei-Speicherns — sonst hiesse ein wiederhergestelltes
// Projekt „gespeichert", obwohl seine Aenderungen nie in einer Datei lagen.
//
// WANN: nach einer Pause von `AUTOSAVE_DELAY_MS` ohne Aenderung, und beim
// Verlassen der Seite sofort. Ein Ziehen der Kamera ist eine Kette von
// Aenderungen; jede einzeln zu serialisieren (mitsamt eingebettetem
// Grundriss-Bild) machte das Ziehen zaeh.
//
// OEFFNEN UND NEU laufen durch `applyProjectFile` und aendern damit den
// Zustand wie jede andere Bearbeitung — die Sicherung folgt ihnen von selbst.
// Es gibt keinen zweiten Weg, der sie „ersetzt".
//
// VOLLER SPEICHER ist nicht fatal: das Projekt bleibt im Speicher und laesst
// sich als Datei sichern. Er wird aber gesagt (`autosaveStorageFull`,
// Statusleiste) — dieselbe Form wie bei Shotlisten, Takes und Bibliothek.
// ───────────────────────────────────────────────────────────────────────────
import { useStore, buildProjectFile } from './useStore';
import { loadJSON, saveJSONSafe } from '../utils/storage';
import type { ProjectFile } from '../types';

export const AUTOSAVE_KEY = 'multicam-autosave';
export const AUTOSAVE_DELAY_MS = 1000;

type Zustand = ReturnType<typeof useStore.getState>;

interface Sicherung {
  lastSavedVersion: number;
  project: ProjectFile;
}

/** Was in die Projektdatei geht. Aendert sich eines davon (per Referenz —
 *  der Store ersetzt, er veraendert nicht), ist neu zu sichern. */
const projektTeile = (s: Zustand): unknown[] => [
  s.projectId, s.projectVersion, s.lastSavedVersion, s.venue, s.cameras, s.persons, s.walls,
  s.backgroundPlan, s.avForeign, s.stageForeign, s.floorPlanForeign, s.wallForeign, s.personForeign,
  s.customCameras, s.customLenses,
];

export function writeAutosave(): boolean {
  const s = useStore.getState();
  const sicherung: Sicherung = { lastSavedVersion: s.lastSavedVersion, project: buildProjectFile(s) };
  // Scheitert das Schreiben, bleibt die vorige Sicherung liegen, statt
  // geloescht zu werden: waechst ein Projekt ueber die Quota (typisch: ein
  // eingebetteter PDF-Grundriss), ist der Stand von davor mehr wert als ein
  // leeres Projekt beim naechsten Start. Dass sie nicht mehr mitkommt, sagt
  // die Statusleiste.
  const ok = saveJSONSafe(AUTOSAVE_KEY, sicherung);
  if (s.autosaveStorageFull === ok) useStore.setState({ autosaveStorageFull: !ok });
  return ok;
}

export function startAutosave(delayMs = AUTOSAVE_DELAY_MS): { flush: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let vorher = projektTeile(useStore.getState());

  const unsubscribe = useStore.subscribe((s) => {
    const jetzt = projektTeile(s);
    if (jetzt.every((teil, i) => teil === vorher[i])) return;
    vorher = jetzt;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      writeAutosave();
    }, delayMs);
  });

  return {
    flush: () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      writeAutosave();
    },
    stop: () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

/**
 * Nur, was sich als Projekt laden LAESST. Eine kaputte oder fremde Sicherung
 * (etwa aus einer neueren Version) wird nicht angewandt — und auch nicht
 * ueberschrieben, solange niemand etwas aendert.
 */
function istSicherung(v: unknown): v is Sicherung {
  if (!v || typeof v !== 'object') return false;
  const { lastSavedVersion, project } = v as Partial<Sicherung>;
  return Number.isFinite(lastSavedVersion) &&
    !!project && typeof project === 'object' &&
    project.formatVersion === 1 &&
    !!project.venue && typeof project.venue === 'object' &&
    Array.isArray(project.cameras) && Array.isArray(project.persons);
}

/** Stellt die letzte Sicherung wieder her. `false`, wenn es keine gibt. */
export function restoreAutosave(): boolean {
  const sicherung = loadJSON<unknown>(AUTOSAVE_KEY, null);
  if (!istSicherung(sicherung)) return false;
  try {
    useStore.getState().applyProjectFile(sicherung.project);
  } catch {
    // Laeuft vor dem ersten Rendern: ein Wurf hier waere ein weisser
    // Bildschirm statt eines leeren Projekts.
    return false;
  }
  useStore.setState({ lastSavedVersion: sicherung.lastSavedVersion });
  return true;
}
