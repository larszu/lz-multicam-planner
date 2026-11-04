// Gegenlicht-Warnung (#234): schaut eine Kamera direkt in eine Leuchte?
//
// Zwei Bedingungen, beide noetig. Die Leuchte steht im Bild der Kamera, UND
// die Kamera steht im Lichtkegel der Leuchte (innerhalb des Feldwinkels).
// Eine Leuchte im Bild, die von der Kamera weg strahlt, blendet nicht; ein
// Kegel, der die Kamera trifft, waehrend die Leuchte hinter ihr haengt, auch
// nicht. Erst beides zusammen ist der Lens-Flare, den man in der Probe findet.
//
// REIN: keine Uhr, kein Store, kein IO.
import type { ForeignFixture } from './foreignView';

const DEG = Math.PI / 180;

export interface GegenlichtKamera {
  x: number;
  y: number;
  z: number;
  pan: number;
  tilt: number;
  hFovDeg: number;
  vFovDeg: number;
}

export interface Gegenlicht {
  fixtureId: string;
  name?: string;
  /** Wie weit die Leuchte von der Bildmitte entfernt steht (Grad). */
  abseitsDeg: number;
  /** Wie weit die Kamera neben der Strahlachse steht (Grad). */
  imStrahlDeg: number;
}

type V = [number, number, number];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Strahlachse in Plan-Koordinaten (x, y, Hoehe): auf den Zielpunkt am Boden, ohne Ziel senkrecht nach unten. */
function strahlAchse(f: ForeignFixture): V {
  if (f.aimX === undefined || f.aimY === undefined) return [0, 0, -1];
  const a: V = [f.aimX - f.x, f.aimY - f.y, -f.z];
  return Math.hypot(a[0], a[1], a[2]) < 1e-6 ? [0, 0, -1] : norm(a);
}

export function gegenlichtFuer(cam: GegenlichtKamera, fixtures: readonly ForeignFixture[]): Gegenlicht[] {
  const p = cam.pan * DEG;
  const t = cam.tilt * DEG;
  const vor: V = [Math.cos(t) * Math.cos(p), Math.cos(t) * Math.sin(p), Math.sin(t)];
  const rechts: V = [-Math.sin(p), Math.cos(p), 0];
  const hoch: V = [-Math.sin(t) * Math.cos(p), -Math.sin(t) * Math.sin(p), Math.cos(t)];
  const out: Gegenlicht[] = [];
  for (const f of fixtures) {
    if (f.hidden || f.dimming === 0) continue;
    const v: V = [f.x - cam.x, f.y - cam.y, f.z - cam.z];
    const tiefe = dot(v, vor);
    if (tiefe <= 0.01) continue;
    const seitlich = Math.atan(Math.abs(dot(v, rechts)) / tiefe) / DEG;
    const senkrecht = Math.atan(Math.abs(dot(v, hoch)) / tiefe) / DEG;
    if (seitlich > cam.hFovDeg / 2 || senkrecht > cam.vFovDeg / 2) continue;
    const zurKamera = norm([-v[0], -v[1], -v[2]]);
    const imStrahlDeg = Math.acos(Math.max(-1, Math.min(1, dot(strahlAchse(f), zurKamera)))) / DEG;
    if (imStrahlDeg > f.fieldDeg / 2) continue;
    out.push({ fixtureId: f.id, name: f.name, abseitsDeg: Math.acos(Math.min(1, tiefe / Math.hypot(v[0], v[1], v[2]))) / DEG, imStrahlDeg });
  }
  return out.sort((a, b) => a.imStrahlDeg - b.imStrahlDeg);
}
