import { describe, expect, it } from 'vitest';
import {
  buildStamp,
  documentFingerprint,
  fingerprint,
  stampForStand,
  stampLine,
} from '../utils/documentStamp';
import { cameraSheetFingerprint, storyboardFingerprint } from '../utils/documentContent';
import { buildStoryboardHtml } from '../utils/storyboard';
import type { Shot, Shotlist } from '../types';
// Quelltext als Zeichenkette (Vite-`?raw`) statt ueber `node:fs`: die
// tsconfig fuehrt bewusst `types: []`, also gibt es hier keine Node-Typen.
import exportPanelSrc from '../components/Export/ExportPanel.tsx?raw';
import shotlistPanelSrc from '../components/Shotlist/ShotlistPanel.tsx?raw';
import storyboardSrc from '../utils/storyboard.ts?raw';

// ADR-004 / Roadmap-Initiative 4 — ein Ausdruck soll sagen koennen, ob er noch
// der aktuelle Stand ist. Geprueft wird genau das und nicht mehr: dass der
// Fingerabdruck derselbe ist wie in den Schwester-Apps, dass er auf den Inhalt
// DIESES Blattes reagiert und nur darauf, und dass der Stempel keine
// Abweichung behauptet, fuer die es keinen Bezugspunkt gibt.

const NOW = new Date('2026-09-01T12:34:00.000Z');

describe('Fingerabdruck — gleiche Ableitung wie cable- und light-planner', () => {
  // Diese drei Werte stammen aus der Implementierung des cable-planners
  // (`src/renderer/lib/documentStamp.ts`), ausgefuehrt am 2026-09-05. Sie sind
  // der einzige belastbare Beweis, dass beide Apps denselben Fingerabdruck
  // rechnen, ohne dass ein Repo das andere importieren muesste. Wer sie
  // „anpasst", weil der Test rot ist, hat die Zusicherung weggeworfen statt
  // den Fehler: zwei Apps, die verschiedene Staende desselben Projekts
  // verschieden benennen, waeren schlimmer als gar kein Stempel.
  it('trifft die Ankerwerte der Schwester-Apps', () => {
    expect(fingerprint('abc')).toBe('1a47e90b');
    expect(fingerprint('')).toBe('811c9dc5');
    expect(documentFingerprint(['Kanal', 'Typ'], [['1', 'Fresnel'], ['2', 'PAR']])).toBe('397133df');
  });

  it('ist stabil und längenfest', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('irgendwas')).toHaveLength(8);
  });

  it('unterscheidet Inhalte, die sich nur in der Feldgrenze unterscheiden', () => {
    // Der Grund fuer den Unit-Separator: mit ';' als Trenner waeren ['a;b']
    // und ['a','b'] derselbe String — zwei verschiedene Dokumente mit
    // demselben Fingerabdruck.
    expect(documentFingerprint(['h'], [['a;b']])).not.toBe(
      documentFingerprint(['h', 'h2'], [['a', 'b']]),
    );
  });

  it('behandelt null/undefined wie eine leere Zelle', () => {
    expect(documentFingerprint(['x'], [[null]])).toBe(documentFingerprint(['x'], [['']]));
  });
});

describe('stampForStand — keine Behauptung ohne Bezugspunkt', () => {
  it('nennt ohne festgeschriebenen Stand keine Revision und keine Abweichung', () => {
    const s = stampForStand({ project: 'Halle A', current: 'aaaaaaaa', now: NOW });
    expect(s.revision).toBeUndefined();
    expect(s.drifted).toBe(false);
  });

  it('meldet Gleichstand und Abweichung getrennt', () => {
    const gleich = stampForStand({
      project: 'Halle A', current: 'aaaaaaaa',
      committed: { label: 'Stand Montag', fingerprint: 'aaaaaaaa' }, now: NOW,
    });
    const ab = stampForStand({
      project: 'Halle A', current: 'bbbbbbbb',
      committed: { label: 'Stand Montag', fingerprint: 'aaaaaaaa' }, now: NOW,
    });
    expect(gleich.drifted).toBe(false);
    expect(ab.drifted).toBe(true);
  });

  it('hängt Label und Vergleichswert aneinander — anders als der Rohbau', () => {
    // `buildStamp` laesst eine Revision OHNE Vergleichswert zu; dann stuende
    // „Rev 3" auf einem Blatt, das seit Rev 3 zwoelf Aenderungen gesehen hat.
    // `stampForStand` kann das gar nicht erst ausdruecken.
    expect(buildStamp({ project: 'X', revision: 'Rev 3', current: 'a', now: NOW }).drifted).toBe(false);
  });
});

describe('stampLine', () => {
  const stand = { label: 'Stand Montag', fingerprint: 'aaaaaaaa' };

  it('sagt „+ Änderungen", statt die Revision alleine zu behaupten', () => {
    const ab = stampForStand({ project: 'Halle A', current: 'bbbbbbbb', committed: stand, now: NOW });
    expect(stampLine(ab)).toContain('Stand Montag + Änderungen');
  });

  it('trägt Projekt, Zeitpunkt und Fingerabdruck', () => {
    const s = stampForStand({ project: 'Halle A', current: 'deadbeef', now: NOW });
    expect(stampLine(s)).toContain('Halle A');
    expect(stampLine(s)).toContain('#deadbeef');
    expect(stampLine(s)).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(stampLine(s)).not.toContain('Änderungen');
  });
});

// ── Regel 1: nur was auf DIESEM Blatt steht ────────────────────────────────

const sheet = (over: Partial<Parameters<typeof cameraSheetFingerprint>[0]> = {}) =>
  cameraSheetFingerprint({
    label: 'CAM 1',
    camera: 'Sony FX9',
    lens: 'Canon 24-105',
    optik: [50, 1, 2.8, 6],
    position: [3, 4, 1.5, 12, -3],
    notes: '',
    alle: [
      { id: 'c1', label: 'CAM 1', camera: 'Sony FX9', lens: 'Canon 24-105' },
      { id: 'c2', label: 'CAM 2', camera: 'Sony FX6', lens: 'Sigma 18-35' },
    ],
    ...over,
  });

describe('Kamerakarte', () => {
  it('reagiert auf die eigene Optik und Aufstellung', () => {
    expect(sheet()).not.toBe(sheet({ optik: [85, 1, 2.8, 6] }));
    expect(sheet()).not.toBe(sheet({ position: [3, 4, 1.5, 40, -3] }));
  });

  it('reagiert auf die Kameraliste am Fuss — die steht mit auf dem Blatt', () => {
    expect(sheet()).not.toBe(
      sheet({
        alle: [
          { id: 'c1', label: 'CAM 1', camera: 'Sony FX9', lens: 'Canon 24-105' },
          { id: 'c2', label: 'CAM 2', camera: 'Sony FX6', lens: 'Sigma 50-100' },
        ],
      }),
    );
  });

  it('ist unabhängig von der Reihenfolge im Store', () => {
    // Die Reihenfolge, in der Kameras angelegt wurden, ist auf dem Blatt nicht
    // zu sehen (die Liste wird sortiert gezeichnet). Ein Stempel, der darauf
    // anschlaegt, meldete eine Abweichung, die keiner gemacht hat — und ein
    // Hinweis, der falsch anschlaegt, wird nach dem zweiten Mal ignoriert.
    expect(sheet()).toBe(
      sheet({
        alle: [
          { id: 'c2', label: 'CAM 2', camera: 'Sony FX6', lens: 'Sigma 18-35' },
          { id: 'c1', label: 'CAM 1', camera: 'Sony FX9', lens: 'Canon 24-105' },
        ],
      }),
    );
  });

  it('reagiert auf die Notiz — sie wird auf die Karte gedruckt', () => {
    expect(sheet()).not.toBe(sheet({ notes: 'nur bis 85mm, sonst Stativ im Bild' }));
  });

  it('reagiert auf Rigging, Comms und Kit (Bedarfe 59/60/61)', () => {
    // Der Fall, um den es geht: zwei Karten derselben Kamera, gleiche Optik,
    // gleiche Position — und ein anderer Comms-Kanal. Ohne diese Zeilen
    // truegen beide denselben Stempel, und der Operator mit dem aelteren
    // Blatt schaltet auf den falschen Kanal.
    const rig = [['rig', 'Podest: 4×4 ft'] as (string | number)[]];
    expect(sheet()).not.toBe(sheet({ extras: rig }));
    expect(sheet({ extras: rig })).not.toBe(
      sheet({ extras: [['rig', 'Podest: 8×4 ft'] as (string | number)[]] }),
    );
  });

  it('reagiert auf den Deckungsauftrag (Bedarf 58)', () => {
    // Das Urteil wird GERECHNET: ein verschobenes Motiv aendert es, ohne dass
    // jemand an der Kamera etwas angefasst haette. Steht es auf dem Blatt,
    // muss es eingehen — sonst trueg das alte Blatt „erreichbar", wo
    // inzwischen „reicht nicht heran" gilt.
    const erreichbar = ['Auftrag:     Nah auf „Sänger"', 'Optik:       762 mm nötig — erreichbar'];
    const nicht = ['Auftrag:     Nah auf „Sänger"', 'Optik:       1482 mm nötig — reicht nicht heran'];
    expect(sheet({ coverage: erreichbar })).not.toBe(sheet({ coverage: nicht }));
    // Ohne Auftrag faellt der Block auf dem Blatt weg — und hier ebenso: eine
    // Karte, die nie einen hatte, behaelt den Stempel, den sie vorher trug.
    expect(sheet()).toBe(sheet({ coverage: [] }));
  });
});

const shot = (id: string, over: Partial<Shot> = {}): Shot =>
  ({
    id,
    name: `Shot ${id}`,
    cameraId: 'c1',
    state: { focalLength: 50, aperture: 2.8, focusDistance: 6, x: 0, y: 0, z: 1.5, pan: 0, tilt: 0 },
    transition: 'fast',
    ...over,
  }) as unknown as Shot;

const liste = (shots: Shot[], name = 'Hauptprobe'): Shotlist =>
  ({ id: 'sl1', name, shots }) as unknown as Shotlist;

describe('Storyboard', () => {
  it('reagiert auf Reihenfolge, Optik und Notiz — alles davon steht auf dem Bogen', () => {
    const a = liste([shot('a'), shot('b')]);
    expect(storyboardFingerprint(a)).not.toBe(storyboardFingerprint(liste([shot('b'), shot('a')])));
    expect(storyboardFingerprint(a)).not.toBe(
      storyboardFingerprint(liste([shot('a', { state: { ...shot('a').state, focalLength: 85 } }), shot('b')])),
    );
    expect(storyboardFingerprint(a)).not.toBe(
      storyboardFingerprint(liste([shot('a', { note: 'auf Einsatz warten' }), shot('b')])),
    );
  });

  it('merkt, ob ein Framegrab da ist — aber hängt nicht am Bildinhalt', () => {
    const ohne = liste([shot('a')]);
    const mit = liste([shot('a', { thumbnail: 'data:image/jpeg;base64,AAA' })]);
    const anderes = liste([shot('a', { thumbnail: 'data:image/jpeg;base64,BBB' })]);
    expect(storyboardFingerprint(ohne)).not.toBe(storyboardFingerprint(mit));
    // Zwei Megabyte data-URL durch den Hash zu schicken beantwortet dieselbe
    // Frage nicht besser: die Shot-Daten daneben aendern sich mit.
    expect(storyboardFingerprint(mit)).toBe(storyboardFingerprint(anderes));
  });

  it('hängt am Namen der Liste — der steht als Überschrift auf dem Blatt', () => {
    expect(storyboardFingerprint(liste([shot('a')]))).not.toBe(
      storyboardFingerprint(liste([shot('a')], 'Generalprobe')),
    );
  });
});

describe('Druckfassung', () => {
  const l = liste([shot('a')]);

  it('bleibt ohne Stempel wortgleich wie bisher', () => {
    // Der Stempel ist optional; ein Aufrufer, der keinen baut, bekommt exakt
    // das alte Dokument. Sonst waere das eine stille Formataenderung.
    expect(buildStoryboardHtml(l, 'Halle A')).toBe(buildStoryboardHtml(l, 'Halle A', undefined));
    expect(buildStoryboardHtml(l, 'Halle A')).not.toContain('class="stamp"');
  });

  it('trägt die Stempelzeile, wenn einer da ist', () => {
    const s = stampForStand({ project: 'Halle A', current: 'deadbeef', now: NOW });
    const html = buildStoryboardHtml(l, 'Halle A', s);
    expect(html).toContain('class="stamp"');
    expect(html).toContain('#deadbeef');
  });

  it('maskiert den Stempeltext wie jeden anderen Text', () => {
    // Der Projektname kommt aus einer Eingabe. Unmaskiert wuerde ein '<' im
    // Namen die Druckseite zerlegen — derselbe Fehler wie ein unmaskierter
    // Shot-Name, nur an einer Stelle, an die niemand denkt.
    const s = stampForStand({ project: 'Halle <A>', current: 'deadbeef', now: NOW });
    const html = buildStoryboardHtml(l, 'Halle A', s);
    expect(html).toContain('Halle &lt;A&gt;');
    expect(html).not.toContain('Halle <A>');
  });
});

describe('Verdrahtet', () => {
  // Alles darueber kann stimmen und nie aufgerufen werden. Genau diese Form —
  // gebaut, begruendet, unerreichbar — ist in diesen Repos mehrfach gefunden
  // worden, deshalb steht sie hier als Test und nicht als Vorsatz.
  it('die Kamerakarte zeichnet die Stempelzeile', () => {
    const panel = exportPanelSrc;
    expect(panel).toMatch(/cameraSheetFingerprint\(/);
    expect(panel).toMatch(/ctx\.fillText\(stampLine\(stamp\)/);
    // Eigenes Band, sonst klebte die Zeile am Rand und fiele beim Beschneiden
    // als erstes weg.
    expect(panel).toMatch(/const stampH = 30;/);
    expect(panel).toMatch(/\+ padding \+ stampH;/);
  });

  it('beide Storyboard-Wege bekommen einen Stempel', () => {
    const panel = shotlistPanelSrc;
    expect(panel).toMatch(/storyboardFingerprint\(list\)/);
    expect(panel).toMatch(/exportStoryboardPng\(list, venue\.name, stempel\(\)[,)]/);
    expect(panel).toMatch(/printStoryboard\(list, venue\.name, stempel\(\)[,)]/);
  });

  it('der Kontaktbogen zeichnet sie ebenfalls', () => {
    expect(storyboardSrc).toMatch(/ctx\.fillText\(stampLine\(stamp\)/);
  });
});
