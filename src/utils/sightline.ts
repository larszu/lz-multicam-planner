// ───────────────────────────────────────────────────────────────────────────
// Bedarf 12 (P1) — Sichtlinien-Konflikte zwischen Kamerastandort und Aufbau.
//
// DER BEFUND ist eine Liste von Dingen, die erst in der Probe auffallen:
//
//   > the lectern blocking the camera line, the confidence monitor sitting in
//   > the wrong place, … truss or speaker stack across the sightline
//
// Und die Kosten stehen daneben: „Conflicts are discovered in rehearsal",
// „days-per-project". Der Bedarf nennt auch die Loesung und ihren Preis:
// „Cheap geometry, prevents a re-rig."
//
// ─── WARUM DIE HOEHE MITGERECHNET WIRD ─────────────────────────────────────
//
// Eine reine 2D-Pruefung — schneidet die Linie das Objekt? — meldet auf jedem
// realen Plan ein Dutzend Treffer und ist damit wertlos: eine 1 m hohe
// Balustrade steht in fast jeder Linie und blockiert fast keine. Eine Kamera
// auf 2 m, die auf ein Motiv in 1,7 m schaut, sieht ueber sie hinweg.
//
// Geprueft wird deshalb dreidimensional: an der Stelle, an der die Linie das
// Hindernis waagerecht kreuzt, wird ihre HOEHE ausgerechnet und gegen die
// Hoehe des Hindernisses gehalten. Gemeldet wird nur, was wirklich davor
// steht — mit der Tiefe, um die es hineinragt.
//
// ─── WAS BEWUSST NICHT GEPRUEFT WIRD ───────────────────────────────────────
//
// „camera position in the audience's way" aus demselben Befund. Dieser Planer
// kennt keinen Zuschauerblock als Objekt — Stuhlreihen sind hier nichts. Eine
// Pruefung darauf muesste raten, wo Publikum sitzt, und wuerde entweder immer
// oder nie anschlagen. Wer den Zuschauerblock als Objekttyp ergaenzt, findet
// hier die Stelle.
//
// REIN: keine Uhr, kein Store, kein IO.
// ───────────────────────────────────────────────────────────────────────────
import type { ReferencePerson, Stage, VenueCamera, Wall } from '../types';
import { defaultWallHeight, resolveWallHeights } from './wallHeight';
import { effectiveCameraPos } from './camera';

/** Ein Punkt im Raum (Meter). */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Worauf die Kamera zielt.
 *
 * `focusDistance` ist die Entfernung zum Motiv ENTLANG DER OPTISCHEN ACHSE und
 * nicht die Grundriss-Strecke — deshalb `cos`/`sin` auf den Tilt und nicht die
 * Distanz direkt als waagerechten Weg. Bei -30° Tilt sind das 13 % Unterschied
 * im Grundriss; das entscheidet, ob das Pult noch in der Linie liegt.
 *
 * Der Standort kommt aus `effectiveCameraPos`: eine Kamera auf Dolly oder Kran
 * steht dort, wo sie GEFAHREN ist, nicht dort, wo sie geparkt wurde.
 */
export const aimPoint = (cam: VenueCamera): { from: Point3; to: Point3 } => {
  const pos = effectiveCameraPos(cam);
  const panRad = (cam.pan * Math.PI) / 180;
  const tiltRad = (cam.tilt * Math.PI) / 180;
  const lauf = cam.focusDistance * Math.cos(tiltRad);
  return {
    from: { x: pos.x, y: pos.y, z: cam.z },
    to: {
      x: pos.x + Math.cos(panRad) * lauf,
      y: pos.y + Math.sin(panRad) * lauf,
      z: cam.z + cam.focusDistance * Math.sin(tiltRad),
    },
  };
};

export type ObstacleKind = 'wall' | 'object' | 'stage';

export interface SightlineConflict {
  cameraId: string;
  cameraLabel: string;
  kind: ObstacleKind;
  obstacleId: string;
  obstacleLabel: string;
  /** Wie tief das Hindernis in die Linie ragt (Meter, > 0). */
  intrusionM: number;
  /** Wie weit vor der Kamera es steht (Meter entlang der Linie). */
  atDistanceM: number;
}

/** Hoehe der Sichtlinie an der Stelle `t` (0 = Kamera, 1 = Motiv). */
const hoeheBei = (a: Point3, b: Point3, t: number): number => a.z + (b.z - a.z) * t;

/**
 * Schnitt zweier Strecken im Grundriss. Liefert `t` auf der ERSTEN Strecke
 * oder `null`. Parallele und beruehrende Faelle gelten als kein Schnitt: eine
 * Wand genau IN der Sichtlinie ist ein entarteter Fall, und ihn als Konflikt
 * zu melden hiesse, aus einer Unbestimmtheit eine Behauptung zu machen.
 */
const streckenSchnitt = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number | null => {
  const rx = bx - ax, ry = by - ay;
  const sx = dx - cx, sy = dy - cy;
  const nenner = rx * sy - ry * sx;
  if (Math.abs(nenner) < 1e-9) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / nenner;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / nenner;
  if (t <= 0 || t >= 1 || u < 0 || u > 1) return null;
  return t;
};

/**
 * Naechster Punkt der Strecke A→B zum Punkt P, als Parameter `t` in [0,1]
 * plus Abstand. Fuer runde Hindernisse (Objekte mit Standflaeche).
 */
const naechsterPunkt = (
  ax: number, ay: number, bx: number, by: number, px: number, py: number,
): { t: number; abstand: number } => {
  const rx = bx - ax, ry = by - ay;
  const len2 = rx * rx + ry * ry;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * rx + (py - ay) * ry) / len2));
  return { t, abstand: Math.hypot(ax + rx * t - px, ay + ry * t - py) };
};

/** Liegt der Punkt in der Grundflaeche des Podests? */
const imPodest = (s: Stage, x: number, y: number): boolean =>
  x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height;

export interface SightlineInput {
  cameras: VenueCamera[];
  walls: Wall[];
  persons: ReferencePerson[];
  stages: Stage[];
  /** Standard height for walls without their own (#198). */
  defaultWallHeightM?: number;
}

/**
 * Alle Sichtlinien-Konflikte im Plan.
 *
 * Sortiert nach Kamera und dann nach Entfernung: das naechste Hindernis ist
 * das, das man zuerst wegraeumt.
 */
export const sightlineConflicts = (input: SightlineInput): SightlineConflict[] => {
  const out: SightlineConflict[] = [];

  for (const cam of input.cameras) {
    const { from, to } = aimPoint(cam);
    const laenge = Math.hypot(to.x - from.x, to.y - from.y);
    if (laenge < 1e-6) continue; // Kamera schaut senkrecht — keine Grundriss-Linie.

    // ── Waende ──
    for (const w of resolveWallHeights(input.walls, defaultWallHeight({ defaultWallHeightM: input.defaultWallHeightM }))) {
      const t = streckenSchnitt(from.x, from.y, to.x, to.y, w.x1, w.y1, w.x2, w.y2);
      if (t === null) continue;
      const linie = hoeheBei(from, to, t);
      if (linie >= w.height) continue; // Die Linie geht darueber weg.
      out.push({
        cameraId: cam.id,
        cameraLabel: cam.label,
        kind: 'wall',
        obstacleId: w.id,
        obstacleLabel: w.label,
        intrusionM: Number((w.height - linie).toFixed(2)),
        atDistanceM: Number((laenge * t).toFixed(2)),
      });
    }

    // ── Buehnenobjekte (Pult, Mikrofonstaender, Drums, Personen …) ──
    //
    // Als KREIS mit `width` als Durchmesser genaehert. Der Planer fuehrt nur
    // eine Breite und keine Tiefe; ein Rechteck bekaeme seine zweite Kante
    // frei erfunden, und eine Drehung dazu. Der Kreis nimmt genau das, was im
    // Datensatz steht.
    for (const p of input.persons) {
      const radius = p.width / 2;
      if (radius <= 0) continue;
      const { t, abstand } = naechsterPunkt(from.x, from.y, to.x, to.y, p.x, p.y);
      if (abstand >= radius) continue;
      // Das Motiv selbst ist kein Hindernis: was am Ende der Linie steht, ist
      // das, worauf die Kamera schaut.
      if (t > 0.98) continue;
      if (t <= 0) continue;
      const linie = hoeheBei(from, to, t);
      if (linie >= p.height) continue;
      out.push({
        cameraId: cam.id,
        cameraLabel: cam.label,
        kind: 'object',
        obstacleId: p.id,
        obstacleLabel: p.label,
        intrusionM: Number((p.height - linie).toFixed(2)),
        atDistanceM: Number((laenge * t).toFixed(2)),
      });
    }

    // ── Podeste ──
    //
    // Nur ERHOEHTE Podeste sind Hindernisse; eine Flaeche auf dem Boden steht
    // in keiner Linie. Und das Podest, auf dem die Kamera SELBST steht, ist
    // ihr Boden und nicht ihr Hindernis — ohne diese Ausnahme meldete jede
    // Kamera auf einem Riser sich selbst.
    for (const s of input.stages) {
      const hoehe = s.elevationM ?? 0;
      if (hoehe <= 0) continue;
      if (imPodest(s, from.x, from.y)) continue;
      const kanten: [number, number, number, number][] = [
        [s.x, s.y, s.x + s.width, s.y],
        [s.x + s.width, s.y, s.x + s.width, s.y + s.height],
        [s.x + s.width, s.y + s.height, s.x, s.y + s.height],
        [s.x, s.y + s.height, s.x, s.y],
      ];
      let naechstes: number | null = null;
      for (const [cx, cy, dx, dy] of kanten) {
        const t = streckenSchnitt(from.x, from.y, to.x, to.y, cx, cy, dx, dy);
        if (t !== null && (naechstes === null || t < naechstes)) naechstes = t;
      }
      if (naechstes === null) continue;
      const linie = hoeheBei(from, to, naechstes);
      if (linie >= hoehe) continue;
      out.push({
        cameraId: cam.id,
        cameraLabel: cam.label,
        kind: 'stage',
        obstacleId: s.id,
        obstacleLabel: s.label,
        intrusionM: Number((hoehe - linie).toFixed(2)),
        atDistanceM: Number((laenge * naechstes).toFixed(2)),
      });
    }
  }

  return out.sort(
    (a, b) =>
      a.cameraLabel.localeCompare(b.cameraLabel, 'de') ||
      a.atDistanceM - b.atDistanceM ||
      a.obstacleId.localeCompare(b.obstacleId),
  );
};

/** Konflikte einer einzelnen Kamera. */
export const conflictsForCamera = (input: SightlineInput, cameraId: string): SightlineConflict[] =>
  sightlineConflicts({ ...input, cameras: input.cameras.filter((c) => c.id === cameraId) });

const ART: Record<ObstacleKind, string> = {
  wall: 'Wand',
  object: 'Objekt',
  stage: 'Podest',
};

/** Klartext eines Konflikts. Kanonisches Deutsch — er landet auch auf Blaettern. */
export const conflictText = (c: SightlineConflict): string =>
  `${ART[c.kind]} „${c.obstacleLabel}" steht ${c.atDistanceM} m vor ${c.cameraLabel} und ragt ${c.intrusionM} m in die Sichtlinie`;
