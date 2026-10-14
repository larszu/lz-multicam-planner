// Eigene Datei, weil FirstSteps.tsx nur Komponenten exportieren darf (Fast Refresh).
export const FIRST_STEPS_OPEN_EVENT = 'mcplan:first-steps';

/** Die Checkliste „Erste Schritte" wieder einblenden (Hilfe-Menue). */
export function openFirstSteps() {
  window.dispatchEvent(new Event(FIRST_STEPS_OPEN_EVENT));
}
