import type { Camera, Lens, SensorSize, VenueCamera } from '../types';
import { speedBoosterExists } from '../data/cameras';
import { getCompatibleLenses, integratedLensesFor } from '../data/lenses';
import { kontrastText } from './color';

/**
 * Sucher-Ansicht (#224): das Schild unter dem Bild und das Blaettern durch
 * die Objektive — „welches Objektiv macht welches Bild" ohne Rechnen.
 */

/** Alle Objektive, die an der aktuell montierten Aufnahme passen — dieselbe Liste wie in der Seitenleiste. */
export function kompatibleObjektive(camDef: Camera, activeMount: string | undefined, eigene: readonly Lens[], bibliothek: readonly Lens[]): Lens[] {
  const integriert = camDef.mount === 'integrated';
  const mount = activeMount ?? camDef.mount;
  const basis = integriert
    ? integratedLensesFor(camDef.id, [...eigene, ...bibliothek])
    : getCompatibleLenses(camDef.mount, camDef.adaptedMounts, activeMount);
  const extra = integriert ? [] : [...eigene, ...bibliothek].filter((l) => l.mount === mount || l.mount === 'universal');
  return [...new Map([...basis, ...extra].map((l) => [l.id, l])).values()];
}

/**
 * Das Set zum Blaettern: die Favoriten unter den passenden Objektiven, wenn
 * es mindestens zwei sind — sonst alle passenden.
 */
export function objektivSet(passend: Lens[], favoriten: string[], aktuellId?: string): Lens[] {
  const fav = passend.filter((l) => favoriten.includes(l.id) || l.id === aktuellId);
  return fav.filter((l) => favoriten.includes(l.id)).length >= 2 ? fav : passend;
}

export function blaettern(set: Lens[], aktuellId: string, richtung: 1 | -1): Lens | null {
  if (set.length === 0) return null;
  const i = set.findIndex((l) => l.id === aktuellId);
  if (i < 0) return set[richtung > 0 ? 0 : set.length - 1];
  if (set.length === 1) return null;
  return set[(i + richtung + set.length) % set.length];
}

/** Was sich an der Kamera aendert, wenn dieses Objektiv angesetzt wird. */
export function objektivWechsel(cam: VenueCamera, lens: Lens | undefined, camMount: string | undefined): Partial<VenueCamera> {
  const extenderPasst = cam.extenderActive === 1 || !!lens?.extenderFactors?.includes(cam.extenderActive);
  return {
    lensId: lens?.id ?? cam.lensId,
    focalLength: lens?.focalLengthMin ?? cam.focalLength,
    aperture: lens?.maxApertureWide ?? cam.aperture,
    extenderActive: extenderPasst ? cam.extenderActive : 1,
    useSpeedbooster: speedBoosterExists(lens?.mount, camMount) ? cam.useSpeedbooster : false,
  };
}

function mm(v: number): string {
  return `${Math.round(v * 10) / 10} mm`;
}

export interface SchildZeilen { kamera: string; objektiv: string }

/** „ARRI ALEXA 35 | Super 35 · 28.0×19.2 mm | f/2.8 | 1.5×" und „Fujinon HA22x7.8 · 24 mm". */
export function sucherZeilen(camDef: Camera, lens: Lens, sensor: SensorSize, cam: VenueCamera): SchildZeilen {
  const format = sensor.name.includes('×') ? sensor.name : `${sensor.name} · ${sensor.widthMm.toFixed(1)}×${sensor.heightMm.toFixed(1)} mm`;
  const crop = `${(Math.round(sensor.cropFactor * 100) / 100).toString()}×`;
  const kamera = [`${camDef.manufacturer} ${camDef.model}`, format, `f/${cam.aperture.toFixed(1)}`, crop].join(' | ');
  const brennweite = cam.extenderActive > 1
    ? `${mm(cam.focalLength)} × ${cam.extenderActive} = ${mm(cam.focalLength * cam.extenderActive)}`
    : mm(cam.focalLength);
  return { kamera, objektiv: `${lens.manufacturer} ${lens.model} · ${brennweite}` };
}

/** Bild mit Schild darunter, als Beleg fuer den Kunden. */
export function bildMitSchild(bild: HTMLCanvasElement, z: SchildZeilen, kennung: { nummer: number; label: string; farbe: string }): HTMLCanvasElement {
  const W = bild.width;
  const zeile = Math.max(14, Math.round(W / 70));
  const leiste = Math.round(zeile * 3.4);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = bild.height + leiste;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(bild, 0, 0);
  ctx.fillStyle = '#101216';
  ctx.fillRect(0, bild.height, W, leiste);
  const rad = leiste * 0.32;
  const mx = zeile + rad;
  const my = bild.height + leiste / 2;
  ctx.fillStyle = kennung.farbe;
  ctx.beginPath();
  ctx.arc(mx, my, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kontrastText(kennung.farbe);
  ctx.font = `700 ${Math.round(rad * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(kennung.nummer), mx, my + 1);
  const x = mx + rad + zeile;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${zeile}px sans-serif`;
  ctx.fillText(`${kennung.label} — ${z.objektiv}`, x, my - zeile * 0.7);
  ctx.fillStyle = '#c9ccd2';
  ctx.font = `${Math.round(zeile * 0.85)}px sans-serif`;
  ctx.fillText(z.kamera, x, my + zeile * 0.75);
  return out;
}
