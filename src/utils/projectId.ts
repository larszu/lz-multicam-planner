// ───────────────────────────────────────────────────────────────────────────
// Die stabile Projekt-Id (cable-planner#908).
//
// Sie entsteht mit dem Projekt, reist in der .mcplan, in der .avplan und in
// der Kamera-Liste mit und aendert sich danach nie. Der cable-planner gleicht
// daran ab, ob eine Kamera-Liste zu einem Projekt gehoert, das er schon kennt
// — Abgleich statt Anhaengen. Der Venue-Name taugt dafuer nicht: den aendert
// man, und zwei Hallen heissen „Halle 1".
//
// `crypto.randomUUID` gibt es nur in einem sicheren Kontext (https,
// localhost). Wird die Seite ueber eine LAN-Adresse per http geoeffnet, fehlt
// sie — `getRandomValues` nicht, daraus entsteht dieselbe v4-Form.
// ───────────────────────────────────────────────────────────────────────────

export function newProjectId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Eine brauchbare Projekt-Id: Text und nicht leer. Die Form wird nicht
 *  verlangt — eine Id aus einer fremden Quelle bleibt, was sie ist. */
export const isProjectId = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Die Id einer ALTEN Datei ohne `projectId` — aus der Datei abgeleitet, nicht
 * gewuerfelt.
 *
 * Gewuerfelt bekaeme dieselbe Datei bei jedem Oeffnen eine andere Id, solange
 * niemand sie speichert. Der cable-planner hielte jede Kamera-Liste daraus
 * fuer ein fremdes Projekt und legte die Kameras jedes Mal neu an — genau das
 * Duplikat, gegen das die Id eingefuehrt wurde. `savedAt` und der Raumname
 * stehen in jeder gespeicherten Datei und aendern sich nur mit einem neuen
 * Speichern, und dann steht die Id ohnehin darin.
 */
export function legacyProjectId(project: { savedAt?: unknown; venue?: { name?: unknown } }): string {
  const quelle = `${String(project.savedAt ?? '')}\u0000${String(project.venue?.name ?? '')}`;
  // FNV-1a, zweimal 32 Bit mit verschiedenem Startwert: kein Kryptohash,
  // nur eine stabile Kennung aus derselben Eingabe.
  const fnv = (start: number) => {
    let h = start >>> 0;
    for (let i = 0; i < quelle.length; i++) {
      h ^= quelle.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return `legacy-${fnv(0x811c9dc5)}${fnv(0x01000193)}`;
}
