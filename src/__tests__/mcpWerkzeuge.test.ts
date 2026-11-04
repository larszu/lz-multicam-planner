import { describe, it, expect, beforeEach, vi } from 'vitest';
import specSrc from '../../electron/mcpTools.cjs?raw';

const speicher: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(speicher)) delete speicher[key];
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => speicher[key] ?? null,
    setItem: (key: string, value: string) => { speicher[key] = value; },
    removeItem: (key: string) => { delete speicher[key]; },
  });
});

async function frisch() {
  const store = await import('../store/useStore');
  const h = await import('../store/history');
  const w = await import('../mcp/werkzeuge');
  const stop = h.history.start();
  return { useStore: store.useStore, history: h.history, ...w, stop };
}

// Quelltext per `?raw`: `tsc -b` kennt hier keine Node-Typen.
const TOOL_SPECS = [...specSrc.matchAll(/\{ name: '([a-z_]+)', write: (true|false),/g)].map((m) => ({ name: m[1], write: m[2] === 'true' }));
const ALIASES = Object.fromEntries(
  [...(/const ALIASES = \{([^}]*)\}/.exec(specSrc)?.[1] ?? '').matchAll(/([a-z_]+): '([a-z_]+)'/g)].map((m) => [m[1], m[2]]),
);

describe('MCP-Werkzeuge nach Arbeitsschritten (#218)', () => {
  it('Server und Renderer kennen dieselben Werkzeuge und Aliase', async () => {
    const { WERKZEUGE, ALIASE } = await frisch();
    expect(TOOL_SPECS.map((s) => s.name).sort()).toEqual(Object.keys(WERKZEUGE).sort());
    expect(ALIASES).toEqual(ALIASE);
    expect(TOOL_SPECS.filter((s) => s.write).map((s) => s.name).sort())
      .toEqual(['aim_at', 'frame_shot', 'move_camera', 'place_camera', 'redo', 'set_lens', 'undo']);
  });

  it('kein Werkzeug fuehrt Zugangsdaten', () => {
    const text = specSrc.toLowerCase();
    for (const wort of ['token', 'password', 'passwort', 'apikey', 'api key', 'credential']) expect(text).not.toContain(wort);
  });

  it('Kamera setzen, ausrichten, Ausschnitt — jeder Aufruf ist genau ein Undo-Schritt', async () => {
    const { useStore, history, werkzeugAusfuehren } = await frisch();
    useStore.getState().addPerson(10, 5);
    vi.advanceTimersByTime(1000);
    const p = useStore.getState().persons[0];

    const r1 = await werkzeugAusfuehren('place_camera', { x: 10, y: 20, z: 1.6, label: 'Front' });
    expect(r1.isError).toBeFalsy();
    const cam = useStore.getState().cameras[0];
    expect(cam).toMatchObject({ x: 10, y: 20, z: 1.6, label: 'Front' });

    await werkzeugAusfuehren('look_at', { cameraId: 'Front', targetId: p.id });
    const gezielt = useStore.getState().cameras[0];
    expect(gezielt.pan).toBeCloseTo(-90, 1);
    expect(gezielt.focusDistance).toBeGreaterThan(14.9);

    const r3 = await werkzeugAusfuehren('frame_shot', { cameraId: cam.id, targetId: p.id, framing: 'medium' });
    expect(r3.text).toMatch(/framed medium/);
    const nachher = useStore.getState().cameras[0];

    history.undo();
    expect(useStore.getState().cameras[0].focalLength).toBe(gezielt.focalLength);
    expect(useStore.getState().cameras[0].pan).toBe(gezielt.pan);
    history.undo();
    expect(useStore.getState().cameras[0].pan).toBe(cam.pan);
    history.redo();
    history.redo();
    expect(useStore.getState().cameras[0].focalLength).toBe(nachher.focalLength);

    const u = await werkzeugAusfuehren('undo', {});
    expect(u.text).toBe('undone');
    expect(useStore.getState().cameras[0].focalLength).toBe(gezielt.focalLength);
  });

  it('Szene als Gliederung, Einzelheiten ueber get_node', async () => {
    const { useStore, werkzeugAusfuehren } = await frisch();
    useStore.getState().addCamera();
    useStore.getState().addPerson(3, 3);
    const o = await werkzeugAusfuehren('scene_outline', {});
    expect(o.text).toMatch(/^Venue /);
    expect(o.text).toMatch(/\n {2}Cameras \(1\)\n {4}\S+ CAM 1 — .+ @ .+ mm · f\//);
    expect(o.text).toMatch(/People & objects \(1\)\n {4}\S+ ".+" — standing/);
    const id = useStore.getState().cameras[0].id;
    const n = JSON.parse((await werkzeugAusfuehren('get_node', { id })).text);
    expect(n.kind).toBe('camera');
    expect(n.fovDeg.horizontal).toBeGreaterThan(0);
    expect((await werkzeugAusfuehren('get_node', { id: 'nope' })).isError).toBe(true);
  });

  it('Fehler kommen als Antwort zurueck, nicht als Absturz', async () => {
    const { werkzeugAusfuehren } = await frisch();
    expect((await werkzeugAusfuehren('move_camera', { cameraId: 'x', pan: 3 })).isError).toBe(true);
    expect((await werkzeugAusfuehren('place_camera', { x: 'a', y: 1 })).isError).toBe(true);
    expect((await werkzeugAusfuehren('gibts_nicht', {})).isError).toBe(true);
  });

  it('Katalogsuche liefert Ids fuer die Konverter', async () => {
    const { werkzeugAusfuehren } = await frisch();
    expect((await werkzeugAusfuehren('list_catalog', { kind: 'converters' })).text).toMatch(/ibe-hdx35-mk3/);
  });
});
