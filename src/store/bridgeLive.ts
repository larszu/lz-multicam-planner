// Live-Verbindung zu LZ Camera Bridge. Getrennt vom Projekt-Store: die Live-
// Pose ist kein Planstand, darf weder Verlauf noch Autosave beruehren und
// wird erst per „Apply" (`updateCamera`) zum Plan.
import { useMemo } from 'react';
import { create } from 'zustand';
import type { VenueCamera } from '../types';
import { loadJSON, saveJSON } from '../utils/storage';
import { applyLive, cameraIdForNumber, parseBridgeMessage, type LiveOptik, type LivePose } from '../utils/bridgeLive';
import { getCameraById, getEffectiveSensor } from '../data/cameras';
import { getLensById } from '../data/lenses';
import { useStore } from './useStore';

export const BRIDGE_DEFAULT_URL = 'ws://localhost:9700';
const PREFS_KEY = 'multicam-bridge-live';
const RETRY_MS = [1000, 2000, 5000, 10000];

export type BridgeStatus = 'off' | 'connecting' | 'connected' | 'error';

interface BridgeLiveState {
  enabled: boolean;
  url: string;
  status: BridgeStatus;
  live: Record<number, LivePose>;
  /** Am Pult gewaehlte Kamera (aus `surfaceInput`). */
  surfaceCameraNumber: number | null;
  setEnabled: (on: boolean) => void;
  setUrl: (url: string) => void;
}

const prefs = loadJSON<{ enabled?: boolean; url?: string }>(PREFS_KEY, {});

export const useBridgeLive = create<BridgeLiveState>((set, get) => ({
  enabled: prefs.enabled === true,
  url: prefs.url || BRIDGE_DEFAULT_URL,
  status: 'off',
  live: {},
  surfaceCameraNumber: null,
  setEnabled: (enabled) => {
    set({ enabled });
    saveJSON(PREFS_KEY, { enabled, url: get().url });
    verbinden();
  },
  setUrl: (url) => {
    set({ url });
    saveJSON(PREFS_KEY, { enabled: get().enabled, url });
    if (get().enabled) verbinden();
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
    useBridgeLive.setState({ status: 'off', live: {}, surfaceCameraNumber: null });
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
  };
  sock.onmessage = (e) => {
    const m = parseBridgeMessage(String(e.data));
    if (!m) return;
    if (m.type === 'pose') {
      useBridgeLive.setState((s) => ({ live: { ...s.live, [m.cameraNumber]: { pose: m.pose, hfovDeg: m.hfovDeg } } }));
    } else if (m.type === 'surfaceInput') {
      if (m.cameraNumber !== undefined) useBridgeLive.setState({ surfaceCameraNumber: m.cameraNumber });
    } else if (m.type === 'cameras') {
      for (const c of m.cameras) if (c.connected) sock.send(JSON.stringify({ type: 'readPose', cameraNumber: c.cameraNumber }));
    }
  };
  sock.onerror = () => useBridgeLive.setState({ status: 'error' });
  sock.onclose = () => {
    ws = null;
    useBridgeLive.setState({ status: 'error' });
    nochmal();
  };
}

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
