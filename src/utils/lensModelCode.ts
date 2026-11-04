/**
 * Modellcodes von Broadcast-Zooms (#241): „HA22x7.8BERM", „CJ20ex7.8B",
 * „XA20sx8.5BRM". Die Zahl vor dem `x` ist der Zoomfaktor, die Zahl danach
 * die kurze Brennweite; die lange ist ihr Produkt. Mehr liest diese Funktion
 * nicht heraus — Lichtstaerke und Extender stehen nur im Datenblatt.
 */
export interface LensModelCode {
  zoomRatio: number;
  wideMm: number;
  /** Zoomfaktor mal kurze Brennweite; das Datenblatt rundet oft anders. */
  teleMm: number;
}

const CODE = /(?:^|[\s/])[A-Z]{1,4}(\d{1,3}(?:\.\d)?)[a-z]{0,2}x(\d{1,3}(?:\.\d{1,2})?)(?=[A-Z]|\b|$)/;

export function parseLensModelCode(model: string): LensModelCode | null {
  const m = CODE.exec(model.trim());
  if (!m) return null;
  const zoomRatio = Number(m[1]);
  const wideMm = Number(m[2]);
  if (!(zoomRatio > 1) || !(wideMm > 0)) return null;
  return { zoomRatio, wideMm, teleMm: Math.round(zoomRatio * wideMm * 10) / 10 };
}
