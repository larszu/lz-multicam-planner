import { describe, it, expect } from 'vitest';
import { CAMERAS } from '../data/cameras';
import { CABLE_CAMERA_IDS, type CableCameraIdentity } from '../data/cableCameraCatalogIds';
import { normaliseIdentity, uniqueCatalogMatch } from '../utils/deviceTypeMatch';

// ───────────────────────────────────────────────────────────────────────────
// Die GUIDs in cameras.ts gegen den Abzug des cable-planner-Katalogs (#145).
//
// Ausgangslage: 9 von 377 Kameras trugen eine `deviceTypeId`, gesetzt von
// Hand und von keinem Test gegen den Katalog gehalten. Eine GUID, die es
// drueben nicht gibt, loest dort auf nichts auf — und eine, die auf das
// falsche Modell zeigt, loest AUTORITATIV auf die falschen Ports auf.
//
// Die vier Zusicherungen hier: jede GUID gibt es im Abzug; keine GUID steht
// an zwei verschiedenen Modellen; jede Kamera mit eindeutigem, woertlichem
// Treffer TRAEGT dessen GUID (sonst waere der Abgleich eine Momentaufnahme,
// die beim naechsten Auffrischen des Abzugs still veraltet); und der Abzug
// selbst ist in sich eindeutig.
// ───────────────────────────────────────────────────────────────────────────

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const modell = (c: { manufacturer: string; model: string }) =>
  `${normaliseIdentity(c.manufacturer)}|${normaliseIdentity(c.model)}`;

describe('der Abzug des cable-planner-Katalogs', () => {
  it('vergibt jede GUID genau einmal und in GUID-Form', () => {
    const ids = CABLE_CAMERA_IDS.map((e) => e.deviceTypeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(GUID);
  });
});

describe('deviceTypeId in cameras.ts', () => {
  const imAbzug = new Set(CABLE_CAMERA_IDS.map((e) => e.deviceTypeId));

  it('jede GUID gibt es im Abzug', () => {
    const fremd = CAMERAS.filter((c) => c.deviceTypeId !== undefined && !imAbzug.has(c.deviceTypeId))
      .map((c) => `${c.id}: ${c.deviceTypeId}`);
    expect(fremd).toEqual([]);
  });

  it('keine GUID steht an zwei verschiedenen Modellen', () => {
    const jeGuid = new Map<string, Set<string>>();
    for (const c of CAMERAS) {
      if (!c.deviceTypeId) continue;
      jeGuid.set(c.deviceTypeId, (jeGuid.get(c.deviceTypeId) ?? new Set()).add(modell(c)));
    }
    const doppelt = [...jeGuid].filter(([, modelle]) => modelle.size > 1)
      .map(([guid, modelle]) => `${guid}: ${[...modelle].join(' / ')}`);
    expect(doppelt).toEqual([]);
  });

  it('jede Kamera mit eindeutigem, woertlichem Treffer traegt dessen GUID', () => {
    // Die Fehlermeldung ist die Arbeitsanweisung nach `npm run katalog:cable-ids`.
    const fehlt = CAMERAS.flatMap((c) => {
      const treffer = uniqueCatalogMatch(c.manufacturer, c.model);
      return treffer && c.deviceTypeId !== treffer.deviceTypeId
        ? [`${c.id} (${c.manufacturer} ${c.model}): deviceTypeId '${treffer.deviceTypeId}' — steht: ${c.deviceTypeId ?? 'keine'}`]
        : [];
    });
    expect(fehlt).toEqual([]);
  });

  it('mehr Kameras als die neun von Hand gesetzten tragen eine GUID', () => {
    // Der gemessene Stand nach dem Abgleich (#145): 12. Eine Untergrenze und
    // kein Gleich — wer den Abzug auffrischt, soll hier nicht nachzaehlen.
    expect(CAMERAS.filter((c) => c.deviceTypeId).length).toBeGreaterThanOrEqual(12);
  });

  it('traegt die vier von Hand zugeordneten Blackmagic-Modelle', () => {
    // Namensvarianten, die der woertliche Abgleich nicht trifft (siehe Kommentar
    // in cameras.ts). Ohne GUID kaemen sie im cable-planner ohne Anschluesse an.
    const guid = (id: string) => CAMERAS.find((c) => c.id === id)?.deviceTypeId;
    expect(guid('bmd-pocket6k')).toBe('d073d39d-9d61-492c-8022-93676460c668');
    expect(guid('bmd-pocket4k')).toBe('ea3ea3d8-3a1c-4087-ab03-1ce394ec1ea5');
    expect(guid('bmd-ursa-g2')).toBe('841e8039-0e83-4734-904f-bf4ffcdb8882');
    expect(guid('bmd-ursa-46k')).toBe('26557b2a-6df5-449c-bcef-29a24e4a811e');
    expect(guid('bmd-studio4kplus')).toBeUndefined();
  });
});

describe('uniqueCatalogMatch — woertlich oder gar nicht', () => {
  const katalog: CableCameraIdentity[] = [
    { deviceTypeId: 'g-z280', name: 'Sony PXW-Z280', manufacturer: 'Sony', model: 'PXW-Z280' },
    { deviceTypeId: 'g-fs7', name: 'Sony PXW-FS7 Mk II', manufacturer: 'Sony', model: 'PXW-FS7 Mk II' },
    { deviceTypeId: 'g-a', name: 'Acme Cam 1', manufacturer: 'Acme', model: 'Cam 1' },
    { deviceTypeId: 'g-b', name: 'Acme Cam-1', manufacturer: 'Acme', model: 'Cam-1' },
    { deviceTypeId: 'g-x', name: 'Unbekannt X1' },
  ];

  it('gleicht Gross/klein, Leerraum und Bindestriche aus', () => {
    expect(uniqueCatalogMatch('sony', 'pxw z280', katalog)?.deviceTypeId).toBe('g-z280');
    expect(uniqueCatalogMatch(' SONY ', 'PXW‑Z280', katalog)?.deviceTypeId).toBe('g-z280');
    expect(uniqueCatalogMatch('Sony', 'PXW  -  Z280', katalog)?.deviceTypeId).toBe('g-z280');
  });

  it('rät nicht: ähnliche Namen treffen nicht', () => {
    expect(uniqueCatalogMatch('Sony', 'PXW-FS7 II', katalog)).toBeUndefined();
    expect(uniqueCatalogMatch('Sony', 'Z280', katalog)).toBeUndefined();
    expect(uniqueCatalogMatch('Sony Electronics', 'PXW-Z280', katalog)).toBeUndefined();
  });

  it('mehrdeutig heisst: keine GUID', () => {
    // „Cam 1" und „Cam-1" sind nach der Normalisierung dasselbe — zwei
    // Eintraege, also keiner.
    expect(uniqueCatalogMatch('Acme', 'Cam 1', katalog)).toBeUndefined();
  });

  it('ein Eintrag ohne Hersteller/Modell trifft nie per Namen', () => {
    expect(uniqueCatalogMatch('Unbekannt', 'X1', katalog)).toBeUndefined();
    expect(uniqueCatalogMatch('', '', katalog)).toBeUndefined();
  });
});
