import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProjectFile, Venue } from '../types';
import { neueSitzflaeche, neueVideowand, platzFuerPerson, publikumsBild, venueAusDatei } from '../utils/raum';
import { SHOW_LICHT_STANDARD, autoVideoWalls, hatSpielfeld, istSpielfeld, showLichtAus, showRig } from '../utils/showRig';
import { TEMPLATES } from '../data/templates';
import { fromVenueExchange, toVenueExchange } from '../utils/venueExchange';
import { sitzblockEcken, sitzblockNormal, videowandNormal } from '../avplan/floorplan';

const halle = (over: Partial<Venue> = {}): Venue => ({
  name: 'Halle', widthM: 20, heightM: 15,
  stages: [{ id: 's', x: 7, y: 0.5, width: 6, height: 3, label: 'Stage', elevationM: 1 }],
  ...over,
});

describe('Raum: neue Flaechen und Waende', () => {
  it('Publikumsflaeche liegt vor der Buehne, blickt zu ihr und bleibt im Raum', () => {
    const v = halle();
    const b = sitzblockNormal(neueSitzflaeche(v));
    expect(b.rotationDeg).toBe(0);
    for (const e of sitzblockEcken(b)) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(v.widthM);
      expect(e.y).toBeGreaterThan(3.5);
      expect(e.y).toBeLessThanOrEqual(v.heightM);
    }
  });

  it('Buehne unten: Flaeche oben, um 180° gedreht', () => {
    const v = halle({ stages: [{ id: 's', x: 7, y: 11, width: 6, height: 3, label: 'S' }] });
    const b = sitzblockNormal(neueSitzflaeche(v, true));
    expect(b.rotationDeg).toBe(180);
    expect(b.standing).toBe(true);
    expect(b.y).toBeLessThan(11);
  });

  it('Videowand steht hinten auf der Buehne, Unterkante ueber dem Podest', () => {
    const w = videowandNormal(neueVideowand(halle()));
    expect(w.y).toBeLessThan(1.5);
    expect(w.bottomM).toBeCloseTo(2);
    expect(w.heightM / w.widthM).toBeCloseTo(9 / 16, 1);
  });

  it('neue Personen kommen auf die Buehne, nebeneinander', () => {
    const v = halle();
    const a = platzFuerPerson(v, 0);
    const b = platzFuerPerson(v, 1);
    expect(a.x).toBeGreaterThan(7);
    expect(a.x).toBeLessThan(13);
    expect(a.y).toBeGreaterThan(0.5);
    expect(a.y).toBeLessThan(3.5);
    expect(b.x).not.toBe(a.x);
  });

  it('auf einem Spielfeld nicht: dort bleibt die Raummitte', () => {
    const v = halle({ widthM: 110, heightM: 75, stages: [{ id: 'p', x: 5, y: 5, width: 100, height: 65, label: 'Pitch' }] });
    expect(platzFuerPerson(v, 0)).toEqual({ x: 55, y: 37.5 });
  });
});

describe('Raum: Publikum in 3D', () => {
  const basis = { widthM: 20, depthM: 15, stages: halle().stages, cameras: [] as { x: number; y: number }[], persons: [] as { x: number; y: number }[], walls: [] };

  it('ohne Flaechen: bisherige Fuellung, stehend, Blick zur Buehne', () => {
    const bild = publikumsBild(basis);
    expect(bild.menschen.length).toBeGreaterThan(50);
    expect(bild.sitze).toHaveLength(0);
    const p = bild.menschen[bild.menschen.length - 1];
    // Buehnenmitte liegt oben (kleines y): Blick nach −y, also um −90°.
    expect(p.blickDeg).toBeLessThan(-45);
    expect(p.blickDeg).toBeGreaterThan(-135);
    expect(bild.menschen.every((m) => m.pose !== 'sitzen')).toBe(true);
  });

  it('Sitzflaeche: Sitze auf jedem Platz, Menschen nach Belegung, Tribuene bei Steigung', () => {
    const block = { id: 'b', x: 10, y: 10, width: 10, rows: 5, riseM: 0.4, occupancy: 0.5 };
    const bild = publikumsBild({ ...basis, blocks: [block] });
    expect(bild.sitze.length).toBeGreaterThan(bild.menschen.length);
    expect(bild.menschen.every((m) => m.pose === 'sitzen')).toBe(true);
    expect(bild.tribuenen).toHaveLength(1);
  });

  it('Stehflaeche: keine Sitze, keine Tribuene', () => {
    const bild = publikumsBild({ ...basis, blocks: [{ id: 'b', x: 10, y: 10, width: 10, rows: 5, standing: true }] });
    expect(bild.sitze).toHaveLength(0);
    expect(bild.tribuenen).toHaveLength(0);
    expect(bild.menschen.length).toBeGreaterThan(50);
  });

  it('um Kameras bleibt Platz', () => {
    const block = { id: 'b', x: 10, y: 10, width: 10, rows: 5, occupancy: 1 };
    const kamera = { x: 10, y: 10 };
    const bild = publikumsBild({ ...basis, cameras: [kamera], blocks: [block] });
    expect(bild.menschen.some((m) => Math.hypot(m.x - kamera.x, m.y - kamera.y) < 1)).toBe(false);
  });
});

describe('Showlicht', () => {
  const blick = { x: 10, y: 12 };

  it('Traverse vor und hinter der Buehne, Wash zeigt auf die Buehne', () => {
    const rig = showRig(halle().stages, blick, { widthM: 20, heightM: 15 });
    expect(rig.traversen).toHaveLength(2);
    const wash = rig.lampen.filter((l) => l.art === 'wash');
    expect(wash.length).toBeGreaterThanOrEqual(2);
    for (const l of wash) {
      expect(l.nach[2]).toBeGreaterThan(0.5);
      expect(l.nach[2]).toBeLessThan(3.5);
      expect(l.von[2]).toBeGreaterThan(3.5);
    }
  });

  it('Beams zeigen ins Publikum, nicht in die Rueckwand', () => {
    const rig = showRig(halle().stages, blick, { widthM: 20, heightM: 15 });
    for (const l of rig.lampen.filter((x) => x.art === 'beam')) expect(l.nach[2]).toBeGreaterThan(l.von[2]);
  });

  it('Spielfeld bekommt Flutlicht statt Traverse', () => {
    const feld = [{ id: 'p', x: 5, y: 5, width: 100, height: 65, label: 'Pitch' }];
    expect(istSpielfeld(feld[0])).toBe(true);
    expect(hatSpielfeld(feld)).toBe(true);
    const rig = showRig(feld, { x: 55, y: 70 }, { widthM: 110, heightM: 75 });
    expect(rig.traversen).toHaveLength(0);
    expect(rig.lampen.filter((l) => l.art === 'flut')).toHaveLength(4);
  });

  it('die bisherige Videowand-Andeutung zeigt zu den Kameras', () => {
    const [w] = autoVideoWalls(halle().stages, blick);
    expect(videowandNormal(w).rotationDeg).toBe(0);
    const [w2] = autoVideoWalls(halle().stages, { x: 10, y: -10 });
    expect(videowandNormal(w2).rotationDeg).toBe(180);
  });
});

describe('Vorlagen', () => {
  it('jede Vorlage hat Publikum und eine Videowand, alles im Raum', () => {
    for (const t of TEMPLATES) {
      expect(t.venue.seatingBlocks?.length, t.id).toBeGreaterThan(0);
      expect(t.venue.videoWalls?.length, t.id).toBeGreaterThan(0);
      for (const b of t.venue.seatingBlocks ?? []) {
        for (const e of sitzblockEcken(b)) {
          expect(e.x, `${t.id}/${b.id}`).toBeGreaterThanOrEqual(-0.01);
          expect(e.x, `${t.id}/${b.id}`).toBeLessThanOrEqual(t.venue.widthM + 0.01);
          expect(e.y, `${t.id}/${b.id}`).toBeGreaterThanOrEqual(-0.01);
          expect(e.y, `${t.id}/${b.id}`).toBeLessThanOrEqual(t.venue.heightM + 0.01);
        }
      }
      for (const c of t.cameras) {
        expect(c.x, `${t.id}/${c.label}`).toBeLessThanOrEqual(t.venue.widthM);
        expect(c.y, `${t.id}/${c.label}`).toBeLessThanOrEqual(t.venue.heightM);
      }
    }
  });

  it('Kirche: CAM 2 und CAM 3 neigen leicht nach unten', () => {
    const k = TEMPLATES.find((t) => t.id === 'church-standard')!;
    for (const l of ['CAM 2', 'CAM 3']) expect(k.cameras.find((c) => c.label === l)!.tilt).toBeLessThan(0);
  });
});

describe('Projektdatei: Raum abwaertskompatibel', () => {
  it('eine Venue ohne Raum-Felder bleibt, wie sie ist', () => {
    const alt = halle();
    expect(venueAusDatei(alt, alt.stages)).toEqual(alt);
  });

  it('Raum-Felder kommen durch, Kaputtes faellt weg', () => {
    const roh = { ...halle(), ceilingHeightM: 9, floorMaterial: 'lava', wallMaterial: 'glass', seatingBlocks: [{ id: 'b', x: 1, y: 1, width: 4, rows: 2 }, { kaputt: true }] } as unknown as Venue;
    const v = venueAusDatei(roh, roh.stages);
    expect(v.ceilingHeightM).toBe(9);
    expect(v.floorMaterial).toBeUndefined();
    expect(v.wallMaterial).toBeUndefined();
    expect(v.seatingBlocks).toHaveLength(1);
  });

  it('Austauschformat traegt den Raum hin und zurueck', () => {
    const venue = halle({ ceilingHeightM: 8, floorMaterial: 'wood', wallMaterial: 'brick', seatingBlocks: [{ id: 'b', x: 10, y: 9, width: 8, rows: 6, standing: true }], videoWalls: [{ id: 'w', x: 10, y: 1, widthM: 4, heightM: 2.25 }] });
    const ex = toVenueExchange({ venue, persons: [], walls: [], backgroundPlan: null, appVersion: 't', exportedAt: '' });
    const zurueck = fromVenueExchange(JSON.parse(JSON.stringify(ex))).venue;
    expect(zurueck.ceilingHeightM).toBe(8);
    expect(zurueck.floorMaterial).toBe('wood');
    expect(zurueck.wallMaterial).toBe('brick');
    expect(zurueck.seatingBlocks).toEqual(venue.seatingBlocks);
    expect(zurueck.videoWalls).toEqual(venue.videoWalls);
  });
});

describe('Projektdatei: Laden und Speichern', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  const datei = (venue: Venue): ProjectFile => ({
    formatVersion: 1, appVersion: '4.3.1', projectVersion: 2, savedAt: '', venue,
    cameras: [], persons: [], walls: [], backgroundPlan: null,
  });

  it('alter Stand laedt ohne Raum-Felder, neuer Stand ueberlebt Speichern und Laden', async () => {
    const { useStore, buildProjectFile } = await import('../store/useStore');
    useStore.getState().applyProjectFile(datei(halle()));
    expect(useStore.getState().venue.seatingBlocks).toBeUndefined();
    expect(useStore.getState().venue.wallMaterial).toBeUndefined();

    useStore.getState().addSeatingBlock(true);
    useStore.getState().addVideoWall();
    useStore.getState().setVenue({ ...useStore.getState().venue, wallMaterial: 'drape' });
    const wand = useStore.getState().venue.videoWalls![0];
    useStore.getState().updateVideoWall(wand.id, { x: 4.5, y: 2, bottomM: 2.5, rotationDeg: 90 });
    const gespeichert = JSON.parse(JSON.stringify(buildProjectFile(useStore.getState()))) as ProjectFile;
    useStore.getState().applyProjectFile(datei(halle()));
    useStore.getState().applyProjectFile(gespeichert);
    const v = useStore.getState().venue;
    expect(v.seatingBlocks).toHaveLength(1);
    expect(v.seatingBlocks![0].standing).toBe(true);
    expect(v.videoWalls).toHaveLength(1);
    expect(v.videoWalls![0]).toMatchObject({ x: 4.5, y: 2, bottomM: 2.5, rotationDeg: 90 });
    expect(v.wallMaterial).toBe('drape');
  });
});

describe('Showlicht einstellbar, im Projekt gespeichert', () => {
  const ablage: Record<string, string> = {};
  beforeEach(() => {
    for (const key of Object.keys(ablage)) delete ablage[key];
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => ablage[key] ?? null,
      setItem: (key: string, value: string) => { ablage[key] = value; },
      removeItem: (key: string) => { delete ablage[key]; },
    });
  });
  const blick = { x: 10, y: 12 };
  const stages = halle().stages;
  const art = (rig: ReturnType<typeof showRig>, a: string) => rig.lampen.filter((l) => l.art === a);

  it('ohne Angabe gelten die Standards — das Rig ist dasselbe wie vorher ohne Einstellung', () => {
    expect(showLichtAus(undefined)).toEqual(SHOW_LICHT_STANDARD);
    expect(showRig(stages, blick, { widthM: 20, heightM: 15 }, showLichtAus(undefined))).toEqual(showRig(stages, blick, { widthM: 20, heightM: 15 }));
  });

  it('Unbrauchbares wird zum Standard, Zahlen werden begrenzt', () => {
    const e = showLichtAus({ brightness: 9, haze: -1, mood: 'disco', color: 'rot', fixtures: 'laser', amount: 3, aimAtStage: 'ja' });
    expect(e).toEqual({ ...SHOW_LICHT_STANDARD, brightness: 2, haze: 0 });
    expect(showLichtAus({ mood: 'custom', color: '#FF0000' })).toMatchObject({ mood: 'custom', color: '#ff0000' });
  });

  it('Art, Anzahl, Helligkeit und Farbe steuern die Lampen', () => {
    const v = { widthM: 20, heightM: 15 };
    const std = showRig(stages, blick, v);
    expect(art(showRig(stages, blick, v, { ...SHOW_LICHT_STANDARD, fixtures: 'wash' }), 'beam')).toHaveLength(0);
    expect(art(showRig(stages, blick, v, { ...SHOW_LICHT_STANDARD, fixtures: 'beams' }), 'wash')).toHaveLength(0);
    expect(art(showRig(stages, blick, v, { ...SHOW_LICHT_STANDARD, amount: 'many' }), 'beam').length).toBeGreaterThan(art(std, 'beam').length);
    expect(art(showRig(stages, blick, v, { ...SHOW_LICHT_STANDARD, amount: 'few' }), 'wash').length).toBeLessThan(art(std, 'wash').length);
    const hell = showRig(stages, blick, v, { ...SHOW_LICHT_STANDARD, brightness: 1.5 });
    expect(hell.lampen[0].intensitaet).toBeCloseTo(std.lampen[0].intensitaet * 1.5, 9);
    const rot = showRig(stages, blick, v, { ...SHOW_LICHT_STANDARD, mood: 'custom', color: '#ff0000' });
    expect(new Set(art(rot, 'beam').map((l) => l.farbe))).toEqual(new Set(['#ff0000']));
    // Front bleibt warmweiss, auch in bunten Stimmungen.
    expect(art(showRig(stages, blick, v, { ...SHOW_LICHT_STANDARD, mood: 'concert' }), 'wash').every((l) => l.farbe === '#fff0e2')).toBe(true);
  });

  it('„Auf die Buehne richten": jeder Beam endet auf der Buehnenflaeche', () => {
    const s = stages[0];
    const rig = showRig(stages, blick, { widthM: 20, heightM: 15 }, { ...SHOW_LICHT_STANDARD, aimAtStage: true });
    const beams = art(rig, 'beam');
    expect(beams.length).toBeGreaterThan(0);
    for (const l of beams) {
      expect(l.nach[0]).toBeGreaterThanOrEqual(s.x);
      expect(l.nach[0]).toBeLessThanOrEqual(s.x + s.width);
      expect(l.nach[2]).toBeGreaterThanOrEqual(s.y);
      expect(l.nach[2]).toBeLessThanOrEqual(s.y + s.height);
    }
  });

  it('alte Projektdatei ohne Showlicht laedt, eigenes Showlicht ueberlebt Speichern und Laden', async () => {
    const { useStore, buildProjectFile } = await import('../store/useStore');
    const datei = (venue: Venue): ProjectFile => ({
      formatVersion: 1, appVersion: '4.8.0', projectVersion: 2, savedAt: '', venue,
      cameras: [], persons: [], walls: [], backgroundPlan: null,
    });
    useStore.getState().applyProjectFile(datei(halle()));
    expect(useStore.getState().venue.showLight).toBeUndefined();

    const eigen = { ...SHOW_LICHT_STANDARD, brightness: 0.7, mood: 'warm' as const, haze: 0.2, fixtures: 'wash' as const, amount: 'many' as const };
    useStore.getState().setVenue({ ...useStore.getState().venue, showLight: eigen });
    const gespeichert = JSON.parse(JSON.stringify(buildProjectFile(useStore.getState()))) as ProjectFile;
    useStore.getState().applyProjectFile(datei(halle()));
    expect(useStore.getState().venue.showLight).toBeUndefined();
    useStore.getState().applyProjectFile(gespeichert);
    expect(useStore.getState().venue.showLight).toEqual(eigen);

    // Kaputter Eintrag in einer Datei: Standards statt Absturz.
    const kaputt = venueAusDatei({ ...halle(), showLight: { brightness: 'hell' } as never }, halle().stages);
    expect(kaputt.showLight).toEqual(SHOW_LICHT_STANDARD);
  });
});
