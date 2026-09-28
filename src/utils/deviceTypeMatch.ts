// ───────────────────────────────────────────────────────────────────────────
// Welche MultiCam-Kamera ist welches Geraet im cable-planner-Katalog? (#145)
//
// ADR-002: nicht raten. Ein Treffer zaehlt nur, wenn Hersteller UND Modell
// nach der Normalisierung woertlich gleich sind und genau EIN Katalog-Eintrag
// passt. „PXW-FS7 II" ist nicht „PXW-FS7 Mk II", „Pocket Cinema 4K" nicht
// „Pocket Cinema Camera 4K" — auch wenn ein Mensch beides sofort gleichsetzt.
// Eine falsch gesetzte GUID ist schlimmer als keine: der cable-planner loest
// sie AUTORITATIV auf Ports auf und fragt nicht mehr nach.
//
// Die Normalisierung gleicht nur Schreibweise aus, keine Bedeutung: Gross/
// klein, Leerraum und Bindestriche (auch die typografischen). „PXW-Z280",
// „pxw z280" und „PXW‑Z280" sind dasselbe Modell; „Z280" ist es nicht.
// ───────────────────────────────────────────────────────────────────────────
import { CABLE_CAMERA_IDS, type CableCameraIdentity } from '../data/cableCameraCatalogIds';

export const normaliseIdentity = (s: string): string =>
  s.toLowerCase().replace(/[\s\-‐-―]+/g, ' ').trim();

/** Der eine Katalog-Eintrag mit genau diesem Hersteller und Modell — oder
 *  `undefined`, wenn keiner oder mehr als einer passt. */
export function uniqueCatalogMatch(
  manufacturer: string,
  model: string,
  catalog: readonly CableCameraIdentity[] = CABLE_CAMERA_IDS,
): CableCameraIdentity | undefined {
  const m = normaliseIdentity(manufacturer);
  const mo = normaliseIdentity(model);
  if (!m || !mo) return undefined;
  const treffer = catalog.filter(
    (e) =>
      e.manufacturer !== undefined && e.model !== undefined &&
      normaliseIdentity(e.manufacturer) === m && normaliseIdentity(e.model) === mo,
  );
  return treffer.length === 1 ? treffer[0] : undefined;
}
