import { FingerNavigation, kneifFaktor } from '../../lib/fingerNavigation';
import { useSchmal } from '../../lib/useSchmal';
import { useStore } from '../../store/useStore';
import { getCameraById, getEffectiveSensor, getAdapterInfo } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov, computeDof } from '../../utils/fov';
import { effectiveCameraPos } from '../../utils/camera';
import { getExportRegistry } from '../../store/exportRegistry';
import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import type { ShotTransition, Stage, StageObjectType, VenueCamera, Wall } from '../../types';
import type { StageFace } from '../../utils/stageBody';
import { groundHeightAt, stageColor, stageFaces, stageLabelAnchor, stageOpacity } from '../../utils/stageBody';
import { alphaSuffix, shadeHex } from '../../utils/color';
import { FiChevronLeft, FiChevronRight, FiUnlock, FiLock, FiPlus, FiX, FiCamera } from 'react-icons/fi';
import { loadJSON, saveJSON } from '../../utils/storage';
import { useTranslation, format } from '../../i18n';
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
import {
  DEFAULT_PATTERN_ROWS,
  paintWallSurface,
  stripCount,
  stripRanges,
  stripTransform,
  surfaceKey,
  textureSize,
} from '../../utils/wallSurface';
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
  // Decoded wall pattern images, keyed by data URL (issue #45). A tick forces a
  // repaint once an image finishes loading asynchronously.
  const wallImageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageTick, setImageTick] = useState(0);
  const getWallImage = useCallback((dataUrl: string): HTMLImageElement | null => {
    const cache = wallImageCache.current;
    const existing = cache.get(dataUrl);
    if (existing) return existing.complete && existing.naturalWidth > 0 ? existing : null;
    const img = new Image();
    img.onload = () => setImageTick((t) => t + 1);
    img.src = dataUrl;
    cache.set(dataUrl, img);
    return null;
  }, []);
  // Fertig gemalte Wandflaechen (#74). Ohne Cache wuerde jede Wand in jedem
  // Bild neu gemalt; so passiert das nur, wenn sich Muster, Anzahl, Farbe,
  // Bild oder die Wandmaße aendern.
  const wallTextureCache = useRef<Map<string, { key: string; canvas: HTMLCanvasElement }>>(new Map());
  const getWallTexture = useCallback(
    (wall: Wall, lengthM: number, loadImage: (src: string) => HTMLImageElement | null): HTMLCanvasElement | null => {
      const pattern = wall.pattern ?? 'solid';
      if (pattern === 'solid') return null;
      const img = pattern === 'image' && wall.patternImage ? loadImage(wall.patternImage) : null;
      if (pattern === 'image' && !img) return null;
      const key = surfaceKey(wall, lengthM);
      const cached = wallTextureCache.current.get(wall.id);
      if (cached && cached.key === key) return cached.canvas;

      const { w, h } = textureSize(lengthM, wall.height);
      const canvas = cached?.canvas ?? document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const tctx = canvas.getContext('2d');
      if (!tctx) return null;
      paintWallSurface(tctx, w, h, {
        pattern,
        fit: wall.patternFit ?? 'tile',
        rows: wall.patternRows ?? DEFAULT_PATTERN_ROWS,
        color: wall.color ?? '#6b7280',
        image: img ?? undefined,
        lengthM,
        heightM: wall.height,
      });
      wallTextureCache.current.set(wall.id, { key, canvas });
      return canvas;
    },
    [],
  );

  // Cache projected person positions during draw() so the click handler can hit-test
  // without re-projecting everything itself.
  const projectedPersons = useRef<{ id: string; sx: number; sy: number; topSy: number; dist: number }[]>([]);
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
    const bare = target?.bare ?? false;
    if (!canvas || !cam) return;
    if (!target && !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const camDef = getCameraById(cam.cameraId, useStore.getState().customCameras);
    const lensDef = getLensById(cam.lensId, useStore.getState().customLenses);
    if (!camDef || !lensDef) return;

    const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);

    // HiDPI: size canvas to container at device pixel ratio.
    // Offscreen (target) rendern wir bei dpr 1 in fester Breite — das Thumbnail
    // wird ohnehin auf 320 px verkleinert.
    const dpr = target ? (target.dpr ?? 1) : (window.devicePixelRatio || 1);
    const cssW = target ? target.cssW : wrap!.getBoundingClientRect().width;
    if (!(cssW > 0)) return; // versteckter Tab: nichts zu zeichnen
    const cssH = Math.round(cssW * 9 / 16);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.scale(dpr, dpr);

    // Logical size
    const W = cssW;
    const H = cssH;

    const fov = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef?.squeeze ?? 1);

    const imgW = fov.imageWidthAtDistance;
    const imgH = fov.imageHeightAtDistance;

    // ── Pan/Tilt offsets ──
    // For a level camera the horizon sits at H/2 regardless of camera height — cam.z only
    // affects where individual objects project (handled in worldToScreen below).
    // Positive tilt = looking up → horizon must move DOWN in the frame (larger y).
    const tiltOffsetPx = (Math.tan((cam.tilt * Math.PI) / 180) / Math.tan((fov.verticalDeg / 2) * Math.PI / 180)) * (H / 2);
    const groundY = H * 0.5 + tiltOffsetPx;
    const groundYClamped = Math.max(-H, Math.min(H * 2, groundY));



    // ═══ BACKGROUND ═══
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, W, H);

    // Sky — richer gradient with subtle blue
    const skyEnd = Math.max(0, groundYClamped);
    if (skyEnd > 0) {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, skyEnd);
      skyGrad.addColorStop(0, '#070b12');
      skyGrad.addColorStop(0.4, '#0c1322');
      skyGrad.addColorStop(0.8, '#131d30');
      skyGrad.addColorStop(1, '#1a2840');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, skyEnd);
    }

    // Ground — realistic with subtle noise effect
    if (groundYClamped < H) {
      const gH = H - groundYClamped;
      const gndGrad = ctx.createLinearGradient(0, groundYClamped, 0, H);
      gndGrad.addColorStop(0, '#2a3040');
      gndGrad.addColorStop(0.15, '#1e2530');
      gndGrad.addColorStop(0.5, '#151a22');
      gndGrad.addColorStop(1, '#0c0f14');
      ctx.fillStyle = gndGrad;
      ctx.fillRect(0, groundYClamped, W, gH);

      // Horizon glow
      const horizGlow = ctx.createLinearGradient(0, groundYClamped - 8, 0, groundYClamped + 20);
      horizGlow.addColorStop(0, 'rgba(100,140,200,0)');
      horizGlow.addColorStop(0.4, 'rgba(100,140,200,0.06)');
      horizGlow.addColorStop(1, 'rgba(100,140,200,0)');
      ctx.fillStyle = horizGlow;
      ctx.fillRect(0, groundYClamped - 8, W, 28);

      // Horizon line
      ctx.strokeStyle = '#3a4a60';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, groundYClamped);
      ctx.lineTo(W, groundYClamped);
      ctx.stroke();
    }

    // ── Helpers: world ↔ camera-space ↔ screen ──
    const panRad = (cam.pan * Math.PI) / 180;
    const cosP = Math.cos(panRad);
    const sinP = Math.sin(panRad);
    const fovHRad = (fov.horizontalDeg * Math.PI) / 360;
    const fovVRad = (fov.verticalDeg * Math.PI) / 360;
    const tiltRad = (cam.tilt * Math.PI) / 180;
    const tiltShift = Math.tan(tiltRad);
    const NEAR = 0.1;

    type CamPoint = { x: number; y: number; z: number };

    const camPos = effectiveCameraPos(cam!);
    const worldToCamera = (wx: number, wy: number, wz: number): CamPoint => {
      const c = cam!;
      const dx = wx - camPos.x;
      const dy = wy - camPos.y;
      return {
        x: -dx * sinP + dy * cosP,
        y: wz - c.z,
        z: dx * cosP + dy * sinP,
      };
    };

    const cameraToScreen = (p: CamPoint) => {
      const screenX = W / 2 + (p.x / (p.z * Math.tan(fovHRad))) * (W / 2);
      const apparentY = p.y / p.z;
      // Positive tilt (look up) rotates the world DOWN in camera frame → subtract tiltShift
      // so that ground objects move toward the bottom of the screen as tilt increases.
      const screenY = H / 2 - ((apparentY - tiltShift) / Math.tan(fovVRad)) * (H / 2);
      return { sx: screenX, sy: screenY, dist: p.z };
    };

    /** Sutherland–Hodgman polygon clipping against the near plane (z ≥ NEAR). */
    const clipPolygonNear = (poly: CamPoint[]): CamPoint[] => {
      const out: CamPoint[] = [];
      for (let i = 0; i < poly.length; i++) {
        const cur = poly[i];
        const prev = poly[(i - 1 + poly.length) % poly.length];
        const curIn = cur.z >= NEAR;
        const prevIn = prev.z >= NEAR;
        if (curIn) {
          if (!prevIn) {
            const t = (NEAR - prev.z) / (cur.z - prev.z);
            out.push({
              x: prev.x + t * (cur.x - prev.x),
              y: prev.y + t * (cur.y - prev.y),
              z: NEAR,
            });
          }
          out.push(cur);
        } else if (prevIn) {
          const t = (NEAR - prev.z) / (cur.z - prev.z);
          out.push({
            x: prev.x + t * (cur.x - prev.x),
            y: prev.y + t * (cur.y - prev.y),
            z: NEAR,
          });
        }
      }
      return out;
    };

    const worldToScreen = (wx: number, wy: number, wz: number): { sx: number; sy: number; dist: number; behindCamera: boolean } => {
      const camP = worldToCamera(wx, wy, wz);
      if (camP.z <= NEAR) return { sx: -999, sy: -999, dist: 0, behindCamera: true };
      const s = cameraToScreen(camP);
      return { sx: s.sx, sy: s.sy, dist: s.dist, behindCamera: false };
    };
    const worldToScreenLocal = worldToScreen;

    // ── Perspective ground grid ──
    // (worldToScreen defined above)
    if (showGrid && groundYClamped < H) {
      ctx.save();
      // Depth lines (horizontal, converging)
      for (let d = 1; d <= 20; d++) {
        const dist = d * 2; // every 2m
        const screenPt = worldToScreenLocal(camPos.x, camPos.y + dist, 0);
        if (screenPt.behindCamera || screenPt.sy < groundYClamped - 2) continue;
        const alpha = Math.max(0.02, 0.12 - d * 0.005);
        ctx.strokeStyle = `rgba(120,160,220,${alpha})`;
        ctx.lineWidth = d % 5 === 0 ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(0, screenPt.sy);
        ctx.lineTo(W, screenPt.sy);
        ctx.stroke();
      }
      // Vertical lines (converging to vanishing point)
      const vanishX = W / 2;
      for (let i = -10; i <= 10; i++) {
        if (i === 0) continue;
        const worldX = camPos.x + i * 2;
        const nearPt = worldToScreenLocal(worldX, camPos.y + 2, 0);
        const farPt = worldToScreenLocal(worldX, camPos.y + 40, 0);
        if (nearPt.behindCamera && farPt.behindCamera) continue;
        const alpha = Math.max(0.02, 0.08 - Math.abs(i) * 0.006);
        ctx.strokeStyle = `rgba(120,160,220,${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(nearPt.behindCamera ? vanishX : nearPt.sx, nearPt.behindCamera ? groundYClamped : nearPt.sy);
        ctx.lineTo(farPt.behindCamera ? vanishX : farPt.sx, farPt.behindCamera ? groundYClamped : farPt.sy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Feste Koerper: Buehnen-Podeste und Waende ──
    // Beide landen in EINER Malerordnung (hinten zuerst). Vorher wurden erst
    // alle Buehnen und dann alle Waende gemalt — bei einer flachen Flaeche auf
    // dem Boden faellt das nicht auf, ein Podest vor einer Wand verschwand
    // dadurch aber hinter ihr.
    // Sortiert wird nach dem Abstand in der Grundebene, damit Wand und Podest
    // denselben Massstab benutzen; `dist` (Kameratiefe) bleibt der Wert fuer
    // die Schaerfeberechnung.
    type Solid = { depth: number; draw: () => void };
    const solids: Solid[] = [];
    const groundDist = (wx: number, wy: number) => Math.hypot(wx - camPos.x, wy - camPos.y);

    /**
     * Eine Flaeche des Podests. Die Ecken kommen aus `stageFaces`, werden in
     * Kameraraum gebracht und an der Near-Plane geschnitten, damit Ecken hinter
     * der Kamera das Viereck nicht zu einem entarteten Dreieck zusammenfalten.
     */
    const drawStageFace = (stage: Stage, face: StageFace) => {
      const clipped = clipPolygonNear(face.points.map((p) => worldToCamera(p.x, p.y, p.z)));
      if (clipped.length < 3) return;
      const projected = clipped.map((p) => cameraToScreen(p));

      const base = stageColor(stage);
      ctx.fillStyle = shadeHex(base, face.shade) + alphaSuffix(stageOpacity(stage));
      ctx.strokeStyle = shadeHex(base, Math.min(1, face.shade + 0.2)) + 'aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(projected[0].sx, projected[0].sy);
      for (let i = 1; i < projected.length; i++) {
        ctx.lineTo(projected[i].sx, projected[i].sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    venue.stages.forEach((stage) => {
      // `stageFaces` laesst die abgewandten Seiten und — bei einer Kamera
      // unterhalb der Oberkante — die Deckflaeche weg (#73).
      for (const face of stageFaces(stage, camPos.x, camPos.y, cam.z)) {
        solids.push({ depth: face.depth, draw: () => drawStageFace(stage, face) });
      }
    });

    // ── Walls from venue (issue #46) ──
    // Each wall is a vertical quad standing on the floor: bottom edge from
    // (x1,y1) to (x2,y2) at z=0, top edge at z=height. Built in camera space and
    // near-plane clipped like the stages so corners behind the camera don't
    // collapse the quad.
    const drawWall = (wall: Wall, dist: number) => {
      const camCorners = [
        worldToCamera(wall.x1, wall.y1, 0),
        worldToCamera(wall.x2, wall.y2, 0),
        worldToCamera(wall.x2, wall.y2, wall.height),
        worldToCamera(wall.x1, wall.y1, wall.height),
      ];
      const clipped = clipPolygonNear(camCorners);
      if (clipped.length < 3) return;
      const projected = clipped.map((p) => cameraToScreen(p));

      const baseColor = wall.color ?? '#6b7280';
      const pattern = wall.pattern ?? 'solid';
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);

      // Depth-of-field blur for the wall, so a textured wall makes the focus
      // falloff visible (issue #45). Same falloff model as persons.
      const outOfFocus = Math.abs(dist - cam.focusDistance);
      const wallBlur = Math.min(14, (outOfFocus * (cam.focalLength / 50)) / Math.max(1, cam.aperture) * 0.6);

      ctx.save();
      if (wallBlur > 0.5) ctx.filter = `blur(${wallBlur.toFixed(1)}px)`;

      // Clip to the wall quad so the pattern only paints on the wall surface.
      ctx.beginPath();
      ctx.moveTo(projected[0].sx, projected[0].sy);
      for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].sx, projected[i].sy);
      ctx.closePath();
      ctx.save();
      ctx.clip();

      // Base fill.
      ctx.fillStyle = baseColor + 'cc';
      ctx.fill();

      const xs = projected.map((p) => p.sx);

      // Muster in WANDkoordinaten (#74): die Flaeche wird einmal auf eine
      // Zwischen-Leinwand gemalt (Kachelzahl steht an der Wand, nicht am Zoom)
      // und dann streifenweise auf das projizierte Viereck gelegt. Vorher lief
      // das im Bildschirmraum — daher wuchs die Blumenzahl beim Reinzoomen ins
      // Unermessliche und ein Bild klebte am Bildschirm statt an der Wand.
      if (pattern !== 'solid') {
        const texture = getWallTexture(wall, len, getWallImage);
        if (texture) {
          const dirX = len > 0 ? (wall.x2 - wall.x1) / len : 0;
          const dirY = len > 0 ? (wall.y2 - wall.y1) / len : 0;
          // Streifenzahl nach Bildschirmbreite: eine ferne Wand braucht wenige.
          const screenW = Math.max(...xs) - Math.min(...xs);
          const ranges = stripRanges(stripCount(screenW));
          for (const { t0, t1 } of ranges) {
            const ax = wall.x1 + dirX * len * t0;
            const ay = wall.y1 + dirY * len * t0;
            const bx = wall.x1 + dirX * len * t1;
            const by = wall.y1 + dirY * len * t1;
            const cTopL = worldToCamera(ax, ay, wall.height);
            const cTopR = worldToCamera(bx, by, wall.height);
            const cBotL = worldToCamera(ax, ay, 0);
            // Streifen hinter der Kamera auslassen, statt mit unsinnigen
            // Koordinaten zu rechnen.
            if (cTopL.z <= NEAR || cTopR.z <= NEAR || cBotL.z <= NEAR) continue;
            const pTopL = cameraToScreen(cTopL);
            const pTopR = cameraToScreen(cTopR);
            const pBotL = cameraToScreen(cBotL);
            const sx = t0 * texture.width;
            const sw = (t1 - t0) * texture.width;
            if (sw <= 0) continue;
            const m = stripTransform(
              sx, sw, texture.height,
              { x: pTopL.sx, y: pTopL.sy },
              { x: pTopR.sx, y: pTopR.sy },
              { x: pBotL.sx, y: pBotL.sy },
            );
            ctx.save();
            // `transform` MULTIPLIZIERT auf die laufende Matrix — anders als
            // `setTransform`, das sie ersetzt und damit die DPR-Skalierung vom
            // Anfang des Zeichnens (ctx.scale(dpr, dpr)) verwerfen wuerde. Auf
            // einem HiDPI-Schirm laege das Muster sonst halb so gross und
            // verschoben auf der Wand.
            ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
            // Halbes Pixel Ueberlappung, sonst blitzen Fugen zwischen den
            // Streifen durch.
            ctx.drawImage(texture, sx, 0, sw + 0.5, texture.height, sx, 0, sw + 0.5, texture.height);
            ctx.restore();
          }
        }
      }

      ctx.restore(); // remove clip

      // Outline (still blurred if out of focus).
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(projected[0].sx, projected[0].sy);
      for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].sx, projected[i].sy);
      ctx.closePath();
      ctx.stroke();
      ctx.restore(); // remove blur filter
    };

    walls.forEach((wall) => {
      const midX = (wall.x1 + wall.x2) / 2;
      const midY = (wall.y1 + wall.y2) / 2;
      const dist = worldToScreen(midX, midY, 0).dist;
      solids.push({ depth: groundDist(midX, midY), draw: () => drawWall(wall, dist) });
    });

    solids.sort((a, b) => b.depth - a.depth).forEach((solid) => solid.draw());

    // Buehnen-Beschriftung ueber die Koerper, sonst verdeckt ein naeher
    // stehendes Podest den Namen des dahinterliegenden.
    venue.stages.forEach((stage) => {
      const anchor = stageLabelAnchor(stage);
      const center = worldToScreen(anchor.x, anchor.y, anchor.z);
      if (center.behindCamera) return;
      const fontSize = Math.max(8, Math.min(16, 200 / center.dist));
      ctx.fillStyle = stageColor(stage);
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(stage.label, center.sx, center.sy + fontSize / 3);
    });

    // ── Draw persons / stage objects ──
    // Use a clip region so partially off-screen objects are cropped, not hidden
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    // Clamp a screen coordinate to a safe finite range for drawing
    const SAFE = 1e4;
    const clampScreen = (v: number, fallbackSign: number): number => {
      if (!isFinite(v)) return fallbackSign * SAFE;
      return Math.max(-SAFE, Math.min(SAFE, v));
    }

    const drawPerson = (cx: number, feetY: number, headY: number, dist: number, objectType?: StageObjectType, label?: string, customColor?: string) => {
      const pxH = Math.abs(headY - feetY);
      if (pxH < 1) return;
      const type = objectType ?? 'person';

      if (type === 'drums') {
        // Drum kit: wider, shorter, with cymbals
        const kitW = pxH * 0.8;
        const kitH = pxH * 0.6;
        const kitY = feetY - kitH;
        // Base drum
        ctx.fillStyle = '#ef444466';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, feetY - kitH * 0.3, kitW * 0.3, kitH * 0.3, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Snare
        ctx.fillStyle = '#fbbf2444';
        ctx.strokeStyle = '#fbbf24';
        ctx.beginPath();
        ctx.ellipse(cx - kitW * 0.25, kitY + kitH * 0.5, kitW * 0.15, kitH * 0.12, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Hi-hat
        ctx.strokeStyle = '#d4d4d8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + kitW * 0.35, feetY); ctx.lineTo(cx + kitW * 0.35, kitY);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx + kitW * 0.35, kitY + kitH * 0.1, kitW * 0.12, kitH * 0.04, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24'; ctx.stroke();
      } else if (type === 'keys') {
        // Keyboard on stand
        const kbW = pxH * 0.8;
        const kbH = pxH * 0.12;
        const kbY = headY + pxH * 0.35;
        // Stand
        ctx.strokeStyle = '#6b728099';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - kbW * 0.3, kbY + kbH); ctx.lineTo(cx - kbW * 0.3, feetY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + kbW * 0.3, kbY + kbH); ctx.lineTo(cx + kbW * 0.3, feetY); ctx.stroke();
        // Keyboard body
        ctx.fillStyle = '#8b5cf644';
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (pxH > 10) ctx.roundRect(cx - kbW / 2, kbY, kbW, kbH, 2);
        else ctx.rect(cx - kbW / 2, kbY, kbW, kbH);
        ctx.fill(); ctx.stroke();
        // White keys
        if (pxH > 20) {
          ctx.strokeStyle = '#c4b5fd44';
          ctx.lineWidth = 0.5;
          const nKeys = Math.min(24, Math.floor(kbW / 4));
          for (let i = 0; i < nKeys; i++) {
            const kx = cx - kbW / 2 + (i / nKeys) * kbW;
            ctx.beginPath(); ctx.moveTo(kx, kbY); ctx.lineTo(kx, kbY + kbH); ctx.stroke();
          }
        }
      } else if (type === 'mic-stand') {
        // Mic stand: thin pole with mic head
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = Math.max(1, pxH * 0.02);
        ctx.beginPath(); ctx.moveTo(cx, feetY); ctx.lineTo(cx, headY + pxH * 0.1); ctx.stroke();
        // Base
        ctx.beginPath();
        ctx.ellipse(cx, feetY, pxH * 0.08, pxH * 0.03, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#9ca3af'; ctx.stroke();
        // Mic head
        ctx.fillStyle = '#4b556366';
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, headY + pxH * 0.05, pxH * 0.04, pxH * 0.06, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      } else if (type === 'chair') {
        const c = customColor ?? '#a16207';
        const seatW = pxH * 0.6;
        const seatY = feetY - pxH * 0.55;
        const backH = pxH * 0.65;
        // Legs
        ctx.strokeStyle = '#57534e'; ctx.lineWidth = Math.max(1, pxH * 0.04);
        ctx.beginPath(); ctx.moveTo(cx - seatW / 2, seatY); ctx.lineTo(cx - seatW / 2, feetY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + seatW / 2, seatY); ctx.lineTo(cx + seatW / 2, feetY); ctx.stroke();
        // Seat
        ctx.fillStyle = c + 'aa'; ctx.strokeStyle = c; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.rect(cx - seatW / 2, seatY, seatW, pxH * 0.08); ctx.fill(); ctx.stroke();
        // Backrest
        ctx.beginPath(); ctx.rect(cx - seatW * 0.45, seatY - backH, seatW * 0.9, backH); ctx.fill(); ctx.stroke();
      } else if (type === 'table') {
        const c = customColor ?? '#a16207';
        const topW = pxH * 1.4;
        const topY = feetY - pxH * 0.75;
        ctx.strokeStyle = '#57534e'; ctx.lineWidth = Math.max(1, pxH * 0.05);
        ctx.beginPath(); ctx.moveTo(cx - topW / 2 + pxH * 0.06, topY + pxH * 0.04); ctx.lineTo(cx - topW / 2 + pxH * 0.06, feetY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + topW / 2 - pxH * 0.06, topY + pxH * 0.04); ctx.lineTo(cx + topW / 2 - pxH * 0.06, feetY); ctx.stroke();
        ctx.fillStyle = c + 'cc'; ctx.strokeStyle = c; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.rect(cx - topW / 2, topY, topW, pxH * 0.08); ctx.fill(); ctx.stroke();
      } else if (type === 'lectern') {
        const c = customColor ?? '#7c3aed';
        const w = pxH * 0.55;
        ctx.fillStyle = c + 'bb'; ctx.strokeStyle = c; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.rect(cx - w / 2, feetY - pxH * 0.85, w, pxH * 0.85); ctx.fill(); ctx.stroke();
        // Slanted top
        ctx.fillStyle = '#1f2937cc'; ctx.strokeStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.6, feetY - pxH * 0.95);
        ctx.lineTo(cx + w * 0.6, feetY - pxH * 0.8);
        ctx.lineTo(cx + w * 0.6, feetY - pxH * 0.72);
        ctx.lineTo(cx - w * 0.6, feetY - pxH * 0.87);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (type === 'sitting-person') {
        const c = customColor ?? '#38bdf8';
        const pxW = pxH * 0.3;
        const headR = pxH * 0.11;
        // Stool hint
        ctx.strokeStyle = '#57534e'; ctx.lineWidth = Math.max(1, pxH * 0.03);
        ctx.beginPath(); ctx.moveTo(cx - pxW * 0.6, feetY - pxH * 0.05); ctx.lineTo(cx - pxW * 0.6, feetY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + pxW * 0.6, feetY - pxH * 0.05); ctx.lineTo(cx + pxW * 0.6, feetY); ctx.stroke();
        // Torso (short)
        ctx.fillStyle = c + '55'; ctx.strokeStyle = c; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - pxW * 0.55, feetY - pxH * 0.5);
        ctx.lineTo(cx + pxW * 0.55, feetY - pxH * 0.5);
        ctx.lineTo(cx + pxW * 0.4, feetY - pxH * 0.05);
        ctx.lineTo(cx - pxW * 0.4, feetY - pxH * 0.05);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // Head
        ctx.fillStyle = '#d4a57488'; ctx.strokeStyle = c;
        ctx.beginPath(); ctx.arc(cx, headY + headR + pxH * 0.05, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Thighs horizontal
        ctx.strokeStyle = c + '88'; ctx.lineWidth = Math.max(1, pxH * 0.04);
        ctx.beginPath(); ctx.moveTo(cx - pxW * 0.3, feetY - pxH * 0.1); ctx.lineTo(cx + pxW * 0.8, feetY - pxH * 0.1); ctx.stroke();
      } else if (type === 'schneetiger') {
        const c = customColor ?? '#e0f2fe';
        const bodyW = pxH * 1.3;
        const bodyH = pxH * 0.5;
        const bodyY = feetY - bodyH * 1.3;
        // Legs
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, pxH * 0.06);
        ctx.beginPath(); ctx.moveTo(cx - bodyW * 0.35, bodyY + bodyH); ctx.lineTo(cx - bodyW * 0.35, feetY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + bodyW * 0.35, bodyY + bodyH); ctx.lineTo(cx + bodyW * 0.35, feetY); ctx.stroke();
        // Body
        ctx.fillStyle = c + 'cc'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (pxH > 10) ctx.roundRect(cx - bodyW / 2, bodyY, bodyW, bodyH, bodyH * 0.4);
        else ctx.rect(cx - bodyW / 2, bodyY, bodyW, bodyH);
        ctx.fill(); ctx.stroke();
        // Stripes
        ctx.strokeStyle = '#1f2937aa'; ctx.lineWidth = Math.max(1, pxH * 0.02);
        for (let i = 1; i < 5; i++) {
          const sx = cx - bodyW / 2 + (bodyW * i) / 5;
          ctx.beginPath(); ctx.moveTo(sx, bodyY + bodyH * 0.1); ctx.lineTo(sx + pxH * 0.04, bodyY + bodyH * 0.9); ctx.stroke();
        }
        // Head
        ctx.fillStyle = c + 'dd'; ctx.strokeStyle = '#334155';
        const hr = pxH * 0.18;
        ctx.beginPath(); ctx.arc(cx + bodyW * 0.45, bodyY + bodyH * 0.3, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Ears
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(cx + bodyW * 0.45 - hr * 0.5, bodyY + bodyH * 0.3 - hr); ctx.lineTo(cx + bodyW * 0.45 - hr * 0.2, bodyY + bodyH * 0.3 - hr * 1.5); ctx.lineTo(cx + bodyW * 0.45, bodyY + bodyH * 0.3 - hr); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + bodyW * 0.45 + hr * 0.5, bodyY + bodyH * 0.3 - hr); ctx.lineTo(cx + bodyW * 0.45 + hr * 0.2, bodyY + bodyH * 0.3 - hr * 1.5); ctx.lineTo(cx + bodyW * 0.45, bodyY + bodyH * 0.3 - hr); ctx.closePath(); ctx.fill();
        // Tail
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, pxH * 0.05);
        ctx.beginPath(); ctx.moveTo(cx - bodyW * 0.5, bodyY + bodyH * 0.3); ctx.quadraticCurveTo(cx - bodyW * 0.85, bodyY, cx - bodyW * 0.75, bodyY - bodyH * 0.4); ctx.stroke();
      } else {
        // Person (or person-guitar) - realistic silhouette
        const pxW = pxH * 0.28;
        const headR = pxH * 0.09;
        const neckY = headY + headR * 2.2;
        const shoulderY = neckY + pxH * 0.03;
        const shoulderW = pxW * 0.55;
        const waistY = feetY - pxH * 0.42;
        const hipW = pxW * 0.4;

        const bodyColor = customColor ?? (type === 'person-guitar' ? '#f97316' : '#22c55e');
        const bodyFill = bodyColor + '44';
        const skinColor = '#d4a574';

        // Head (skin-colored circle)
        ctx.fillStyle = skinColor + '88';
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, headY + headR, headR, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Hair
        ctx.fillStyle = '#44403c88';
        ctx.beginPath();
        ctx.arc(cx, headY + headR * 0.8, headR * 0.95, Math.PI, Math.PI * 2);
        ctx.fill();

        // Neck
        ctx.fillStyle = skinColor + '66';
        ctx.fillRect(cx - headR * 0.3, neckY - pxH * 0.01, headR * 0.6, pxH * 0.04);

        // Torso
        ctx.fillStyle = bodyFill;
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - shoulderW, shoulderY);
        ctx.lineTo(cx + shoulderW, shoulderY);
        ctx.lineTo(cx + hipW, waistY);
        ctx.lineTo(cx - hipW, waistY);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Arms
        ctx.strokeStyle = bodyColor + 'aa';
        ctx.lineWidth = Math.max(1, pxH * 0.025);
        // Left arm
        ctx.beginPath();
        ctx.moveTo(cx - shoulderW, shoulderY);
        ctx.quadraticCurveTo(cx - shoulderW - pxW * 0.15, shoulderY + pxH * 0.15, cx - shoulderW + pxW * 0.05, waistY + pxH * 0.05);
        ctx.stroke();
        // Right arm
        ctx.beginPath();
        ctx.moveTo(cx + shoulderW, shoulderY);
        if (type === 'person-guitar') {
          ctx.quadraticCurveTo(cx + shoulderW + pxW * 0.1, shoulderY + pxH * 0.1, cx + pxW * 0.2, waistY - pxH * 0.05);
        } else {
          ctx.quadraticCurveTo(cx + shoulderW + pxW * 0.15, shoulderY + pxH * 0.15, cx + shoulderW - pxW * 0.05, waistY + pxH * 0.05);
        }
        ctx.stroke();

        // Legs
        ctx.strokeStyle = bodyColor + '88';
        ctx.lineWidth = Math.max(1, pxH * 0.03);
        ctx.beginPath(); ctx.moveTo(cx - hipW * 0.5, waistY); ctx.lineTo(cx - hipW * 0.3, feetY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + hipW * 0.5, waistY); ctx.lineTo(cx + hipW * 0.3, feetY); ctx.stroke();

        // Guitar body (for guitarist)
        if (type === 'person-guitar') {
          const gx = cx + pxW * 0.15;
          const gy = waistY - pxH * 0.08;
          const gw = pxH * 0.12;
          ctx.fillStyle = '#92400e66';
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(gx, gy, gw, gw * 0.7, 0.2, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          // Neck of guitar
          ctx.strokeStyle = '#92400e';
          ctx.lineWidth = Math.max(1, pxH * 0.015);
          ctx.beginPath();
          ctx.moveTo(gx - gw * 0.3, gy - gw * 0.5);
          ctx.lineTo(cx + shoulderW * 0.3, shoulderY + pxH * 0.03);
          ctx.stroke();
        }
      }

      // Label
      if (label && feetY > 0 && feetY < H - 5 && cx > -50 && cx < W + 50 && dist > 0) {
        const fontSize = Math.max(7, Math.min(11, 120 / dist));
        const labelColor = customColor ?? (
          type === 'drums' ? '#ef4444' :
          type === 'keys' ? '#8b5cf6' :
          type === 'person-guitar' ? '#f97316' :
          type === 'mic-stand' ? '#9ca3af' :
          type === 'chair' ? '#a16207' :
          type === 'table' ? '#a16207' :
          type === 'lectern' ? '#7c3aed' :
          type === 'sitting-person' ? '#38bdf8' :
          type === 'schneetiger' ? '#e0f2fe' :
          '#22c55e'
        );
        ctx.fillStyle = labelColor;
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, feetY + fontSize + 2);
      }
    }

    projectedPersons.current = [];
    let inFramePersons = 0;
    let totalInFront = 0;
    let nearestCrosshair: { id: string; label: string; dist: number; sx: number; sy: number } | null = null;
    persons.forEach((person) => {
      // Project via worldToCamera + cameraToScreen directly so a person who is
      // physically in front of the camera but within the projection NEAR plane
      // (i.e. very close — < 10 cm) still gets drawn. worldToScreen treats
      // anything inside NEAR as "behindCamera" which would otherwise make the
      // person vanish when zooming in tight, even though they should just
      // become huge.
      // Steht die Person auf einem Podest, liegen ihre Fuesse auf dessen
      // Oberkante statt auf dem Boden (#73) — sonst steckt sie bis zur Huefte
      // in der Buehne.
      const feetZ = groundHeightAt(venue.stages, person.x, person.y);
      const feetCam = worldToCamera(person.x, person.y, feetZ);
      // Genuinely behind the camera — no chance of being visible
      if (feetCam.z <= 0.001) return;
      totalInFront++;
      const headCam = worldToCamera(person.x, person.y, feetZ + person.height);
      const feetProj = cameraToScreen(feetCam);
      const headProj = cameraToScreen(headCam);

      // Clamp projected positions to finite safe range so huge close-up values
      // don't blow up the canvas drawing.
      const feetSx = clampScreen(feetProj.sx, 1);
      const feetSy = clampScreen(feetProj.sy, 1);
      const headSy = clampScreen(headProj.sy, -1);

      const pxH = Math.abs(headSy - feetSy);
      if (pxH < 1) return;

      // Skip if entirely off-screen
      const objW = pxH * 0.5;
      if (feetSx + objW < 0) return;
      if (feetSx - objW > W) return;
      if (feetSy < 0 && headSy < 0) return;
      if (feetSy > H && headSy > H) return;

      inFramePersons++;

      // Remember on-screen position for click-to-focus hit-testing
      projectedPersons.current.push({
        id: person.id,
        sx: feetSx,
        sy: feetSy,
        topSy: headSy,
        dist: feetProj.dist,
      });

      // Track person nearest the screen centre (crosshair) for distance overlay
      const torsoSy = (feetSy + headSy) / 2;
      const centreDist = Math.hypot(feetSx - W / 2, torsoSy - H / 2);
      if (centreDist < Math.min(W, H) * 0.18) {
        if (!nearestCrosshair || centreDist < Math.hypot(nearestCrosshair.sx - W / 2, nearestCrosshair.sy - H / 2)) {
          nearestCrosshair = { id: person.id, label: person.label, dist: feetProj.dist, sx: feetSx, sy: torsoSy };
        }
      }

      // ── Depth of Field blur ──
      // Smooth falloff scaled by focal length / aperture, so a fast tele blurs
      // backgrounds aggressively while a wide-stopped-down lens stays sharp.
      // Locked subject (focus-pinned in the operator's frame) always renders
      // sharp regardless of distance.
      let blurPx = 0;
      if (cam.lockedPersonId !== person.id) {
        const outOfFocus = Math.abs(feetProj.dist - cam.focusDistance);
        blurPx = Math.min(12, outOfFocus * (cam.focalLength / 50) / Math.max(1, cam.aperture) * 0.6);
      }
      if (blurPx > 0.5) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      drawPerson(feetSx, feetSy, headSy, feetProj.dist, person.objectType, `${person.label} (${person.height.toFixed(1)}m)`, person.color);
      if (blurPx > 0.5) ctx.filter = 'none';
    });

    ctx.restore();

    // ── Draw other cameras ──
    cameras.forEach((otherCam) => {
      if (otherCam.id === cam.id) return;
      const pos = worldToScreen(otherCam.x, otherCam.y, otherCam.z);
      if (pos.behindCamera) return;

      const sz = Math.max(4, Math.min(12, 80 / pos.dist));
      ctx.fillStyle = otherCam.color + 'aa';
      ctx.strokeStyle = otherCam.color;
      ctx.lineWidth = 1.5;
      ctx.fillRect(pos.sx - sz, pos.sy - sz / 2, sz * 2, sz);
      ctx.strokeRect(pos.sx - sz, pos.sy - sz / 2, sz * 2, sz);

      const fontSize = Math.max(7, Math.min(10, 100 / pos.dist));
      ctx.fillStyle = otherCam.color;
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(otherCam.label, pos.sx, pos.sy - sz / 2 - 3);
    });

    const vRulerW = bare ? 0 : 26;
    const rulerH = 22;
    // ═══ RULERS ═══
    if (!bare) {
      const rulerY = H - rulerH;
      ctx.fillStyle = '#000000cc';
      ctx.fillRect(0, rulerY, W, rulerH);

      const niceSteps = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
      const rawStep = imgW / 8;
      const step = niceSteps.find((s) => s >= rawStep) ?? rawStep;
      const halfImgW = imgW / 2;

      ctx.strokeStyle = '#666';
      ctx.fillStyle = '#999';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 1;

      for (let m = 0; m <= halfImgW; m += step) {
        const pxR = W / 2 + (m / imgW) * W;
        const pxL = W / 2 - (m / imgW) * W;
        if (pxR <= W) {
          ctx.beginPath(); ctx.moveTo(pxR, rulerY); ctx.lineTo(pxR, rulerY + 6); ctx.stroke();
          ctx.fillText(`${m.toFixed(m < 1 ? 2 : 1)}m`, pxR, rulerY + 16);
        }
        if (m > 0 && pxL >= 0) {
          ctx.beginPath(); ctx.moveTo(pxL, rulerY); ctx.lineTo(pxL, rulerY + 6); ctx.stroke();
          ctx.fillText(`${m.toFixed(m < 1 ? 2 : 1)}m`, pxL, rulerY + 16);
        }
    }
    ctx.strokeStyle = '#ccc';
    ctx.beginPath(); ctx.moveTo(W / 2, rulerY); ctx.lineTo(W / 2, rulerY + 8); ctx.stroke();

    // Vertical ruler
    const vRulerX = W - vRulerW;
    ctx.fillStyle = '#000000cc';
    ctx.fillRect(vRulerX, 0, vRulerW, H - rulerH);

    const rawStepV = imgH / 6;
    const stepV = niceSteps.find((s) => s >= rawStepV) ?? rawStepV;
    ctx.strokeStyle = '#666';
    ctx.fillStyle = '#999';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';

    for (let m = 0; m <= imgH; m += stepV) {
      const py = groundYClamped - (m / imgH) * (H * 0.6);
      if (py < 0 || py > H - rulerH) continue;
      ctx.beginPath(); ctx.moveTo(vRulerX, py); ctx.lineTo(vRulerX + 5, py); ctx.stroke();
      ctx.fillText(`${m.toFixed(m < 1 ? 2 : 1)}m`, W - 3, py + 3);
    }

    }

    // ═══ OVERLAY GUIDES ═══
    // Safe areas
    if (!bare && showSafeAreas) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      const asM = W * 0.035;
      ctx.strokeRect(asM, asM * (H / W), W - asM * 2, H - asM * 2 * (H / W));
      const tsM = W * 0.05;
      ctx.strokeRect(tsM, tsM * (H / W), W - tsM * 2, H - tsM * 2 * (H / W));
      ctx.setLineDash([]);
    }

    // Rule of thirds
    if (!bare && showThirds) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo((W / 3) * i, 0); ctx.lineTo((W / 3) * i, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (H / 3) * i); ctx.lineTo(W, (H / 3) * i); ctx.stroke();
      }
    }

    // Crosshair
    if (!bare && showCrosshair) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W / 2 - 18, H / 2); ctx.lineTo(W / 2 + 18, H / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 18); ctx.lineTo(W / 2, H / 2 + 18); ctx.stroke();

      // Distance readout under the crosshair: focus distance + nearest in-frame
      // subject. Helps the operator verify pull-focus while panning.
      const lines: string[] = [format(t('preview.crosshairFocus', 'focus {d}m'), { d: cam.focusDistance.toFixed(1) })];
      if (nearestCrosshair) {
        const n = nearestCrosshair as { label: string; dist: number };
        lines.push(`${n.label}: ${n.dist.toFixed(1)}m`);
      }
      ctx.fillStyle = '#000000aa';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const lineH = 12;
      const boxW = 120;
      const boxH = lines.length * lineH + 6;
      ctx.fillRect(W / 2 - boxW / 2, H / 2 + 22, boxW, boxH);
      ctx.fillStyle = '#cbd5e1';
      lines.forEach((t, i) => ctx.fillText(t, W / 2, H / 2 + 22 + lineH * (i + 1) - 1));
    }

    // ── Coverage indicator (top-left badge) ──
    // Subtle warning when subjects exist but aren't framed. Locked subject
    // off-frame gets a stronger red badge because that's almost always wrong.
    if (!bare && totalInFront > 0) {
      const offFrame = totalInFront - inFramePersons;
      const lockedTarget = cam.lockedPersonId ? persons.find((p) => p.id === cam.lockedPersonId) : null;
      const lockedOff = lockedTarget ? !projectedPersons.current.some((p) => p.id === lockedTarget.id) : false;
      let badgeText: string;
      let badgeColor: string;
      if (lockedOff) {
        badgeText = format(t('preview.badge.outOfFrame', '⚠ {label} OUT OF FRAME'), { label: lockedTarget!.label });
        badgeColor = '#ef4444';
      } else if (offFrame > 0) {
        badgeText = format(t('preview.badge.inFrameRatio', '{n}/{total} in frame'), { n: inFramePersons, total: totalInFront });
        badgeColor = '#fbbf24';
      } else {
        badgeText = format(t('preview.badge.inFrame', '{n} in frame'), { n: inFramePersons });
        badgeColor = '#22c55e';
      }
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      const tw = ctx.measureText(badgeText).width + 12;
      ctx.fillStyle = '#000000aa';
      ctx.fillRect(4, 4, tw, 18);
      ctx.fillStyle = badgeColor;
      ctx.fillText(badgeText, 10, 16);
    }

    // ═══ VIGNETTE ═══
    const vigR = Math.max(W, H) * 0.8;
    const vig = ctx.createRadialGradient(W / 2, H / 2, vigR * 0.4, W / 2, H / 2, vigR);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.7, 'rgba(0,0,0,0.05)');
    vig.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Compact Pan/Tilt badge top-right
    if (!bare) {
      ctx.fillStyle = '#00000088';
      const badgeW = 110;
      ctx.fillRect(W - vRulerW - badgeW - 4, 4, badgeW, 18);
      ctx.fillStyle = '#ffffffaa';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`P ${cam.pan.toFixed(1)}°  T ${cam.tilt.toFixed(1)}°`, W - vRulerW - 8, 16);
    }

    // Anzahl sichtbarer Personen in State spiegeln, damit das Render sie lesen
    // kann ohne auf den Ref zuzugreifen (Refs sind waehrend des Renders tabu und
    // loesen kein Re-Render aus). Gleicher Wert => React bricht ab, kein Loop.
    if (!target) setProjectedCount(projectedPersons.current.length);

  }, [selectedCam, venue, persons, walls, cameras, showGrid, showSafeAreas, showThirds, showCrosshair, getWallImage, imageTick, t]);

  // Repaint synchronously after every render so pan/tilt drags update the canvas
  // on the very next browser frame. The earlier `useEffect` variant was being
  // batched by React under fast drag input, so the 2D/3D views (which bind
  // declaratively to the store) updated immediately while the imperatively-
  // painted canvas lagged or skipped frames.
  useLayoutEffect(() => {
    draw();
  }, [draw]);

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
      // `draw` schreibt beim normalen Lauf die projizierten Personen in den Ref
      // (Hit-Testing der sichtbaren Ansicht). Der Offscreen-Lauf hat eine andere
      // Groesse — deshalb den Stand sichern und danach zurueckspielen.
      const saved = projectedPersons.current;
      try {
        draw({ canvas, cssW: cssWidth });
      } finally {
        projectedPersons.current = saved;
      }
      return canvas.width > 0 && canvas.height > 0 ? canvas : null;
    };
    registry.renderCameraOffscreen = (camId, canvas, cssWidth, dpr = 1) => {
      const target = useStore.getState().cameras.find((c) => c.id === camId);
      if (!target) return false;
      const saved = projectedPersons.current;
      try {
        draw({ canvas, cssW: cssWidth, dpr, cam: target, bare: true });
      } finally {
        projectedPersons.current = saved;
      }
      return canvas.width > 0;
    };
    return () => {
      registry.renderPreviewOffscreen = null;
      registry.renderCameraOffscreen = null;
    };
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
          {([
            [t('preview.overlay.grid', 'Grid'), showGrid, setShowGrid],
            [t('preview.overlay.safeAreas', 'Safe Areas'), showSafeAreas, setShowSafeAreas],
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
                    className="w-12 bg-bc-dark border border-bc-border px-1 text-[11px] text-bc-text font-mono"
                    title={t('preview.manualMin', 'Manual minimum focal length (mm)')}
                  />
                  <input
                    type="number" min={manualMin + 1} max={2000} value={manualMax}
                    onChange={(e) => setManualMax(Math.max(manualMin + 1, Math.min(2000, parseFloat(e.target.value) || 500)))}
                    className="w-12 bg-bc-dark border border-bc-border px-1 text-[11px] text-bc-text font-mono"
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
                    className="w-12 bg-bc-dark border border-bc-border px-1 text-[11px] text-bc-text font-mono"
                    title={t('preview.apertureManualMin', 'Manual minimum (aperture)')}
                  />
                  <input
                    type="number" min={manualApMin + 0.1} max={64} step={0.1} value={manualApMax}
                    onChange={(e) => setManualApMax(Math.max(manualApMin + 0.1, Math.min(64, parseFloat(e.target.value) || 32)))}
                    className="w-12 bg-bc-dark border border-bc-border px-1 text-[11px] text-bc-text font-mono"
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
            className="w-14 bg-bc-dark border border-bc-border px-1 py-0.5 text-[10px] text-bc-text font-mono"
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
          <DataCell label={t('preview.data.focalLength', 'Focal Length')} value={`${cam.focalLength.toFixed(1)}mm`} sub={cam.extenderActive > 1 ? `eff. ${(cam.focalLength * cam.extenderActive).toFixed(0)}mm` : `eq. ${fov.equivalentFocalLength.toFixed(0)}mm`} />
          <DataCell label={t('preview.data.aperture', 'Aperture')} value={`f/${cam.aperture.toFixed(1)}`} sub={adapterInfo && adapterInfo.lightLossStops !== 0 ? `eff. T${(cam.aperture * Math.pow(2, adapterInfo.lightLossStops / 2)).toFixed(1)}` : undefined} />
          <DataCell label={t('preview.data.distance', 'Distance')} value={`${cam.focusDistance.toFixed(1)}m`} />
          <DataCell label={t('preview.data.fovH', 'FOV H')} value={`${fov.horizontalDeg.toFixed(1)}°`} />
          <DataCell label={t('preview.data.fovV', 'FOV V')} value={`${fov.verticalDeg.toFixed(1)}°`} />
          <DataCell label={t('preview.data.imageWidth', 'Image Width')} value={`${fov.imageWidthAtDistance.toFixed(1)}m`} sub={`@ ${cam.focusDistance.toFixed(0)}m`} />
          <DataCell label={t('preview.data.imageHeight', 'Image Height')} value={`${fov.imageHeightAtDistance.toFixed(1)}m`} sub={`@ ${cam.focusDistance.toFixed(0)}m`} />
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
    <div className="bg-bc-dark border border-bc-border px-2 py-1.5">
      <div className="text-[10px] text-bc-dim leading-tight">{label}</div>
      <div className="text-bc-text-bright text-sm font-mono font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-bc-dim leading-tight">{sub}</div>}
    </div>
  );
}
