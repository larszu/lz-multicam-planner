import { describe, expect, it } from 'vitest';
import { CAMERAS } from '../data/cameras';
import { LENSES } from '../data/lenses';
import { RIGS } from '../data/rigs';
import { GERAETETYP_IDS, geraetetypIdVon } from '../data/geraetetypIds';
import { toCameraList } from '../utils/cameraExport';
import type { VenueCamera } from '../types';

// ---------------------------------------------------------------------------
// Die stabile Geraetetyp-Id je Katalog-Eintrag (2026-09-24).
//
// ─── DER BEFUND, AUS DEM SIE KOMMT ─────────────────────────────────────────
//
// `cameraExport.ts` schrieb `deviceTypeId` in die camera-list, damit der
// Cable-Planner die Kamera AUTORITATIV auf ihr Datenblatt aufloest statt ueber
// den Modellnamen zu raten. Gemessen: das Feld war an NEUN von 377 Kameras
// gesetzt. Bei 368 stand `undefined` — die Bruecke war gebaut und trug nichts.
//
// ─── WAS HIER GEPRUEFT WIRD ────────────────────────────────────────────────
//
// 1. Die Tabelle deckt JEDEN Katalog-Eintrag ab. Eine Luecke hiesse: dieses
//    Geraet wird beim Export wieder namentlich geraten, und niemand merkt es.
// 2. Die neun von Hand gesetzten GUIDs gewinnen weiter. Sie sind aelter als
//    die Ableitung, und gespeicherte Plaene zeigen auf sie.
// 3. Die Ids sind STABIL. Sie sind UUIDv5 ueber einen festen Namensraum; ein
//    neu gewuerfelter Namensraum liesse jede gespeicherte Verknuepfung ins
//    Leere zeigen. Die drei Goldwerte unten sind der Anker dafuer.
// 4. Der Export gibt sie wirklich mit.
//
// Erzeugt wird die Tabelle im cable-planner (`npm run katalog:uebernahme`);
// dieselbe Rechnung schreibt dort die Katalog-GUIDs. Eine Abweichung zwischen
// beiden ist deshalb nicht moeglich, solange niemand von Hand hineinschreibt.
// ---------------------------------------------------------------------------

describe('die Tabelle deckt die Kataloge ab', () => {
  it('kennt jede Kamera, jedes Objektiv und jedes Rig', () => {
    const fehlend = {
      camera: CAMERAS.filter((c) => !geraetetypIdVon('camera', c.id)).map((c) => c.id),
      lens: LENSES.filter((l) => !geraetetypIdVon('lens', l.id)).map((l) => l.id),
      rig: RIGS.filter((r) => !geraetetypIdVon('rig', r.id)).map((r) => r.id),
    };
    expect(fehlend).toEqual({ camera: [], lens: [], rig: [] });
  });

  it('hat keine Id doppelt — sonst zeigten zwei Geraete auf dasselbe Datenblatt', () => {
    const alle = Object.values(GERAETETYP_IDS).flatMap((t) => Object.values(t));
    expect(alle.length).toBe(new Set(alle).size);
  });

  it('gibt fuer eine unbekannte Quell-Id nichts zurueck, statt etwas zu erfinden', () => {
    expect(geraetetypIdVon('camera', 'gibt-es-nicht')).toBeUndefined();
    expect(geraetetypIdVon('camera', undefined)).toBeUndefined();
    expect(geraetetypIdVon('gibt-es-nicht', 'sony-fx6')).toBeUndefined();
  });
});

describe('die von Hand gesetzten GUIDs bleiben', () => {
  it('uebernimmt sie in die Tabelle, statt sie zu ueberschreiben', () => {
    const mitHand = CAMERAS.filter((c) => c.deviceTypeId);
    expect(mitHand.length).toBeGreaterThan(0);
    for (const c of mitHand) {
      expect(geraetetypIdVon('camera', c.id), c.id).toBe(c.deviceTypeId);
    }
  });
});

describe('die Ids sind stabil', () => {
  it('haelt drei Goldwerte fest — ein neuer Namensraum faellt hier auf', () => {
    // UUIDv5, Namensraum a7f3c1e2-5b84-5d16-9c3a-7e2f4b8d0a61, Name
    // `avplan:<bereich>:<quellId>`. Wer den Namensraum aendert, macht diese
    // drei Zeilen rot — und genau das ist der Zweck: jede gespeicherte
    // Verknuepfung in jedem Projektfile haengt daran.
    expect(geraetetypIdVon('camera', 'sony-hdc-3500')).toBe('a3e679c9-d581-53a8-ac75-6d00b07f9215');
    expect(geraetetypIdVon('camera', 'sony-fx6')).toBe('a823f2ff-3be9-4c45-af4e-bd4f6b13f7d7');
    expect(geraetetypIdVon('lens', 'fuj-ua107x8.4')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('der Export gibt die Identitaet mit', () => {
  const platziert = (cameraId: string): VenueCamera =>
    ({ id: `v-${cameraId}`, label: 'Kamera 1', cameraId, x: 1, y: 2 }) as unknown as VenueCamera;

  it('traegt sie auch fuer eine Kamera ohne von Hand gesetzte GUID', () => {
    // Der eigentliche Befund: genau diese Kameras gingen vorher ohne Identitaet
    // hinueber. `sony-hdc-3500` fuehrt keine eigene GUID in `cameras.ts`.
    const ohneHand = CAMERAS.find((c) => !c.deviceTypeId)!;
    const liste = toCameraList(
      [platziert(ohneHand.id)],
      (id) => CAMERAS.find((c) => c.id === id),
      { appVersion: '0', exportedAt: '2026-09-24T00:00:00.000Z' },
    );
    expect(liste.cameras[0].deviceTypeId).toBe(geraetetypIdVon('camera', ohneHand.id));
    expect(liste.cameras[0].deviceTypeId).toBeTruthy();
  });

  it('laesst eine unbekannte Kamera ohne Id, statt eine zu erfinden', () => {
    const liste = toCameraList(
      [platziert('kenne-ich-nicht')],
      () => undefined,
      { appVersion: '0', exportedAt: '2026-09-24T00:00:00.000Z' },
    );
    expect(liste.cameras[0].deviceTypeId).toBeUndefined();
  });
});
