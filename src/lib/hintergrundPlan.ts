// Geladener Plan → `BackgroundPlan`; ohne pdf.js, damit es testbar bleibt.
import type { GeladenerPlan, VektorZeichnung } from '../avplan/floorplan';
import type { BackgroundPlan } from '../types';

/** Geladener Plan → MultiCams `BackgroundPlan`. Der Plan bekommt die Breite
 *  des Venues; Meter je Pixel gilt fuer beide Achsen gleich, bis jemand
 *  kalibriert. */
export function alsHintergrundPlan(plan: GeladenerPlan, venueBreiteM: number, planBreiteM?: number): BackgroundPlan {
  const s = (planBreiteM && planBreiteM > 0 ? planBreiteM : venueBreiteM) / plan.naturalWidth;
  return {
    dataUrl: plan.src,
    scaleX: s,
    scaleY: s,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.3,
    widthPx: plan.naturalWidth,
    heightPx: plan.naturalHeight,
  };
}

/** Breite einer DXF in Metern, wenn ihre Einheit ($INSUNITS) bekannt ist. */
export function dxfMeterBreite(z: VektorZeichnung): number | undefined {
  return z.meterJeEinheit ? z.breite * z.meterJeEinheit : undefined;
}

