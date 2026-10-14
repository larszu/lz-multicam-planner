// ───────────────────────────────────────────────────────────────────────────
// FINGER STATT MAUS — die Gesten der 3D-Ansicht als reine Rechnung (#137).
//
// NUTZER-MELDUNG: „Auf mobilen Endgeraeten funktioniert im 3d Mode intuitive
// ansichts Steuerung nicht."
//
// Sie funktionierte nicht, weil es sie nicht gab. Die Ansicht hing an
// `mousedown`/`mousemove`/`wheel` und an WASD. Ein Telefon hat weder Rad noch
// Tastatur, und `mousemove` kommt dort nur als Nachbildung EINES Fingers —
// Kneifen und Zweifinger-Schub fallen komplett weg. Wer die App auf dem
// Telefon oeffnete, sah also einen Raum und konnte sich nicht darin bewegen.
//
// ─── WARUM DAS HIER STEHT UND NICHT IN DER KOMPONENTE ─────────────────────
//
// Eine Geste ist ein Zustandswechsel ueber mehrere Ereignisse: zwei Finger
// herunter, beide bewegen sich, einer geht hoch — und was dann passiert,
// entscheidet ueber jeden weiteren Zug. Genau solche Ketten sind es, die in
// einer React-Komponente mit `three`-Kamera daneben niemand mehr pruefen
// kann; man testet sie dann auf dem Geraet, einmal, und nie wieder.
//
// Diese Datei kennt keine Kamera, kein `three`, kein DOM. Sie nimmt Punkte
// und gibt Deltas zurueck. `fingerNavigation.test.ts` fuehrt die Ketten
// durch, die auf dem Geraet schiefgehen: der zweite Finger, der mitten im
// Zug dazukommt; der Finger, der ohne `pointerup` verschwindet; der Zug, der
// nach dem Loslassen des zweiten Fingers weitergeht.
//
// ─── DIE BELEGUNG, UND WARUM SIE SO IST ───────────────────────────────────
//
//   EIN Finger    — umsehen (Gieren/Nicken). Das ist die Geste, die auf dem
//                   Telefon jeder zuerst probiert, und in jeder Karten- und
//                   Spiele-App bedeutet sie „Blickrichtung".
//   ZWEI Finger   — kneifen: vor/zurueck. Schieben: seitwaerts und hoch/
//                   runter. Beides GLEICHZEITIG, weil es zwei Finger auch
//                   gleichzeitig tun; ein Modus-Umschalter dazwischen waere
//                   genau die Art Bedienung, die der Nutzer „nicht intuitiv"
//                   genannt hat.
//
// Nicht belegt ist der Doppeltipp. Er waere frei, aber jede Zuweisung dafuer
// (heranfahren? zuruecksetzen?) waere geraten — und ein Griff, der etwas
// Unerwartetes tut, ist schlimmer als keiner.
// ───────────────────────────────────────────────────────────────────────────

export interface Punkt {
  id: number;
  x: number;
  y: number;
}

/** Was aus einer Bewegung folgt. Alle Werte sind Deltas seit dem letzten Zug. */
export interface Zug {
  /** Gieren in Bildschirm-Pixeln — die Komponente rechnet in Radiant um. */
  dreheX: number;
  /** Nicken in Bildschirm-Pixeln. */
  dreheY: number;
  /** Vor/zurueck, in Pixeln Fingerabstand. Positiv = Finger gehen auseinander. */
  fahre: number;
  /** Seitwaerts in Pixeln (Mittelpunkt der Finger). */
  schiebeX: number;
  /** Hoch/runter in Pixeln (Mittelpunkt der Finger). */
  schiebeY: number;
  /**
   * Fingerabstand VOR diesem Zug, in Pixeln. 0 bei weniger als zwei Fingern.
   *
   * Er steht hier, damit `kneifFaktor` seinen Bezugswert bekommt, ohne dass
   * die Komponente ihn selbst mitschreiben muss — genau diese Mitschrift
   * waere die Stelle, an der der erste Kneif-Zug ins Leere liefe.
   */
  abstandVorher: number;
}

export const KEIN_ZUG: Zug = { dreheX: 0, dreheY: 0, fahre: 0, schiebeX: 0, schiebeY: 0, abstandVorher: 0 };

const abstand = (a: Punkt, b: Punkt) => Math.hypot(a.x - b.x, a.y - b.y);
const mitte = (a: Punkt, b: Punkt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Der Geste-Zustand einer Flaeche.
 *
 * Eine Instanz je Zeichenflaeche. Sie haelt die liegenden Finger und den
 * Stand der letzten Auswertung — mehr Gedaechtnis braucht es nicht.
 */
export class FingerNavigation {
  private finger = new Map<number, Punkt>();
  private letzterAbstand = 0;
  private letzteMitte: { x: number; y: number } | null = null;

  /** Wie viele Finger gerade liegen. */
  get anzahl(): number {
    return this.finger.size;
  }

  runter(p: Punkt): void {
    this.finger.set(p.id, { ...p });
    this.neuVermessen();
  }

  /**
   * Ein Finger bewegt sich.
   *
   * Ein Finger, den wir nicht kennen (weil `runter` verlorenging — das
   * passiert, wenn die Beruehrung ausserhalb der Flaeche begann), wird
   * AUFGENOMMEN statt ignoriert, und dieser eine Zug ist leer. Ihn zu
   * ignorieren hiesse: die Ansicht reagiert nicht, und der Nutzer legt den
   * Finger noch einmal auf. Ihn ohne Vorgaenger zu verrechnen hiesse: die
   * Ansicht springt um die halbe Bildschirmbreite.
   */
  bewegt(p: Punkt): Zug {
    const vorher = this.finger.get(p.id);
    this.finger.set(p.id, { ...p });
    if (!vorher) {
      this.neuVermessen();
      return KEIN_ZUG;
    }

    if (this.finger.size === 1) {
      return { ...KEIN_ZUG, dreheX: p.x - vorher.x, dreheY: p.y - vorher.y };
    }

    // Zwei und mehr: gemessen wird an den ERSTEN BEIDEN. Ein dritter Finger
    // auf der Flaeche ist im Betrieb fast immer der Handballen — ihn in den
    // Mittelpunkt einzurechnen liesse das Bild wegdriften, obwohl sich die
    // fuehrenden Finger gar nicht bewegt haben.
    const [a, b] = [...this.finger.values()];
    const jetztAbstand = abstand(a, b);
    const jetztMitte = mitte(a, b);
    const zug: Zug = {
      dreheX: 0,
      dreheY: 0,
      fahre: this.letzterAbstand === 0 ? 0 : jetztAbstand - this.letzterAbstand,
      schiebeX: this.letzteMitte ? jetztMitte.x - this.letzteMitte.x : 0,
      schiebeY: this.letzteMitte ? jetztMitte.y - this.letzteMitte.y : 0,
      abstandVorher: this.letzterAbstand,
    };
    this.letzterAbstand = jetztAbstand;
    this.letzteMitte = jetztMitte;
    return zug;
  }

  /**
   * Ein Finger geht hoch — oder wird vom Browser abgebrochen
   * (`pointercancel`, ein Anruf, eine Geste des Systems).
   *
   * Danach wird neu vermessen: sonst nimmt der verbliebene Finger den
   * Zweifinger-Abstand von vorhin als Ausgangswert und die Ansicht springt
   * beim naechsten Pixel Bewegung.
   */
  hoch(id: number): void {
    this.finger.delete(id);
    this.neuVermessen();
  }

  /** Alles vergessen — etwa beim Verlassen der Ansicht. */
  leeren(): void {
    this.finger.clear();
    this.neuVermessen();
  }

  private neuVermessen(): void {
    if (this.finger.size >= 2) {
      const [a, b] = [...this.finger.values()];
      this.letzterAbstand = abstand(a, b);
      this.letzteMitte = mitte(a, b);
    } else {
      this.letzterAbstand = 0;
      this.letzteMitte = null;
    }
  }
}

/**
 * Kneifen als FAKTOR statt als Pixelzahl.
 *
 * Fuer eine Brennweite oder einen Abstand ist „mal 1,3" die richtige Form und
 * „plus 40" die falsche: 40 mm sind bei einem Weitwinkel eine andere Welt und
 * bei einem 600er nichts. Der Bezugswert ist der Fingerabstand VOR dem Zug,
 * nicht die Bildschirmbreite — sonst haengt dieselbe Geste an der
 * Geraetegroesse.
 */
export function kneifFaktor(abstandVorher: number, fahre: number): number {
  if (abstandVorher <= 1) return 1;
  const neu = abstandVorher + fahre;
  if (neu <= 1) return 1;
  return neu / abstandVorher;
}

/** Radiant je Bildschirm-Pixel fuer Umsehen — Maus und Finger gleich. */
export const UMSEHEN_RAD_JE_PX = 0.002;

/**
 * Ziehen → Drehung der Ansicht (#174).
 *
 * Der Inhalt folgt der Hand, wie in jedem 3D- und Kartenprogramm: nach rechts
 * ziehen dreht die Ansicht nach links, damit das Bild nach rechts wandert;
 * nach oben ziehen neigt den Blick nach unten. Vorher war es die
 * Ego-Shooter-Belegung (Maus = Blickrichtung) — gemeldet als „falsch herum".
 *
 * `dYaw` positiv = nach links drehen (three.js: rotation.y waechst gegen den
 * Uhrzeigersinn von oben), `dPitch` positiv = nach oben neigen.
 */
export function umsehen(dx: number, dy: number): { dYaw: number; dPitch: number } {
  return { dYaw: dx * UMSEHEN_RAD_JE_PX, dPitch: dy * UMSEHEN_RAD_JE_PX };
}
