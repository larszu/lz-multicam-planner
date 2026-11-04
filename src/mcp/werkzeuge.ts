import { useStore } from '../store/useStore';
import { beginGesture, endGesture, history } from '../store/history';
import { getExportRegistry } from '../store/exportRegistry';
import { CAMERAS, getCameraById, getEffectiveSensor } from '../data/cameras';
import { LENSES, getLensById, pickInitialMountAndLens } from '../data/lenses';
import { LENS_ADAPTERS, activeLensAdapter } from '../data/lensAdapters';
import { libraryCameras, libraryLenses } from '../library/registry';
import { computeFov } from '../utils/fov';
import { maskedFov } from '../utils/rahmenmaske';
import { bridgeLine } from '../utils/steuerweg';
import { FRAMINGS, reachVerdict } from '../utils/lensReach';
import { effectiveCameraPos } from '../utils/camera';
import { groundHeightAt } from '../utils/stageBody';
import type { AimTarget, FramingName, ReferencePerson, VenueCamera } from '../types';
import { ausrichtungAuf } from '../utils/kameraZiel';

/**
 * Die MCP-Werkzeuge des Planers (#218), benannt nach dem Arbeitsschritt am
 * Set. Sie laufen im Renderer gegen den Store — dieselben Aktionen wie die
 * Oberflaeche, mit Undo und Autosave. Jede Aenderung ist genau ein
 * Undo-Schritt. Zugangsdaten (Bibliothek, KI, Bridge) gibt es hier nicht.
 */
export interface WerkzeugAntwort {
  text: string;
  image?: { data: string; mimeType: 'image/png' };
  isError?: boolean;
}

type Args = Record<string, unknown>;
type Werkzeug = (args: Args) => WerkzeugAntwort | Promise<WerkzeugAntwort>;

class Fehler extends Error {}

const num = (v: unknown, name: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Fehler(`${name} must be a number`);
  return v;
};
const optNum = (v: unknown, name: string): number | undefined => (v === undefined ? undefined : num(v, name));
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Fehler(`${name} is required`);
  return v.trim();
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function kamera(id: unknown): VenueCamera {
  const s = useStore.getState();
  const key = str(id, 'cameraId');
  const cam = s.cameras.find((c) => c.id === key) ?? s.cameras.find((c) => c.label.toLowerCase() === key.toLowerCase());
  if (!cam) throw new Fehler(`no camera "${key}"`);
  return cam;
}

function person(id: string): ReferencePerson | undefined {
  const s = useStore.getState();
  return s.persons.find((p) => p.id === id) ?? s.persons.find((p) => p.label.toLowerCase() === id.toLowerCase());
}

/** Eine Aenderung = ein Undo-Schritt. */
function schritt<T>(fn: () => T): T {
  beginGesture();
  try {
    return fn();
  } finally {
    endGesture();
  }
}

function optik(cam: VenueCamera) {
  const s = useStore.getState();
  const camDef = getCameraById(cam.cameraId, s.customCameras);
  const lensDef = getLensById(cam.lensId, s.customLenses);
  if (!camDef || !lensDef) return null;
  const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount, cam.lensAdapterId);
  return { camDef, lensDef, sensor };
}

function pose(p: ReferencePerson): string {
  if (p.objectType === 'sitting-person' || p.seatedOn) return 'seated';
  if (p.objectType.startsWith('person')) return 'standing';
  return p.objectType;
}

function kameraZeile(cam: VenueCamera): string {
  const o = optik(cam);
  const body = o ? `${o.camDef.manufacturer} ${o.camDef.model}` : cam.cameraId;
  const lens = o ? `${o.lensDef.manufacturer} ${o.lensDef.model}`.trim() : cam.lensId;
  const ext = cam.extenderActive > 1 ? ` ×${cam.extenderActive}` : '';
  return `${cam.id} ${cam.label} — ${body} · ${lens} @ ${r1(cam.focalLength)} mm${ext} · f/${cam.aperture} · at (${r2(cam.x)}, ${r2(cam.y)}, ${r2(cam.z)}) pan ${r1(cam.pan)}° tilt ${r1(cam.tilt)}°`;
}

export function sceneOutline(): string {
  const s = useStore.getState();
  const v = s.venue;
  const zeilen = [`Venue "${v.name}" ${v.widthM}×${v.heightM} m`];
  zeilen.push(`  Stages (${v.stages.length})`);
  for (const st of v.stages) zeilen.push(`    ${st.id} "${st.label}" ${r2(st.width)}×${r2(st.height)} m at (${r2(st.x)}, ${r2(st.y)})${st.elevationM ? `, ${r2(st.elevationM)} m high` : ''}`);
  zeilen.push(`  Cameras (${s.cameras.length})`);
  for (const c of s.cameras) zeilen.push(`    ${kameraZeile(c)}`);
  zeilen.push(`  People & objects (${s.persons.length})`);
  for (const p of s.persons) zeilen.push(`    ${p.id} "${p.label}" — ${pose(p)} · ${r2(p.height)} m · at (${r2(p.x)}, ${r2(p.y)})`);
  zeilen.push(`  Walls (${s.walls.length})`);
  return zeilen.join('\n');
}

function kameraDetail(cam: VenueCamera): Record<string, unknown> {
  const s = useStore.getState();
  const o = optik(cam);
  const detail: Record<string, unknown> = { kind: 'camera', ...cam };
  delete detail.source;
  if (o) {
    const fov = computeFov(o.sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, o.lensDef.squeeze ?? 1);
    detail.body = `${o.camDef.manufacturer} ${o.camDef.model}`;
    detail.lens = `${o.lensDef.manufacturer} ${o.lensDef.model}`.trim();
    detail.lensRangeMm = [o.lensDef.focalLengthMin, o.lensDef.focalLengthMax];
    detail.sensor = o.sensor;
    detail.fovDeg = { horizontal: r1(fov.horizontalDeg), vertical: r1(fov.verticalDeg) };
    detail.imageWidthAtFocusM = r2(fov.imageWidthAtDistance);
    if (cam.frameMask) {
      const m = maskedFov(fov.horizontalDeg, cam.frameMask);
      detail.maskFovDeg = { mask: cam.frameMask, horizontal: r1(m.hDeg), vertical: r1(m.vDeg) };
    }
    const conv = activeLensAdapter(o.camDef, o.lensDef, cam.lensAdapterId);
    if (conv) detail.converter = `${conv.manufacturer} ${conv.model} ×${conv.magnification}`;
  }
  if (cam.controlRoute) detail.controlRouteLine = [cam.controlRoute.via, cam.controlRoute.head, bridgeLine(cam.controlRoute.bridge)].filter(Boolean).join(' · ');
  detail.selected = s.selectedCameraId === cam.id;
  return detail;
}

export function getNode(id: string): Record<string, unknown> | null {
  const s = useStore.getState();
  const cam = s.cameras.find((c) => c.id === id) ?? s.cameras.find((c) => c.label.toLowerCase() === id.toLowerCase());
  if (cam) return kameraDetail(cam);
  const p = person(id);
  if (p) return { kind: 'person', pose: pose(p), ...p };
  const st = s.venue.stages.find((x) => x.id === id);
  if (st) return { kind: 'stage', ...st };
  const w = s.walls.find((x) => x.id === id);
  if (w) return { kind: 'wall', ...w };
  return null;
}

/** Pan/Tilt/Fokus so, dass die optische Achse den Punkt trifft. */
export function aimValues(cam: VenueCamera, target: { x: number; y: number; z: number }) {
  const a = ausrichtungAuf(cam, target);
  if (!a) throw new Fehler('target is at the camera position');
  const pos = effectiveCameraPos({ ...cam, pan: a.pan });
  return { ...a, focusDistance: r2(Math.hypot(target.x - pos.x, target.y - pos.y, target.z - cam.z)) };
}

function ziel(args: Args): { x: number; y: number; z: number; label: string; target: AimTarget } {
  if (typeof args.targetId === 'string') {
    const p = person(args.targetId);
    if (!p) throw new Fehler(`no person or object "${args.targetId}"`);
    const boden = groundHeightAt(useStore.getState().venue.stages, p.x, p.y);
    const hoehe = optNum(args.z, 'z') ?? boden + p.height * 0.9;
    return { x: p.x, y: p.y, z: hoehe, label: p.label, target: { kind: 'person', id: p.id } };
  }
  const x = num(args.x, 'x');
  const y = num(args.y, 'y');
  return { x, y, z: optNum(args.z, 'z') ?? 1.6, label: 'point', target: { kind: 'point', x, y } };
}

function kurzeAntwort(cam: VenueCamera, was: string): WerkzeugAntwort {
  const neu = useStore.getState().cameras.find((c) => c.id === cam.id) ?? cam;
  return { text: `${was}\n${kameraZeile(neu)}` };
}

function catalogQuery(args: Args): WerkzeugAntwort {
  const kind = typeof args.kind === 'string' ? args.kind : 'cameras';
  const q = typeof args.query === 'string' ? args.query.toLowerCase() : '';
  const limit = Math.min(50, Math.max(1, Math.round(optNum(args.limit, 'limit') ?? 20)));
  const s = useStore.getState();
  const hit = (t: string) => !q || t.toLowerCase().includes(q);
  let rows: string[];
  if (kind === 'lenses') {
    rows = [...s.customLenses, ...LENSES, ...libraryLenses()]
      .filter((l) => hit(`${l.manufacturer} ${l.model} ${l.mount}`))
      .map((l) => `${l.id} — ${l.manufacturer} ${l.model} (${l.mount}, ${l.focalLengthMin}–${l.focalLengthMax} mm, f/${l.maxApertureWide})`);
  } else if (kind === 'converters') {
    rows = LENS_ADAPTERS.filter((a) => hit(`${a.manufacturer} ${a.model}`))
      .map((a) => `${a.id} — ${a.manufacturer} ${a.model} (${a.lensMount} → ${a.bodyMounts.join('/')}, ×${a.magnification})`);
  } else {
    rows = [...s.customCameras, ...CAMERAS, ...libraryCameras()]
      .filter((c) => hit(`${c.manufacturer} ${c.model} ${c.mount}`))
      .map((c) => `${c.id} — ${c.manufacturer} ${c.model} (${c.mount}, ${c.sensor.name})`);
  }
  const uniq = [...new Set(rows)];
  return { text: uniq.slice(0, limit).join('\n') + (uniq.length > limit ? `\n… ${uniq.length - limit} more` : '') || 'nothing found' };
}

function canvasPng(c: HTMLCanvasElement | null, was: string): WerkzeugAntwort {
  if (!c || c.width === 0) return { text: `${was} is not available right now — open the view once.`, isError: true };
  const url = c.toDataURL('image/png');
  return { text: was, image: { data: url.slice(url.indexOf(',') + 1), mimeType: 'image/png' } };
}

const FRAMING_NAMES = Object.keys(FRAMINGS) as Exclude<FramingName, 'custom'>[];

export const WERKZEUGE: Record<string, Werkzeug> = {
  scene_outline: () => ({ text: sceneOutline() }),

  get_node: (a) => {
    const id = str(a.id, 'id');
    const n = getNode(id);
    if (!n) throw new Fehler(`no node "${id}"`);
    return { text: JSON.stringify(n, null, 2) };
  },

  list_catalog: catalogQuery,

  place_camera: (a) => {
    const s = useStore.getState();
    const cameraId = typeof a.cameraModelId === 'string' ? a.cameraModelId : undefined;
    const camDef = cameraId ? getCameraById(cameraId, s.customCameras) : undefined;
    if (cameraId && !camDef) throw new Fehler(`no camera model "${cameraId}" — see list_catalog`);
    const lensId = typeof a.lensId === 'string' ? a.lensId : undefined;
    if (lensId && !getLensById(lensId, s.customLenses)) throw new Fehler(`no lens "${lensId}" — see list_catalog kind=lenses`);
    const x = num(a.x, 'x');
    const y = num(a.y, 'y');
    return schritt(() => {
      s.addCamera(camDef && CAMERAS.some((c) => c.id === camDef.id) ? camDef.id : undefined, lensId);
      const alle = useStore.getState().cameras;
      const neu = alle[alle.length - 1];
      const patch: Partial<VenueCamera> = { x, y, z: optNum(a.z, 'z') ?? neu.z };
      if (typeof a.label === 'string' && a.label.trim()) patch.label = a.label.trim();
      if (camDef && camDef.id !== neu.cameraId) {
        const pick = pickInitialMountAndLens(camDef.mount, camDef.adaptedMounts, s.customLenses, camDef.id);
        const lens = lensId ? getLensById(lensId, s.customLenses) : pick.lens;
        patch.cameraId = camDef.id;
        patch.activeMount = pick.mount;
        if (lens) Object.assign(patch, { lensId: lens.id, focalLength: lens.focalLengthMin, aperture: lens.maxApertureWide });
      }
      useStore.getState().updateCamera(neu.id, patch);
      return kurzeAntwort(neu, 'placed');
    });
  },

  move_camera: (a) => {
    const cam = kamera(a.cameraId);
    const patch: Partial<VenueCamera> = {};
    for (const k of ['x', 'y', 'z', 'pan', 'tilt'] as const) {
      const v = optNum(a[k], k);
      if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) throw new Fehler('nothing to change');
    return schritt(() => {
      useStore.getState().updateCamera(cam.id, patch);
      return kurzeAntwort(cam, 'moved');
    });
  },

  set_lens: (a) => {
    const cam = kamera(a.cameraId);
    const s = useStore.getState();
    const patch: Partial<VenueCamera> = {};
    let lens = getLensById(cam.lensId, s.customLenses);
    if (typeof a.lensId === 'string') {
      lens = getLensById(a.lensId, s.customLenses);
      if (!lens) throw new Fehler(`no lens "${a.lensId}"`);
      Object.assign(patch, { lensId: lens.id, focalLength: lens.focalLengthMin, aperture: lens.maxApertureWide, extenderActive: 1 });
    }
    const f = optNum(a.focalLength, 'focalLength');
    if (f !== undefined) {
      if (lens && (f < lens.focalLengthMin || f > lens.focalLengthMax)) throw new Fehler(`focal length outside ${lens.focalLengthMin}–${lens.focalLengthMax} mm`);
      patch.focalLength = f;
    }
    const ap = optNum(a.aperture, 'aperture');
    if (ap !== undefined) patch.aperture = ap;
    const fd = optNum(a.focusDistance, 'focusDistance');
    if (fd !== undefined) patch.focusDistance = fd;
    if (Object.keys(patch).length === 0) throw new Fehler('nothing to change');
    return schritt(() => {
      useStore.getState().updateCamera(cam.id, patch);
      return kurzeAntwort(cam, 'lens set');
    });
  },

  aim_at: (a) => {
    const cam = kamera(a.cameraId);
    const z = ziel(a);
    const v = aimValues(cam, z);
    return schritt(() => {
      useStore.getState().updateCamera(cam.id, { ...v, aimTarget: z.target });
      return kurzeAntwort(cam, `aimed at ${z.label} (${r2(z.x)}, ${r2(z.y)}, ${r2(z.z)})`);
    });
  },

  frame_shot: (a) => {
    const cam = kamera(a.cameraId);
    const framing = str(a.framing, 'framing') as Exclude<FramingName, 'custom'>;
    if (!FRAMING_NAMES.includes(framing)) throw new Fehler(`framing must be one of ${FRAMING_NAMES.join(', ')}`);
    const p = person(str(a.targetId, 'targetId'));
    if (!p) throw new Fehler(`no person or object "${a.targetId}"`);
    const o = optik(cam);
    if (!o) throw new Fehler('camera body or lens unknown');
    const f = FRAMINGS[framing];
    const extent = (f.axis === 'width' ? p.width : p.height) * f.factor;
    const boden = groundHeightAt(useStore.getState().venue.stages, p.x, p.y);
    const mitte = f.axis === 'height' ? boden + Math.max(extent / 2, p.height - extent / 2) : boden + p.height / 2;
    const v = aimValues(cam, { x: p.x, y: p.y, z: mitte });
    const urteil = reachVerdict({ distanceM: v.focusDistance, axis: f.axis, extentM: extent, optics: { sensor: o.sensor, lens: o.lensDef } });
    return schritt(() => {
      const patch: Partial<VenueCamera> = { ...v, aimTarget: { kind: 'person', id: p.id } };
      let note = '';
      if (urteil.kind === 'reachable') {
        patch.focalLength = r1(urteil.requiredMm / urteil.extender);
        patch.extenderActive = urteil.extender;
      } else if (urteil.kind === 'too-wide') {
        patch.focalLength = o.lensDef.focalLengthMin;
        patch.extenderActive = 1;
        note = ` — lens too long: needs ${Math.round(urteil.requiredMm)} mm, widest is ${urteil.widestMm} mm`;
      } else if (urteil.kind === 'too-long') {
        patch.focalLength = o.lensDef.focalLengthMax;
        note = ` — lens too short: needs ${Math.round(urteil.requiredMm)} mm, longest is ${urteil.longestMm} mm`;
      } else if (urteil.kind === 'in-gap') {
        note = ` — between extender ranges (${Math.round(urteil.belowMm)} / ${Math.round(urteil.aboveMm)} mm)`;
      }
      useStore.getState().updateCamera(cam.id, patch);
      return kurzeAntwort(cam, `framed ${framing} shot on ${p.label}${note}`);
    });
  },

  render_preview: async (a) => {
    const cam = kamera(a.cameraId);
    const breite = Math.min(1920, Math.max(160, Math.round(optNum(a.width, 'width') ?? 960)));
    const { renderCamera } = await import('../components/Preview/cameraViewRenderer');
    const { render3D } = await import('../components/Render3D/kameraBild3d');
    const canvas = document.createElement('canvas');
    // Gerendert wie im Kamerablick, wenn der Renderer laeuft; sonst die Zeichnung.
    const ok = render3D(cam.id, canvas, breite, 1, 'gross') || renderCamera(cam.id, canvas, breite);
    return canvasPng(ok ? canvas : null, `camera view ${cam.label}`);
  },

  render_top_view: () => canvasPng(getExportRegistry().capture2DExport?.() ?? null, 'top view'),

  undo: () => {
    if (!history.canUndo()) return { text: 'nothing to undo' };
    history.undo();
    return { text: 'undone' };
  },

  redo: () => {
    if (!history.canRedo()) return { text: 'nothing to redo' };
    history.redo();
    return { text: 'redone' };
  },
};

/** Zusaetzliche Namen fuer dieselben Werkzeuge. */
export const ALIASE: Record<string, string> = {
  look_at: 'aim_at',
  get_scene: 'scene_outline',
};

export async function werkzeugAusfuehren(name: string, args: Args): Promise<WerkzeugAntwort> {
  const fn = WERKZEUGE[ALIASE[name] ?? name];
  if (!fn) return { text: `unknown tool "${name}"`, isError: true };
  try {
    return await fn(args ?? {});
  } catch (e) {
    if (e instanceof Fehler) return { text: e.message, isError: true };
    throw e;
  }
}
