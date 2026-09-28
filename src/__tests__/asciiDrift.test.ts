import { describe, expect, it } from 'vitest';
import ts from 'typescript';

// ── Meldungstexte in richtigem Deutsch ─────────────────────────────────────
//
// Derselbe Guard wie in `cable-planner` (dort cable#755), und aus demselben
// Anlass: die Anwendung schrieb ihre eigene Sprache in ASCII-Ersatzformen —
// „Hoehe", „Buehne", „fuer", „laesst", „zurueck". Das stand nicht in
// Kommentaren, sondern in Beschriftungen, Hinweisen und Blattspalten.
// Gemessen vor dem Aufraeumen: 213 Stellen im Quelltext.
//
// DIE BEWEISLAST IST UMGEDREHT. Eine Liste falscher Woerter waere immer
// unvollstaendig und liesse das naechste neue Wort still durch. Dieser Guard
// kennt stattdessen die Woerter, in denen „ae/oe/ue" KEIN Umlaut-Ersatz ist:
// englische Begriffe, deutsche Woerter mit echter Vokalfolge („zuerst",
// „Quelle", „Manuell", „Dauer") und Hex-Ziffernfolgen. Alles andere ist ein
// Befund.
//
// NICHT DABEI: Kommentare (sie bleiben ASCII wie im ganzen Repo), Modul-Pfade,
// Platzhalter in geschweiften Klammern (`format()` schlaegt sie als
// SCHLUESSEL nach) und die Testdateien selbst.

const roh = {
  ...(import.meta.glob('../**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob('../**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
};

/** Die Stellen im Literal, an denen der Text steht — ohne Anfuehrungszeichen,
 *  ohne `${`/`}`. Ein Bezeichner in `${hatWert}` ist Code, kein Text. */
const INNEN: Partial<Record<ts.SyntaxKind, [number, number]>> = {
  [ts.SyntaxKind.StringLiteral]: [1, -1],
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral]: [1, -1],
  [ts.SyntaxKind.TemplateHead]: [1, -2],
  [ts.SyntaxKind.TemplateMiddle]: [1, -2],
  [ts.SyntaxKind.TemplateTail]: [1, -1],
  [ts.SyntaxKind.JsxText]: [0, 0],
};

/**
 * Woerter, in denen „ae/oe/ue" kein Umlaut-Ersatz ist. Wer hier etwas
 * eintraegt, sagt: dieses Wort ist so richtig geschrieben.
 */
const HARMLOS = new Set(
  [
    // Deutsch mit echter Vokalfolge
    'zuerst', 'quer', 'dauer', 'fahrtdauer', 'mindestdauer', 'manuell',
    'manuelles', 'manuelle', 'quelle', 'quellen', 'quelltext', 'quellenname',
    'quellenliste', 'quellausschnitt', 'quellausschnitts', 'quellsprache', 'steuer',
    'fernsteuerweg', 'fernsteuerbar', 'sequenz', 'neu', 'neue', 'neuer',
    'neues', 'neuen', 'aktuell', 'aktuelle', 'aktuellem', 'dauerhaft',
    'genaue', 'bauen', 'frequenz', 'steuerung', 'teuerste', 'aktuellen', 'steuert', 'gesteuert',
    'ferngesteuert', 'übersteuert', 'ansteuerung',
    'aktueller', 'aktuelles',
    // Englisch und Bezeichner, die als Text auftauchen
    'venueexchange', 'importvenueexchange', 'parsevenueexchange', 'venue',
    'returndue', 'due', 'value', 'values', 'postovalue', 'valuetopos',
    'cornflowerblue', 'blue', 'true', 'issue', 'unique', 'query', 'request', 'requested',
    'does', 'goes', 'sequence', 'continue', 'guess', 'guessed', 'guesses',
    // Ein Paar fuer sich ist nie ein deutsches Wort — es kommt aus einer
    // UUID, einer Farbe oder einem Pfad.
    'ae', 'oe', 'ue',
  ].map((w) => w.toLowerCase()),
);

/**
 * Kennungen, die als WERT in Dateien und Fingerabdruecken stehen. Sie werden
 * verglichen, nicht gelesen: `schicht-uebergabe` geht in
 * `documentFingerprint` ein, und ein Umlaut darin liesse jedes frueher
 * gedruckte Blatt als veraltet erscheinen.
 */
const KENNUNGEN = new Set(['schicht-uebergabe']);

/** Hex-Folgen (Farben, Fingerabdruecke) bestehen nur aus a-f und Ziffern. */
const istHex = (wort: string) => /^[0-9a-f]+$/i.test(wort);

/**
 * Die Entscheidung, ob ein Wort eine ASCII-Ersatzform ist — als eigene
 * Funktion, damit sie direkt geprueft werden kann. Die `venue`-Regel greift
 * upstream heute an keiner Stelle; sie traegt in der Suite-Kopie, deren
 * i18n-Schluessel `header.venueExport` und `sidebar.venueSettings` heissen.
 * Ohne den Test hier waere sie eine Regel, die keine Gegensonde je rot
 * bekaeme — und damit unbelegt.
 */
export const istErsatzform = (wort: string): boolean => {
  if (!/ae|oe|ue|Ae|Oe|Ue|AE|OE|UE/.test(wort)) return false;
  const klein = wort.toLowerCase();
  if (klein.startsWith('venue') || HARMLOS.has(klein) || istHex(wort)) return false;
  return true;
};

interface Befund {
  datei: string;
  wort: string;
  text: string;
}

const scanne = (): { befunde: Befund[]; literale: number } => {
  const befunde: Befund[] = [];
  let literale = 0;
  for (const [pfad, src] of Object.entries(roh)) {
    const kurz = pfad.replace(/^\.\.\//, 'src/');
    // Testdateien pruefen sich nicht selbst: ihre Namen und Vorgaben duerfen
    // ASCII bleiben, sie stehen in keiner Oberflaeche.
    if (/\.test\.tsx?$/.test(kurz) || kurz.includes('__tests__')) continue;
    const kind = kurz.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(kurz, src, ts.ScriptTarget.Latest, true, kind);
    const lauf = (node: ts.Node): void => {
      const eltern = node.parent as ts.Node | undefined;
      const modulPfad =
        !!eltern &&
        (ts.isImportDeclaration(eltern) || ts.isExportDeclaration(eltern)) &&
        eltern.moduleSpecifier === node;
      const spanne = modulPfad ? undefined : INNEN[node.kind];
      if (spanne) {
        const text = src.slice(node.getStart(sf) + spanne[0], node.getEnd() + spanne[1]);
        literale += 1;
        // URLs (manufacturerUrl-Belege, Quelle-Links) sind keine deutsche
        // Prosa: „ue/oe/ae" darin (discontinued, truelens, juegos) sind keine
        // Umlaut-Ersatzformen. Vor der Wortpruefung herausnehmen.
        const ohnePlatzhalter = text.replace(/\{[^}]*\}/g, ' ').replace(/https?:\/\/\S+/g, ' ');
        if (!KENNUNGEN.has(text.trim())) {
          // CamelCase AUSEINANDER, bevor ein Wort geprueft wird.
          //
          // Der Scan sucht deutsche Umlaut-Ersatzformen, und die stehen in
          // WOERTERN. Ein Bezeichner wie `playSequence` ist keines, sondern
          // zwei — und weil er als Ganzes nicht auf der Ausnahmeliste stand,
          // meldete der Lauf ein „ue", das aus dem englischen `sequence` kam,
          // obwohl `sequence` dort ausdruecklich steht. Eine Liste, die
          // jede Zusammensetzung einzeln fuehren muss, ist immer einen
          // Eintrag zu kurz — genau die Bauform, die dieser Check im Kopf
          // ablehnt.
          //
          // Geteilt wird nur am Uebergang klein→gross: `Geraeteliste` hat
          // keinen Grossbuchstaben im Innern und bleibt damit ein Befund.
          const woerter = (ohnePlatzhalter.match(/[A-Za-zÄÖÜäöüß]+/g) ?? []).flatMap((w) =>
            w.split(/(?<=[a-zäöüß])(?=[A-ZÄÖÜ])/),
          );
          for (const wort of woerter) {
            if (!istErsatzform(wort)) continue;
            befunde.push({ datei: kurz, wort, text: text.slice(0, 70) });
          }
        }
      }
      ts.forEachChild(node, lauf);
    };
    lauf(sf);
  }
  return { befunde, literale };
};

describe('die Entscheidung selbst', () => {
  it('nennt eine Ersatzform beim Namen', () => {
    for (const w of ['Geraet', 'Buehne', 'Hoehe', 'laesst', 'zurueck', 'loeschen']) {
      expect(istErsatzform(w), w).toBe(true);
    }
  });

  it('laesst die venue-Wortfamilie stehen', () => {
    // Englisch, und in der Suite-Kopie als Schluessel ueber ein Dutzend Mal:
    // `header.venueExport`, `sidebar.venueSettings`, `header.import.venueFailed`.
    for (const w of ['venue', 'venueExport', 'venueImport', 'venueSettings', 'venueFailed']) {
      expect(istErsatzform(w), w).toBe(false);
    }
  });

  it('laesst deutsche Woerter mit echter Vokalfolge stehen', () => {
    for (const w of ['neue', 'Manuell', 'Dauer', 'zuerst', 'Quelle', 'ferngesteuert']) {
      expect(istErsatzform(w), w).toBe(false);
    }
  });
});

describe('die Texte stehen in richtigem Deutsch, nicht in ASCII-Ersatzformen', () => {
  it('scannt ueberhaupt etwas (sonst prueft dieser Test nichts)', () => {
    const { literale } = scanne();
    expect(Object.keys(roh).length).toBeGreaterThan(40);
    expect(literale).toBeGreaterThan(1000);
  });

  it('findet keine ASCII-Ersatzform in einem String-Literal', () => {
    const { befunde } = scanne();
    const liste = befunde.map((b) => `${b.datei}: „${b.wort}" in "${b.text}"`);
    expect(liste, `ASCII-Ersatzformen: ${liste.join(' | ')}`).toEqual([]);
  });
});
