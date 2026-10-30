// Live-Verbindung zu LZ Camera Bridge. Getrennt vom Projekt-Store: die Live-
// Pose ist kein Planstand, darf weder Verlauf noch Autosave beruehren und
// wird erst per „Apply" (`updateCamera`) zum Plan.
import { useMemo } from 'react';
import { create } from 'zustand';
import type { VenueCamera } from '../types';
import { loadJSON, saveJSON } from '../utils/storage';
import { applyLive, atemAlsBus, bussesFromMixer, cameraIdForNumber, inputForCamera, isVirtualMixer, mixerInputs, parseBridgeMessage, type AtemStand, type LiveOptik, type LivePose, type MixerBus } from '../utils/bridgeLive';
import { getCameraById, getEffectiveSensor } from '../data/cameras';
import { getLensById } from '../data/lenses';
import { useStore } from './useStore';

export const BRIDGE_DEFAULT_URL = 'ws://localhost:9700';
const PREFS_KEY = 'multicam-bridge-live';
const RETRY_MS = [1000, 2000, 5000, 10000];

export type BridgeStatus = 'off' | 'connecting' | 'connected' | 'error';
/** Woher die Multiview ihren Mischer liest: Bridge oder ATEM direkt (nur Desktop-App). */
export type MixerSource = 'bridge' | 'atem';

interface AtemBridge {
  connect(host: string): Promise<boolean>;
  disconnect(): Promise<void>;
  command(cmd: string, source?: number): Promise<boolean>;
  onState(cb: (s: AtemStand) => void): () => void;
}
/** Nur in der Desktop-App: ein Browser erreicht das UDP-Protokoll des ATEM nicht. */
export const atemApi = (): AtemBridge | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { multicamAtem?: AtemBridge }).multicamAtem;

interface BridgeLiveState {
  enabled: boolean;
  url: string;
  status: BridgeStatus;
  live: Record<number, LivePose>;
  /** Am Pult gewaehlte Kamera (aus `surfaceInput`). */
  surfaceCameraNumber: number | null;
  /** Bridge-Mischer, dem die Multiview folgt (null = eigener Mischer des Planers). */
  mixerNumber: number | null;
  /** Zaehlt jeden AUTO, den der Bridge-Mischer startet; die Multiview blendet dann selbst. */
  autoRequest: number;
  /** Mischer der Bridge, wie zuletzt gemeldet (Typ, Eingaenge, Busse). */
  mixers: MixerBus[];
  /** Echten Mischer vom Planer aus schalten (sonst nur anzeigen). */
  mixerDrives: boolean;
  mixerSource: MixerSource;
  atemHost: string;
  /** ATEM direkt, solange `mixerSource` 'atem' ist. */
  atemBus: MixerBus | null;
  setEnabled: (on: boolean) => void;
  setUrl: (url: string) => void;
  setMixerNumber: (n: number | null) => void;
  setMixerDrives: (on: boolean) => void;
  setMixerSource: (src: MixerSource) => void;
  setAtemHost: (host: string) => void;
}

type Prefs = { enabled?: boolean; url?: string; mixerNumber?: number | null; mixerDrives?: boolean; mixerSource?: MixerSource; atemHost?: string };
const prefs: Prefs = { ...loadJSON<Prefs>(PREFS_KEY, {}), ...ausAdresse() };

/**
 * `?bridge=ws://host:9700&mixer=1` — so oeffnet die Bridge den Planer: gleich
 * verbunden und dem Mischer folgend. Gilt auch fuer die naechsten Starts.
 */
function ausAdresse(): Prefs {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const url = q.get('bridge');
  const mixer = Number(q.get('mixer'));
  const out: Prefs = {};
  if (url && /^wss?:\/\//.test(url)) { out.enabled = true; out.url = url; }
  if (Number.isInteger(mixer) && mixer > 0) { out.mixerNumber = mixer; out.mixerSource = 'bridge'; }
  if (Object.keys(out).length) saveJSON(PREFS_KEY, { ...loadJSON<Prefs>(PREFS_KEY, {}), ...out });
  return out;
}
const merken = (s: Pick<BridgeLiveState, 'enabled' | 'url' | 'mixerNumber' | 'mixerDrives' | 'mixerSource' | 'atemHost'>) =>
  saveJSON(PREFS_KEY, { enabled: s.enabled, url: s.url, mixerNumber: s.mixerNumber, mixerDrives: s.mixerDrives, mixerSource: s.mixerSource, atemHost: s.atemHost });

export const useBridgeLive = create<BridgeLiveState>((set, get) => ({
  enabled: prefs.enabled === true,
  url: prefs.url || BRIDGE_DEFAULT_URL,
  status: 'off',
  live: {},
  surfaceCameraNumber: null,
  mixerNumber: prefs.mixerNumber ?? null,
  autoRequest: 0,
  mixers: [],
  mixerDrives: prefs.mixerDrives === true,
  mixerSource: prefs.mixerSource === 'atem' ? 'atem' : 'bridge',
  atemHost: prefs.atemHost ?? '',
  atemBus: null,
  setEnabled: (enabled) => {
    set({ enabled });
    merken(get());
    verbinden();
  },
  setUrl: (url) => {
    set({ url });
    merken(get());
    if (get().enabled) verbinden();
  },
  setMixerNumber: (mixerNumber) => {
    set({ mixerNumber, mixerSource: 'bridge' });
    merken(get());
    atemVerbinden();
    if (mixerNumber === null) return;
    const bus = gefolgt();
    if (bus) { meldeEingaenge(true); folgeMischer(bus); }
    sock()?.send(JSON.stringify({ type: 'listSwitchers' }));
  },
  setMixerDrives: (mixerDrives) => {
    set({ mixerDrives });
    merken(get());
  },
  setMixerSource: (mixerSource) => {
    set({ mixerSource });
    merken(get());
    atemVerbinden();
  },
  setAtemHost: (atemHost) => {
    set({ atemHost });
    merken(get());
    atemVerbinden();
  },
}));

let ws: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let versuch = 0;

function trennen() {
  if (retry) clearTimeout(retry);
  retry = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

/** (Neu) verbinden nach dem aktuellen Stand von `enabled`/`url`. */
export function verbinden() {
  trennen();
  const { enabled, url } = useBridgeLive.getState();
  if (!enabled) {
    useBridgeLive.setState({ status: 'off', live: {}, surfaceCameraNumber: null, mixers: [] });
    return;
  }
  useBridgeLive.setState({ status: 'connecting' });
  let sock: WebSocket;
  try {
    sock = new WebSocket(url);
  } catch {
    useBridgeLive.setState({ status: 'error' });
    nochmal();
    return;
  }
  ws = sock;
  sock.onopen = () => {
    versuch = 0;
    useBridgeLive.setState({ status: 'connected' });
    sock.send(JSON.stringify({ type: 'listCameras' }));
    sock.send(JSON.stringify({ type: 'listSwitchers' }));
  };
  sock.onmessage = (e) => {
    const m = parseBridgeMessage(String(e.data));
    if (!m) return;
    if (m.type === 'pose') {
      useBridgeLive.setState((s) => ({ live: { ...s.live, [m.cameraNumber]: { pose: m.pose, hfovDeg: m.hfovDeg } } }));
    } else if (m.type === 'surfaceInput') {
      if (m.cameraNumber !== undefined) useBridgeLive.setState({ surfaceCameraNumber: m.cameraNumber });
    } else if (m.type === 'mixer') {
      const vorher = gefolgt();
      useBridgeLive.setState((s) => ({ mixers: m.full ? m.mixers : einpflegen(s.mixers, m.mixers) }));
      const bus = gefolgt();
      if (!bus || useBridgeLive.getState().mixerSource !== 'bridge') return;
      if (isVirtualMixer(bus) && !isVirtualMixer(vorher)) meldeEingaenge(true);
      folgeMischer(bus);
    } else if (m.type === 'cameras') {
      for (const c of m.cameras) if (c.connected) sock.send(JSON.stringify({ type: 'readPose', cameraNumber: c.cameraNumber }));
    }
  };
  sock.onerror = () => useBridgeLive.setState({ status: 'error' });
  sock.onclose = () => {
    ws = null;
    // Ohne Verbindung kein Mischerstand: ein alter darf den Plan nicht mehr setzen.
    useBridgeLive.setState({ status: 'error', mixers: [] });
    nochmal();
  };
}

const sock = (): WebSocket | null => (ws && ws.readyState === WebSocket.OPEN ? ws : null);

/** Einzelstand in die Liste; Typ, Name und Verbindung aus der Liste bleiben. */
function einpflegen(liste: MixerBus[], neu: MixerBus[]): MixerBus[] {
  const out = [...liste];
  for (const n of neu) {
    const i = out.findIndex((x) => x.switcherNumber === n.switcherNumber);
    if (i >= 0) out[i] = { ...out[i], ...n, inputs: n.inputs ?? out[i].inputs };
    else out.push({ connected: true, ...n });
  }
  return out;
}

/** Der Mischer, dem die Multiview folgt, sobald er gemeldet ist. */
function gefolgt(): MixerBus | undefined {
  const { mixerNumber, mixers, mixerSource, atemBus } = useBridgeLive.getState();
  if (mixerSource === 'atem') return atemBus ?? undefined;
  return mixerNumber === null ? undefined : mixers.find((x) => x.switcherNumber === mixerNumber);
}

/** Befehl an den gefolgten Mischer (Multiview am echten Mischer, wenn erlaubt). */
export function mischerBefehl(cmd: 'preview' | 'cut' | 'auto' | 'take', source?: number): boolean {
  if (useBridgeLive.getState().mixerSource === 'atem') {
    const api = atemApi();
    if (!api) return false;
    void api.command(cmd, source);
    return true;
  }
  const { mixerNumber } = useBridgeLive.getState();
  const s = sock();
  if (mixerNumber === null || !s) return false;
  s.send(JSON.stringify({ type: 'switcherCommand', switcherNumber: mixerNumber, cmd, params: source !== undefined ? { source } : {} }));
  return true;
}

// ── Multiview folgt einem Bridge-Mischer ─────────────────────────────────
// Der Mischer der Bridge ist die Wahrheit: was ein Pult schaltet, kommt hier
// an und setzt Program/Preview. Nur beim Mischer ohne Hardware geht, was im
// Planer geschaltet wird, als `mirror` zurueck, damit Tally und Pult-Tasten
// stimmen. Gleiche Werte in beide Richtungen aendern nichts, darum laeuft
// das nicht im Kreis. Einen echten Mischer liest der Planer nur; seine
// Preview zeigt die Multiview direkt (`useMixerFollow`), die Auswahl im Plan
// bleibt frei.

let uebernehme = false;
let warImUebergang = false;

function folgeMischer(bus: MixerBus) {
  const { cameras, programCameraId, selectedCameraId } = useStore.getState();
  const { programId, previewId } = bussesFromMixer(cameras, bus);
  // AUTO am Pult: die Multiview blendet selbst; das Ende meldet der Mischer.
  if (bus.inTransition && !warImUebergang) useBridgeLive.setState((s) => ({ autoRequest: s.autoRequest + 1 }));
  warImUebergang = bus.inTransition;
  if (bus.inTransition) return;
  uebernehme = true;
  try {
    if (programId !== programCameraId) useStore.getState().setProgramCamera(programId);
    if (isVirtualMixer(bus) && previewId && previewId !== selectedCameraId) useStore.getState().selectCamera(previewId);
  } finally {
    uebernehme = false;
  }
}

let meldung: ReturnType<typeof setTimeout> | null = null;
/** Planer-Schnitt an die Bridge; ein Schnitt setzt zwei Busse, gemeldet wird einmal. */
function meldeBusse() {
  if (meldung) return;
  meldung = setTimeout(() => {
    meldung = null;
    const { mixerNumber } = useBridgeLive.getState();
    const s = sock();
    if (mixerNumber === null || !s || !isVirtualMixer(gefolgt())) return;
    const { cameras, programCameraId, selectedCameraId } = useStore.getState();
    s.send(JSON.stringify({
      type: 'switcherCommand', switcherNumber: mixerNumber, cmd: 'mirror',
      params: { program: inputForCamera(cameras, programCameraId), preview: inputForCamera(cameras, selectedCameraId) },
    }));
  }, 0);
}

let gemeldet = '';
/**
 * Kameranamen als Eingangsnamen: so beschriftet das Pult seine Tasten.
 * Die Kameraliste aendert sich bei jedem Ziehen; gesendet wird nur, wenn
 * sich Nummern oder Namen wirklich geaendert haben.
 */
function meldeEingaenge(immer = false) {
  const { mixerNumber } = useBridgeLive.getState();
  const s = sock();
  if (mixerNumber === null || !s || !isVirtualMixer(gefolgt())) return;
  const inputs = mixerInputs(useStore.getState().cameras);
  const key = `${mixerNumber}|${JSON.stringify(inputs)}`;
  if (!immer && key === gemeldet) return;
  gemeldet = key;
  s.send(JSON.stringify({ type: 'switcherCommand', switcherNumber: mixerNumber, cmd: 'mirror', params: { inputs } }));
}

useStore.subscribe((s, vorher) => {
  if (!isVirtualMixer(gefolgt())) {
    // Echter Mischer: neue Zuordnung im Plan gleich am Stand des Mischers zeigen.
    const bus = gefolgt();
    if (bus && s.cameras !== vorher.cameras) folgeMischer(bus);
    return;
  }
  if (s.cameras !== vorher.cameras) meldeEingaenge();
  if (uebernehme) return;
  if (s.programCameraId !== vorher.programCameraId || s.selectedCameraId !== vorher.selectedCameraId) meldeBusse();
});

function nochmal() {
  if (!useBridgeLive.getState().enabled) return;
  const ms = RETRY_MS[Math.min(versuch, RETRY_MS.length - 1)];
  versuch += 1;
  retry = setTimeout(verbinden, ms);
}

export function optikOf(cam: VenueCamera): LiveOptik {
  const { customCameras, customLenses } = useStore.getState();
  const camDef = getCameraById(cam.cameraId, customCameras);
  const lens = getLensById(cam.lensId, customLenses);
  if (!lens) return {};
  const sensor = camDef ? getEffectiveSensor(camDef, lens, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount) : undefined;
  return { sensorWidthMm: sensor?.widthMm, focalMin: lens.focalLengthMin, focalMax: lens.focalLengthMax };
}

/** Kameras, wie 2D und 3D sie zeigen: Plan plus Live-Pose. */
export function useLiveCameras(cameras: VenueCamera[]): VenueCamera[] {
  const live = useBridgeLive((s) => s.live);
  return useMemo(() => applyLive(cameras, live, optikOf), [cameras, live]);
}

/** Id der am Pult gewaehlten Planer-Kamera, sonst null. */
export function useSurfaceCameraId(cameras: VenueCamera[]): string | null {
  const num = useBridgeLive((s) => (s.status === 'connected' ? s.surfaceCameraNumber : null));
  return useMemo(() => cameraIdForNumber(cameras, num), [cameras, num]);
}

export interface MixerFollow {
  bus: MixerBus;
  /** Echter Mischer (ATEM …): Planer liest nur, ausser `drives`. */
  extern: boolean;
  /** Multiview-Tasten schalten den Mischer der Bridge. */
  drives: boolean;
  previewId: string | null;
  programId: string | null;
}

/** Der gefolgte Mischer, wie die Multiview ihn zeigt; null ohne Verbindung. */
export function useMixerFollow(cameras: VenueCamera[]): MixerFollow | null {
  const bus = useBridgeLive((s) => (s.mixerSource === 'atem'
    ? (s.atemBus?.connected ? s.atemBus : undefined)
    : s.status === 'connected' && s.mixerNumber !== null ? s.mixers.find((x) => x.switcherNumber === s.mixerNumber) : undefined));
  const drives = useBridgeLive((s) => s.mixerDrives);
  return useMemo(() => {
    if (!bus) return null;
    const extern = !isVirtualMixer(bus);
    return { bus, extern, drives: extern && drives && bus.connected !== false, ...bussesFromMixer(cameras, bus) };
  }, [bus, cameras, drives]);
}

// ── ATEM direkt (Desktop-App) ───────────────────────────────────────────
// Derselbe Weg wie ein Bridge-Mischer: der Stand wird zu einem `MixerBus`,
// die Multiview folgt ihm, und geschaltet wird nur mit Freigabe.

function atemVerbinden() {
  const api = atemApi();
  if (!api) return;
  const { mixerSource, atemHost } = useBridgeLive.getState();
  if (mixerSource === 'atem' && atemHost.trim()) void api.connect(atemHost.trim());
  else {
    void api.disconnect();
    useBridgeLive.setState({ atemBus: null });
  }
}

const atem = atemApi();
if (atem) {
  atem.onState((a) => {
    if (useBridgeLive.getState().mixerSource !== 'atem') return;
    const bus = atemAlsBus(a);
    useBridgeLive.setState({ atemBus: bus });
    if (bus.connected) folgeMischer(bus);
  });
  atemVerbinden();
}
