// ───────────────────────────────────────────────────────────────────────────
// DER KAMERABLICK — eine Komponente fuer „Was sieht diese Kamera?"
//
// Nutzer-Meldung 2026-10-14: „In 3D View gibt es ‚Camera view', das ist
// halbwegs redundant zu Preview. Integriere alle Preview-Features da rein."
//
// Vorher gab es zwei Kamerablicke mit zwei Bedienungen: den Vorschau-Reiter
// (Overlays, Objektiv-Regler, Presets, Rig-Pult) und den Kamerablick der
// 3D-Ansicht (nur das Bild). Jetzt ist es dieselbe Komponente: der
// Vorschau-Reiter zeigt sie, und „Kamerablick" in der 3D-Ansicht zeigt sie
// an der Stelle der freien 3D-Kamera. Das Bild kommt in beiden Faellen aus
// dem gemeinsamen Renderer (Render3D/kameraBild3d), nicht aus einer zweiten
// Szene.
//
// #193: Der Bereich scrollt als GANZES — vorher hatte er zwei Scrollbereiche
// (Bild+Regler oben, Rig-Pult unten), und in einem kleinen Fenster war der
// untere nicht erreichbar. Die Kamerasteuerung (Rig-Pult) ist aufklappbar.
// ───────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  FiCamera,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCrosshair,
  FiLayers,
  FiLock,
  FiPlus,
  FiUnlock,
  FiX,
} from 'react-icons/fi';
import { FingerNavigation, kneifFaktor } from '../../lib/fingerNavigation';
import { useGeteilt } from '../../lib/useGeteilt';
import { useStore } from '../../store/useStore';
import { getCameraById, getEffectiveSensor, getAdapterInfo } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov, computeDof } from '../../utils/fov';
import { effectiveCameraPos } from '../../utils/camera';
import { getExportRegistry } from '../../store/exportRegistry';
import type { ShotTransition, VenueCamera } from '../../types';
import { useTranslation, format } from '../../i18n';
import { mountTypeLabel } from '../../i18n/mount';
import RigControlPanel from '../RigControl/RigControlPanel';
import Regler from '../ui/Regler';
import { TRANSITION_CYCLE, TRANSITION_PRESET_SECONDS, runCameraTransition } from '../../utils/cameraTransition';
import { captureCurrentShot } from '../../utils/captureShot';
import { profileForMount } from '../../utils/motionProfile';
import { drawCameraView, wallSurfaces, type ProjectedPerson } from './cameraViewRenderer';
import LookToggle from '../Render3D/LookToggle';
import { bereit3D, render3D, useBedarf3D, useBildVersion3D, useKameraLook } from '../Render3D/kameraBild3d';
import { assignPreset, groupPresets, hasPose, type PreviewPreset } from '../../utils/previewPreset';
import { formatAperture, formatDistance, niceTicks, stepAlong, stepStop, stopsInRange } from '../../utils/lensScale';

/** Kuerzeste sinnvolle Fokusdistanz des Reglers (m). */
const FOCUS_MIN = 0.5;
/** Ab dieser Breite steht die Datenspalte neben dem Bild (Containerbreite, nicht Fenster). */
const BREIT_AB_PX = 760;

// Gespeichert und zwischen beiden Kamerablicken geteilt (lib/useGeteilt).
const PRESETS_KEY = 'multicam-preview-presets';
const TRANSITION_MODE_KEY = 'multicam-preview-transition-mode';
const TRANSITION_SEC_KEY = 'multicam-preview-transition-sec';
const OVERLAYS_KEY = 'multicam-preview-overlays';
const STEUERUNG_KEY = 'multicam-preview-control-open';

interface Overlays { grid: boolean; safeAreas: boolean; thirds: boolean; crosshair: boolean; data: boolean }
const OVERLAYS_START: Overlays = { grid: true, safeAreas: true, thirds: false, crosshair: true, data: true };
const KEINE_PRESETS: PreviewPreset[] = [];

// ── Bildquelle fuer Export und Shotlist ──
//
// Beide Kamerablicke liefern ein Bild. Angemeldet ist der zuletzt
// eingeblendete (der 3D-Kamerablick, solange er offen ist), darunter liegt
// der Vorschau-Reiter. Ein einfaches „wer zuletzt schreibt" hinterliesse
// beim Schliessen des 3D-Blicks eine leere Stelle, obwohl die Vorschau noch
// steht.
interface Bildquelle {
  capture: () => HTMLCanvasElement | null;
  offscreen: (cssWidth?: number) => HTMLCanvasElement | null;
}
const bildquellen: Bildquelle[] = [];
function bildquelleMelden(): void {
  const reg = getExportRegistry();
  const q = bildquellen[bildquellen.length - 1];
  reg.capturePreviewCanvas = q ? () => q.capture() : null;
  reg.renderPreviewOffscreen = q ? (w) => q.offscreen(w) : null;
}

export interface KamerablickProps {
  /** Links in der Kopfzeile, z. B. die Ansichtswahl der 3D-Ansicht. */
  kopf?: ReactNode;
}

export default function Kamerablick({ kopf }: KamerablickProps) {
  const { cameras, selectedCameraId, venue, persons, walls, selectNextCamera, selectPrevCamera } = useStore();
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = cameras.find((c) => c.id === selectedCameraId);
  const [flaeche, setFlaeche] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const miss = () => setFlaeche({ w: el.clientWidth, h: el.clientHeight });
    miss();
    const ro = new ResizeObserver(miss);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const breit = flaeche.w >= BREIT_AB_PX;

  const [overlays, setOverlays] = useGeteilt<Overlays>(OVERLAYS_KEY, OVERLAYS_START);
  const ov = { ...OVERLAYS_START, ...overlays };
  const [steuerungOffen, setSteuerungOffen] = useGeteilt<boolean>(STEUERUNG_KEY, false);
  const [presets, setPresets] = useGeteilt<PreviewPreset[]>(PRESETS_KEY, KEINE_PRESETS);
  const [transitionMode, setTransitionMode] = useGeteilt<ShotTransition>(TRANSITION_MODE_KEY, 'off');
  const [transitionSeconds, setTransitionSeconds] = useGeteilt<number>(TRANSITION_SEC_KEY, 6);

  const [focusPickMode, setFocusPickMode] = useState(false);
  // Manuell (#47/#62): Brennweite und Blende ueber die echte Optik hinaus.
  const [manualZoom, setManualZoom] = useState(false);
  const [manualMin, setManualMin] = useState(1);
  const [manualMax, setManualMax] = useState(500);
  const [manualAperture, setManualAperture] = useState(false);
  const [manualApMin, setManualApMin] = useState(0.1);
  const [manualApMax, setManualApMax] = useState(32);
  const [shotHint, setShotHint] = useState<string | null>(null);
  const transitionCancel = useRef<(() => void) | null>(null);
  useEffect(() => () => { transitionCancel.current?.(); }, []);

  const [imageTick, setImageTick] = useState(0);
  const [look, setLook] = useKameraLook('multicam-preview-look');
  useBedarf3D(look === 'rendered');
  const bildVersion = useBildVersion3D();
  const bildPuffer = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => wallSurfaces.subscribe(() => setImageTick((n) => n + 1)), []);

  const projectedPersons = useRef<ProjectedPerson[]>([]);
  const [projectedCount, setProjectedCount] = useState(0);

  // Fokus folgt dem gesperrten Motiv; Schwenk und Neigung bleiben beim Bediener.
  useEffect(() => {
    if (!cam?.lockedPersonId) return;
    const target = persons.find((p) => p.id === cam.lockedPersonId);
    if (!target) return;
    const pos = effectiveCameraPos(cam);
    const dist = Math.hypot(target.x - pos.x, target.y - pos.y, target.height * 0.5 - cam.z);
    if (Math.abs(dist - cam.focusDistance) > 0.05) {
      useStore.getState().updateCamera(cam.id, { focusDistance: Math.max(0.1, dist) });
    }
  }, [cam, persons]);

  // `target`: fester Offscreen-Canvas (Shotlist-Framegrab, auch bei verstecktem Reiter).
  const draw = useCallback((target?: { canvas: HTMLCanvasElement; cssW: number }) => {
    const canvas = target?.canvas ?? canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !cam || (!target && !wrap)) return;
    const { customCameras, customLenses } = useStore.getState();
    const cssW = target ? target.cssW : wrap!.getBoundingClientRect().width;
    const dpr = target ? 1 : (window.devicePixelRatio || 1);
    const gerendert = !target && look === 'rendered' && cssW > 0
      && render3D(cam.id, (bildPuffer.current ??= document.createElement('canvas')), cssW, dpr, 'gross');
    const projected = drawCameraView({
      canvas,
      cssW,
      dpr,
      cam,
      bare: false,
      scene: { venue, persons, walls, cameras, customCameras, customLenses },
      overlays: { grid: ov.grid, safeAreas: ov.safeAreas, thirds: ov.thirds, crosshair: ov.crosshair },
      t,
      hintergrund: gerendert ? bildPuffer.current : null,
    });
    if (!target && projected) {
      projectedPersons.current = projected;
      setProjectedCount(projected.length);
    }
  }, [cam, venue, persons, walls, cameras, ov.grid, ov.safeAreas, ov.thirds, ov.crosshair, t, look]);

  // Synchron nach jedem Render, damit Schwenken per Zug ohne Ruckeln mitgeht.
  useLayoutEffect(() => { draw(); }, [draw, imageTick, bildVersion]);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);
  useEffect(() => {
    const quelle: Bildquelle = {
      capture: () => {
        const src = canvasRef.current;
        if (!src || src.width === 0 || src.height === 0) return null;
        const copy = document.createElement('canvas');
        copy.width = src.width;
        copy.height = src.height;
        copy.getContext('2d')?.drawImage(src, 0, 0);
        return copy;
      },
      offscreen: (cssWidth = 640) => {
        const canvas = document.createElement('canvas');
        drawRef.current({ canvas, cssW: cssWidth });
        return canvas.width > 0 && canvas.height > 0 ? canvas : null;
      },
    };
    bildquellen.push(quelle);
    bildquelleMelden();
    return () => {
      bildquellen.splice(bildquellen.indexOf(quelle), 1);
      bildquelleMelden();
    };
  }, []);

  // ── Zeiger: Schwenk/Neige per Zug, Kneifen zoomt, Fokus-Pick per Tipp ──
  const finger = useRef(new FingerNavigation());
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      finger.current.runter({ id: e.pointerId, x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!cam) return;
    if (e.pointerType !== 'mouse') {
      const zug = finger.current.bewegt({ id: e.pointerId, x: e.clientX, y: e.clientY });
      if (finger.current.anzahl >= 2) {
        // Kneifen als FAKTOR: 40 mm sind am Weitwinkel eine andere Welt als am 600er.
        const ziel = Math.max(1, Math.min(2000, cam.focalLength * kneifFaktor(zug.abstandVorher, zug.fahre)));
        useStore.getState().updateCamera(cam.id, { focalLength: ziel });
        return;
      }
    }
    if (!isDragging.current || focusPickMode) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    // 1 px Zug = der Winkel, den 1 px im Bild ueberspannt: die Szene bleibt am Zeiger.
    const canvas = canvasRef.current;
    let panSens = 0.3;
    let tiltSens = 0.2;
    if (canvas && fov) {
      if (canvas.clientWidth > 0) panSens = fov.horizontalDeg / canvas.clientWidth;
      if (canvas.clientHeight > 0) tiltSens = fov.verticalDeg / canvas.clientHeight;
    }
    const invH = cam.invertPreviewH ? -1 : 1;
    const invV = cam.invertPreviewV ? -1 : 1;
    const wrap180 = (v: number) => {
      const w = ((v + 180) % 360 + 360) % 360 - 180;
      return w === 180 ? -180 : w;
    };
    useStore.getState().updateCamera(cam.id, {
      pan: wrap180(cam.pan - dx * panSens * invH),
      tilt: Math.max(-90, Math.min(45, cam.tilt + dy * tiltSens * invV)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') finger.current.hoch(e.pointerId);
    const wasDragging = isDragging.current;
    isDragging.current = false;
    if (!wasDragging || !cam || !focusPickMode) return;
    if (Math.hypot(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y) > 4) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    let best: { dist: number; pickDist: number } | null = null;
    for (const p of projectedPersons.current) {
      const halfW = Math.max(8, Math.abs(p.topSy - p.sy) * 0.25);
      const top = Math.min(p.topSy, p.sy);
      const bottom = Math.max(p.topSy, p.sy);
      if (cx < p.sx - halfW || cx > p.sx + halfW || cy < top - 8 || cy > bottom + 12) continue;
      const d = Math.abs(cx - p.sx);
      if (!best || d < best.pickDist) best = { dist: p.dist, pickDist: d };
    }
    if (best) useStore.getState().updateCamera(cam.id, { focusDistance: Math.max(0.1, best.dist) });
  };

  // Mausrad zoomt. Nicht-passiv: der Bereich scrollt (#193), und ohne
  // preventDefault liefe beim Zoomen die ganze Seite mit.
  const zoomGrenzen = useRef({ min: 1, max: 2000 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const c = useStore.getState().cameras.find((k) => k.id === useStore.getState().selectedCameraId);
      if (!c) return;
      e.preventDefault();
      const { min, max } = zoomGrenzen.current;
      const ziel = c.focalLength * (e.deltaY > 0 ? 1.04 : 1 / 1.04);
      useStore.getState().updateCamera(c.id, { focalLength: Math.max(min, Math.min(max, ziel)) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [cam?.id]);

  const camDef = cam ? getCameraById(cam.cameraId, useStore.getState().customCameras) : undefined;
  const lensDef = cam ? getLensById(cam.lensId, useStore.getState().customLenses) : undefined;
  const sensor = cam && camDef && lensDef ? getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount) : undefined;
  const adapterInfo = cam && camDef && lensDef ? getAdapterInfo(camDef, lensDef, cam.useSpeedbooster, cam.activeMount) : null;
  const fov = cam && sensor ? computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef?.squeeze ?? 1) : null;
  const dof = cam && sensor ? computeDof(sensor, cam.focalLength, cam.aperture, cam.focusDistance, cam.extenderActive) : null;

  const zoomMin = manualZoom ? manualMin : (lensDef?.focalLengthMin ?? 4);
  const zoomMax = manualZoom ? manualMax : (lensDef?.focalLengthMax ?? 300);
  useEffect(() => { zoomGrenzen.current = { min: zoomMin, max: zoomMax }; }, [zoomMin, zoomMax]);

  const kopfzeile = (
    <div className="flex flex-wrap items-center gap-2">
      {kopf}
      {cam && (
        <div className={`flex min-w-0 items-center gap-1 ${kopf ? 'ml-auto' : ''}`}>
          <button type="button" onClick={selectPrevCamera} className="bc-btn-soft px-0" aria-label={t('preview.prevCamera', 'Previous camera')} title={t('preview.prevCamera', 'Previous camera')}>
            <FiChevronLeft size={18} />
          </button>
          <span className="min-w-0 truncate px-1 text-sm font-semibold text-bc-text-bright">
            {cam.label}
            <span className="ml-1.5 text-xs font-normal tabular-nums text-bc-dim">{cameras.findIndex((c) => c.id === cam.id) + 1}/{cameras.length}</span>
          </span>
          <button type="button" onClick={selectNextCamera} className="bc-btn-soft px-0" aria-label={t('preview.nextCamera', 'Next camera')} title={t('preview.nextCamera', 'Next camera')}>
            <FiChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );

  if (!cam) {
    return (
      <div ref={rootRef} className="flex h-full w-full flex-col gap-3 overflow-y-auto p-3">
        {kopfzeile}
        <div className="m-auto flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-bc-dim">{t('preview.emptyState', 'Select a camera to see its preview')}</p>
          {cameras.length > 0 && (
            <button type="button" className="bc-btn-primary min-h-11 text-sm" onClick={() => useStore.getState().selectCamera(cameras[0].id)}>
              <FiCamera size={16} /> {format(t('preview.showCamera', 'Look through {cam}'), { cam: cameras[0].label })}
            </button>
          )}
        </div>
      </div>
    );
  }

  const update = (patch: Partial<VenueCamera>) => useStore.getState().updateCamera(cam.id, patch);

  const focusMax = Math.max(20, Math.ceil(Math.hypot(venue.widthM, venue.heightM)));
  const apMin = manualAperture ? manualApMin : (lensDef?.maxApertureWide ?? 1.4);
  const apMax = manualAperture ? manualApMax : 22;
  const zoomTicks = niceTicks(zoomMin, zoomMax);
  const focusTicks = niceTicks(FOCUS_MIN, focusMax);
  const apertureStops = stopsInRange(apMin, apMax);

  const addPreset = () => {
    const name = window.prompt(t('preview.presetNamePrompt', 'Preset name:'), `${cam.focalLength.toFixed(0)}mm f/${cam.aperture.toFixed(1)}`);
    if (!name) return;
    setPresets((alt) => [...alt, {
      // Ein Preset gehoert zu genau einer Kamera — sonst faehrt es irgendeine andere an.
      id: Date.now().toString(36), name: name.trim(), cameraId: cam.id,
      focalLength: cam.focalLength, aperture: cam.aperture, focusDistance: cam.focusDistance,
      pan: cam.pan, tilt: cam.tilt, z: cam.z, trackOffset: cam.trackOffset, x: cam.x, y: cam.y,
    }]);
  };
  const applyPreset = (p: PreviewPreset) => {
    const target: Partial<VenueCamera> = { focalLength: p.focalLength, aperture: p.aperture, focusDistance: p.focusDistance, lockedPersonId: undefined };
    if (p.pan !== undefined) target.pan = p.pan;
    if (p.tilt !== undefined) target.tilt = p.tilt;
    if (p.z !== undefined) target.z = p.z;
    if (p.trackOffset !== undefined) target.trackOffset = p.trackOffset;
    if (p.x !== undefined) target.x = p.x;
    if (p.y !== undefined) target.y = p.y;
    // Ein Preset darf ausserhalb der echten Optik liegen — dann muss der Regler es zeigen koennen.
    if (lensDef && (p.focalLength < lensDef.focalLengthMin || p.focalLength > lensDef.focalLengthMax)) {
      setManualZoom(true);
      setManualMin((m) => Math.min(m, Math.floor(p.focalLength)));
      setManualMax((m) => Math.max(m, Math.ceil(p.focalLength)));
    }
    update({ lockedPersonId: undefined });
    const secs = transitionMode === 'off' ? 0
      : transitionMode === 'manual' ? Math.max(0, transitionSeconds)
      : TRANSITION_PRESET_SECONDS[transitionMode];
    transitionCancel.current?.();
    const start = useStore.getState().cameras.find((c) => c.id === cam.id);
    if (!start) return;
    // Dieselbe Fahrt wie die Shotlist (utils/cameraTransition), im Stil der Montage.
    transitionCancel.current = runCameraTransition({
      from: start,
      to: target,
      seconds: secs,
      profile: profileForMount(start.mountType),
      apply: (patch) => useStore.getState().updateCamera(cam.id, patch),
      onDone: () => { transitionCancel.current = null; },
    });
  };
  const deletePreset = (id: string) => setPresets((alt) => alt.filter((p) => p.id !== id));
  const presetGroups = groupPresets(presets, cam.id, cameras.map((c) => c.id));

  const aufnehmen = () => {
    const res = captureCurrentShot();
    setShotHint(
      !res.ok ? (res.reason ?? t('preview.shot.failed', 'Capture failed.'))
        : res.hadThumbnail ? t('preview.shot.done', 'Shot captured.')
          : t('preview.shot.noImage', 'Shot saved — without picture.'),
    );
    window.setTimeout(() => setShotHint(null), 2500);
  };

  const lockSubject = () => {
    const W = canvasRef.current?.clientWidth ?? 0;
    const H = canvasRef.current?.clientHeight ?? 0;
    let best: { id: string; d: number } | null = null;
    for (const p of projectedPersons.current) {
      const d = Math.hypot(p.sx - W / 2, p.sy - H / 2);
      if (!best || d < best.d) best = { id: p.id, d };
    }
    if (best) update({ lockedPersonId: best.id });
  };

  const manuellKnopf = (an: boolean, umschalten: () => void, title: string) => (
    <button
      type="button"
      onClick={umschalten}
      aria-pressed={an}
      title={title}
      className={`rounded-bc-full px-3 text-xs font-semibold transition-colors ${an ? 'bg-bc-yellow/20 text-bc-yellow-text' : 'bg-bc-panel-raised text-bc-muted hover:text-bc-text-bright'}`}
    >
      {t('preview.manual', 'Manual')}
    </button>
  );
  const grenzFeld = (wert: number, setzen: (v: number) => void, title: string) => (
    <input
      type="number"
      value={wert}
      onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setzen(v); }}
      className="w-16 border border-bc-border bg-bc-sunken px-1.5 text-right text-xs tabular-nums text-bc-text-bright"
      title={title}
      aria-label={title}
    />
  );

  // Auf grossen Flaechen bleibt das Bild so klein, dass die Regler darunter
  // ohne Scrollen zu sehen sind; schmal fuellt es die Breite.
  const bildMaxBreite = breit && flaeche.h > 0 ? Math.max(360, (flaeche.h - 230) * (16 / 9)) : undefined;

  const datenblock = camDef && lensDef && fov && dof && ov.data && (
    <section className={breit ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-1.5 sm:grid-cols-3'} aria-label={t('preview.overlay.data', 'Data')}>
      <div className={`rounded-bc-m bg-bc-panel-raised px-3 py-2 ${breit ? '' : 'col-span-full'}`}>
        <div className="text-[11px] text-bc-dim">{camDef.sensor.name} · {camDef.mount}</div>
        <div className="text-xs text-bc-muted">{camDef.manufacturer} {camDef.model}</div>
        <div className="text-xs text-bc-muted">{lensDef.manufacturer} {lensDef.model}</div>
        {adapterInfo && (
          <div className="mt-0.5 text-[11px] text-bc-yellow-text">
            ⚡ {adapterInfo.name}{adapterInfo.lightLossStops !== 0 ? ` (${adapterInfo.lightLossStops > 0 ? '−' : '+'}${Math.abs(adapterInfo.lightLossStops)}T)` : ''}
          </div>
        )}
      </div>
      {cam.notes?.trim() && (
        <div className={`rounded-bc-m bg-bc-panel-raised px-3 py-2 ${breit ? '' : 'col-span-full'}`}>
          <div className="text-[11px] text-bc-dim">{t('preview.notes', 'Notes')}</div>
          <div className="whitespace-pre-wrap text-xs leading-snug text-bc-text">{cam.notes}</div>
        </div>
      )}
      <div className={breit ? 'grid grid-cols-2 gap-1.5' : 'contents'}>
        <DataCell label={t('preview.data.focalLength', 'Focal length')} value={`${cam.focalLength.toFixed(1)} mm`} sub={cam.extenderActive > 1 ? `eff. ${(cam.focalLength * cam.extenderActive).toFixed(0)} mm` : `eq. ${fov.equivalentFocalLength.toFixed(0)} mm`} />
        <DataCell label={t('preview.data.aperture', 'Aperture')} value={`f/${cam.aperture.toFixed(1)}`} sub={adapterInfo && adapterInfo.lightLossStops !== 0 ? `eff. T${(cam.aperture * Math.pow(2, adapterInfo.lightLossStops / 2)).toFixed(1)}` : undefined} />
        <DataCell label={t('preview.data.distance', 'Distance')} value={`${cam.focusDistance.toFixed(1)} m`} />
        <DataCell label={t('preview.data.fovH', 'FOV H')} value={`${fov.horizontalDeg.toFixed(1)}°`} sub={`V ${fov.verticalDeg.toFixed(1)}°`} />
        <DataCell label={t('preview.data.imageWidth', 'Image width')} value={`${fov.imageWidthAtDistance.toFixed(1)} m`} sub={`@ ${cam.focusDistance.toFixed(0)} m`} />
        <DataCell label={t('preview.data.imageHeight', 'Image height')} value={`${fov.imageHeightAtDistance.toFixed(1)} m`} sub={`@ ${cam.focusDistance.toFixed(0)} m`} />
        <DataCell label={t('preview.data.dofNear', 'DoF Near')} value={dof.nearLimit < 0.01 ? '0 m' : `${dof.nearLimit.toFixed(2)} m`} />
        <DataCell label={t('preview.data.dofFar', 'DoF Far')} value={dof.farLimit === Infinity ? '∞' : `${dof.farLimit.toFixed(2)} m`} />
        <DataCell label={t('preview.data.dofTotal', 'DoF Total')} value={dof.totalDof === Infinity ? '∞' : `${dof.totalDof.toFixed(2)} m`} />
      </div>
    </section>
  );

  return (
    <div ref={rootRef} className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="flex flex-col gap-3 p-2 sm:p-3">
        {kopfzeile}

        <div className={breit && datenblock ? 'grid grid-cols-[minmax(0,1fr)_15rem] items-start gap-3' : 'flex flex-col gap-3'}>
          <div className="flex min-w-0 flex-col gap-3">
            {/* ── Das Bild ── */}
            <div ref={wrapRef} className="relative mx-auto w-full overflow-hidden rounded-bc-l bg-bc-media shadow-bc-1" style={{ maxWidth: bildMaxBreite }}>
              <canvas
                ref={canvasRef}
                data-preview-canvas
                className="block w-full"
                // `touchAction: none`: sonst scrollt die Seite unter dem Bild weg, statt zu schwenken (#137).
                style={{ cursor: focusPickMode ? 'crosshair' : 'grab', touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
            </div>

            {/* ── Werkzeuge am Bild: Darstellung, Einblendungen, Fokus, Hauptaktion ── */}
            <div className="flex flex-wrap items-center gap-2">
              <LookToggle value={look} onChange={setLook} laedt={!bereit3D()} />
              <Einblendungen
                ov={ov}
                look={look}
                onOv={(patch) => setOverlays({ ...ov, ...patch })}
                invertH={!!cam.invertPreviewH}
                invertV={!!cam.invertPreviewV}
                onInvert={(patch) => update(patch)}
              />
              <button
                type="button"
                onClick={() => setFocusPickMode((v) => !v)}
                aria-pressed={focusPickMode}
                title={focusPickMode ? t('preview.focusPickLeave', 'Click anywhere to leave focus-pick mode') : t('preview.focusPickEnter', 'Pick a person in the preview to set focus distance')}
                className={`bc-btn-soft text-xs ${focusPickMode ? 'ring-2 ring-bc-yellow' : ''}`}
              >
                <FiCrosshair size={14} /> {t('preview.focusPick', 'Focus pick')}
              </button>
              {cam.lockedPersonId ? (
                <button type="button" onClick={() => update({ lockedPersonId: undefined })} title={t('preview.releaseLock', 'Release focus lock')} className="bc-btn-soft text-xs text-bc-yellow-text">
                  <FiLock size={14} /> {t('preview.unlock', 'Unlock')} {persons.find((p) => p.id === cam.lockedPersonId)?.label ?? t('preview.subject', 'subject')}
                </button>
              ) : projectedCount > 0 && (
                <button type="button" onClick={lockSubject} title={t('preview.lockSubjectTitle', 'Lock focus distance to the subject closest to the crosshair')} className="bc-btn-soft text-xs">
                  <FiUnlock size={14} /> {t('preview.lockSubject', 'Lock subject')}
                </button>
              )}
              <button type="button" onClick={aufnehmen} className="bc-btn-primary ml-auto text-xs" title={t('preview.addShot', 'Add the current view to the shotlist as a shot')}>
                <FiCamera size={14} /> {t('preview.captureShot', 'Capture shot')}
              </button>
            </div>
            <p className="-mt-1 text-[11px] text-bc-dim" role="status">
              {shotHint ?? (focusPickMode ? t('preview.hintFocusPick', 'Click a person to set focus distance') : t('preview.hintDrag2', 'Drag the picture: pan/tilt · wheel or pinch: zoom'))}
            </p>

            {/* ── Objektiv: Zoom, Blende, Fokus (log-Bahn, Rasten, Enter-Kette) ── */}
            <section className="flex flex-col gap-1 rounded-bc-l bg-bc-panel-raised/50 px-3 py-2" data-regler-kette aria-label={t('preview.lens', 'Lens')}>
              <Regler
                label={t('preview.zoom', 'Zoom')}
                value={cam.focalLength}
                min={zoomMin}
                max={zoomMax}
                skala="log"
                raster={zoomTicks}
                marken={zoomTicks}
                formatMarke={(v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)))}
                einheit="mm"
                dezimalen={1}
                onChange={(v) => update({ focalLength: v })}
                onStep={(dir) => update({ focalLength: stepAlong(cam.focalLength, dir, zoomMin, zoomMax, zoomTicks) })}
                title={t('preview.focal.title2', 'Focal length — logarithmic, snaps to the marks (Shift = free).')}
                rechts={
                  <>
                    {manualZoom && grenzFeld(manualMin, (v) => setManualMin(Math.max(1, Math.min(manualMax - 1, v))), t('preview.manualMin', 'Manual minimum focal length (mm)'))}
                    {manualZoom && grenzFeld(manualMax, (v) => setManualMax(Math.max(manualMin + 1, Math.min(2000, v))), t('preview.manualMax', 'Manual maximum focal length (mm)'))}
                    {manuellKnopf(manualZoom, () => {
                      const next = !manualZoom;
                      if (!next && lensDef) {
                        const c = Math.min(lensDef.focalLengthMax, Math.max(lensDef.focalLengthMin, cam.focalLength));
                        if (c !== cam.focalLength) update({ focalLength: c });
                      }
                      setManualZoom(next);
                    }, t('preview.manualTitle', "Temporarily scrub focal length beyond the lens's real range"))}
                  </>
                }
              />
              <Regler
                label={t('preview.aperture', 'Aperture')}
                value={cam.aperture}
                min={apMin}
                max={apMax}
                skala="log"
                raster={apertureStops}
                marken={[apMin, ...apertureStops, apMax]}
                formatMarke={(v) => (v < 10 ? v.toFixed(1) : v.toFixed(0))}
                format={formatAperture}
                praefix="f/"
                dezimalen={1}
                onChange={(v) => update({ aperture: v })}
                onStep={(dir) => update({ aperture: stepStop(cam.aperture, dir, apMin, apMax) })}
                title={t('preview.aperture.title2', 'Aperture — snaps to full stops (Shift = stepless).')}
                rechts={
                  <>
                    {manualAperture && grenzFeld(manualApMin, (v) => setManualApMin(Math.max(0.1, Math.min(manualApMax - 0.1, v))), t('preview.apertureManualMin', 'Manual minimum (aperture)'))}
                    {manualAperture && grenzFeld(manualApMax, (v) => setManualApMax(Math.max(manualApMin + 0.1, Math.min(64, v))), t('preview.apertureManualMax', 'Manual maximum (aperture)'))}
                    {manuellKnopf(manualAperture, () => {
                      const next = !manualAperture;
                      if (!next) {
                        const c = Math.min(22, Math.max(lensDef?.maxApertureWide ?? 1.4, cam.aperture));
                        if (c !== cam.aperture) update({ aperture: c });
                      }
                      setManualAperture(next);
                    }, t('preview.aperture.beyond', 'Run the aperture beyond the real lens limits'))}
                  </>
                }
              />
              <Regler
                label={t('preview.focus', 'Focus')}
                value={Math.min(cam.focusDistance, focusMax)}
                min={FOCUS_MIN}
                max={focusMax}
                skala="log"
                raster={focusTicks}
                marken={focusTicks}
                formatMarke={formatDistance}
                format={formatDistance}
                einheit="m"
                dezimalen={1}
                notiz={cam.lockedPersonId ? t('preview.locked', 'locked') : undefined}
                onChange={(v) => update({ focusDistance: Math.max(0.1, v), lockedPersonId: undefined })}
                onStep={(dir) => update({ focusDistance: stepAlong(cam.focusDistance, dir, FOCUS_MIN, focusMax, focusTicks), lockedPersonId: undefined })}
                title={t('preview.focus.title2', 'Focus distance — fine up close, coarse far away (logarithmic).')}
              />
            </section>

            {!breit && datenblock}

            {/* ── Presets (#47/#62): je Kamera, angefahren mit der Transition-Zeit ── */}
            <section className="flex flex-col gap-2" aria-label={t('preview.presets', 'Presets')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-bc-muted">{t('preview.presets', 'Presets')}</span>
                {presetGroups.own.map((p) => (
                  <span key={p.id} className="inline-flex items-center rounded-bc-full bg-bc-panel-raised text-xs text-bc-text">
                    <button type="button" className="rounded-bc-full pl-3 pr-1 hover:text-bc-text-bright" onClick={() => applyPreset(p)} title={`${p.focalLength.toFixed(0)}mm · f/${p.aperture.toFixed(1)} · ${p.focusDistance.toFixed(1)}m`}>
                      {p.name}{hasPose(p) && <span className="ml-1 text-bc-accent" title={t('preview.preset.hasPose', 'contains camera position')}>◈</span>}
                    </button>
                    <button type="button" className="rounded-bc-full px-1.5 text-bc-dim hover:text-bc-red-text" onClick={() => deletePreset(p.id)} aria-label={format(t('preview.deletePresetNamed', 'Delete preset {name}'), { name: p.name })} title={t('preview.deletePreset', 'Delete preset')}>
                      <FiX size={12} />
                    </button>
                  </span>
                ))}
                {presetGroups.own.length === 0 && <span className="text-xs text-bc-dim">{t('preview.preset.none', 'none yet')}</span>}
                <button type="button" onClick={addPreset} className="bc-btn-soft text-xs" title={`${t('preview.savePreset', 'Save current focal length / aperture / focus as a preset')} · ${cam.label}`}>
                  <FiPlus size={14} /> {t('preview.add', 'Add')}
                </button>
              </div>
              {/* Presets ohne Zuordnung (Altbestand, geloeschte Kamera): anwendbar und zuschlagbar — stilles Loeschen waere Datenverlust. */}
              {presetGroups.unassigned.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-bc-dim" title={t('preview.preset.unassigned.title', 'Presets with no camera assigned')}>{t('preview.preset.unassigned', 'unassigned')}</span>
                  {presetGroups.unassigned.map((p) => (
                    <span key={p.id} className="inline-flex items-center rounded-bc-full border border-dashed border-bc-border text-xs text-bc-muted">
                      <button type="button" className="rounded-bc-full pl-3 pr-1" onClick={() => applyPreset(p)}>{p.name}</button>
                      <button type="button" className="rounded-bc-full px-1 hover:text-bc-text-bright" onClick={() => setPresets(assignPreset(presets, p.id, cam.id))} aria-label={format(t('preview.preset.assign', 'Assign to {cam}'), { cam: cam.label })} title={format(t('preview.preset.assign', 'Assign to {cam}'), { cam: cam.label })}>
                        <FiPlus size={12} />
                      </button>
                      <button type="button" className="rounded-bc-full px-1.5 hover:text-bc-red-text" onClick={() => deletePreset(p.id)} aria-label={format(t('preview.deletePresetNamed', 'Delete preset {name}'), { name: p.name })}>
                        <FiX size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-bc-muted">{t('preview.transitionTime', 'Transition time')}</span>
                <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('preview.transitionTime', 'Transition time')}>
                  {TRANSITION_CYCLE.map((m) => (
                    <button key={m} type="button" aria-pressed={transitionMode === m} onClick={() => setTransitionMode(m)} className="px-2.5 text-xs font-medium">
                      {transitionLabel(t, m)}
                    </button>
                  ))}
                </div>
                {transitionMode === 'manual' && (
                  <label className="inline-flex items-center gap-1 text-xs text-bc-dim">
                    <input
                      type="number" min={0} max={120} step={0.5}
                      value={transitionSeconds}
                      onChange={(e) => setTransitionSeconds(Math.max(0, Math.min(120, parseFloat(e.target.value) || 0)))}
                      className="w-16 border border-bc-border bg-bc-sunken px-1.5 text-right tabular-nums text-bc-text-bright"
                      aria-label={t('preview.transitionSeconds', 'Transition time in seconds (editing switches to Manual)')}
                    />
                    s
                  </label>
                )}
              </div>
            </section>

            {/* ── Kamerasteuerung (Rig-Pult), aufklappbar (#193) ── */}
            <section className="rounded-bc-l bg-bc-panel-raised/50">
              <button
                type="button"
                onClick={() => setSteuerungOffen(!steuerungOffen)}
                aria-expanded={steuerungOffen}
                className="flex w-full items-center gap-2 rounded-bc-l px-3 py-2 text-left hover:bg-bc-hover"
              >
                <FiChevronDown size={16} className={`shrink-0 transition-transform ${steuerungOffen ? '' : '-rotate-90'}`} />
                <span className="shrink-0 text-sm font-semibold text-bc-text-bright">{t('preview.control', 'Camera control')}</span>
                <span className="hidden min-w-0 truncate text-xs text-bc-dim sm:inline">
                  {mountTypeLabel(t, cam.mountType ?? 'tripod')} · {t('preview.control.hint', 'pan/tilt pad, travel, takes')}
                </span>
              </button>
              {steuerungOffen && <div className="px-1 pb-2"><RigControlPanel eingebettet /></div>}
            </section>
          </div>

          {breit && datenblock && <div className="sticky top-0">{datenblock}</div>}
        </div>
      </div>
    </div>
  );
}

function transitionLabel(t: (k: string, f: string) => string, m: ShotTransition): string {
  switch (m) {
    case 'off': return t('preview.transition.off', 'Cut');
    case 'fast': return t('preview.transition.fast', 'Fast 3 s');
    case 'slow': return t('preview.transition.slow', 'Slow 10 s');
    default: return t('preview.transition.manual', 'Manual');
  }
}

/** Einblendungen und Zugrichtung — selten gebraucht, darum hinter einem Knopf. */
function Einblendungen({ ov, look, onOv, invertH, invertV, onInvert }: {
  ov: Overlays;
  look: string;
  onOv: (patch: Partial<Overlays>) => void;
  invertH: boolean;
  invertV: boolean;
  onInvert: (patch: Partial<VenueCamera>) => void;
}) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOffen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('pointerdown', zu);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', zu); document.removeEventListener('keydown', esc); };
  }, [offen]);

  const zeilen: [string, boolean, () => void][] = [
    // Das Bodenraster gehoert zur Zeichnung; im gerenderten Bild liegt der echte Boden.
    ...(look === 'simple' ? [[t('preview.overlay.grid', 'Grid'), ov.grid, () => onOv({ grid: !ov.grid })] as [string, boolean, () => void]] : []),
    [t('preview.overlay.safeAreas', 'Safe areas'), ov.safeAreas, () => onOv({ safeAreas: !ov.safeAreas })],
    [t('preview.overlay.thirds', 'Thirds'), ov.thirds, () => onOv({ thirds: !ov.thirds })],
    [t('preview.overlay.crosshair', 'Crosshair'), ov.crosshair, () => onOv({ crosshair: !ov.crosshair })],
    [t('preview.overlay.dataPanel', 'Data panel'), ov.data, () => onOv({ data: !ov.data })],
    [t('preview.invertH', 'Invert H'), invertH, () => onInvert({ invertPreviewH: !invertH })],
    [t('preview.invertV', 'Invert V'), invertV, () => onInvert({ invertPreviewV: !invertV })],
  ];
  const an = zeilen.filter(([, on]) => on).length;

  return (
    <div ref={ref} className="relative">
      <button type="button" className="bc-btn-soft text-xs" aria-expanded={offen} aria-haspopup="true" onClick={() => setOffen((o) => !o)}>
        <FiLayers size={14} /> {t('preview.overlays', 'Overlays')}
        <span className="tabular-nums text-bc-dim">{an}</span>
      </button>
      {offen && (
        <div className="bc-popover absolute left-0 top-full z-30 mt-1 flex w-56 flex-col p-1.5" role="group" aria-label={t('preview.overlays', 'Overlays')}>
          {zeilen.map(([label, on, umschalten], i) => (
            <label key={label} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-bc-s px-2 text-xs text-bc-text hover:bg-bc-hover ${i === zeilen.length - 2 ? 'mt-1 border-t border-bc-border pt-1' : ''}`}>
              <input type="checkbox" checked={on} onChange={umschalten} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function DataCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-bc-m bg-bc-panel-raised px-2.5 py-1.5">
      <div className="text-[11px] leading-tight text-bc-dim">{label}</div>
      <div className="text-sm font-semibold leading-tight tabular-nums text-bc-text-bright">{value}</div>
      {sub && <div className="text-[11px] leading-tight text-bc-dim">{sub}</div>}
    </div>
  );
}
