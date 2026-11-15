// Mehrfachauswahl, Zwischenablage und Sitzplaetze im Plan (#250).
//
// Rein: die Store-Aktionen und der 2D-Plan rufen nur hier hinein, damit
// Auswahl, Kopieren und Hinsetzen ohne Oberflaeche pruefbar sind.
import type { ReferencePerson, VenueCamera } from '../types';
import { SITZFLAECHE_M } from './personGestalt';

export interface Auswahl {
  cameraIds: string[];
  personIds: string[];
}

export type AuswahlArt = 'camera' | 'person';

export const leereAuswahl = (): Auswahl => ({ cameraIds: [], personIds: [] });

export const auswahlGroesse = (a: Auswahl) => a.cameraIds.length + a.personIds.length;

export const istAusgewaehlt = (a: Auswahl, art: AuswahlArt, id: string) =>
  (art === 'camera' ? a.cameraIds : a.personIds).includes(id);

/** Nimmt ein Objekt in die Auswahl auf oder heraus (Shift/Cmd-Klick). */
export function umschalten(a: Auswahl, art: AuswahlArt, id: string): Auswahl {
  const liste = art === 'camera' ? a.cameraIds : a.personIds;
  const neu = liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
  return art === 'camera' ? { ...a, cameraIds: neu } : { ...a, personIds: neu };
}

export const vereinige = (a: Auswahl, b: Auswahl): Auswahl => ({
  cameraIds: [...new Set([...a.cameraIds, ...b.cameraIds])],
  personIds: [...new Set([...a.personIds, ...b.personIds])],
});

/** Nur, was es noch gibt — nach Rueckgaengig oder Loeschen von anderswo. */
export function bereinigt(a: Auswahl, cameras: { id: string }[], persons: { id: string }[]): Auswahl {
  const c = new Set(cameras.map((x) => x.id));
  const p = new Set(persons.map((x) => x.id));
  return { cameraIds: a.cameraIds.filter((id) => c.has(id)), personIds: a.personIds.filter((id) => p.has(id)) };
}

export interface Rahmen {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rahmenAus(a: { x: number; y: number }, b: { x: number; y: number }): Rahmen {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

const drin = (r: Rahmen, x: number, y: number) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;

/** Alles, was im aufgezogenen Rahmen liegt (Plan-Meter). */
export function imRahmen(
  r: Rahmen,
  cameras: { id: string; x: number; y: number }[],
  persons: { id: string; x: number; y: number }[],
): Auswahl {
  return {
    cameraIds: cameras.filter((c) => drin(r, c.x, c.y)).map((c) => c.id),
    personIds: persons.filter((p) => drin(r, p.x, p.y)).map((p) => p.id),
  };
}

export interface Zwischenablage {
  cameras: VenueCamera[];
  persons: ReferencePerson[];
}

export function kopiere(a: Auswahl, cameras: VenueCamera[], persons: ReferencePerson[]): Zwischenablage {
  const klon = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    cameras: cameras.filter((c) => a.cameraIds.includes(c.id)).map(klon),
    persons: persons.filter((p) => a.personIds.includes(p.id)).map(klon),
  };
}

/** Versatz je Einfuegen; jedes weitere Einfuegen rueckt eine Stufe weiter. */
export const EINFUEGE_VERSATZ_M = 1;

export interface EinfuegeKontext {
  camId: () => string;
  personId: () => string;
  /** Wie oft schon eingefuegt wurde, 1 beim ersten Mal. */
  stufe: number;
  breiteM: number;
  tiefeM: number;
  /** Anzahl Kameras im Plan — fuer Name und Farbe der neuen. */
  kameraZahl: number;
  farben: readonly string[];
  /** Namen der Objekte, die schon im Plan stehen — die Kopie bekommt die naechste freie Nummer (#269). */
  vorhandeneNamen?: readonly string[];
}

/**
 * Name fuer die Kopie eines Objekts (#269): „Chair 3" wird zu „Chair n+1",
 * wobei n die hoechste Nummer mit demselben Vorsatz im Plan ist. Ein Name
 * ohne Nummer am Ende bekommt „ 2", „ 3" … angehaengt.
 */
export function naechsterName(label: string, vorhandene: readonly string[]): string {
  const m = /^(.*?)\s*(\d+)$/.exec(label.trim());
  const vorsatz = (m ? m[1] : label.trim()).trim();
  const muster = new RegExp(`^${vorsatz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+)$`);
  let hoechste = m ? Number(m[2]) : 1;
  for (const n of vorhandene) {
    const t = muster.exec(n.trim());
    if (t) hoechste = Math.max(hoechste, Number(t[1]));
  }
  return vorsatz ? `${vorsatz} ${hoechste + 1}` : String(hoechste + 1);
}

export type AusrichtArt = 'links' | 'mitteH' | 'rechts' | 'oben' | 'mitteV' | 'unten' | 'verteilenH' | 'verteilenV';

/**
 * Neue Positionen fuer mehrere markierte Objekte (#269): an einer Kante oder
 * der Mitte ausrichten, oder gleichmaessig zwischen den aeussersten verteilen.
 * Zurueck kommen nur die Ids, deren Lage sich aendert.
 */
export function ausrichten<T extends { id: string; x: number; y: number }>(
  objekte: readonly T[],
  art: AusrichtArt,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (objekte.length < 2) return out;
  const xs = objekte.map((o) => o.x);
  const ys = objekte.map((o) => o.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const setze = (o: T, x: number, y: number) => {
    if (Math.abs(x - o.x) > 1e-9 || Math.abs(y - o.y) > 1e-9) out[o.id] = { x, y };
  };
  if (art === 'verteilenH' || art === 'verteilenV') {
    const h = art === 'verteilenH';
    const sortiert = [...objekte].sort((a, b) => (h ? a.x - b.x : a.y - b.y));
    const start = h ? minX : minY;
    const schritt = ((h ? maxX : maxY) - start) / (sortiert.length - 1);
    sortiert.forEach((o, i) => setze(o, h ? start + i * schritt : o.x, h ? o.y : start + i * schritt));
    return out;
  }
  for (const o of objekte) {
    if (art === 'links') setze(o, minX, o.y);
    else if (art === 'rechts') setze(o, maxX, o.y);
    else if (art === 'mitteH') setze(o, (minX + maxX) / 2, o.y);
    else if (art === 'oben') setze(o, o.x, minY);
    else if (art === 'unten') setze(o, o.x, maxY);
    else setze(o, o.x, (minY + maxY) / 2);
  }
  return out;
}

/**
 * Eine Kopie der Zwischenablage mit frischen Ids, um `stufe` Meter versetzt.
 * Kameras heissen wie neu angelegte (`CAM n`), damit die Nummer zur Bridge
 * passt; Sperre, Bridge-Kamera, Mischereingang und Geraete-Identitaet gehoeren
 * dem Original und gehen nicht mit. Verweise innerhalb der Kopie (Fokus auf
 * eine mitkopierte Person, Sitz auf einem mitkopierten Stuhl) zeigen auf die
 * Kopien.
 */
export function einfuegen(clip: Zwischenablage, k: EinfuegeKontext): { cameras: VenueCamera[]; persons: ReferencePerson[] } {
  const d = EINFUEGE_VERSATZ_M * k.stufe;
  const x = (v: number) => Math.max(0, Math.min(k.breiteM, v + d));
  const y = (v: number) => Math.max(0, Math.min(k.tiefeM, v + d));
  const neueId = new Map(clip.persons.map((p) => [p.id, k.personId()]));
  const cameras = clip.cameras.map((c, i): VenueCamera => {
    const n = k.kameraZahl + i;
    const { bridgeCameraNumber: _b, mixerInput: _m, source: _s, lastSourceIndex: _l, ...rest } = c;
    const fokus = c.lockedPersonId ? neueId.get(c.lockedPersonId) : undefined;
    return {
      ...rest,
      id: k.camId(),
      label: `CAM ${n + 1}`,
      color: k.farben[n % k.farben.length],
      x: x(c.x),
      y: y(c.y),
      locked: false,
      ...(fokus ? { lockedPersonId: fokus } : {}),
    };
  });
  const vergeben = [...(k.vorhandeneNamen ?? [])];
  const persons = clip.persons.map((p) => {
    const stuhl = p.seatedOn ? neueId.get(p.seatedOn) : undefined;
    const label = naechsterName(p.label, vergeben);
    vergeben.push(label);
    const kopie: ReferencePerson = { ...p, id: neueId.get(p.id)!, label, x: x(p.x), y: y(p.y), locked: false };
    if (stuhl) kopie.seatedOn = stuhl;
    else delete kopie.seatedOn;
    return kopie;
  });
  return { cameras, persons };
}

// ── Sitzplaetze ─────────────────────────────────────────────────────────────

/** Typen, die sich auf einen Stuhl setzen lassen. */
export const SITZT_AUF_STUHL = new Set<ReferencePerson['objectType']>(['person', 'sitting-person']);

/** Wie nah eine Person am Stuhl abgelegt werden muss, um sich zu setzen. */
export const SITZ_FANG_M = 0.6;

/** Blickrichtung eines Stuhls ohne eigene Angabe: zur Plan-Unterkante (+y). */
export const STUHL_BLICK_DEG = 90;

/** Hoehe der Sitzflaeche eines Stuhls — die Haelfte seiner Gesamthoehe. */
export const sitzhoeheVon = (stuhl: Pick<ReferencePerson, 'height'>) => Math.round(stuhl.height * 0.5 * 100) / 100;

/** Hoehe einer sitzenden Person, deren Sitzflaeche bei `sitz` liegt (Norm 1,3 m bei 0,45 m). */
export const sitzendeHoehe = (sitz: number) => Math.round((1.3 * sitz) / SITZFLAECHE_M * 100) / 100;

export const blickVon = (p: Pick<ReferencePerson, 'facingDeg'>) => p.facingDeg ?? STUHL_BLICK_DEG;

/** Der freie Stuhl, auf den `person` an (x, y) faellt — oder null. */
export function stuhlBei(person: Pick<ReferencePerson, 'id' | 'objectType'>, x: number, y: number, persons: ReferencePerson[]): ReferencePerson | null {
  if (!SITZT_AUF_STUHL.has(person.objectType)) return null;
  let best: ReferencePerson | null = null;
  let bestD = Infinity;
  for (const s of persons) {
    if (s.objectType !== 'chair' || s.id === person.id) continue;
    if (besetzt(s.id, persons, person.id)) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= Math.max(SITZ_FANG_M, s.width) && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

const besetzt = (stuhlId: string, persons: ReferencePerson[], ausser?: string) =>
  persons.some((o) => o.id !== ausser && o.seatedOn === stuhlId);

/** Der erste Stuhl, auf dem noch niemand sitzt. */
export const freierStuhl = (persons: ReferencePerson[]): ReferencePerson | null =>
  persons.find((s) => s.objectType === 'chair' && !besetzt(s.id, persons)) ?? null;

/** Was sich an der Person aendert, wenn sie sich auf `stuhl` setzt. */
export function hinsetzen(stuhl: ReferencePerson): Partial<ReferencePerson> {
  const sitz = sitzhoeheVon(stuhl);
  return {
    x: stuhl.x,
    y: stuhl.y,
    objectType: 'sitting-person',
    height: sitzendeHoehe(sitz),
    seatedOn: stuhl.id,
    seatHeight: sitz,
    facingDeg: blickVon(stuhl),
  };
}

/** Steht die Person auf, faellt der Bezug zum Stuhl weg; sie blickt wieder zu den Kameras. */
export const aufstehen = (): Partial<ReferencePerson> => ({ seatedOn: undefined, seatHeight: undefined, facingDeg: undefined });

/**
 * Wohin eine Person kommt, die auf (x, y) abgelegt wird: auf einen freien
 * Stuhl in der Naehe, oder — war sie auf einem und ist weg — wieder stehend
 * frei im Raum.
 */
export function ablegen(person: ReferencePerson, x: number, y: number, persons: ReferencePerson[]): Partial<ReferencePerson> {
  const stuhl = stuhlBei(person, x, y, persons);
  if (stuhl) return hinsetzen(stuhl);
  return person.seatedOn ? { x, y, ...aufstehen() } : { x, y };
}

/**
 * Personen, die auf einem bewegten oder gedrehten Stuhl sitzen, gehen mit.
 * `alt` ist der Stuhl vorher, `neu` nachher.
 */
export function sitzendeFolgen(persons: ReferencePerson[], alt: ReferencePerson, neu: ReferencePerson): ReferencePerson[] {
  if (alt.objectType !== 'chair') return persons;
  const dx = neu.x - alt.x;
  const dy = neu.y - alt.y;
  const blick = blickVon(neu);
  const sitz = sitzhoeheVon(neu);
  let geaendert = false;
  const out = persons.map((p) => {
    if (p.seatedOn !== alt.id || p.id === alt.id) return p;
    geaendert = true;
    return { ...p, x: p.x + dx, y: p.y + dy, facingDeg: blick, seatHeight: sitz, height: sitzendeHoehe(sitz) };
  });
  return geaendert ? out : persons;
}
