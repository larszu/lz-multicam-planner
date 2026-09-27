import { describe, expect, it } from 'vitest';
import {
  PRESET_MOVE_TOLERANCE_M,
  checkPresets,
  nextPresetNumber,
  presetFromCamera,
  presetRows,
} from '../utils/ptzPresets';
import type { Lens, PtzPreset, VenueCamera } from '../types';
import quelle from '../utils/ptzPresets.ts?raw';
import sidebarQuelle from '../components/Sidebar/Sidebar.tsx?raw';
import exportQuelle from '../components/Export/ExportPanel.tsx?raw';
import contentQuelle from '../utils/documentContent.ts?raw';
import cameraExportQuelle from '../utils/cameraExport.ts?raw';

// ---------------------------------------------------------------------------
// Bedarf 14 -- PTZ-Presets als Projekt-Dokumentation.
//
//   > Presets are undocumented device memory; someone nudges or refocuses a
//   > camera and forgets to overwrite, and the recalled shot is wrong live
//   > with no operator to save it.
//
//   > A common cause of preset trouble is adjusting the camera's position or
//   > focus after saving it and then forgetting to overwrite that preset.
//
// Geprueft wird vor allem, was NICHT gemeldet wird: dass ein Preset andere
// Werte hat als die Kamera gerade, ist der Normalfall -- ein Preset IST ein
// anderer Shot. Eine Warnung darueber staende auf jedem korrekten Aufbau.
// ---------------------------------------------------------------------------

/** Quelltext ohne Kommentare. Ein Guard, der den Kopfkommentar mitliest,
 *  prueft die eigene Begruendung statt des Codes. */
const ohneKommentare = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const zeit = '2026-09-06T10:00:00.000Z';

const kamera = (over: Partial<VenueCamera> = {}): VenueCamera =>
  ({
    id: 'c1',
    label: 'CAM 1',
    cameraId: 'ptz-1',
    lensId: 'l1',
    x: 10,
    y: 5,
    z: 2,
    pan: 0,
    tilt: 0,
    focalLength: 20,
    aperture: 2.8,
    focusDistance: 8,
    color: '#fff',
    extenderActive: 1,
    ...over,
  }) as VenueCamera;

const preset = (over: Partial<PtzPreset> = {}): PtzPreset => ({
  number: 1,
  name: 'Weit Bühne',
  pan: 15,
  tilt: -5,
  focalLength: 20,
  focusDistance: 8,
  savedAt: zeit,
  savedAtPosition: { x: 10, y: 5, z: 2 },
  ...over,
});

const objektiv: Lens = {
  id: 'l1',
  manufacturer: 'Test',
  model: '12-120',
  focalLengthMin: 12,
  focalLengthMax: 120,
  maxApertureWide: 2.8,
  mount: 'B4',
  type: 'zoom',
};

describe('was NICHT gemeldet wird', () => {
  it('schweigt, wenn es kein Preset gibt', () => {
    expect(checkPresets(kamera(), { lens: objektiv, isPtz: true })).toEqual([]);
  });

  it('meldet NICHT, dass das Preset andere Werte hat als die Kamera gerade', () => {
    // Der Normalfall. Ein Preset IST ein anderer Shot als der aktuelle; eine
    // Warnung darueber staende auf jedem korrekten Aufbau und waere nach dem
    // zweiten Mal Rauschen -- mitsamt der richtigen daneben.
    const cam = kamera({ pan: 0, tilt: 0, focalLength: 20, presets: [preset({ pan: 90, tilt: -30, focalLength: 100 })] });
    expect(checkPresets(cam, { lens: objektiv, isPtz: true })).toEqual([]);
  });

  it('erfindet keinen Brennweitenbereich, wenn das Objektiv unbekannt ist', () => {
    const cam = kamera({ presets: [preset({ focalLength: 999 })] });
    expect(checkPresets(cam, { isPtz: true })).toEqual([]);
  });
});

describe('die Kamera wurde seit dem Speichern versetzt', () => {
  it('meldet den Versatz mit Entfernung', () => {
    // Der Fall aus dem Befund. Pan und Tilt sind Winkel des Koerpers -- wird
    // der Koerper versetzt, zeigt derselbe Winkel woanders hin, ohne dass
    // sich am Preset etwas geaendert haette.
    const cam = kamera({ x: 12, presets: [preset()] });
    const f = checkPresets(cam, { lens: objektiv, isPtz: true });
    expect(f).toEqual([{ kind: 'camera-moved-since-save', number: 1, values: ['2.00'] }]);
  });

  it('meldet NICHT unterhalb der Toleranz', () => {
    // Darunter liegt die Genauigkeit, mit der ueberhaupt jemand eine Kamera
    // in einen Plan setzt.
    const cam = kamera({ x: 10 + PRESET_MOVE_TOLERANCE_M / 2, presets: [preset()] });
    expect(checkPresets(cam, { lens: objektiv, isPtz: true })).toEqual([]);
  });

  it('rechnet in drei Dimensionen', () => {
    // Eine hochgekurbelte Kamera ist genauso versetzt wie eine verschobene.
    const cam = kamera({ z: 4, presets: [preset()] });
    expect(checkPresets(cam, { lens: objektiv, isPtz: true })).toEqual([
      { kind: 'camera-moved-since-save', number: 1, values: ['2.00'] },
    ]);
  });
});

describe('was ein Preset unbrauchbar macht', () => {
  it('meldet eine doppelt vergebene Nummer', () => {
    // Das Geraet haelt nur eines. Zwei Zeilen mit derselben Nummer heissen,
    // dass die Dokumentation falsch ist -- eine der beiden ist nicht abrufbar.
    const cam = kamera({ presets: [preset({ number: 3 }), preset({ number: 3, name: 'Pult' })] });
    expect(checkPresets(cam, { lens: objektiv, isPtz: true })).toContainEqual({
      kind: 'duplicate-number',
      number: 3,
      values: ['2'],
    });
  });

  it('meldet ein Preset ohne Namen', () => {
    // Genau der Befund: ohne Namen ist es wieder blosse Geraetespeicher-Nummer.
    const cam = kamera({ presets: [preset({ name: '   ' })] });
    expect(checkPresets(cam, { lens: objektiv, isPtz: true })).toContainEqual({ kind: 'unnamed', number: 1 });
  });

  it('meldet eine Brennweite ausserhalb des Objektivs', () => {
    const cam = kamera({ presets: [preset({ focalLength: 300 })] });
    expect(checkPresets(cam, { lens: objektiv, isPtz: true })).toContainEqual({
      kind: 'focal-out-of-lens-range',
      number: 1,
      values: ['300', '12', '120'],
    });
  });

  it('meldet Presets auf einer Kamera, die keine PTZ ist', () => {
    const cam = kamera({ presets: [preset()] });
    expect(checkPresets(cam, { lens: objektiv, isPtz: false })).toContainEqual({ kind: 'not-a-ptz' });
  });
});

describe('ein Preset entsteht aus der aktuellen Stellung', () => {
  it('kopiert Winkel, Optik UND Standort', () => {
    // Kopiert und nicht verlinkt: ein Preset, das auf die aktuellen Werte
    // zeigt, waere per Konstruktion immer aktuell -- und als Dokument wertlos.
    const cam = kamera({ pan: 42, tilt: -7, focalLength: 55, focusDistance: 12 });
    const p = presetFromCamera(cam, 2, 'Pult', zeit, 'Predigt');
    expect(p).toEqual({
      number: 2,
      name: 'Pult',
      segment: 'Predigt',
      pan: 42,
      tilt: -7,
      focalLength: 55,
      focusDistance: 12,
      savedAt: zeit,
      savedAtPosition: { x: 10, y: 5, z: 2 },
    });
  });

  it('bleibt unberührt, wenn die Kamera danach schwenkt', () => {
    const cam = kamera({ pan: 42 });
    const p = presetFromCamera(cam, 1, 'Pult', zeit);
    const gedreht = { ...cam, pan: 180 };
    expect(p.pan).toBe(42);
    expect(checkPresets({ ...gedreht, presets: [p] }, { lens: objektiv, isPtz: true })).toEqual([]);
  });

  it('lässt das Segment weg, statt es leer zu setzen', () => {
    expect('segment' in presetFromCamera(kamera(), 1, 'X', zeit)).toBe(false);
  });
});

describe('Nummernvergabe', () => {
  it('nimmt die kleinste freie, nicht die nächsthöhere', () => {
    // Nummern am Pult sind eine knappe, GETIPPTE Ressource: eine geloeschte 2
    // bliebe bei `max + 1` fuer immer frei.
    expect(nextPresetNumber([preset({ number: 1 }), preset({ number: 3 })])).toBe(3 - 1);
    expect(nextPresetNumber([])).toBe(1);
    expect(nextPresetNumber([preset({ number: 1 }), preset({ number: 2 })])).toBe(3);
  });
});

describe('die Tabelle auf der Karte', () => {
  it('führt Nummer, Shot und Segment -- die drei Spalten des Bedarfs', () => {
    const cam = kamera({ presets: [preset({ number: 2, name: 'Pult', segment: 'Predigt' })] });
    const r = presetRows(cam)[0];
    expect(r.nummer).toBe('2');
    expect(r.shot).toBe('Pult');
    expect(r.segment).toBe('Predigt');
  });

  it('nennt ein namenloses Preset als solches, statt die Zeile leer zu lassen', () => {
    expect(presetRows(kamera({ presets: [preset({ name: '' })] }))[0].shot).toBe('(ohne Namen)');
  });

  it('sortiert nach Nummer -- so wird sie am Pult gelesen', () => {
    const cam = kamera({ presets: [preset({ number: 7 }), preset({ number: 2 }), preset({ number: 4 })] });
    expect(presetRows(cam).map((r) => r.nummer)).toEqual(['2', '4', '7']);
  });

  it('trägt den Stand, damit „ist das noch aktuell?" beantwortbar ist', () => {
    expect(presetRows(kamera({ presets: [preset()] }))[0].stand).toBe('2026-09-06');
  });
});

describe('was die Dateien NICHT tun', () => {
  it('die Ableitung holt sich die Zeit nicht selbst', () => {
    expect(quelle).not.toMatch(/new Date\(\)|Date\.now\(\)/);
  });

  it('behauptet keinen Geräte-Abgleich', () => {
    // Der Bedarf nennt „read-back/diff against the device where the protocol
    // allows" -- dieses Repo spricht kein Kamera-Protokoll. Einen Abgleich zu
    // behaupten, der den Plan mit sich selbst vergleicht, waere schlimmer als
    // keiner.
    //
    // Geprueft wird der CODE, nicht der Kopfkommentar -- der nennt die
    // Protokolle ja gerade, um zu sagen, dass sie fehlen. Der erste Versuch
    // dieses Tests fiel genau darueber um.
    expect(ohneKommentare(quelle)).not.toMatch(/visca|onvif|fetch\(|axios|XMLHttpRequest/i);
  });

  it('nimmt die Presets nur MIT Versionssprung in die camera-list auf', () => {
    // Bis 2026-09-27 stand hier „schmuggelt die Presets NICHT in das
    // eingefrorene Format": `camera-list` ist in zwei Repos eingefroren
    // (`cameraListContract.test.ts`), und ein neues Feld waere ein
    // Schema-Bruch ohne Versionssprung gewesen. Seit v3 stehen sie drin —
    // MIT Sprung und mit beiden Vertraegen nachgezogen. Die Bedingung bleibt
    // dieselbe: Presets im Format nur zusammen mit einer Version ab 3.
    expect(cameraExportQuelle).toMatch(/presets/);
    expect(cameraExportQuelle).toMatch(/CAMERA_LIST_VERSION = [3-9] as const/);
  });
});

describe('Erreichbarkeit', () => {
  it('hat eine eigene Gruppe im Seitenstreifen, nur für PTZ', () => {
    expect(sidebarQuelle).toContain('id="presets"');
    expect(sidebarQuelle).toMatch(/\{istPtz && \(/);
    // Die PTZ-Eigenschaft kommt aus dem Katalog-Datensatz und nicht aus dem
    // Modellnamen: „PTZ" im Namen ist keine Eigenschaft des Geraets.
    expect(sidebarQuelle).toContain("camDef?.type === 'ptz'");
  });

  it('speichert aus der aktuellen Stellung und zeigt die Befunde', () => {
    expect(sidebarQuelle).toMatch(/savePresetFromCamera\(cam\.id/);
    expect(sidebarQuelle).toMatch(/checkPresets\(cam,/);
    expect(sidebarQuelle).toContain('presetFindingText');
    // Ausgeschriebener switch, jeder Fall im Quelltext auffindbar. Der erste
    // Versuch verbot `${f.kind}` in einem Template-String -- und traf damit
    // den React-`key` der Liste, der voellig in Ordnung ist. Geprueft wird
    // jetzt, was gemeint war: dass jeder Fall eine eigene Zeile hat.
    for (const kind of [
      'duplicate-number',
      'unnamed',
      'focal-out-of-lens-range',
      'camera-moved-since-save',
      'not-a-ptz',
    ]) {
      expect(sidebarQuelle).toContain(`case '${kind}':`);
    }
  });

  it('steht auf der Kamerakarte und geht in den Fingerabdruck', () => {
    // Die Regel dieses Repos: was auf dem Blatt zu SEHEN ist, muss eingehen.
    expect(exportQuelle).toContain('PTZ-PRESETS');
    expect(exportQuelle).toMatch(/presets: presetZeilen\.map/);
    expect(contentQuelle).toMatch(/presets\?: StampCell\[\]\[\]/);
    expect(contentQuelle).toMatch(/'preset'/);
  });

  it('lässt den Block weg, wenn es keine Presets gibt', () => {
    // Ein fester Block waere auf jeder Karte ohne PTZ eine leere Flaeche.
    expect(exportQuelle).toMatch(/presetZeilen\.length > 0 \? 40 \+/);
    expect(exportQuelle).toMatch(/if \(presetH > 0\)/);
  });
});
