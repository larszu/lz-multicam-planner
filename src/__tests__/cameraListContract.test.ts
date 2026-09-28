// ───────────────────────────────────────────────────────────────────────────
// Drift-Guard fuer das Kamera-Listen-Format `camera-list` v3 (liest v1, v2).
//
// Das Format ist in ZWEI Apps dupliziert: multicam-planner schreibt
// (src/utils/cameraExport.ts), cable-planner liest (src/renderer/lib/
// multicamCameraImport.ts). Beide Modulkoepfe behaupten einander:
// „Schema-identisch zum Cable-Planner" bzw. „Gegenstueck: multicam-planner".
//
// Diese Behauptung stand bis ADR-005 Inkrement 4 unter KEINEM Test. Beide
// Seiten testeten nur sich selbst gegen selbstgeschriebene Fixtures — eine
// Aenderung auf einer Seite waere auf beiden Seiten gruen durchgelaufen.
// Die Schemata waren dabei tatsaechlich identisch; es hielt sie nur nichts.
//
// Gleiches Muster wie src/__tests__/inventoryContract.test.ts: der
// eingefrorene CONTRACT unten steht WORTGLEICH in cable-planner
// tests/cameraListContract.test.ts. Aendert jemand das Schema in EINEM Repo,
// schlaegt dessen Guard fehl. Kein Test in einem Repo kann den Code des
// anderen ausfuehren — aber Auseinanderlaufen wird laut, statt still.
//
// !!! Wenn dieser Contract bewusst geaendert wird:
//   1. CAMERA_LIST_VERSION erhoehen (Abwaertskompatibilitaet beachten),
//   2. die identische Aenderung im cable-planner nachziehen,
//   3. die eingefrorenen Key-Listen in BEIDEN Guards anpassen.
// ───────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { interfaceKeys } from './support/interfaceKeys';
import cameraExportSrc from '../utils/cameraExport.ts?raw';
import {
  CAMERA_LIST_KIND,
  CAMERA_LIST_VERSION,
  toCameraList,
  parseCameraList,
  type CameraListEntry,
  type CameraListExchange,
  type CameraListLens,
  type CameraListPreset,
} from '../utils/cameraExport';
import type { VenueCamera, Camera, Lens } from '../types';

// Eingefrorener Contract — MUSS in beiden Repos identisch sein.
const CONTRACT = {
  kind: 'camera-list',
  version: 3,
  envelopeKeys: ['app', 'appVersion', 'cameras', 'exportedAt', 'formatVersion', 'kind', 'projectId'],
  entryKeys: ['deviceTypeId', 'extender', 'focalMm', 'id', 'label', 'lens', 'manufacturer', 'model', 'mount', 'pan', 'presets', 'tilt', 'x', 'y', 'z'],
  lensKeys: ['focalMaxMm', 'focalMinMm', 'manufacturer', 'model', 'mount'],
  presetKeys: ['focalMm', 'focusM', 'name', 'number', 'pan', 'savedAt', 'segment', 'tilt'],
} as const;

// Voll besetzter Muster-Eintrag (jedes Feld gesetzt). Er haelt die Laufzeit-
// Form fest — NICHT die Typ-Vollstaendigkeit: ein neues optionales Feld
// laesst ihn unveraendert. Dafuer ist der interfaceKeys-Test weiter unten da.
const lens: CameraListLens = {
  manufacturer: 'Fujinon',
  model: 'UA24x7.8',
  focalMinMm: 7.8,
  focalMaxMm: 187,
  mount: 'B4',
};
const preset: CameraListPreset = {
  number: 3,
  name: 'Pult',
  segment: 'Begrüßung',
  pan: 12.5,
  tilt: -4,
  focalMm: 85,
  focusM: 9.2,
  savedAt: '2026-09-06T10:00:00.000Z',
};
const entry: CameraListEntry = {
  id: 'vc1',
  label: 'Kamera 1',
  manufacturer: 'Blackmagic Design',
  model: 'URSA Broadcast G2',
  deviceTypeId: 'dt-cam-0001',
  x: 3.5,
  y: 7.25,
  z: 1.8,
  mount: 'B4',
  focalMm: 50,
  extender: 2,
  lens,
  pan: 180,
  tilt: -3,
  presets: [preset],
};
const exchange: CameraListExchange = {
  kind: CAMERA_LIST_KIND,
  formatVersion: CAMERA_LIST_VERSION,
  app: 'multicam-planner',
  appVersion: '1.2.3',
  exportedAt: '2026-01-01T00:00:00.000Z',
  projectId: '6f1c2a4e-9b0d-4e7a-8c3f-2d5b7a9e1c04',
  cameras: [entry],
};

const sortedKeys = (o: object) => Object.keys(o).sort();

describe('camera-list Wire-Contract (Drift-Guard)', () => {
  it('Format-Marker + Version sind eingefroren', () => {
    expect(CAMERA_LIST_KIND).toBe(CONTRACT.kind);
    expect(CAMERA_LIST_VERSION).toBe(CONTRACT.version);
  });

  it('Envelope-Shape ist eingefroren', () => {
    expect(sortedKeys(exchange)).toEqual(CONTRACT.envelopeKeys);
  });

  it('Feld-Namen des Kamera-Eintrags sind eingefroren', () => {
    expect(sortedKeys(entry)).toEqual(CONTRACT.entryKeys);
  });

  it('Feld-Namen des Objektivs sind eingefroren', () => {
    expect(sortedKeys(lens)).toEqual(CONTRACT.lensKeys);
  });

  it('Feld-Namen des Presets sind eingefroren', () => {
    expect(sortedKeys(preset)).toEqual(CONTRACT.presetKeys);
  });

  it('fängt auch ein neu hinzugefügtes OPTIONALES Feld', () => {
    // Die Muster-Literale oben wuerden das nicht tun. Hier gegen den
    // Interface-Rumpf im Quelltext — dieselbe Pruefung wie im cable-planner,
    // damit der zweiseitige Vertrag auf beiden Seiten gleich scharf ist.
    expect(interfaceKeys(cameraExportSrc, 'CameraListEntry')).toEqual(CONTRACT.entryKeys);
    expect(interfaceKeys(cameraExportSrc, 'CameraListExchange')).toEqual(CONTRACT.envelopeKeys);
    expect(interfaceKeys(cameraExportSrc, 'CameraListLens')).toEqual(CONTRACT.lensKeys);
    expect(interfaceKeys(cameraExportSrc, 'CameraListPreset')).toEqual(CONTRACT.presetKeys);
  });

  it('der ECHTE Exporter schreibt genau den eingefrorenen Envelope', () => {
    // Anders als die cable-Seite (die nur liest) kann hier der Exporter
    // selbst laufen — der Guard prueft also nicht nur die Typen, sondern das,
    // was wirklich in der Datei landet.
    const placed = [
      {
        id: 'vc1', cameraId: 'cam-a', lensId: 'lens-a', label: 'Kamera 1',
        x: 3.5, y: 7.25, z: 1.8, activeMount: 'B4', focalLength: 50, extenderActive: 2,
        pan: 180, tilt: -3,
        presets: [
          {
            id: 'p3', number: 3, name: 'Pult', segment: 'Begrüßung', pan: 12.5, tilt: -4,
            focalLength: 85, focusDistance: 9.2, savedAt: '2026-09-06T10:00:00.000Z',
            savedAtPosition: { x: 3.5, y: 7.25, z: 1.8 },
          },
        ],
      },
    ] as unknown as VenueCamera[];
    const lib = {
      'cam-a': {
        manufacturer: 'Blackmagic Design',
        model: 'URSA Broadcast G2',
        deviceTypeId: 'dt-cam-0001',
        mount: 'EF',
      },
    } as unknown as Record<string, Camera>;
    const optiken = {
      'lens-a': {
        manufacturer: 'Fujinon', model: 'UA24x7.8', focalLengthMin: 7.8, focalLengthMax: 187, mount: 'B4',
      },
    } as unknown as Record<string, Lens>;

    const out = toCameraList(placed, (id) => lib[id], {
      appVersion: '1.2.3',
      exportedAt: '2026-01-01T00:00:00.000Z',
      projectId: '6f1c2a4e-9b0d-4e7a-8c3f-2d5b7a9e1c04',
    }, (id) => optiken[id]);
    expect(sortedKeys(out)).toEqual(CONTRACT.envelopeKeys);
    expect(sortedKeys(out.cameras[0])).toEqual(CONTRACT.entryKeys);
    expect(sortedKeys(out.cameras[0].lens!)).toEqual(CONTRACT.lensKeys);
    // Der Stand des Speicherns bleibt in MultiCam: er ist die Frage „hat
    // sich die Kamera seither bewegt?", und die beantwortet MultiCam selbst.
    expect(sortedKeys(out.cameras[0].presets![0])).toEqual(CONTRACT.presetKeys);
    expect(out).toEqual(exchange);
  });

  it('v1 wird weiter gelesen', () => {
    // Dateien, die vor v2 geschrieben wurden, liegen auf Platten und in
    // Mails. Eine v1-Liste ist eine v2-Liste ohne Optik und ohne Projekt-Id.
    const v1 = {
      kind: 'camera-list', formatVersion: 1, app: 'multicam-planner', appVersion: '4.3.5',
      exportedAt: '2026-09-01T00:00:00.000Z',
      cameras: [{ id: 'vc1', label: 'CAM 1', manufacturer: 'Sony', model: 'PMW-F55', x: 1, y: 2 }],
    };
    const back = parseCameraList(JSON.stringify(v1));
    expect(back.formatVersion).toBe(1);
    expect(back.cameras[0].model).toBe('PMW-F55');
  });

  it('v2 wird weiter gelesen', () => {
    const { pan: _p, tilt: _t, presets: _ps, ...v2Eintrag } = entry;
    const back = parseCameraList(JSON.stringify({ ...exchange, formatVersion: 2, cameras: [v2Eintrag] }));
    expect(back.formatVersion).toBe(2);
    expect(back.cameras[0].presets).toBeUndefined();
  });

  it('parse lehnt fremdes Format und fremde Version ab', () => {
    expect(() => parseCameraList(JSON.stringify({ ...exchange, kind: 'something-else' }))).toThrow();
    expect(() =>
      parseCameraList(JSON.stringify({ ...exchange, formatVersion: CONTRACT.version + 1 })),
    ).toThrow();
    expect(() => parseCameraList(JSON.stringify({ ...exchange, cameras: undefined }))).toThrow();
    expect(() => parseCameraList('not json')).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Der Vertrag kennt nicht nur die Namen der Felder, sondern ihre Bedeutung.
//
// BEFUND (Defektformen-Sweep, Form `vertrag-nur-feldnamen`, gemessen
// 2026-09-07). Alles oberhalb dieser Zeile prueft NAMEN: eingefrorene
// Envelope-Keys, eingefrorene Entry-Keys, dieselben Keys aus dem
// Interface-Rumpf, und vier Ablehnungen, die alle am Umschlag haengen
// (fremdes `kind`, fremde Version, fehlendes Array, kaputtes JSON).
//
// Ueber den INHALT des Arrays stand nichts — und `parseCameraList` sah ihn
// auch nicht an: es gab `data as CameraListExchange` zurueck. Der Cast war
// die ganze Zusicherung. `cameras: [null, 42, {}, { id: 5, x: "links" }]`
// kam als wohlgeformte `CameraListExchange` beim Aufrufer an, und der
// Aufrufer ist der Cable-Planner, der aus jedem Eintrag einen
// Equipment-Knoten baut: ohne `id` einen ohne Identitaet, mit `x: "links"`
// einen bei NaN.
//
// Die Faelle hier sind deshalb keine Typ-Uebungen. Jeder von ihnen ist eine
// Datei, die es geben kann — von Hand editiert, aus einem aelteren Stand
// gerettet, von einem fremden Werkzeug geschrieben.
// ───────────────────────────────────────────────────────────────────────────
describe('camera-list Wire-Contract (Bedeutung, nicht nur Namen)', () => {
  const mitKameras = (cameras: unknown) => JSON.stringify({ ...exchange, cameras });

  it('ein Eintrag muss ein Objekt sein', () => {
    for (const murks of [null, 42, 'CAM 1', [], true]) {
      expect(() => parseCameraList(mitKameras([murks])), String(murks)).toThrow(/Kamera #1/);
    }
  });

  it('id und label sind Pflicht und nicht leer', () => {
    expect(() => parseCameraList(mitKameras([{ ...entry, id: undefined }]))).toThrow(/id/);
    expect(() => parseCameraList(mitKameras([{ ...entry, id: '' }]))).toThrow(/id/);
    expect(() => parseCameraList(mitKameras([{ ...entry, id: '   ' }]))).toThrow(/id/);
    expect(() => parseCameraList(mitKameras([{ ...entry, id: 5 }]))).toThrow(/id/);
    expect(() => parseCameraList(mitKameras([{ ...entry, label: undefined }]))).toThrow(/label/);
  });

  it('x und y sind Zahlen, wenn sie dastehen', () => {
    for (const murks of ['links', null, NaN, Infinity, {}]) {
      expect(() => parseCameraList(mitKameras([{ ...entry, x: murks }])), String(murks)).toThrow(/x/);
    }
    // Aber sie DUERFEN fehlen — eine Kamera ohne Position ist erlaubt, sie
    // steht dann eben noch nirgends. Das ist die Gegenprobe: ohne sie waere
    // „x ist immer Pflicht" ebenfalls gruen.
    const ohnePosition = { id: 'vc9', label: 'CAM 9' };
    expect(parseCameraList(mitKameras([ohnePosition])).cameras[0]).toEqual(ohnePosition);
    // Und 0 ist eine Position, kein fehlender Wert.
    expect(parseCameraList(mitKameras([{ ...entry, x: 0, y: 0 }])).cameras[0].x).toBe(0);
  });

  it('die optionalen Textfelder sind Text, wenn sie dastehen', () => {
    expect(() => parseCameraList(mitKameras([{ ...entry, manufacturer: 7 }]))).toThrow(/manufacturer/);
    expect(() => parseCameraList(mitKameras([{ ...entry, deviceTypeId: {} }]))).toThrow(/deviceTypeId/);
    const ohne = { id: 'vc9', label: 'CAM 9' };
    expect(() => parseCameraList(mitKameras([ohne]))).not.toThrow();
  });

  it('der Umschlag traegt seine Herkunft — sonst weiss niemand, wer das geschrieben hat', () => {
    for (const feld of ['app', 'appVersion', 'exportedAt'] as const) {
      expect(() => parseCameraList(JSON.stringify({ ...exchange, [feld]: undefined })), feld)
        .toThrow(new RegExp(feld));
    }
  });

  it('die Fehlermeldung sagt, WELCHE Kamera es ist', () => {
    // Eine Liste mit 40 Kameras und der Meldung „ungueltig" ist keine Hilfe.
    expect(() => parseCameraList(mitKameras([entry, entry, { ...entry, id: '' }])))
      .toThrow(/Kamera #3/);
  });

  it('was der Exporter schreibt, nimmt der Parser an', () => {
    // Die Rundreise. Ohne sie koennte die neue Pruefung so streng sein, dass
    // sie die eigene Ausgabe ablehnt — und das faellt sonst erst beim Nutzer
    // auf, der exportiert und danach importiert.
    const placed = [
      { id: 'vc1', cameraId: 'cam-a', label: 'Kamera 1', x: 3.5, y: 7.25 },
      { id: 'vc2', cameraId: 'unbekannt', label: 'Kamera 2', x: 0, y: 0 },
    ] as unknown as VenueCamera[];
    const lib = {
      'cam-a': { manufacturer: 'Blackmagic Design', model: 'URSA Broadcast G2', deviceTypeId: 'dt-cam-0001' },
    } as unknown as Record<string, Camera>;
    const out = toCameraList(placed, (id) => lib[id], {
      appVersion: '1.2.3', exportedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(() => parseCameraList(JSON.stringify(out))).not.toThrow();
    expect(parseCameraList(JSON.stringify(out)).cameras).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// v2 (cable-planner#910): die Optik — nach Bedeutung, nicht nur nach Namen.
//
// Drueben wird aus `focalMm` und `lens` eine Zeile am Geraet („24–105 @ 85
// mm"). Eine Brennweite von 0, ein Objektiv, das ein Array ist, ein Extender
// „2x" als Text — jede davon ergaebe dort eine Angabe, die nach Datenblatt
// aussieht und keine ist. Und umgekehrt: was MultiCam NICHT weiss, schreibt
// der Exporter nicht hin.
// ───────────────────────────────────────────────────────────────────────────
describe('camera-list v2 — Optik und Höhe', () => {
  const mitEintrag = (e: unknown) => JSON.stringify({ ...exchange, cameras: [e] });

  it('z ist eine endliche Zahl, wenn es dasteht — auch 0 und darunter', () => {
    for (const murks of ['1.5', null, NaN, Infinity]) {
      expect(() => parseCameraList(mitEintrag({ ...entry, z: murks })), String(murks)).toThrow(/z/);
    }
    // Eine Kamera im Graben steht unter dem Buehnenniveau; das ist eine Hoehe.
    expect(parseCameraList(mitEintrag({ ...entry, z: -0.5 })).cameras[0].z).toBe(-0.5);
  });

  it('Brennweite und Extender sind endlich und größer als 0', () => {
    for (const feld of ['focalMm', 'extender'] as const) {
      for (const murks of [0, -2, NaN, Infinity, '2x', null]) {
        expect(() => parseCameraList(mitEintrag({ ...entry, [feld]: murks })), `${feld}=${murks}`)
          .toThrow(new RegExp(feld));
      }
    }
  });

  it('mount ist Text', () => {
    expect(() => parseCameraList(mitEintrag({ ...entry, mount: 4 }))).toThrow(/mount/);
  });

  it('lens ist ein Objekt, und seine Felder bedeuten, was sie heißen', () => {
    for (const murks of [null, [], 'Fujinon', 7]) {
      expect(() => parseCameraList(mitEintrag({ ...entry, lens: murks })), String(murks)).toThrow(/lens/);
    }
    expect(() => parseCameraList(mitEintrag({ ...entry, lens: { ...lens, focalMinMm: 0 } }))).toThrow(/focalMinMm/);
    expect(() => parseCameraList(mitEintrag({ ...entry, lens: { ...lens, focalMaxMm: 'tele' } }))).toThrow(/focalMaxMm/);
    expect(() => parseCameraList(mitEintrag({ ...entry, lens: { ...lens, model: 24 } }))).toThrow(/model/);
    // Ein Objektiv, von dem nur der Name bekannt ist, ist erlaubt.
    expect(parseCameraList(mitEintrag({ ...entry, lens: { model: 'UA24x7.8' } })).cameras[0].lens)
      .toEqual({ model: 'UA24x7.8' });
  });

  it('die Projekt-Id ist Text und nicht leer, wenn sie dasteht', () => {
    for (const murks of ['', '   ', 42, null]) {
      expect(() => parseCameraList(JSON.stringify({ ...exchange, projectId: murks })), String(murks))
        .toThrow(/projectId/);
    }
    const { projectId: _ohne, ...ohneId } = exchange;
    expect(() => parseCameraList(JSON.stringify(ohneId))).not.toThrow();
  });

  describe('der Exporter schreibt nur, was er weiß', () => {
    const meta = { appVersion: '1.2.3', exportedAt: '2026-01-01T00:00:00.000Z' };
    const basis = {
      id: 'vc1', cameraId: 'cam-a', lensId: 'lens-a', label: 'CAM 1',
      x: 1, y: 2, z: 1.5, focalLength: 24, extenderActive: 1,
    };
    const kamera = { manufacturer: 'Sony', model: 'HDC-3500', mount: 'B4' } as unknown as Camera;

    it('kein Extender bei Faktor 1 und bei einem Wahrheitswert aus alten Dateien', () => {
      for (const extenderActive of [1, true, false, undefined]) {
        const out = toCameraList([{ ...basis, extenderActive } as unknown as VenueCamera], () => kamera, meta);
        expect('extender' in out.cameras[0], String(extenderActive)).toBe(false);
      }
    });

    it('der aktive Mount ist ohne Wechsel-Mount der native — ohne Kamera keiner', () => {
      const out = toCameraList([basis as unknown as VenueCamera], () => kamera, meta);
      expect(out.cameras[0].mount).toBe('B4');
      const gewechselt = toCameraList([{ ...basis, activeMount: 'EF' } as unknown as VenueCamera], () => kamera, meta);
      expect(gewechselt.cameras[0].mount).toBe('EF');
      const unbekannt = toCameraList([basis as unknown as VenueCamera], () => undefined, meta);
      expect('mount' in unbekannt.cameras[0]).toBe(false);
    });

    it('kein Objektiv, wenn es nicht aufzulösen ist — und keine Projekt-Id, wenn keine da ist', () => {
      const out = toCameraList([basis as unknown as VenueCamera], () => kamera, meta);
      expect('lens' in out.cameras[0]).toBe(false);
      expect('projectId' in out).toBe(false);
    });

    it('keine Höhe und keine Brennweite, die keine Zahl ist', () => {
      const out = toCameraList(
        [{ ...basis, z: undefined, focalLength: NaN } as unknown as VenueCamera], () => kamera, meta,
      );
      expect('z' in out.cameras[0]).toBe(false);
      expect('focalMm' in out.cameras[0]).toBe(false);
      // Und was fehlt, laesst den Parser nicht scheitern: die Rundreise haelt.
      expect(() => parseCameraList(JSON.stringify(out))).not.toThrow();
    });
  });
});

describe('camera-list v3: ein Preset ist nachstellbar oder die Datei lädt nicht', () => {
  const mitPreset = (p: Record<string, unknown>) =>
    JSON.stringify({ ...exchange, cameras: [{ ...entry, presets: [{ ...preset, ...p }] }] });

  it('nimmt ein vollständiges Preset an', () => {
    expect(parseCameraList(JSON.stringify(exchange)).cameras[0].presets![0].name).toBe('Pult');
  });

  it('lehnt Nummer, Brennweite und Fokus ab, die es nicht gibt', () => {
    expect(() => parseCameraList(mitPreset({ number: -1 }))).toThrow(/number/);
    expect(() => parseCameraList(mitPreset({ number: 2.5 }))).toThrow(/number/);
    expect(() => parseCameraList(mitPreset({ focalMm: 0 }))).toThrow(/focalMm/);
    expect(() => parseCameraList(mitPreset({ focusM: -1 }))).toThrow(/focusM/);
    expect(() => parseCameraList(mitPreset({ pan: 'links' }))).toThrow(/pan/);
  });

  it('verlangt Ausrichtung, Optik und Stand', () => {
    for (const feld of ['pan', 'tilt', 'focalMm', 'focusM', 'savedAt']) {
      expect(() => parseCameraList(mitPreset({ [feld]: undefined })), feld).toThrow(new RegExp(feld));
    }
  });

  it('presets ist eine Liste', () => {
    expect(() =>
      parseCameraList(JSON.stringify({ ...exchange, cameras: [{ ...entry, presets: { 3: preset } }] })),
    ).toThrow(/presets/);
  });
});
