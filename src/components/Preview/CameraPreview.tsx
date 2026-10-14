import { FingerNavigation, kneifFaktor } from '../../lib/fingerNavigation';
import { useSchmal } from '../../lib/useSchmal';
import { useStore } from '../../store/useStore';
import { getCameraById, getEffectiveSensor, getAdapterInfo } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov, computeDof } from '../../utils/fov';
import { effectiveCameraPos } from '../../utils/camera';
import { getExportRegistry } from '../../store/exportRegistry';
import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import type { ShotTransition, VenueCamera } from '../../types';
import { FiChevronLeft, FiChevronRight, FiUnlock, FiLock, FiPlus, FiX, FiCamera } from 'react-icons/fi';
import { loadJSON, saveJSON } from '../../utils/storage';
import { useTranslation } from '../../i18n';
import RigControlPanel from '../RigControl/RigControlPanel';
import {
  TRANSITION_CYCLE,
  TRANSITION_LABEL,
  TRANSITION_PRESET_SECONDS,
  runCameraTransition,
} from '../../utils/cameraTransition';
import { captureCurrentShot } from '../../utils/captureShot';
import { profileForMount } from '../../utils/motionProfile';
import LensSlider from './LensSlider';
import { drawCameraView, wallSurfaces, type ProjectedPerson } from './cameraViewRenderer';
import LookToggle from '../Render3D/LookToggle';
import { bereit3D, render3D, useBedarf3D, useBildVersion3D, useKameraLook } from '../Render3D/kameraBild3d';
import {
  assignPreset,
  groupPresets,
  hasPose,
  type PreviewPreset,
} from '../../utils/previewPreset';
import {
  formatAperture,
  formatDistance,
  formatFocal,
  niceTicks,
  stepAlong,
  stepStop,
  stopsInRange,
} from '../../utils/lensScale';

/** Kuerzeste sinnvolle Fokusdistanz des Reglers (m). */
const FOCUS_MIN = 0.5;

// Preview-Presets (#47, erweitert #62 Punkt 3): gespeicherte Posen zum
// Anfahren — Optik plus (optional) Position im Raum. Typ und Zuordnungslogik
// liegen in utils/previewPreset, damit die Regeln testbar sind.
const PREVIEW_PRESETS_KEY = 'multicam-preview-presets';
const PREVIEW_TRANSITION_MODE_KEY = 'multicam-preview-transition-mode';
const PREVIEW_TRANSITION_SEC_KEY = 'multicam-preview-transition-sec';

// Transition-Time (#62 Punkt 4): das Anfahren eines Presets. Engine + Konstanten
// liegen in utils/cameraTransition, damit die Shotlist (#62 Punkt 5) exakt
// dieselbe Fahrt nutzt statt einer zweiten Implementierung.
type TransitionMode = ShotTransition;

interface PreviewProps {
  undocked: boolean;
  onUndock: () => void;
}

export default function CameraPreview({ undocked, onUndock }: PreviewProps) {
  const { cameras, selectedCameraId, venue, persons, walls, selectNextCamera, selectPrevCamera } = useStore();
  const { t } = useTranslation();
  // Schmales Fenster: das Bild bekommt die volle Breite, die Zahlen wandern
  // darunter (#137).
  const schmal = useSchmal();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = cameras.find((c) => c.id === selectedCameraId);
  const selectedCam = cam;
  const isDragging = useRef(false);
  // Die liegenden Finger (#137). Eine Instanz je Vorschau: die Geste IST der
  // Zustand zwischen den Ereignissen, und den kann ein Handler nicht halten.
  const finger = useRef(new FingerNavigation());
  const lastMouse = useRef({ x: 0, y: 0 });

  // Overlay toggles
  const [showGrid, setShowGrid] = useState(true);
  const [showSafeAreas, setShowSafeAreas] = useState(true);
  const [showThirds, setShowThirds] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showData, setShowData] = useState(true);
  const [focusPickMode, setFocusPickMode] = useState(false);
  // Manual-zoom mode (issue #47): widen the focal-length slider past the lens's
  // real range to preview hypothetical focal lengths. Both ends are editable.
  const [manualZoom, setManualZoom] = useState(false);
  const [manualMin, setManualMin] = useState(1);
  const [manualMax, setManualMax] = useState(500);
  // Manual-aperture mode (issue #62): widen the aperture slider past the lens's
  // real range (default 0.1 - 32) to preview hypothetical f-stops. Both ends editable.
  const [manualAperture, setManualAperture] = useState(false);
  const [manualApMin, setManualApMin] = useState(0.1);
  const [manualApMax, setManualApMax] = useState(32);
  // Transition-Time (#62 Punkt 4): Modus + Manuell-Zeit, global persistiert.
  const [transitionMode, setTransitionMode] = useState<TransitionMode>(() => loadJSON<TransitionMode>(PREVIEW_TRANSITION_MODE_KEY, 'off'));
  const [transitionSeconds, setTransitionSeconds] = useState<number>(() => loadJSON<number>(PREVIEW_TRANSITION_SEC_KEY, 6));
  // Kurze Rueckmeldung nach 'Shot aufnehmen' (#62 Punkt 5).
  const [shotHint, setShotHint] = useState<string | null>(null);
  // Abbruch-Handle der laufenden Preset-Fahrt (utils/cameraTransition).
  const transitionCancel = useRef<(() => void) | null>(null);
  // Laufende Fahrt beim Unmount abbrechen.
  useEffect(() => () => { transitionCancel.current?.(); }, []);
  // Optical presets (issue #47), persisted globally.
  const [presets, setPresets] = useState<PreviewPreset[]>(() => loadJSON<PreviewPreset[]>(PREVIEW_PRESETS_KEY, []));
  const persistPresets = useCallback((next: PreviewPreset[]) => { setPresets(next); saveJSON(PREVIEW_PRESETS_KEY, next); }, []);
  // Wandbilder laden asynchron (#45): fertig geladen => neu zeichnen.
  const [imageTick, setImageTick] = useState(0);
  // Gerendert (Standard) oder die einfache Zeichnung (#167).
  const [look, setLook] = useKameraLook('multicam-preview-look');
  useBedarf3D(look === 'rendered');
  const bildVersion = useBildVersion3D();
  const bildPuffer = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => wallSurfaces.subscribe(() => setImageTick((n) => n + 1)), []);

  // Cache projected person positions during draw() so the click handler can hit-test
  // without re-projecting everything itself.
  const projectedPersons = useRef<ProjectedPerson[]>([]);
  // Spiegel von projectedPersons.current.length fuer die Render-Phase.
  const [projectedCount, setProjectedCount] = useState(0);

  // ── Locked-person focus tracker ──
  // When cam.lockedPersonId is set, the focus distance follows that target as
  // the camera or the subject moves. Pan/tilt are NOT changed here — the
  // operator still aims manually. Useful for live events where the subject
  // walks around but the operator already has them framed.
  useEffect(() => {
    if (!cam?.lockedPersonId) return;
    const target = persons.find((p) => p.id === cam.lockedPersonId);
    if (!target) return;
    const pos = effectiveCameraPos(cam);
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.height * 0.5 - cam.z; // aim at the subject's centre, not the feet
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (Math.abs(dist - cam.focusDistance) > 0.05) {
      useStore.getState().updateCamera(cam.id, { focusDistance: Math.max(0.1, dist) });
    }
  }, [cam?.lockedPersonId, cam?.x, cam?.y, cam?.z, cam?.focusDistance, cam?.id, cam?.trackOffset, cam?.pan, persons, cam]);

  // `target` rendert in einen uebergebenen (auch nicht im DOM haengenden) Canvas
  // mit fester Breite. Gebraucht fuer Shotlist-Framegrabs, wenn der Preview-Tab
  // gerade nicht sichtbar ist und der eigene Canvas darum 0 px breit waere.
  // `cam`/`bare` im Ziel: das Multiview rendert damit jede Kamera ohne
  // Bedien-Overlays (Lineale, Hilfslinien, Badges) in seine Kacheln.
  const draw = useCallback((target?: { canvas: HTMLCanvasElement; cssW: number; dpr?: number; cam?: VenueCamera; bare?: boolean }) => {
    const canvas = target?.canvas ?? canvasRef.current;
    const wrap = wrapRef.current;
    const cam = target?.cam ?? selectedCam;
    if (!canvas || !cam) return;
    if (!target && !wrap) return;
    const { customCameras, customLenses } = useStore.getState();
    // Offscreen (target) in fester Breite, sonst so breit wie der Rahmen.
    const cssW = target ? target.cssW : wrap!.getBoundingClientRect().width;
    const dpr = target ? (target.dpr ?? 1) : (window.devicePixelRatio || 1);
    // Gerendertes Bild (#167) als Grund — solange die 3D-Szene laedt, die Zeichnung.
    const gerendert = !target && look === 'rendered' && cssW > 0
      && render3D(cam.id, (bildPuffer.current ??= document.createElement('canvas')), cssW, dpr, 'gross');
    const projected = drawCameraView({
      canvas,
      cssW,
      dpr,
      cam,
      bare: target?.bare ?? false,
      scene: { venue, persons, walls, cameras, customCameras, customLenses },
      overlays: { grid: showGrid, safeAreas: showSafeAreas, thirds: showThirds, crosshair: showCrosshair },
      t,
      hintergrund: gerendert ? bildPuffer.current : null,
    });
    // Nur das sichtbare Bild bestimmt, welche Personen sich antippen lassen.
    // Die Anzahl wandert in den State, damit das Render sie lesen kann (Refs
    // sind waehrend des Renders tabu); gleicher Wert => kein erneutes Render.
    if (!target && projected) {
      projectedPersons.current = projected;
      setProjectedCount(projected.length);
    }
  }, [selectedCam, venue, persons, walls, cameras, showGrid, showSafeAreas, showThirds, showCrosshair, t, look]);

  // Repaint synchronously after every render so pan/tilt drags update the canvas
  // on the very next browser frame. The earlier `useEffect` variant was being
  // batched by React under fast drag input, so the 2D/3D views (which bind
  // declaratively to the store) updated immediately while the imperatively-
  // painted canvas lagged or skipped frames.
  useLayoutEffect(() => {
    draw();
  }, [draw, imageTick, bildVersion]);

  // Resize observer lives in a normal effect — not time-critical.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    const registry = getExportRegistry();
    registry.capturePreviewCanvas = () => {
      const source = canvasRef.current;
      if (!source || source.width === 0 || source.height === 0) return null;

      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      const copyCtx = copy.getContext('2d');
      if (!copyCtx) return null;
      copyCtx.drawImage(source, 0, 0);
      return copy;
    };

    return () => { registry.capturePreviewCanvas = null; };
  }, []);

  // Offscreen-Render fuer Shotlist-Framegrabs (#62 Punkt 5): funktioniert auch,
  // wenn der Preview-Tab gerade versteckt ist (dann ist der sichtbare Canvas
  // 0 px breit und `capturePreviewCanvas` liefert nichts).
  useEffect(() => {
    const registry = getExportRegistry();
    registry.renderPreviewOffscreen = (cssWidth = 640) => {
      const canvas = document.createElement('canvas');
      draw({ canvas, cssW: cssWidth });
      return canvas.width > 0 && canvas.height > 0 ? canvas : null;
    };
    return () => { registry.renderPreviewOffscreen = null; };
  }, [draw]);

  // ── PTZ Mouse Controls ──
  const dragStart = useRef({ x: 0, y: 0 });
  // ─── ZEIGER STATT MAUS (#137) ───────────────────────────────────────
  //
  // Vorher hingen Schwenk und Neigung an `onMouseDown/Move/Up`. Ein Browser
  // auf dem Telefon bildet `mousemove` waehrend einer Beruehrung NICHT nach
  // — er schickt eines nach dem Loslassen. Der Zug am Bild tat dort also
  // nichts, und das Kneifen gibt es als Maus-Ereignis ueberhaupt nicht.
  //
  // Dieselben Handler bedienen jetzt beides. Fuer die Maus aendert sich
  // nichts: ein `pointerdown` mit `pointerType: 'mouse'` traegt dieselben
  // Koordinaten wie das `mousedown` davor.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      finger.current.runter({ id: e.pointerId, x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).style.cursor = focusPickMode ? 'crosshair' : 'grabbing';
  }, [focusPickMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      const zug = finger.current.bewegt({ id: e.pointerId, x: e.clientX, y: e.clientY });
      if (finger.current.anzahl >= 2) {
        // Kneifen zoomt — als FAKTOR, nicht als Millimeter-Summe: 40 mm sind
        // am Weitwinkel eine andere Welt als am 600er. Der Bezugswert ist
        // der Fingerabstand, damit dieselbe Geste am Telefon und am Tablet
        // dasselbe tut.
        if (cam) {
          const f = kneifFaktor(zug.abstandVorher, zug.fahre);
          const ziel = Math.max(1, Math.min(2000, cam.focalLength * f));
          useStore.getState().updateCamera(cam.id, { focalLength: ziel });
        }
        return;
      }
    }
    if (!isDragging.current || !cam) return;
    // In focus-pick mode the press is a click target — don't pan/tilt
    if (focusPickMode) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    // FOV-scaled sensitivity so the scene moves 1:1 with the mouse: 1 px of
    // cursor motion rotates the camera by the angle one pixel on the canvas
    // spans. Per-camera invert flags reverse the direction without touching
    // sensitivity. Pan & tilt wrap into [-180, 180) so the camera can spin
    // through ±180° instead of hitting a hard clamp.
    const canvas = canvasRef.current;
    const camDef = getCameraById(cam.cameraId, useStore.getState().customCameras);
    const lensDef = getLensById(cam.lensId, useStore.getState().customLenses);
    let panSens = 0.3;
    let tiltSens = 0.2;
    if (canvas && camDef && lensDef) {
      const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
      const fov = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef?.squeeze ?? 1);
      const cssW = canvas.clientWidth || canvas.width;
      const cssH = canvas.clientHeight || canvas.height;
      if (cssW > 0) panSens = fov.horizontalDeg / cssW;
      if (cssH > 0) tiltSens = fov.verticalDeg / cssH;
    }
    const invH = cam.invertPreviewH ? -1 : 1;
    const invV = cam.invertPreviewV ? -1 : 1;
    const wrap180 = (v: number) => {
      let w = ((v + 180) % 360 + 360) % 360 - 180;
      if (w === 180) w = -180;
      return w;
    };
    const newPan = wrap180(cam.pan - dx * panSens * invH);
    const newTilt = Math.max(-90, Math.min(45, cam.tilt + dy * tiltSens * invV));
    useStore.getState().updateCamera(cam.id, { pan: newPan, tilt: newTilt });
  }, [cam, focusPickMode]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      finger.current.hoch(e.pointerId);
    }
    const wasDragging = isDragging.current;
    isDragging.current = false;
    (e.target as HTMLElement).style.cursor = focusPickMode ? 'crosshair' : 'grab';

    if (!wasDragging || !cam) return;
    const movedPx = Math.hypot(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y);
    if (!focusPickMode || movedPx > 4) return;

    // ── Click-to-focus: hit-test against projected persons ──
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    let best: { id: string; dist: number; pickDist: number } | null = null;
    for (const p of projectedPersons.current) {
      // Treat each person as a vertical bar of ~half its height in width
      const personPxH = Math.abs(p.topSy - p.sy);
      const halfW = Math.max(8, personPxH * 0.25);
      const top = Math.min(p.topSy, p.sy);
      const bottom = Math.max(p.topSy, p.sy);
      // Allow generous vertical slop so labels/heads are easy to grab
      const inX = cx >= p.sx - halfW && cx <= p.sx + halfW;
      const inY = cy >= top - 8 && cy <= bottom + 12;
      if (!inX || !inY) continue;
      const cxDist = Math.abs(cx - p.sx);
      if (!best || cxDist < best.pickDist) {
        best = { id: p.id, dist: p.dist, pickDist: cxDist };
      }
    }
    if (best) {
      useStore.getState().updateCamera(cam.id, { focusDistance: Math.max(0.1, best.dist) });
    }
  }, [cam, focusPickMode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!cam) return;
    e.preventDefault();
    const ld = getLensById(cam.lensId, useStore.getState().customLenses);
    if (!ld) return;
    const range = ld.focalLengthMax - ld.focalLengthMin;
    const step = Math.max(0.1, range * 0.02);
    const newFL = Math.max(ld.focalLengthMin, Math.min(ld.focalLengthMax, cam.focalLength + (e.deltaY > 0 ? step : -step)));
    useStore.getState().updateCamera(cam.id, { focalLength: newFL });
  }, [cam]);

  if (!cam) {
    return (
      <div className="flex items-center justify-center h-full text-bc-dim">
        <p>{t('preview.emptyState', 'Select a camera to see its preview')}</p>
      </div>
    );
  }

  // Computed data for readout (outside canvas)
  const camDef = getCameraById(cam.cameraId, useStore.getState().customCameras);
  const lensDef = getLensById(cam.lensId, useStore.getState().customLenses);
  const sensor = camDef && lensDef ? getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount) : undefined;
  const adapterInfo = camDef && lensDef ? getAdapterInfo(camDef, lensDef, cam.useSpeedbooster, cam.activeMount) : null;
  const fov = sensor ? computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef?.squeeze ?? 1) : null;
  const dof = sensor ? computeDof(sensor, cam.focalLength, cam.aperture, cam.focusDistance, cam.extenderActive) : null;
  const lightLoss = adapterInfo ? (adapterInfo.lightLossStops > 0 ? ` (−${adapterInfo.lightLossStops}T)` : adapterInfo.lightLossStops < 0 ? ` (+${Math.abs(adapterInfo.lightLossStops)}T)` : '') : '';

  const camIdx = cameras.findIndex((c) => c.id === cam.id);

  // Upper bound for the focus-distance slider — roughly the venue diagonal.
  const focusMax = Math.max(20, Math.ceil(Math.hypot(venue.widthM, venue.heightM)));

  // Effektive Regler-Grenzen: normal die echten Objektiv-Werte, im Manual-Modus
  // die frei gesetzten. Daraus die Rastmarken der jeweiligen Bahn.
  const zoomMin = manualZoom ? manualMin : (lensDef?.focalLengthMin ?? 4);
  const zoomMax = manualZoom ? manualMax : (lensDef?.focalLengthMax ?? 300);
  const apMin = manualAperture ? manualApMin : (lensDef?.maxApertureWide ?? 1.4);
  const apMax = manualAperture ? manualApMax : 22;
  // Bewusst ohne useMemo: das sind ein paar Array-Operationen auf hoechstens
  // 14 Elementen — billiger als die Memoisierung selbst.
  const zoomTicks = niceTicks(zoomMin, zoomMax);
  const focusTicks = niceTicks(FOCUS_MIN, focusMax);
  // Blende rastet auf die Normreihe; die Bahn-Enden kommen dazu, damit die
  // Skala auch bei krummen Objektiv-Grenzen (f/1.7) beschriftet ist.
  const apertureTicks = [
    ...new Set([apMin, ...stopsInRange(apMin, apMax), apMax].map((v) => Number(v.toFixed(2)))),
  ].sort((a, b) => a - b);

  const addPreset = () => {
    const name = window.prompt(t('preview.presetNamePrompt', 'Preset name:'), `${cam.focalLength.toFixed(0)}mm f/${cam.aperture.toFixed(1)}`);
    if (!name) return;
    persistPresets([...presets, {
      // Ein Preset gehoert zu genau einer Kamera — sonst faehrt es beim
      // naechsten Klick irgendeine andere an ihre Position.
      id: Date.now().toString(36), name: name.trim(), cameraId: cam.id,
      focalLength: cam.focalLength, aperture: cam.aperture, focusDistance: cam.focusDistance,
      pan: cam.pan, tilt: cam.tilt, z: cam.z, trackOffset: cam.trackOffset, x: cam.x, y: cam.y,
    }]);
  };
  // Fahrt von der aktuellen Pose (A) zum Ziel-Patch (B) ueber `seconds` mit
  // Ease-in/out. Jeder numerische Parameter wird einzeln interpoliert. `seconds`
  // <= 0 springt hart. Eine laufende Fahrt wird vorher abgebrochen (#62 Punkt 4).
  const runTransition = (camId: string, target: Partial<VenueCamera>, seconds: number) => {
    transitionCancel.current?.();
    const start = useStore.getState().cameras.find((c) => c.id === camId);
    if (!start) { useStore.getState().updateCamera(camId, target); return; }
    transitionCancel.current = runCameraTransition({
      from: start,
      to: target,
      seconds,
      // Presets fahren im Stil der Montage — dieselbe Engine wie die Shotlist.
      profile: profileForMount(start.mountType),
      apply: (patch) => useStore.getState().updateCamera(camId, patch),
      onDone: () => { transitionCancel.current = null; },
    });
  };
  const applyPreset = (p: PreviewPreset) => {
    // Optische Werte immer, raeumliche nur wenn im Preset vorhanden (Abwaerts-
    // kompatibilitaet zu aelteren, rein optischen Presets).
    const target: Partial<VenueCamera> = { focalLength: p.focalLength, aperture: p.aperture, focusDistance: p.focusDistance, lockedPersonId: undefined };
    if (p.pan !== undefined) target.pan = p.pan;
    if (p.tilt !== undefined) target.tilt = p.tilt;
    if (p.z !== undefined) target.z = p.z;
    if (p.trackOffset !== undefined) target.trackOffset = p.trackOffset;
    if (p.x !== undefined) target.x = p.x;
    if (p.y !== undefined) target.y = p.y;
    // A preset can hold a focal length outside the lens's native range, so make
    // sure the slider can represent it (vor der Fahrt setzen).
    if (lensDef && (p.focalLength < lensDef.focalLengthMin || p.focalLength > lensDef.focalLengthMax)) {
      setManualZoom(true);
      setManualMin((m) => Math.min(m, Math.floor(p.focalLength)));
      setManualMax((m) => Math.max(m, Math.ceil(p.focalLength)));
    }
    // Focus-Lock sofort loesen, damit die Fahrt nicht dagegen arbeitet.
    useStore.getState().updateCamera(cam.id, { lockedPersonId: undefined });
    const secs = transitionMode === 'off' ? 0
      : transitionMode === 'manual' ? Math.max(0, transitionSeconds)
      : TRANSITION_PRESET_SECONDS[transitionMode];
    runTransition(cam.id, target, secs);
  };
  const deletePreset = (id: string) => persistPresets(presets.filter((p) => p.id !== id));
  /** Altbestand/verwaiste Presets dieser Kamera zuschlagen. */
  const takeOverPreset = (id: string) => persistPresets(assignPreset(presets, id, cam.id));

  // Sichtbar sind nur die Presets DIESER Kamera plus die ohne Zuordnung;
  // Presets anderer, noch existierender Kameras bleiben aussen vor.
  const presetGroups = groupPresets(presets, cam.id, cameras.map((c) => c.id));

  return (
    // ─── DAS BILD ZUERST (#137) ──────────────────────────────────────────
    //
    // NUTZER-MELDUNG: „In preview mode ueberlagert der Text das Bild. Das
    // Bild ist das wichtigste. Bedienelemente muessen dann darunter und
    // intuitiver zu bedienen sein."
    //
    // Der Datenblock stand als feste 224-px-Spalte NEBEN dem Bild. Auf einem
    // Telefon mit 390 px blieben dem Bild 150 px — die Kamera-Vorschau war
    // schmaler als die Zahlen daneben. Auf schmalen Fenstern liegt der Block
    // jetzt DARUNTER, zweispaltig, und der Scrollbereich wandert nach aussen:
    // Bild, Bedienung, Zahlen, in dieser Reihenfolge.
    <div className={`relative w-full h-full flex gap-2 ${schmal ? 'flex-col overflow-y-auto' : 'overflow-hidden'}`}>
      {/* Left: Canvas + controls */}
      <div className={`flex-1 flex flex-col gap-2 min-w-0 ${schmal ? '' : 'overflow-y-auto'}`}>
        {/* Camera switcher bar */}
        <div className="flex items-center gap-2 px-2">
          <button onClick={selectPrevCamera} className="p-1 hover:bg-bc-border text-bc-muted hover:text-bc-text-bright" title={t('preview.prevCamera', 'Previous camera')}><FiChevronLeft size={16} /></button>
          <span className="text-bc-text-bright font-bold text-sm flex-1 text-center">{cam.label}</span>
          <button onClick={selectNextCamera} className="p-1 hover:bg-bc-border text-bc-muted hover:text-bc-text-bright" title={t('preview.nextCamera', 'Next camera')}><FiChevronRight size={16} /></button>
          <span className="text-bc-dim text-[10px]">{camIdx + 1}/{cameras.length}</span>
        </div>

        {/* Canvas container */}
        <div ref={wrapRef} className="relative w-full">
          <canvas
            ref={canvasRef}
            data-preview-canvas
            className="w-full"
            // `touchAction: none`: sonst scrollt die Seite unter dem Bild
            // weg, statt die Kamera zu schwenken (#137).
            style={{ cursor: focusPickMode ? 'crosshair' : 'grab', display: 'block', touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
          />
        </div>

        {/* Overlay toggle bar */}
        <div className="flex items-center gap-2 px-2 flex-wrap">
          <LookToggle value={look} onChange={setLook} laedt={!bereit3D()} />
          {([
            // Das Bodenraster gehoert zur Zeichnung; im gerenderten Bild liegt der echte Boden.
            ...(look === 'simple' ? [[t('preview.overlay.grid', 'Grid'), showGrid, setShowGrid]] : []),
            [t('preview.overlay.safeAreas', 'Safe areas'), showSafeAreas, setShowSafeAreas],
            [t('preview.overlay.thirds', 'Thirds'), showThirds, setShowThirds],
            [t('preview.overlay.crosshair', 'Crosshair'), showCrosshair, setShowCrosshair],
            [t('preview.overlay.data', 'Data'), showData, setShowData],
          ] as [string, boolean, (v: boolean) => void][]).map(([label, on, set]) => (
            <button
              key={label}
              onClick={() => set(!on)}
              className={`px-2 py-0.5 text-[10px] font-medium border transition-colors ${on ? 'border-bc-accent text-bc-accent bg-bc-accent/10' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => useStore.getState().updateCamera(cam.id, { invertPreviewH: !cam.invertPreviewH })}
            title={t('preview.flipH', 'Flip horizontal pan direction')}
            className={`px-2 py-0.5 text-[10px] font-medium border transition-colors ${cam.invertPreviewH ? 'border-bc-accent text-bc-accent bg-bc-accent/10' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
          >
            ↔ {t('preview.invertH', 'Invert H')}
          </button>
          <button
            onClick={() => useStore.getState().updateCamera(cam.id, { invertPreviewV: !cam.invertPreviewV })}
            title={t('preview.flipV', 'Flip vertical tilt direction')}
            className={`px-2 py-0.5 text-[10px] font-medium border transition-colors ${cam.invertPreviewV ? 'border-bc-accent text-bc-accent bg-bc-accent/10' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
          >
            ↕ {t('preview.invertV', 'Invert V')}
          </button>
          <button
            onClick={() => setFocusPickMode((v) => !v)}
            title={focusPickMode ? t('preview.focusPickLeave', 'Click anywhere to leave focus-pick mode') : t('preview.focusPickEnter', 'Pick a person in the preview to set focus distance')}
            className={`px-2 py-0.5 text-[10px] font-medium border transition-colors ${focusPickMode ? 'border-bc-yellow text-bc-yellow bg-bc-yellow/10' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
          >
            ◎ {t('preview.focusPick', 'Focus pick')} {focusPickMode ? '· ' + t('preview.on', 'ON') : ''}
          </button>
          {cam.lockedPersonId && (
            <button
              onClick={() => useStore.getState().updateCamera(cam.id, { lockedPersonId: undefined })}
              title={t('preview.releaseLock', 'Release focus lock')}
              className="px-2 py-0.5 text-[10px] font-medium border border-bc-yellow text-bc-yellow bg-bc-yellow/10 flex items-center gap-1"
            >
              <FiLock size={10} /> {t('preview.unlock', 'Unlock')} {persons.find((p) => p.id === cam.lockedPersonId)?.label ?? t('preview.subject', 'subject')}
            </button>
          )}
          {!cam.lockedPersonId && projectedCount > 0 && (
            <button
              onClick={() => {
                // Lock to the projected person nearest the crosshair (centre).
                const W = canvasRef.current?.clientWidth ?? 0;
                const H = canvasRef.current?.clientHeight ?? 0;
                let best: { id: string; d: number } | null = null;
                for (const p of projectedPersons.current) {
                  const d = Math.hypot(p.sx - W / 2, p.sy - H / 2);
                  if (!best || d < best.d) best = { id: p.id, d };
                }
                if (best) useStore.getState().updateCamera(cam.id, { lockedPersonId: best.id });
              }}
              title={t('preview.lockSubjectTitle', 'Lock focus distance to the subject closest to the crosshair')}
              className="px-2 py-0.5 text-[10px] font-medium border border-bc-border text-bc-dim hover:text-bc-text flex items-center gap-1"
            >
              <FiUnlock size={10} /> {t('preview.lockSubject', 'Lock subject')}
            </button>
          )}
          <span className="text-[10px] text-bc-faint ml-auto">
            {focusPickMode ? t('preview.hintFocusPick', 'Click a person to set focus distance') : t('preview.hintDrag', 'Drag: Pan/Tilt · Scroll: Zoom')}
          </span>
        </div>

        {/* Zoom / Blende / Fokus — logarithmische Bahn + Rastung, siehe LensSlider.
            Manual-Modus (#47/#62) weitet die Grenzen ueber die echte Optik hinaus. */}
        <LensSlider
          label={t('preview.zoom', 'Zoom')}
          value={cam.focalLength}
          min={zoomMin}
          max={zoomMax}
          ticks={zoomTicks}
          format={formatFocal}
          unit="mm"
          onChange={(v) => useStore.getState().updateCamera(cam.id, { focalLength: v })}
          onStep={(dir) => useStore.getState().updateCamera(cam.id, { focalLength: stepAlong(cam.focalLength, dir, zoomMin, zoomMax, zoomTicks) })}
          title={t('preview.focal.title', 'Focal length — logarithmic, snaps to the marks. Shift = free, wheel = one step.')}
          headerRight={
            <>
              {manualZoom && (
                <>
                  <input
                    type="number" min={1} max={manualMax - 1} value={manualMin}
                    onChange={(e) => setManualMin(Math.max(1, Math.min(manualMax - 1, parseFloat(e.target.value) || 1)))}
                    className="w-12 border border-bc-border bg-bc-panel-raised px-1 text-[11px] text-bc-text font-mono"
                    title={t('preview.manualMin', 'Manual minimum focal length (mm)')}
                  />
                  <input
                    type="number" min={manualMin + 1} max={2000} value={manualMax}
                    onChange={(e) => setManualMax(Math.max(manualMin + 1, Math.min(2000, parseFloat(e.target.value) || 500)))}
                    className="w-12 border border-bc-border bg-bc-panel-raised px-1 text-[11px] text-bc-text font-mono"
                    title={t('preview.manualMax', 'Manual maximum focal length (mm)')}
                  />
                </>
              )}
              <button
                onClick={() => setManualZoom((on) => {
                  const next = !on;
                  if (!next && lensDef) {
                    const clamped = Math.min(lensDef.focalLengthMax, Math.max(lensDef.focalLengthMin, cam.focalLength));
                    if (clamped !== cam.focalLength) useStore.getState().updateCamera(cam.id, { focalLength: clamped });
                  }
                  return next;
                })}
                title={t('preview.manualTitle', "Temporarily scrub focal length beyond the lens's real range")}
                className={`px-1.5 py-0.5 text-[11px] font-medium border transition-colors ${manualZoom ? 'border-bc-yellow text-bc-yellow bg-bc-yellow/10' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
              >
                {t('preview.manual', 'Manual')}
              </button>
            </>
          }
        />

        <LensSlider
          label={t('preview.aperture', 'Aperture')}
          value={cam.aperture}
          min={apMin}
          max={apMax}
          ticks={apertureTicks}
          format={formatAperture}
          prefix="f/"
          formatTick={(v) => (v < 10 ? v.toFixed(1) : v.toFixed(0))}
          onChange={(v) => useStore.getState().updateCamera(cam.id, { aperture: v })}
          onStep={(dir) => useStore.getState().updateCamera(cam.id, { aperture: stepStop(cam.aperture, dir, apMin, apMax) })}
          title={t('preview.aperture.title', 'Aperture — standard series in full stops (√2). Shift = stepless, wheel = one stop.')}
          headerRight={
            <>
              {manualAperture && (
                <>
                  <input
                    type="number" min={0.1} max={manualApMax - 0.1} step={0.1} value={manualApMin}
                    onChange={(e) => setManualApMin(Math.max(0.1, Math.min(manualApMax - 0.1, parseFloat(e.target.value) || 0.1)))}
                    className="w-12 border border-bc-border bg-bc-panel-raised px-1 text-[11px] text-bc-text font-mono"
                    title={t('preview.apertureManualMin', 'Manual minimum (aperture)')}
                  />
                  <input
                    type="number" min={manualApMin + 0.1} max={64} step={0.1} value={manualApMax}
                    onChange={(e) => setManualApMax(Math.max(manualApMin + 0.1, Math.min(64, parseFloat(e.target.value) || 32)))}
                    className="w-12 border border-bc-border bg-bc-panel-raised px-1 text-[11px] text-bc-text font-mono"
                    title={t('preview.apertureManualMax', 'Manual maximum (aperture)')}
                  />
                </>
              )}
              <button
                onClick={() => setManualAperture((on) => {
                  const next = !on;
                  if (!next) {
                    const wide = lensDef?.maxApertureWide ?? 1.4;
                    const clamped = Math.min(22, Math.max(wide, cam.aperture));
                    if (clamped !== cam.aperture) useStore.getState().updateCamera(cam.id, { aperture: clamped });
                  }
                  return next;
                })}
                title={t('preview.aperture.beyond', 'Run the aperture beyond the real lens limits')}
                className={`px-1.5 py-0.5 text-[11px] font-medium border transition-colors ${manualAperture ? 'border-bc-yellow text-bc-yellow bg-bc-yellow/10' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
              >
                {t('preview.manual', 'Manual')}
              </button>
            </>
          }
        />

        <LensSlider
          label={t('preview.focus', 'Focus')}
          value={Math.min(cam.focusDistance, focusMax)}
          min={FOCUS_MIN}
          max={focusMax}
          ticks={focusTicks}
          format={formatDistance}
          unit="m"
          onChange={(v) => useStore.getState().updateCamera(cam.id, { focusDistance: Math.max(0.1, v), lockedPersonId: undefined })}
          onStep={(dir) => useStore.getState().updateCamera(cam.id, { focusDistance: stepAlong(cam.focusDistance, dir, FOCUS_MIN, focusMax, focusTicks), lockedPersonId: undefined })}
          note={cam.lockedPersonId ? t('preview.locked', 'locked') : undefined}
          title={t('preview.focus.title', 'Focus distance — fine up close, coarse far away (logarithmic). Click the number to type it.')}
        />


        {/* Presets (#47) — pro Kamera. Die Liste zeigt nur die Presets der
            aktiven Kamera; Presets anderer Kameras wuerden sonst diese hierher
            fahren. */}
        <div className="px-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-bc-dim" title={`Presets von ${cam.label}`}>
            {t('preview.presets', 'Presets')} · {cam.label}
          </span>
          {presetGroups.own.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] border border-bc-border text-bc-text hover:border-bc-accent">
              <button onClick={() => applyPreset(p)} title={`${p.focalLength.toFixed(0)}mm · f/${p.aperture.toFixed(1)} · ${p.focusDistance.toFixed(1)}m${p.pan !== undefined ? ` · Pos (Pan ${p.pan.toFixed(0)}° Tilt ${p.tilt?.toFixed(0)}° H ${p.z?.toFixed(1)}m)` : ''}`}>{p.name}{hasPose(p) && <span className="ml-0.5 text-bc-accent" title={t('preview.preset.hasPose', 'contains camera position')}>◈</span>}</button>
              <button onClick={() => deletePreset(p.id)} className="text-bc-faint hover:text-bc-red" title={t('preview.deletePreset', 'Delete preset')} aria-label={`Preset ${p.name} löschen`}><FiX size={10} /></button>
            </span>
          ))}
          {presetGroups.own.length === 0 && (
            <span className="text-[10px] text-bc-faint">{t('preview.preset.none', 'none yet')}</span>
          )}
          <button onClick={addPreset} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] border border-bc-border text-bc-dim hover:text-bc-accent hover:border-bc-accent" title={`${t('preview.savePreset', 'Save current focal length / aperture / focus as a preset')} · ${cam.label}`}>
            <FiPlus size={10} /> {t('preview.add', 'Add')}
          </button>

          {/* Shot aufnehmen (#62 Punkt 5): friert die aktuelle Ansicht inkl.
              Framegrab als Shot in der aktiven Shotlist ein. */}
          <button
            onClick={() => {
              const res = captureCurrentShot();
              setShotHint(
                !res.ok
                  ? (res.reason ?? 'Aufnehmen fehlgeschlagen.')
                  : res.hadThumbnail
                    ? 'Shot aufgenommen.'
                    : 'Shot gespeichert — ohne Bild.',
              );
              window.setTimeout(() => setShotHint(null), 2500);
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] border border-bc-accent/60 text-bc-accent bg-bc-accent/10 hover:bg-bc-accent/20"
            title={t('preview.addShot', 'Add the current view to the shotlist as a shot')}
          >
            <FiCamera size={10} /> {t('preview.captureShot', 'Capture shot')}
          </button>
          {shotHint && <span className="text-[10px] text-bc-yellow">{shotHint}</span>}
        </div>

        {/* Presets ohne Zuordnung: aus der Zeit vor der Kamera-Bindung oder von
            einer geloeschten/ausgetauschten Kamera. Sie bleiben anwendbar und
            lassen sich dieser Kamera zuschlagen — stilles Loeschen waere
            Datenverlust. */}
        {presetGroups.unassigned.length > 0 && (
          <div className="px-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-bc-faint" title={t('preview.preset.unassigned.title', 'Presets with no camera assigned')}>
              {t('preview.preset.unassigned', 'unassigned')}
            </span>
            {presetGroups.unassigned.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] border border-dashed border-bc-border text-bc-dim hover:border-bc-accent">
                <button onClick={() => applyPreset(p)} title={`Auf ${cam.label} anwenden — ${p.focalLength.toFixed(0)}mm · f/${p.aperture.toFixed(1)}`}>{p.name}{hasPose(p) && <span className="ml-0.5 text-bc-accent">◈</span>}</button>
                <button
                  onClick={() => takeOverPreset(p.id)}
                  className="text-bc-faint hover:text-bc-accent"
                  title={`${cam.label} zuordnen`}
                  aria-label={`Preset ${p.name} der Kamera ${cam.label} zuordnen`}
                >
                  <FiPlus size={10} />
                </button>
                <button onClick={() => deletePreset(p.id)} className="text-bc-faint hover:text-bc-red" title={t('preview.deletePreset', 'Delete preset')} aria-label={`Preset ${p.name} löschen`}><FiX size={10} /></button>
              </span>
            ))}
          </div>
        )}

        {/* Transition-Time (#62 Punkt 4): steuert, wie ein Preset angefahren wird. */}
        <div className="px-2 flex items-center gap-2">
          <span className="text-[10px] text-bc-dim">{t('preview.transitionTime', 'Transition time')}</span>
          <button
            onClick={() => {
              const next = TRANSITION_CYCLE[(TRANSITION_CYCLE.indexOf(transitionMode) + 1) % TRANSITION_CYCLE.length];
              setTransitionMode(next);
              saveJSON(PREVIEW_TRANSITION_MODE_KEY, next);
            }}
            title={t('preview.transitionToggle', 'Toggle: OFF (jumps) / Fast 3 s / Slow 10 s / Manual')}
            className={`px-2 py-0.5 text-[10px] font-medium border transition-colors ${transitionMode === 'off' ? 'border-bc-border text-bc-dim hover:text-bc-text' : 'border-bc-accent text-bc-accent bg-bc-accent/10'}`}
          >
            {TRANSITION_LABEL[transitionMode]}
          </button>
          <input
            type="number" min={0} max={120} step={0.5}
            value={transitionMode === 'manual' ? transitionSeconds : (transitionMode === 'off' ? 0 : TRANSITION_PRESET_SECONDS[transitionMode])}
            onChange={(e) => {
              // Zeit editieren schaltet auf Manuell und uebernimmt den Wert.
              const v = Math.max(0, Math.min(120, parseFloat(e.target.value) || 0));
              setTransitionMode('manual');
              setTransitionSeconds(v);
              saveJSON(PREVIEW_TRANSITION_MODE_KEY, 'manual');
              saveJSON(PREVIEW_TRANSITION_SEC_KEY, v);
            }}
            className="w-14 border border-bc-border bg-bc-panel-raised px-1 py-0.5 text-[10px] text-bc-text font-mono"
            title={t('preview.transitionSeconds', 'Transition time in seconds (editing switches to Manual)')}
          />
          <span className="text-[10px] text-bc-faint">s</span>
        </div>

        {/* ── Rig-Steuerung ──
            Nutzer-Meldung 2026-09-09: „Die ‚Rig' Einstellungen im Multicam
            planner muessen unter das Preview. Nicht in extra Tab."

            Sie stand als eigener Reiter neben dem Preview — und damit war
            beides nie gleichzeitig zu sehen. Genau das braucht man aber: das
            Pult faehrt die Kamera, das Preview zeigt, was dabei herauskommt.
            Wer den Reiter wechselt, um zu fahren, sieht das Ergebnis erst,
            wenn er zurueckwechselt.

            Sie liegt UNTER dem Bild und im selben Scrollbereich: fuer den
            Blick auf beides zaehlt die Naehe, und der Platz reicht auch auf
            einem schmalen Fenster, weil der Bereich ohnehin scrollt. */}
        <RigControlPanel />
      </div>

      {/* Right: Data readout panel */}
      {camDef && lensDef && fov && dof && showData && (
        <div className={schmal
          ? 'w-full grid grid-cols-2 gap-1.5 px-2 pb-2'
          : 'w-56 shrink-0 overflow-y-auto space-y-1.5 pr-1'}>
          {/* Camera + Lens header */}
          <div className={`bg-bc-dark border border-bc-border p-2 ${schmal ? 'col-span-2' : ''}`}>
            <span className="text-bc-text-bright font-semibold text-xs">{cam.label}</span>
            <div className="text-bc-dim text-[10px]">{camDef.sensor.name} · {camDef.mount}</div>
            <div className="text-bc-muted text-[10px] mt-0.5">{camDef.manufacturer} {camDef.model}</div>
            <div className="text-bc-muted text-[10px]">{lensDef.manufacturer} {lensDef.model}</div>
            {adapterInfo && (
              <div className="text-yellow-400 text-[10px] mt-0.5">⚡ {adapterInfo.name}{lightLoss}</div>
            )}
          </div>

          {/* Notes — only when filled */}
          {cam.notes && cam.notes.trim() && (
            <div className={`bg-bc-dark border border-bc-border p-2 ${schmal ? 'col-span-2' : ''}`}>
              <div className="text-[10px] text-bc-dim leading-tight mb-0.5">{t('preview.notes', 'Notes')}</div>
              <div className="text-[11px] text-bc-text whitespace-pre-wrap leading-snug">{cam.notes}</div>
            </div>
          )}

          {/* Data cells */}
          <DataCell label={t('preview.data.focalLength', 'Focal length')} value={`${cam.focalLength.toFixed(1)}mm`} sub={cam.extenderActive > 1 ? `eff. ${(cam.focalLength * cam.extenderActive).toFixed(0)}mm` : `eq. ${fov.equivalentFocalLength.toFixed(0)}mm`} />
          <DataCell label={t('preview.data.aperture', 'Aperture')} value={`f/${cam.aperture.toFixed(1)}`} sub={adapterInfo && adapterInfo.lightLossStops !== 0 ? `eff. T${(cam.aperture * Math.pow(2, adapterInfo.lightLossStops / 2)).toFixed(1)}` : undefined} />
          <DataCell label={t('preview.data.distance', 'Distance')} value={`${cam.focusDistance.toFixed(1)}m`} />
          <DataCell label={t('preview.data.fovH', 'FOV H')} value={`${fov.horizontalDeg.toFixed(1)}°`} />
          <DataCell label={t('preview.data.fovV', 'FOV V')} value={`${fov.verticalDeg.toFixed(1)}°`} />
          <DataCell label={t('preview.data.imageWidth', 'Image width')} value={`${fov.imageWidthAtDistance.toFixed(1)}m`} sub={`@ ${cam.focusDistance.toFixed(0)}m`} />
          <DataCell label={t('preview.data.imageHeight', 'Image height')} value={`${fov.imageHeightAtDistance.toFixed(1)}m`} sub={`@ ${cam.focusDistance.toFixed(0)}m`} />
          <DataCell label={t('preview.data.dofNear', 'DoF Near')} value={dof.nearLimit < 0.01 ? '0m' : `${dof.nearLimit.toFixed(2)}m`} />
          <DataCell label={t('preview.data.dofFar', 'DoF Far')} value={dof.farLimit === Infinity ? '∞' : `${dof.farLimit.toFixed(2)}m`} />
          <DataCell label={t('preview.data.dofTotal', 'DoF Total')} value={dof.totalDof === Infinity ? '∞' : `${dof.totalDof.toFixed(2)}m`} />
        </div>
      )}
    </div>
  );
}

function DataCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-bc-border bg-bc-panel-raised px-2 py-1.5">
      <div className="text-[10px] text-bc-dim leading-tight">{label}</div>
      <div className="text-bc-text-bright text-sm font-mono font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-bc-dim leading-tight">{sub}</div>}
    </div>
  );
}
