/**
 * Kleine Farbhelfer fuers Zeichnen auf Canvas.
 *
 * Der Preview-Tab haengt Deckkraft bisher als Hex-Suffix an Farbstrings
 * (`'#3b82f6' + 'cc'`). Damit das nicht an jeder Stelle neu von Hand passiert
 * — und damit ein Podest ohne Licht-Modell trotzdem als Koerper lesbar wird —
 * liegen die beiden Rechnungen hier.
 */

/** '#abc' → '#aabbcc'. Unbekannte Formate kommen unveraendert zurueck. */
function expandHex(hex: string): string {
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

/**
 * Farbe abdunkeln (factor < 1) oder aufhellen (factor > 1).
 * Nicht-Hex-Farben bleiben unveraendert, statt zu `#NaNNaNNaN` zu werden.
 */
export function shadeHex(hex: string, factor: number): string {
  const full = expandHex(hex);
  if (!/^#[0-9a-f]{6}$/i.test(full)) return hex;
  const f = Number.isFinite(factor) ? Math.max(0, factor) : 1;
  const channel = (offset: number) => {
    const v = parseInt(full.slice(offset, offset + 2), 16);
    return Math.max(0, Math.min(255, Math.round(v * f)))
      .toString(16)
      .padStart(2, '0');
  };
  return '#' + channel(1) + channel(3) + channel(5);
}

/** Deckkraft 0..1 → zweistelliges Hex-Suffix fuer `'#rrggbb' + suffix`. */
export function alphaSuffix(opacity: number): string {
  const o = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
  return Math.round(o * 255)
    .toString(16)
    .padStart(2, '0');
}

/** Schrift auf einer Kamerafarbe: dunkel auf hellen Farben, hell auf dunklen (WCAG-Luminanz). */
export function kontrastText(hex: string): '#0b1426' | '#ffffff' {
  const full = expandHex(hex);
  if (!/^#[0-9a-f]{6}$/i.test(full)) return '#ffffff';
  const lin = (o: number) => {
    const c = parseInt(full.slice(o, o + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return l > 0.179 ? '#0b1426' : '#ffffff';
}
