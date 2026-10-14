// Rueckgaengig / Wiederherstellen (#175), nach dem Muster von
// cable-planner `store/projectHistory.ts`.
//
// MultiCam hatte nie eine Historie (das Bearbeiten-Menue sagte es seit #129
// selbst); wer sie vermisste, kannte sie aus dem Cable Planner.
//
// Ein Schritt ist das, was ein Mensch als eine Handlung erlebt:
//  - eine Geste: alles zwischen Maus/Finger runter und hoch (Kamera ziehen,
//    Regler schieben, Wand zeichnen) — sonst waere jedes Mausereignis ein
//    eigener Schritt;
//  - ein Eingabefeld: alle Aenderungen, solange derselbe Fokus bleibt;
//  - ein Schwall: Aenderungen, die dichter als COALESCE_MS aufeinander
//    folgen (Tastatur-Nudges, Rig-Fahrten, Aktionen mit mehreren `set`).
//
// Oeffnen und Neu (`projectEpoch`) beginnen die Historie von vorn.
import { useEffect, useSyncExternalStore } from 'react';
import { useStore, takeHistorySnapshot, restoreHistorySnapshot, HISTORY_KEYS, type HistorySnapshot } from './useStore';

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 300;

let past: HistorySnapshot[] = [];
let future: HistorySnapshot[] = [];
let current: HistorySnapshot | null = null;
let epoch = 0;
let restoring = false;
let lastChange = 0;
let lastFocus: Element | null = null;
let gestureStart: HistorySnapshot | null = null;
let gestureActive = false;

const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

const same = (a: HistorySnapshot, b: HistorySnapshot) => HISTORY_KEYS.every((k) => a[k] === b[k]);

const editableFocus = (): Element | null => {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement;
  return el && isEditable(el) ? el : null;
};

export function isEditable(el: EventTarget | null): boolean {
  if (!el || typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset'].includes(el.type);
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function push(entry: HistorySnapshot) {
  past.push(entry);
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
}

function onChange(now: number) {
  const s = useStore.getState();
  if (s.projectEpoch !== epoch) {
    epoch = s.projectEpoch;
    past = [];
    future = [];
    current = takeHistorySnapshot(s);
    gestureStart = gestureActive ? current : null;
    notify();
    return;
  }
  const next = takeHistorySnapshot(s);
  if (!current || same(current, next)) return;
  if (restoring) {
    current = next;
    return;
  }
  const focus = editableFocus();
  if (gestureActive) {
    // Der Eintrag entsteht erst beim Loslassen, aus dem Stand davor.
    if (!gestureStart) gestureStart = current;
  } else {
    const merge = past.length > 0 && (now - lastChange < COALESCE_MS || (focus !== null && focus === lastFocus));
    if (!merge) push(current);
    else future = [];
  }
  current = next;
  lastChange = now;
  lastFocus = focus;
  notify();
}

/** Maus/Finger runter: alles bis zum Loslassen wird ein Schritt. */
export function beginGesture() {
  gestureActive = true;
  gestureStart = null;
}

export function endGesture() {
  if (!gestureActive) return;
  gestureActive = false;
  if (gestureStart && current && !same(gestureStart, current)) {
    push(gestureStart);
    lastChange = 0;
    notify();
  }
  gestureStart = null;
}

function step(from: HistorySnapshot[], to: HistorySnapshot[]) {
  const target = from.pop();
  if (!target || !current) return;
  to.push(current);
  restoring = true;
  try {
    restoreHistorySnapshot(target);
  } finally {
    restoring = false;
  }
  current = takeHistorySnapshot(useStore.getState());
  lastChange = 0;
  lastFocus = null;
  notify();
}

export const history = {
  canUndo: () => past.length > 0,
  canRedo: () => future.length > 0,
  undo: () => step(past, future),
  redo: () => step(future, past),
  /** Startet die Aufzeichnung ab dem jetzigen Stand. */
  start(): () => void {
    const s = useStore.getState();
    epoch = s.projectEpoch;
    current = takeHistorySnapshot(s);
    past = [];
    future = [];
    lastChange = 0;
    lastFocus = null;
    gestureActive = false;
    gestureStart = null;
    const unsub = useStore.subscribe(() => onChange(Date.now()));
    notify();
    return unsub;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Zustand fuer Menue und Befehlspalette (ausgegraut, wenn nichts da ist). */
export function useHistoryState(): { canUndo: boolean; canRedo: boolean } {
  useSyncExternalStore(history.subscribe, () => version);
  return { canUndo: history.canUndo(), canRedo: history.canRedo() };
}

/**
 * Strg/Cmd+Z, Strg/Cmd+Shift+Z und Strg+Y — ausser in Eingabefeldern: dort
 * gilt das Rueckgaengig des Feldes, und ein zweites Abfangen naehme dem
 * Tippenden seinen Text weg. Dazu die Gesten-Klammer fuer Ziehen.
 */
export function useHistoryShortcuts() {
  useEffect(() => {
    const unsub = history.start();
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
        e.preventDefault();
        history.redo();
      }
    };
    const down = (e: PointerEvent) => { if (e.button === 0) beginGesture(); };
    // Erst nach dem Loslassen-Ereignis abschliessen: Konvas `dragend` und der
    // `click` laufen nach `pointerup` und gehoeren noch zur selben Geste.
    const up = () => { setTimeout(endGesture, 0); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
    };
  }, []);
}
