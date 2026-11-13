/**
 * #269 — Name fuer ein dupliziertes Objekt.
 *
 * Endet der Name der Quelle auf eine Nummer („Chair 3"), bekommt die Kopie
 * die naechste freie Nummer mit demselben Praefix („Chair 4", oder hoeher,
 * wenn 4 schon vergeben ist). Vorher hiess die Kopie „Chair 3 copy" bzw.
 * beim Einfuegen wieder „Chair 3" und trug damit dieselbe Nummer wie die Quelle.
 * Ohne Nummer am Ende bleibt es beim Anhang „copy".
 */
export const duplikatLabel = (quelle: string, vorhandene: readonly string[]): string => {
  const m = /^(.*?)(\d+)$/.exec(quelle.trim());
  if (!m) return `${quelle} copy`;
  const praefix = m[1];
  const belegt = new Set<number>();
  for (const l of vorhandene) {
    const t = l.trim();
    if (!t.startsWith(praefix)) continue;
    const rest = t.slice(praefix.length);
    if (/^\d+$/.test(rest)) belegt.add(Number(rest));
  }
  let n = Number(m[2]) + 1;
  while (belegt.has(n)) n++;
  return `${praefix}${n}`;
};
