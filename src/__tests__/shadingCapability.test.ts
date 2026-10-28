import { describe, expect, it } from 'vitest';
import {
  BRIDGE_SOURCE,
  BUS_SCOPE_NOTE,
  BUS_SCOPE_SHORT,
  CONTROL_PATH_LABEL,
  MODE_PAINT,
  PAINT_FUNCTIONS,
  PAINT_FUNCTION_LABEL,
  SHADING_FINDING_LABEL,
  fleetMatch,
  normaliseControlPath,
  remoteFunctions,
  shadingFindings,
  shadingLines,
  shadingVerdict,
} from '../utils/shadingCapability';
import { cardExtraRows } from '../utils/cameraCardExtras';
import { buildShiftReport } from '../utils/shiftReport';
import { cameraSheetFingerprint } from '../utils/documentContent';
import type { ControlPath, VenueCamera } from '../types';
import quelle from '../utils/shadingCapability.ts?raw';
import sidebarQuelle from '../components/Sidebar/Sidebar.tsx?raw';
import panelQuelle from '../components/Export/ExportPanel.tsx?raw';
import storeQuelle from '../store/useStore.ts?raw';
import shiftQuelle from '../utils/shiftReport.ts?raw';

// ---------------------------------------------------------------------------
// Bedarf 48 (P2) — die Faehigkeits-Unterschiede einer gemischten Flotte
// stehen im PLAN, nicht in der Probe.
//
//   > The exposed paint set differs per protocol (Panasonic AW PTZ exposes
//   > only iris/bars/focus, Blackmagic exposes the full colour-correction
//   > set). […] Flag at plan time which positions cannot do remote colour
//   > temperature / black balance, INSTEAD OF DISCOVERING IT IN REHEARSAL.
//
// Der teuerste Fehler waere hier, mehr zu behaupten als die Quelle hergibt:
// die Tabelle sagt, was das BACKEND kann, nicht was das MODELL beantwortet.
// ---------------------------------------------------------------------------

const cam = (over: Partial<VenueCamera> = {}): VenueCamera =>
  ({
    id: over.id ?? 'c1',
    label: over.label ?? 'CAM 1',
    cameraId: 'x',
    lensId: 'y',
    x: 0,
    y: 0,
    z: 1.5,
    pan: 0,
    tilt: 0,
    focalLength: 50,
    aperture: 4,
    focusDistance: 5,
    color: '#fff',
    extenderActive: 1,
    ...over,
  }) as VenueCamera;

const arten = (c: VenueCamera, alle: VenueCamera[] = [c]): string[] =>
  shadingFindings(c, alle).map((f) => f.kind);

// ── 1. Die Tabelle ist eine Kopie, und sie sagt woher ──────────────────────

describe('die Herkunft der Tabelle steht als Wert da', () => {
  it('nennt Repo, Datei, Symbol und den Stand', () => {
    // Nicht nur im Kommentar: der Paritaets-Guard der Suite braucht die
    // Stelle, gegen die er prueft, und ein Blatt braucht den Grund.
    expect(BRIDGE_SOURCE.repo).toBe('sony-camera-bridge');
    expect(BRIDGE_SOURCE.file).toBe('packages/web-rcp/src/capabilities.ts');
    expect(BRIDGE_SOURCE.symbol).toBe('MODE_CAPS');
    expect(BRIDGE_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('kennt jeden Weg in beiden Richtungen', () => {
    // Ein Weg ohne Tabellenzeile liefe in `shadingVerdict` auf `undefined`,
    // und die Karte behauptete eine Kann-Liste aus nichts.
    const wege = Object.keys(CONTROL_PATH_LABEL).sort();
    expect(Object.keys(MODE_PAINT).sort()).toEqual(wege);
    for (const w of wege) expect(CONTROL_PATH_LABEL[w as ControlPath]).toBeTruthy();
  });

  it('gibt jeder Paint-Funktion eine Beschriftung', () => {
    for (const f of PAINT_FUNCTIONS) expect(PAINT_FUNCTION_LABEL[f]).toBeTruthy();
    expect(Object.keys(PAINT_FUNCTION_LABEL).sort()).toEqual([...PAINT_FUNCTIONS].sort());
  });

  it('bildet die Asymmetrie ab, die der Bedarf benennt', () => {
    // Woertlich aus dem Bedarf: „Panasonic AW PTZ exposes only iris/bars/
    // focus, Blackmagic exposes the full colour-correction set." Fokus ist
    // keine Schattierung und steht deshalb nicht in dieser Liste.
    expect([...MODE_PAINT['panasonic-ptz']].sort()).toEqual(['bars', 'iris']);
    for (const f of ['colorTemp', 'whiteBalance', 'blackBalance', 'cc', 'resetCc'] as const) {
      expect(MODE_PAINT.blackmagic).toContain(f);
    }
  });

  it('hält die beiden Sony-CCU-Wege gleich — solange die Quelle es tut', () => {
    // Sie zusammenzufassen waere bequem und der Anfang einer zweiten
    // Wahrheit. Getrennt gefuehrt faellt es auf, wenn die Bridge einen von
    // beiden aendert — und dann gehoert hier nachgesehen, nicht angeglichen.
    expect(MODE_PAINT.tcp).toEqual(MODE_PAINT.serial);
  });

  it('behauptet keinen Auto-Abgleich, den die Quelle nicht kennt', () => {
    // Die Bridge begruendet es: Sonys 700-Protokoll ist NDA-only, keine
    // oeffentliche Quelle dokumentiert die Auto-Setup-Codes. Eine Spalte, die
    // ueberall „nein" sagt, bleibt trotzdem stehen — sie beantwortet die
    // Frage, die sonst in der Probe gestellt wird.
    //
    // `b4-lens` ist die EINE Ausnahme, und sie ist genau deshalb hier
    // aufgezaehlt und nicht uebersprungen: an einem B4-Objektiv ist die
    // Blendenautomatik kein Befehlscode, sondern HIROSE PIN 8 — ein Draht,
    // der die Optik zwischen ihrer eigenen Automatik und Fernsteuerung
    // umschaltet. Was dieser Test verbietet, ist eine BEHAUPTUNG OHNE QUELLE,
    // nicht eine Automatik, die man anfassen kann.
    //
    // Als Liste und nicht als `if`, damit die naechste solche Ausnahme eine
    // Zeile mit Begruendung braucht. `abb` nur dort, wo der Befehlssatz
    // einen Schwarzabgleich ausloesen kann (ABB_ERLAUBT).
    // Die Broadcast-Protokolle (Sony 700/CNA-1, Panasonic AW/AK, Canon BU,
    // Hitachi, Ikegami, GV LDK, Marshall) haben die Auto-Setup-Befehle
    // dokumentiert im Satz -- die Quelle fuehrt sie, also hier auch.
    const BROADCAST: readonly ControlPath[] = [
      'sony-700', 'sony-cna1', 'panasonic-serial', 'canon-bu',
      'hitachi-rcz', 'ikegami-iup', 'gv-ldk', 'marshall-cv420',
    ];
    const AUTOIRIS_ERLAUBT: readonly ControlPath[] = ['b4-lens', ...BROADCAST];
    const ABB_ERLAUBT: readonly ControlPath[] = [
      'sony-700', 'sony-cna1', 'panasonic-serial', 'hitachi-rcz', 'ikegami-iup',
    ];

    for (const w of Object.keys(MODE_PAINT) as ControlPath[]) {
      if (!ABB_ERLAUBT.includes(w)) expect(MODE_PAINT[w]).not.toContain('abb');
      if (!AUTOIRIS_ERLAUBT.includes(w)) {
        expect(MODE_PAINT[w]).not.toContain('autoIris');
      }
    }

    // Die Gegenprobe: eine Ausnahme, die ihre Ausnahme nicht nutzt, ist ein
    // vergessener Eintrag und keine Entscheidung.
    for (const w of AUTOIRIS_ERLAUBT) {
      expect(MODE_PAINT[w]).toContain('autoIris');
    }

    expect(PAINT_FUNCTIONS).toContain('abb');
    expect(PAINT_FUNCTIONS).toContain('autoIris');
  });

  it('sieht nur an EINER Stelle in der Tabelle nach', () => {
    // Eine zweite Leserin waere eine zweite Gelegenheit, `none` oder den
    // fehlenden Eintrag anders zu behandeln.
    const treffer = quelle.match(/MODE_PAINT\[/g) ?? [];
    expect(treffer).toHaveLength(1);
    expect(quelle).toMatch(/export const shadingVerdict[\s\S]{0,240}MODE_PAINT\[/);
  });
});

// ── 2. Vier Urteile, und keines davon ist „leer" ───────────────────────────

describe('shadingVerdict', () => {
  it('unterscheidet „kein Weg im Plan" von „kann nichts"', () => {
    // Der Kern: eine Position ohne Eintrag ist eine UNGESTELLTE FRAGE. Sie
    // als „kann alles" oder als „kann nichts" zu lesen waere je einmal die
    // teuerste Annahme des Tages.
    expect(shadingVerdict(cam(), 'colorTemp')).toBe('kein-weg');
    expect(shadingVerdict(cam({ controlPath: 'none' }), 'colorTemp')).toBe('von-hand');
    expect(shadingVerdict(cam({ controlPath: 'panasonic-ptz' }), 'colorTemp')).toBe('nicht-im-bus');
    expect(shadingVerdict(cam({ controlPath: 'blackmagic' }), 'colorTemp')).toBe('im-bus');
  });

  it('zählt auf, was geht — in Pult-Reihenfolge', () => {
    expect(remoteFunctions(cam({ controlPath: 'panasonic-ptz' }))).toEqual(['iris', 'bars']);
    expect(remoteFunctions(cam())).toEqual([]);
    expect(remoteFunctions(cam({ controlPath: 'none' }))).toEqual([]);
  });
});

// ── 3. Die beiden Luecken, die der Bedarf woertlich nennt ──────────────────

describe('was der Bedarf zur Planungszeit sehen will', () => {
  it('meldet fehlende Farbtemperatur und fehlenden Schwarzabgleich', () => {
    const ptz = cam({ controlPath: 'panasonic-ptz' });
    expect(arten(ptz)).toContain('no-colortemp');
    expect(arten(ptz)).toContain('no-blackbalance');
    const f = shadingFindings(ptz, [ptz]).find((x) => x.kind === 'no-colortemp');
    // Der Satz nennt den Weg — sonst ist er nicht nachvollziehbar.
    expect(f?.text).toContain('Panasonic AW PTZ (CGI)');
    expect(f?.text).toContain('Farbtemperatur');
  });

  it('schweigt an einer Position, die beides kann', () => {
    expect(arten(cam({ controlPath: 'blackmagic' }))).toEqual([]);
  });

  it('wiederholt die eigene Eingabe nicht', () => {
    // Wer „von Hand am Body" eingetragen hat, weiss, dass vom Pult nichts
    // geht. Diese Meldung waere die, die man wegklickt — mitsamt der
    // naechsten, die einen Grund hatte.
    const arten1 = arten(cam({ controlPath: 'none' }));
    expect(arten1).not.toContain('no-colortemp');
    expect(arten1).not.toContain('no-blackbalance');
    expect(arten1).not.toContain('path-unstated');
  });

  it('meldet die ungestellte Frage als eigenen Befund', () => {
    const ohne = cam();
    expect(arten(ohne)).toEqual(['path-unstated']);
    expect(shadingFindings(ohne, [ohne])[0].text).toContain('Probe');
  });

  it('gibt jeder Befundart eine Beschriftung', () => {
    for (const k of Object.keys(SHADING_FINDING_LABEL)) {
      expect(SHADING_FINDING_LABEL[k as never]).toBeTruthy();
    }
  });
});

// ── 4. Die Flotte — der eigentliche Bedarf ─────────────────────────────────

describe('fleetMatch', () => {
  const ptz = cam({ id: 'c1', label: 'CAM 1', controlPath: 'panasonic-ptz' });
  const bm = cam({ id: 'c2', label: 'CAM 2', controlPath: 'blackmagic' });

  it('rechnet den Schnitt, über den sich abgleichen lässt', () => {
    // Genau der Fall aus dem Beleg: Panasonic PTZ neben Blackmagic. Gemeinsam
    // ist NUR die Blende — alles andere kann eine von beiden nicht.
    const m = fleetMatch([ptz, bm]);
    expect(m.shared).toEqual(['iris']);
    expect(m.considered).toEqual(['c1', 'c2']);
    expect(m.unstated).toEqual([]);
  });

  it('meldet den Riss in BEIDE Richtungen', () => {
    // Nicht nur die PTZ faellt heraus: Farbbalken kann sie, die Blackmagic
    // nicht. Wer nur nach dem „schwaecheren" Geraet sucht, uebersieht das —
    // und stellt in der Probe fest, dass eine Kamera kein Testbild liefert.
    const m = fleetMatch([ptz, bm]);
    expect(m.split).toContain('colorTemp');
    expect(m.split).toContain('bars');
    expect(shadingFindings(ptz, [ptz, bm]).map((f) => f.kind)).toContain('fleet-split');
    const gegen = shadingFindings(bm, [ptz, bm]).find((f) => f.kind === 'fleet-split');
    expect(gegen?.text).toContain('Farbbalken');
  });

  it('meldet den Riss NUR an der Position, die herausfällt', () => {
    // Sony-CCU plus eine dazugestellte PTZ: die CCU kann alles, was die PTZ
    // kann, und mehr. Ihr denselben Satz zu melden waere die Warnung ohne
    // Anlass — nach der dritten liest niemand mehr die mit Anlass.
    const ccu = cam({ id: 'c5', label: 'CAM 5', controlPath: 'tcp' });
    const m = fleetMatch([ccu, ptz]);
    expect(m.shared).toEqual(['iris', 'bars']);
    expect(m.split).toContain('blackBalance');
    expect(arten(ptz, [ccu, ptz])).toContain('fleet-split');
    expect(arten(ccu, [ccu, ptz])).not.toContain('fleet-split');
  });

  it('schweigt in einer gleichartigen Flotte', () => {
    const b2 = cam({ id: 'c3', label: 'CAM 3', controlPath: 'blackmagic' });
    const m = fleetMatch([bm, b2]);
    expect(m.split).toEqual([]);
    expect(m.shared).toEqual([...MODE_PAINT.blackmagic]);
    expect(arten(bm, [bm, b2])).toEqual([]);
  });

  it('lässt eine Position ohne Weg den Schnitt NICHT schrumpfen', () => {
    // Unbekannt ist nicht dasselbe wie „kann nichts". Wuerde sie mitzaehlen,
    // waere der Schnitt jeder halb ausgefuellten Show leer — und die Meldung
    // damit wertlos.
    const offen = cam({ id: 'c9', label: 'CAM 9' });
    const m = fleetMatch([bm, offen]);
    expect(m.shared).toEqual([...MODE_PAINT.blackmagic]);
    expect(m.considered).toEqual(['c2']);
    expect(m.unstated).toEqual(['c9']);
    expect(arten(offen, [bm, offen])).toEqual(['path-unstated']);
  });

  it('zählt „von Hand am Body" sehr wohl mit', () => {
    // Das ist keine Unbekannte, sondern eine Entscheidung — und die groesste
    // Luecke, die eine Flotte haben kann.
    const hand = cam({ id: 'c4', label: 'CAM 4', controlPath: 'none' });
    const m = fleetMatch([bm, hand]);
    expect(m.shared).toEqual([]);
    expect(m.considered).toEqual(['c2', 'c4']);
    expect(arten(hand, [bm, hand])).toEqual(['fleet-split']);
  });

  it('eine einzelne Position hat keinen Riss', () => {
    const m = fleetMatch([bm]);
    expect(m.split).toEqual([]);
    expect(m.shared).toEqual([...MODE_PAINT.blackmagic]);
  });

  it('leere Flotte teilt nichts und behauptet nichts', () => {
    expect(fleetMatch([])).toEqual({ considered: [], shared: [], split: [], unstated: [] });
  });
});

// ── 5. Das Blatt ───────────────────────────────────────────────────────────

describe('was auf der Karte und auf dem Blatt steht', () => {
  it('schreibt beide Zeilen IMMER, auch ohne Eintrag', () => {
    // Eine weggelassene Zeile liest sich als „dazu gibt es nichts zu sagen" —
    // und genau dieser Eindruck laesst die Luecke bis in die Probe stehen.
    const z = shadingLines(cam());
    expect(z).toHaveLength(2);
    expect(z[0]).toContain('nicht angegeben');
    expect(z[1]).toContain('nicht angegeben');
  });

  it('nennt das Kann und nicht das Kann-nicht', () => {
    // An einer Panasonic-PTZ waeren das sechzehn Verneinungen, die niemand
    // liest — und die dann auch die eine Zeile mitnehmen, an der etwas steht.
    const z = shadingLines(cam({ controlPath: 'panasonic-ptz' }));
    expect(z[0]).toContain('Panasonic AW PTZ (CGI)');
    expect(z[1]).toContain('Blende, Farbbalken');
    expect(z[1]).not.toContain('Farbtemperatur');
  });

  it('schränkt die Kann-Zeile auf der Karte selbst ein', () => {
    // Ein weitergereichtes Blatt traegt sonst eine Zusicherung, die niemand
    // gegeben hat: die Tabelle gilt fuer den WEG, nicht fuer das Modell.
    expect(shadingLines(cam({ controlPath: 'blackmagic' }))[1]).toContain(BUS_SCOPE_SHORT);
    expect(BUS_SCOPE_SHORT).toBe('Weg, nicht Modell');
    expect(BUS_SCOPE_NOTE).toContain('nicht zugesichert');
    // Und die lange Fassung steht dort, wo der Weg gewaehlt wird.
    expect(sidebarQuelle).toMatch(/\{BUS_SCOPE_NOTE\}/);
  });

  it('sagt „von Hand am Body" statt einer leeren Zeile', () => {
    expect(shadingLines(cam({ controlPath: 'none' }))[1]).toBe('Fernsteuerbar: von Hand am Body');
  });

  it('geht in den Stempel der Karte ein', () => {
    // Zwei Karten derselben Position, gleiche Optik, anderer Fernsteuerweg —
    // ohne diese Zeilen truegen beide denselben Stempel.
    const basis = {
      label: 'CAM 1',
      camera: 'Sony HDC',
      lens: 'Canon',
      optik: [50, 4],
      position: [0, 0, 1.5, 0, 0],
      alle: [],
    };
    const a = cameraSheetFingerprint({
      ...basis,
      extras: cardExtraRows(cam({ controlPath: 'blackmagic' })),
    });
    const b = cameraSheetFingerprint({
      ...basis,
      extras: cardExtraRows(cam({ controlPath: 'panasonic-ptz' })),
    });
    expect(a).not.toBe(b);
    expect(cardExtraRows(cam()).some((r) => r[0] === 'shading')).toBe(true);
  });

  it('steht auf dem Übergabe-Blatt', () => {
    // Die naechste Schicht greift sonst am Pult nach einem Regler, den es
    // fuer diese Kamera gar nicht gibt.
    const ptz = cam({ controlPath: 'panasonic-ptz' });
    const zeile = buildShiftReport([ptz]).rows[0];
    expect(zeile.findings.map((f) => f.label)).toContain('Farbtemperatur nicht fernsteuerbar');
    expect(shiftQuelle).toMatch(/shadingFindings\(cam, cameras\)/);
  });
});

// ── 6. Laden und Verdrahtung ───────────────────────────────────────────────

describe('normaliseControlPath', () => {
  it('nimmt einen bekannten Weg', () => {
    expect(normaliseControlPath({ controlPath: 'visca' })).toEqual({ controlPath: 'visca' });
    expect(normaliseControlPath({ controlPath: 'none' })).toEqual({ controlPath: 'none' });
  });

  it('wirft einen unbekannten Weg weg', () => {
    // Er stuende sonst in `shadingVerdict` vor einer Tabelle, die ihn nicht
    // kennt — und die Karte behauptete eine Kann-Liste aus `undefined`.
    expect(normaliseControlPath({ controlPath: 'telepathie' })).toEqual({});
    expect(normaliseControlPath({ controlPath: 42 })).toEqual({});
    expect(normaliseControlPath({})).toEqual({});
    expect(normaliseControlPath(null)).toEqual({});
  });

  it('läuft auf dem Lade-Pfad', () => {
    expect(storeQuelle).toMatch(/\.\.\.normaliseControlPath\(c\)/);
  });
});

describe('der Weg ist verdrahtet', () => {
  it('ist eintragbar', () => {
    expect(sidebarQuelle).toMatch(/controlPath: \(e\.target\.value \|\| undefined\)/);
    expect(sidebarQuelle).toMatch(/shadingFindings\(cam, cameras\)/);
  });

  it('wird auf die Karte gezeichnet', () => {
    expect(panelQuelle).toMatch(/shadingLines\(targetCam\)/);
    expect(panelQuelle).toContain("ctx.fillText('SCHATTIERUNG', cx, cy)");
  });

  it('bleibt rein — keine Uhr, kein Store, kein IO', () => {
    expect(quelle).not.toMatch(/\bDate\.now\b|new Date\(|useStore|fetch\(/);
  });
});
