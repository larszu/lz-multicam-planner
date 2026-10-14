// ───────────────────────────────────────────────────────────────────────────
// Das Thema — hell, dunkel oder dem System folgen (B-70).
//
// DREI ZUSTAENDE, NICHT ZWEI. „System" ist keine Umschreibung fuer „dunkel":
// wer nichts gewaehlt hat, folgt dem Betriebssystem, und wer gewaehlt hat,
// gewinnt gegen es. Ein Schalter mit zwei Stellungen kann den ersten Fall
// nicht ausdruecken — er muesste beim ersten Oeffnen eine Wahl erfinden.
//
// WIE ES WIRKT. Dieses Modul setzt `data-theme` am Wurzelelement, sonst
// nichts. Die Farben stehen in `index.css` als Werte der bc-*-Token; hier
// wird kein Hex angefasst. Wer eine Farbe aendern will, aendert sie dort —
// an einer Stelle, fuer beide Themen.
//
// Dieselbe Bauform wie im `inventory-planner` und im
// `larszu-facility-planner`. Sie steht dreimal im Baum und nicht in einem
// Paket: die drei Repos teilen keinen Quellbaum, und ein Paket fuer
// sechzehn Zeilen waere eine Abhaengigkeit fuer eine Zeile Logik.
// ───────────────────────────────────────────────────────────────────────────

export type Thema = 'hell' | 'dunkel' | 'system';

const SCHLUESSEL = 'multicam-planner:thema';

/** Ereignis nach jeder Wahl — Kopf-Umschalter und Einstellungen bleiben gleich. */
export const THEMA_EVENT = 'multicam-planner:thema';

/** Die gespeicherte Wahl — `system`, wenn keine getroffen wurde. */
export const liesThema = (): Thema => {
  try {
    const w = localStorage.getItem(SCHLUESSEL);
    return w === 'hell' || w === 'dunkel' ? w : 'system';
  } catch {
    // Privates Fenster, gesperrter Speicher: die Vorgabe steht, die Wahl
    // haelt eben nur bis zum Neuladen. Kein Grund, den Start abzubrechen.
    return 'system';
  }
};

/**
 * Die Wahl setzen und anwenden.
 *
 * Bei `system` wird das Attribut ENTFERNT statt auf einen Wert gesetzt: nur
 * dann greift die Medienabfrage in `index.css`. Ein `data-theme="system"`
 * waere ein dritter Wert, den kein Stilblatt kennt — die App bliebe auf dem
 * Vorgabe-Thema stehen, und der Schalter saehe aus, als taete er nichts.
 */
export const setzeThema = (t: Thema): void => {
  try {
    localStorage.setItem(SCHLUESSEL, t);
  } catch {
    /* siehe oben */
  }
  const wurzel = document.documentElement;
  if (t === 'system') wurzel.removeAttribute('data-theme');
  else wurzel.setAttribute('data-theme', t === 'hell' ? 'light' : 'dark');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(THEMA_EVENT, { detail: t }));
};

/** Beim Start einmal anwenden, was gespeichert ist. */
export const themaAnwenden = (): void => setzeThema(liesThema());

/**
 * Ist gerade HELL aktiv?
 *
 * Fuer die Stellen, die ihre Farben selbst zeichnen und deshalb kein
 * CSS-Token lesen koennen — der 2D-Plan. Gemessen wird der WIRKLICHE
 * Zustand (`data-theme` plus, wenn keines gesetzt ist, die Systemvorgabe)
 * und nicht die gespeicherte Wahl: bei `system` sagt die Wahl allein nichts.
 */
export const istHell = (): boolean => {
  if (typeof document === 'undefined') return false;
  const gesetzt = document.documentElement.getAttribute('data-theme');
  if (gesetzt === 'light') return true;
  if (gesetzt === 'dark') return false;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches === true;
};
