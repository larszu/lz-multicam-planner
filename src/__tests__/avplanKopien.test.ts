// ADR-015 — Waechter ueber die Kopien der Suite-Pakete.
//
// Unter `src/**/avplan/<name>/` liegen zeichengleiche Kopien aus
// av-planner-suite/packages/<name>/src, jede mit einem MANIFEST.json, das
// fuer jede Datei ihre SHA-256 nennt. Eine Aenderung in der Kopie waere eine
// neue Parallelfassung — genau das, was ADR-015 beendet: drei
// `venueExchange.ts` mit drei Pruefsummen, die sich in Kommentaren
// „byte-gleich" nannten. Dieser Test rechnet die Bytes nach, statt es zu
// glauben.
//
// Er faellt auch, wenn im Ordner eine .ts/.tsx liegt, die das Manifest nicht
// kennt: sonst waechse die Kopie still um eigenen Code, den der naechste
// `pakete:verteilen`-Lauf ueberschreibt.
//
// Gelesen wird per `import.meta.glob` + `?raw`, nicht ueber node:fs: `tsc -b`
// kennt hier keine Node-Typen (dieselbe Machart wie specSource.test.ts).
// `?raw` liefert den Dateiinhalt als UTF-8-String; gehasht wird dieser
// String als UTF-8 — wie `pakete:verteilen` das Manifest schreibt.
import { describe, it, expect } from 'vitest';

interface Manifest {
  paket?: string;
  dateien?: Record<string, string>;
}

const MANIFESTE = import.meta.glob('../**/avplan/*/MANIFEST.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Jede Datei unter einem avplan/<name>/-Ordner, egal welcher Endung. */
const DATEIEN = import.meta.glob('../**/avplan/*/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Jeder Paket-Ordner, auch einer ohne Manifest. */
const ORDNER = [
  ...new Set(
    Object.keys(DATEIEN).map((p) => {
      const m = /^(.*\/avplan\/[^/]+)\//.exec(p);
      return m ? m[1] : null;
    }).filter((o): o is string => o !== null),
  ),
].sort();

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const hinweis = (name: string) =>
  `Kopie eines Suite-Pakets (ADR-015) — Aenderung gehoert nach av-planner-suite/packages/${name}, dann npm run pakete:verteilen`;

describe('Kopien der Suite-Pakete (ADR-015)', () => {
  it('es gibt mindestens eine Kopie (sonst prueft dieser Test nichts)', () => {
    expect(ORDNER.length).toBeGreaterThan(0);
  });

  for (const ordner of ORDNER) {
    const name = ordner.split('/').pop() as string;
    const anzeige = ordner.replace(/^\.\.\//, 'src/');
    const lesen = (): Manifest | null => {
      const roh = MANIFESTE[`${ordner}/MANIFEST.json`];
      if (roh === undefined) return null;
      try {
        return JSON.parse(roh) as Manifest;
      } catch {
        return null;
      }
    };

    describe(anzeige, () => {
      it('hat ein lesbares MANIFEST.json', () => {
        const m = lesen();
        expect(!!m && typeof m.dateien === 'object', `${anzeige}/MANIFEST.json fehlt oder ist kaputt. ${hinweis(name)}`).toBe(true);
      });

      it('jede Datei stimmt mit ihrer Pruefsumme ueberein', async () => {
        const dateien = lesen()?.dateien ?? {};
        const abweichend: string[] = [];
        for (const [datei, soll] of Object.entries(dateien)) {
          const inhalt = DATEIEN[`${ordner}/${datei}`];
          if (inhalt === undefined) abweichend.push(`${datei} (fehlt)`);
          else if ((await sha256(inhalt)) !== soll) abweichend.push(datei);
        }
        expect(abweichend, `Geaendert in ${anzeige}: ${abweichend.join(', ')}. ${hinweis(name)}`).toEqual([]);
      });

      it('traegt keine Quelldatei, die das Manifest nicht kennt', () => {
        const bekannt = new Set(Object.keys(lesen()?.dateien ?? {}));
        const fremd = Object.keys(DATEIEN)
          .filter((p) => p.startsWith(`${ordner}/`) && /\.tsx?$/.test(p))
          .map((p) => p.slice(ordner.length + 1))
          .filter((d) => !bekannt.has(d));
        expect(fremd, `Nicht im Manifest, in ${anzeige}: ${fremd.join(', ')}. ${hinweis(name)}`).toEqual([]);
      });
    });
  }
});
