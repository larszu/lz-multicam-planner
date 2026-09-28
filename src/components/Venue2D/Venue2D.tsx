import { Stage, Layer, Rect, Wedge, Arc, Circle, Text, Group, Line, Image as KImage, Transformer } from 'react-konva';
import { useStore } from '../../store/useStore';
import { foreignFixturesFrom, cctToColor } from '../../utils/foreignView';
import { getCameraById, getEffectiveSensor } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov } from '../../utils/fov';
import { dofBand } from '../../utils/dofBand';
import type { VenueCamera, Wall } from '../../types';
import { effectiveCameraPos, rigYaw } from '../../utils/camera';
import { dragIsOwn, dropToParked } from '../../utils/venueDrag';
import { stageColor, stageTopZ } from '../../utils/stageBody';
import { alphaSuffix, shadeHex } from '../../utils/color';
import RigOverlay, { RIG_HANDLE_RADIUS } from './RigOverlay';
import { getExportRegistry } from '../../store/exportRegistry';
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type Konva from 'konva';
import { FiCopy, FiLock, FiUnlock, FiTrash2 } from 'react-icons/fi';
import { useTranslation, format } from '../../i18n';
import { useIstHell } from '../../lib/useIstHell';
import { planAblage } from '../../avplan/floorplan';
import { usePlanLaden } from '../../lib/usePlanLaden';

// Shared style for context-menu items (issue #38).
const ctxItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
};

/**
 * Die FLAECHEN des Plans — als Palette, nicht als Hex im Markup (B-70).
 *
 * ZWEI SORTEN FARBE STEHEN IN DIESER DATEI, und nur eine davon dreht sich
 * mit dem Thema:
 *
 *   Flaeche   Grund, Blatt, Raster, Rahmen, Massstab. Das ist die
 *             Zeichenunterlage, und die ist auf Papier weiss. Sie steht hier.
 *   Bedeutung Kamera-Marken, Waende, Buehnen, Personen, Warnfarben. Die
 *             bedeuten etwas, und ihre Bedeutung haengt nicht am Thema —
 *             eine rote Marke bleibt rot. Sie stehen weiter dort, wo sie
 *             gebraucht werden.
 *
 * Konva zeichnet in ein Canvas und kann keine CSS-Variable lesen; deshalb
 * eine Tabelle im Code und nicht `var(--color-bc-…)`. Die Werte sind
 * dieselben wie im Stilblatt — wer eine aendert, aendert beide.
 */
const PALETTE = {
  dunkel: {
    grund: '#0a0b0f',
    blatt: '#111318',
    raster: '#1D324F',
    rasterText: '#555555',
    rahmen: '#2a2d3a',
    massstab: '#666666',
    chip: '#000000aa',
    chipText: '#9ca3af',
  },
  hell: {
    grund: '#E8E9E4',
    blatt: '#FFFFFF',
    raster: '#C7CEDA',
    rasterText: '#8A93A3',
    rahmen: '#AAB3C2',
    massstab: '#6E7684',
    chip: '#ffffffcc',
    chipText: '#4E6180',
  },
} as const;

export default function Venue2D() {
  const { t } = useTranslation();
  const P = PALETTE[useIstHell() ? 'hell' : 'dunkel'];
  const { venue, setVenue, cameras, selectedCameraId, selectCamera, moveCamera, updateCamera, removeCamera, duplicateCamera, showAllFov, showDof, pixelsPerMeter, persons, updatePerson, removePerson, duplicatePerson, updateStage, addStage, removeStage, backgroundPlan, setBackgroundPlan, walls, updateWall, addWall, removeWall, wallSnap, editMode, avForeign, showForeign } = useStore();

  // Edit-mode locking (issue #43): each mode locks every category except its own.
  // 'all' falls through to each object's individual lock flag.
  const lockStages = editMode !== 'all' && editMode !== 'stage';
  const lockPersons = editMode !== 'all' && editMode !== 'objects';
  const lockCameras = editMode !== 'all' && editMode !== 'cameras';
  const lockWalls = editMode !== 'all' && editMode !== 'floorplan';
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Grundriss per Drag & Drop auf den Plan (ADR-015, @avplan/floorplan):
  // derselbe Lader wie der Upload in der Sidebar. Die Handler reagieren nur
  // auf gezogene DATEIEN — Konvas eigene Drags (Kameras, Buehnen, Pan)
  // sind Maus-Drags ohne dataTransfer und laufen unberuehrt durch.
  const { lade: ladePlan, meldeUngeeignet } = usePlanLaden();
  const [planZiehtDarueber, setPlanZiehtDarueber] = useState(false);
  const planAblageHandler = planAblage({
    pdf: true,
    onDatei: (datei) => { void ladePlan(datei); },
    onUngeeignet: meldeUngeeignet,
    onAktiv: setPlanZiehtDarueber,
  });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // ── Stage resize (issue #42): select a stage to show a Konva Transformer
  // with corner/edge anchors. ──
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const stageNodeRefs = useRef<Record<string, Konva.Group>>({});

  // ── Right-click context menu (issue #42/#38) ──
  type MenuTarget = { x: number; y: number; kind: 'camera' | 'person' | 'stage' | 'wall'; id: string; locked: boolean };
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  // ── Wall drawing mode ──
  const [drawingWall, setDrawingWall] = useState(false);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [wallCursor, setWallCursor] = useState<{ x: number; y: number } | null>(null);
  const shiftHeld = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = true;
      if (e.key === 'Escape') {
        setWallStart(null);
        setWallCursor(null);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Listen for wall-draw-mode toggle from sidebar or toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      setDrawingWall((e as CustomEvent).detail?.active ?? true);
      setWallStart(null);
      setWallCursor(null);
    };
    window.addEventListener('multicam-wall-draw', handler);
    return () => window.removeEventListener('multicam-wall-draw', handler);
  }, []);

  /** Snap endpoint when shift is held: 0, 45, 90° increments */
  const snapPoint = useCallback((start: { x: number; y: number }, end: { x: number; y: number }) => {
    if (!shiftHeld.current) return end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { x: start.x + Math.cos(snapAngle) * dist, y: start.y + Math.sin(snapAngle) * dist };
  }, []);

  // Magnet a point to the nearest existing wall endpoint within a small radius
  // (issue #40). Disabled when the wall-snap option is off. `excludeWallId`
  // skips the wall whose endpoint is currently being dragged.
  const WALL_SNAP_DIST_M = 0.4;
  const snapToEndpoints = useCallback(
    (pt: { x: number; y: number }, excludeWallId?: string) => {
      if (!wallSnap) return pt;
      let best: { x: number; y: number } | null = null;
      let bestD = WALL_SNAP_DIST_M;
      for (const w of walls) {
        if (w.id === excludeWallId) continue;
        for (const ep of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) {
          const d = Math.hypot(pt.x - ep.x, pt.y - ep.y);
          if (d < bestD) { bestD = d; best = ep; }
        }
      }
      return best ?? pt;
    },
    [wallSnap, walls],
  );

  // Calibration state
  const [calibActive, setCalibActive] = useState(false);
  const [calibDistM, setCalibDistM] = useState(10);
  const [calibAxis, setCalibAxis] = useState<'x' | 'y'>('x');
  const [calibAutoResize, setCalibAutoResize] = useState(true);
  const [calibScaleLocked, setCalibScaleLocked] = useState(true);
  const [calibPoints, setCalibPoints] = useState<{ x: number; y: number }[]>([]);
  const [calibCursor, setCalibCursor] = useState<{ x: number; y: number } | null>(null);

  const ppm = pixelsPerMeter;
  // Read-only Lampen aus der verlustfrei mitgefuehrten .avplan-Lighting-Domaene.
  const foreignFixtures = useMemo(
    () => (showForeign ? foreignFixturesFrom(avForeign.lighting) : []),
    [showForeign, avForeign.lighting],
  );
  const W = venue.widthM * ppm;
  const H = venue.heightM * ppm;

  // Compute world extent including background image
  const bgExtentW = backgroundPlan ? (backgroundPlan.offsetX + backgroundPlan.widthPx * backgroundPlan.scaleX) * ppm : 0;
  const bgExtentH = backgroundPlan ? (backgroundPlan.offsetY + backgroundPlan.heightPx * backgroundPlan.scaleY) * ppm : 0;
  const worldW = Math.max(W, bgExtentW);
  const worldH = Math.max(H, bgExtentH);

  useEffect(() => {
    const registry = getExportRegistry();
    registry.capture2DExport = () => {
      const stage = stageRef.current;
      if (!stage) return null;
      try {
        return stage.toCanvas({
          x: 0,
          y: 0,
          width: worldW,
          height: worldH,
          pixelRatio: 2,
        }) as HTMLCanvasElement;
      } catch {
        return null;
      }
    };
    return () => { registry.capture2DExport = null; };
  }, [worldW, worldH]);

  // Measure container and auto-fit zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-fit when venue or container changes (fit full extent)
  useEffect(() => {
    const scaleX = containerSize.w / worldW;
    const scaleY = containerSize.h / worldH;
    const fitZoom = Math.min(scaleX, scaleY, 1) * 0.95; // 95% to leave margin
    setZoom(fitZoom);
    // Center the stage
    setStagePos({
      x: (containerSize.w - worldW * fitZoom) / 2,
      y: (containerSize.h - worldH * fitZoom) / 2,
    });
  }, [containerSize.w, containerSize.h, worldW, worldH]);

  // Wheel zoom around pointer
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldZoom = zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const factor = 1.08;
    const newZoom = Math.max(0.1, Math.min(10, direction > 0 ? oldZoom * factor : oldZoom / factor));

    // Zoom towards pointer position
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldZoom,
      y: (pointer.y - stagePos.y) / oldZoom,
    };
    setZoom(newZoom);
    setStagePos({
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    });
  }, [zoom, stagePos]);

  const getPointerWorldPoint = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;

    const pointer = stage.getPointerPosition();
    if (!pointer) return null;

    const localX = (pointer.x - stagePos.x) / zoom;
    const localY = (pointer.y - stagePos.y) / zoom;
    return {
      xPx: Math.max(0, Math.min(worldW, localX)),
      yPx: Math.max(0, Math.min(worldH, localY)),
    };
  }, [stagePos.x, stagePos.y, zoom, worldW, worldH]);

  // Load background image when plan changes
  useEffect(() => {
    if (!backgroundPlan) { setBgImage(null); return; }
    const img = new window.Image();
    img.onload = () => setBgImage(img);
    img.src = backgroundPlan.dataUrl;
  }, [backgroundPlan?.dataUrl]);

  // Listen for calibration start/cancel from Sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const { active, distanceM, axis, autoResize, scaleLocked } = (e as CustomEvent).detail;
      setCalibActive(active);
      setCalibDistM(distanceM);
      setCalibAxis(axis || 'x');
      setCalibAutoResize(autoResize ?? true);
      setCalibScaleLocked(scaleLocked ?? false);
      setCalibPoints([]);
      setCalibCursor(null);
    };
    window.addEventListener('multicam-calibrate', handler);
    return () => window.removeEventListener('multicam-calibrate', handler);
  }, []);

  // Handle calibration clicks on the stage
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Clicking empty canvas (the Konva Stage itself) clears the stage selection.
    if (e.target === e.target.getStage() && !drawingWall && !calibActive) {
      setSelectedStageId(null);
    }
    const point = getPointerWorldPoint();
    if (!point) return;

    if (drawingWall) {
      const worldPoint = { x: point.xPx / ppm, y: point.yPx / ppm };
      if (!wallStart) {
        const start = snapToEndpoints(worldPoint);
        setWallStart(start);
        setWallCursor(start);
        return;
      }

      const snappedEnd = snapToEndpoints(snapPoint(wallStart, worldPoint));
      const length = Math.hypot(snappedEnd.x - wallStart.x, snappedEnd.y - wallStart.y);
      if (length >= 0.1) {
        addWall({
          x1: wallStart.x,
          y1: wallStart.y,
          x2: snappedEnd.x,
          y2: snappedEnd.y,
          label: `Wall ${walls.length + 1}`,
        });
      }
      setWallStart(null);
      setWallCursor(null);
      return;
    }

    if (!calibActive || !backgroundPlan) return;

    const localX = point.xPx;
    const localY = point.yPx;

    const newPoints = [...calibPoints, { x: localX, y: localY }];
    setCalibPoints(newPoints);

    if (newPoints.length >= 2) {
      const updatedPlan = { ...backgroundPlan };

      if (calibAxis === 'x') {
        const dx = Math.abs(newPoints[1].x - newPoints[0].x);
        if (dx > 1) {
          const dxImage = dx / (backgroundPlan.scaleX * ppm);
          updatedPlan.scaleX = calibDistM / dxImage;
          if (calibScaleLocked) updatedPlan.scaleY = updatedPlan.scaleX;
        }
      } else {
        const dy = Math.abs(newPoints[1].y - newPoints[0].y);
        if (dy > 1) {
          const dyImage = dy / (backgroundPlan.scaleY * ppm);
          updatedPlan.scaleY = calibDistM / dyImage;
          if (calibScaleLocked) updatedPlan.scaleX = updatedPlan.scaleY;
        }
      }

      setBackgroundPlan(updatedPlan);

      // Auto-resize venue to encompass full floor plan
      if (calibAutoResize) {
        const imgW = updatedPlan.widthPx * updatedPlan.scaleX + updatedPlan.offsetX;
        const imgH = updatedPlan.heightPx * updatedPlan.scaleY + updatedPlan.offsetY;
        if (imgW > venue.widthM || imgH > venue.heightM) {
          setVenue({
            ...venue,
            widthM: Math.max(venue.widthM, Math.ceil(imgW)),
            heightM: Math.max(venue.heightM, Math.ceil(imgH)),
          });
        }
      }

      setCalibActive(false);
      setCalibPoints([]);
      setCalibCursor(null);
      window.dispatchEvent(new CustomEvent('multicam-calibrate-done'));
    }
  }, [addWall, backgroundPlan, calibActive, calibAutoResize, calibAxis, calibDistM, calibPoints, calibScaleLocked, drawingWall, getPointerWorldPoint, ppm, setBackgroundPlan, setVenue, snapPoint, snapToEndpoints, venue, wallStart, walls.length]);

  const handleStageMouseMove = useCallback(() => {
    const point = getPointerWorldPoint();
    if (!point) return;
    if (drawingWall && wallStart) {
      setWallCursor(snapToEndpoints(snapPoint(wallStart, { x: point.xPx / ppm, y: point.yPx / ppm })));
    }
    if (calibActive && calibPoints.length === 1) {
      setCalibCursor({ x: point.xPx, y: point.yPx });
    }
  }, [calibActive, calibPoints.length, drawingWall, getPointerWorldPoint, ppm, snapPoint, snapToEndpoints, wallStart]);

  const handleWallEndpointDragMove = useCallback((wall: Wall, end: 'start' | 'end', e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const rawPoint = { x: node.x() / ppm, y: node.y() / ppm };
    const anchor = end === 'start' ? { x: wall.x2, y: wall.y2 } : { x: wall.x1, y: wall.y1 };
    // Angle-snap (shift) first, then magnet to other walls' endpoints (issue #40).
    const p = snapToEndpoints(snapPoint(anchor, rawPoint), wall.id);

    // Endpoints that were coincident with the one being dragged move together,
    // so two joined walls keep their shared corner (issue #40).
    const orig = end === 'start' ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
    if (wallSnap) {
      for (const other of walls) {
        if (other.id === wall.id) continue;
        if (Math.hypot(other.x1 - orig.x, other.y1 - orig.y) < 0.05) updateWall(other.id, { x1: p.x, y1: p.y });
        if (Math.hypot(other.x2 - orig.x, other.y2 - orig.y) < 0.05) updateWall(other.id, { x2: p.x, y2: p.y });
      }
    }

    updateWall(wall.id, end === 'start' ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y });
    node.position({ x: p.x * ppm, y: p.y * ppm });
  }, [ppm, snapPoint, snapToEndpoints, updateWall, wallSnap, walls]);

  const handleCamDragEnd = useCallback(
    (cam: VenueCamera, e: Konva.KonvaEventObject<DragEvent>) => {
      // Nutzer-Meldung 2026-09-07: „wenn man im 2D-Plan ne Kamera schwenkt per
      // Mausbewegung springt die Kamera an ne falsche Stelle." Das Ende des
      // Schwenk-Griff-Drags STEIGT hierher auf (Konva feuert `dragend` mit
      // bubble=true), und `e.target` war dann der Griff — dessen Koordinaten
      // sind gruppen-lokal, also rund dreissig Pixel. Durch `ppm` geteilt
      // ergab das ein paar Zentimeter, und die Kamera sprang in die Ecke.
      // Begruendung und Gegenprobe: `utils/venueDrag.ts`.
      if (!dragIsOwn(e)) return;
      // The drag operates on the *effective* (track-offset-adjusted) marker.
      // Subtract the offset back out so cam.x/cam.y stores the parked position.
      const drop = dropToParked({
        dropX: e.target.x() / ppm,
        dropY: e.target.y() / ppm,
        rigYawDeg: rigYaw(cam),
        trackOffset: cam.trackOffset ?? 0,
        venueWidthM: venue.widthM,
        venueHeightM: venue.heightM,
      });
      // Snap the visual back to the (possibly clamped) effective position.
      e.target.position({ x: drop.markerX * ppm, y: drop.markerY * ppm });
      moveCamera(cam.id, drop.parkedX, drop.parkedY);
    },
    [moveCamera, ppm, venue],
  );

  // Pan-rotation handle (issue #36): orbit a handle around the camera marker to
  // aim its viewing direction directly in the 2D canvas. Hold Shift to snap to
  // 15° increments. The handle lives at a fixed pixel radius from the marker and
  // its local (x,y) — relative to the camera Group origin — gives the pan angle.
  const PAN_HANDLE_RADIUS = 30;
  const handlePanRotate = useCallback(
    (cam: VenueCamera, e: Konva.KonvaEventObject<DragEvent>) => {
      const nx = e.target.x();
      const ny = e.target.y();
      let deg = (Math.atan2(ny, nx) * 180) / Math.PI;
      if (shiftHeld.current) deg = Math.round(deg / 15) * 15;
      // Keep the handle pinned to its orbit radius along the new angle.
      const rad = (deg * Math.PI) / 180;
      e.target.position({ x: Math.cos(rad) * PAN_HANDLE_RADIUS, y: Math.sin(rad) * PAN_HANDLE_RADIUS });
      updateCamera(cam.id, { pan: deg });
    },
    [updateCamera],
  );

  // Rig-Ausricht-Griff: dreht Schiene/Chassis/Beinstellung, ohne den Pan der
  // Kamera anzufassen. Shift rastet auf 15°.
  const handleRigRotate = useCallback(
    (cam: VenueCamera, e: Konva.KonvaEventObject<DragEvent>) => {
      let deg = (Math.atan2(e.target.y(), e.target.x()) * 180) / Math.PI;
      if (shiftHeld.current) deg = Math.round(deg / 15) * 15;
      const rad = (deg * Math.PI) / 180;
      e.target.position({ x: Math.cos(rad) * RIG_HANDLE_RADIUS, y: Math.sin(rad) * RIG_HANDLE_RADIUS });
      updateCamera(cam.id, { rigRotation: deg });
    },
    [updateCamera],
  );

  const handleStageDragEnd = useCallback(
    (stageId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const stage = venue.stages.find((s) => s.id === stageId);
      if (!stage) return;
      const maxX = Math.max(0, venue.widthM - stage.width);
      const maxY = Math.max(0, venue.heightM - stage.height);
      const newX = Math.max(0, Math.min(maxX, e.target.x() / ppm));
      const newY = Math.max(0, Math.min(maxY, e.target.y() / ppm));
      e.target.position({ x: newX * ppm, y: newY * ppm });
      updateStage(stageId, { x: newX, y: newY });
    },
    [updateStage, ppm, venue],
  );

  const handlePersonDragEnd = useCallback(
    (personId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const newX = Math.max(0, Math.min(venue.widthM, e.target.x() / ppm));
      const newY = Math.max(0, Math.min(venue.heightM, e.target.y() / ppm));
      e.target.position({ x: newX * ppm, y: newY * ppm });
      updatePerson(personId, { x: newX, y: newY });
    },
    [updatePerson, ppm, venue],
  );

  // Keep the Transformer attached to the currently-selected (unlocked) stage.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const target = selectedStageId ? venue.stages.find((s) => s.id === selectedStageId) : null;
    const node = selectedStageId ? stageNodeRefs.current[selectedStageId] : null;
    if (node && target && !target.locked && !lockStages) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedStageId, venue.stages, drawingWall, calibActive, lockStages]);

  // Commit a Transformer resize: convert the scaled group back into metric
  // width/height (+ x/y, since top/left anchors move the origin) and reset the
  // scale so the next drag starts clean. Clamps to a 0.5 m minimum.
  const handleStageTransformEnd = useCallback(
    (stageId: string, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const src = venue.stages.find((s) => s.id === stageId);
      if (!src) return;
      const newWidth = Math.max(0.5, src.width * scaleX);
      const newHeight = Math.max(0.5, src.height * scaleY);
      const newX = Math.max(0, node.x() / ppm);
      const newY = Math.max(0, node.y() / ppm);
      node.position({ x: newX * ppm, y: newY * ppm });
      updateStage(stageId, {
        x: newX,
        y: newY,
        width: Math.round(newWidth * 10) / 10,
        height: Math.round(newHeight * 10) / 10,
      });
    },
    [ppm, updateStage, venue.stages],
  );

  // Open the right-click context menu for an object, positioned at the cursor
  // relative to the canvas container (issue #38).
  const openContextMenu = useCallback(
    (kind: MenuTarget['kind'], id: string, locked: boolean, e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      const rect = containerRef.current?.getBoundingClientRect();
      setMenu({
        kind,
        id,
        locked,
        x: e.evt.clientX - (rect?.left ?? 0),
        y: e.evt.clientY - (rect?.top ?? 0),
      });
    },
    [],
  );

  // Dismiss the context menu on any outside interaction / Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('wheel', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('wheel', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const handleMenuAction = useCallback((action: 'duplicate' | 'lock' | 'delete') => {
    if (!menu) return;
    const { kind, id, locked } = menu;
    if (action === 'delete') {
      if (kind === 'camera') removeCamera(id);
      else if (kind === 'person') removePerson(id);
      else if (kind === 'wall') removeWall(id);
      else { removeStage(id); if (selectedStageId === id) setSelectedStageId(null); }
    } else if (action === 'lock') {
      if (kind === 'camera') updateCamera(id, { locked: !locked });
      else if (kind === 'person') updatePerson(id, { locked: !locked });
      else { updateStage(id, { locked: !locked }); if (!locked && selectedStageId === id) setSelectedStageId(null); }
    } else {
      // duplicate
      if (kind === 'camera') duplicateCamera(id);
      else if (kind === 'person') duplicatePerson(id);
      else {
        const src = venue.stages.find((s) => s.id === id);
        if (src) addStage({ x: Math.min(venue.widthM - src.width, src.x + 0.5), y: Math.min(venue.heightM - src.height, src.y + 0.5), width: src.width, height: src.height, label: `${src.label} copy` });
      }
    }
    setMenu(null);
  }, [menu, removeCamera, removePerson, removeStage, removeWall, updateCamera, updatePerson, updateStage, duplicateCamera, duplicatePerson, addStage, venue.stages, venue.widthM, venue.heightM, selectedStageId]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: P.grund, borderRadius: 8, overflow: 'hidden', position: 'relative' }}
      onDragOver={planAblageHandler.onDragOver}
      onDragLeave={(e) => {
        // dragleave feuert auch beim Wechsel auf das Konva-Canvas darunter;
        // nur das echte Verlassen beendet die Hervorhebung.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        planAblageHandler.onDragLeave();
      }}
      onDrop={planAblageHandler.onDrop}
    >
      {planZiehtDarueber && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-bc-accent bg-bc-accent/10 pointer-events-none"
        >
          <span className="bg-bc-panel text-bc-text-bright text-sm px-3 py-2 border border-bc-accent">
            {t('venue.planDrop.release', 'Release to load the image or PDF as the floor plan')}
          </span>
        </div>
      )}
      {/* Zoom indicator */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, background: P.chip, padding: '4px 10px', borderRadius: 4, fontSize: 11, color: P.chipText, pointerEvents: 'none', backdropFilter: 'blur(4px)' }}>
        {(zoom * 100).toFixed(0)}%
      </div>
      <Stage
        ref={stageRef}
        width={containerSize.w}
        height={containerSize.h}
        scaleX={zoom}
        scaleY={zoom}
        x={stagePos.x}
        y={stagePos.y}
        draggable={!calibActive && !drawingWall}
        onDragEnd={(e) => {
          // Dieselbe Regel wie bei der Kamera-Marke, nur hier schon immer von
          // Hand geschrieben: ein Drag-Handler rechnet nur mit seinem eigenen
          // Knoten. Ueber `dragIsOwn` steht sie jetzt an einer Stelle.
          if (!dragIsOwn(e)) return;
          setStagePos({ x: e.target.x(), y: e.target.y() });
        }}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseMove={handleStageMouseMove}
        style={{ cursor: calibActive || drawingWall ? 'crosshair' : 'grab' }}
      >
      {/* ── Layer 1: Static background (venue, image, grid, scale bar) ── */}
      <Layer listening={false}>
        <Rect x={0} y={0} width={W} height={H} fill={P.blatt} />
        {bgImage && backgroundPlan && (
          <KImage
            image={bgImage}
            x={(backgroundPlan.offsetX) * ppm}
            y={(backgroundPlan.offsetY) * ppm}
            width={backgroundPlan.widthPx * backgroundPlan.scaleX * ppm}
            height={backgroundPlan.heightPx * backgroundPlan.scaleY * ppm}
            opacity={backgroundPlan.opacity}
          />
        )}
        {Array.from({ length: Math.floor(venue.widthM) + 1 }).map((_, i) => (
          <Group key={`vg-${i}`}>
            <Line points={[i * ppm, 0, i * ppm, H]} stroke={P.raster} strokeWidth={1} />
            <Text x={i * ppm + 2} y={2} text={`${i}m`} fontSize={9} fill={P.rasterText} />
          </Group>
        ))}
        {Array.from({ length: Math.floor(venue.heightM) + 1 }).map((_, i) => (
          <Group key={`hg-${i}`}>
            <Line points={[0, i * ppm, W, i * ppm]} stroke={P.raster} strokeWidth={1} />
            <Text x={2} y={i * ppm + 2} text={`${i}m`} fontSize={9} fill={P.rasterText} />
          </Group>
        ))}
        <Rect x={0} y={0} width={W} height={H} stroke={P.rahmen} strokeWidth={2} />
        {/* Scale bar */}
        <Line points={[10, H - 20, 10 + 5 * ppm, H - 20]} stroke={P.massstab} strokeWidth={2} />
        <Line points={[10, H - 25, 10, H - 15]} stroke={P.massstab} strokeWidth={2} />
        <Line points={[10 + 5 * ppm, H - 25, 10 + 5 * ppm, H - 15]} stroke={P.massstab} strokeWidth={2} />
        <Text x={10} y={H - 38} text="5m" fontSize={11} fill={P.massstab} />
      </Layer>

      {/* ── Layer 2: Interactive objects (FOV, stages, walls, persons, cameras) ── */}
      <Layer>
        {/* FOV cones (non-interactive, rendered first = behind everything) */}
        {cameras.map((cam) => {
          if (!showAllFov && cam.id !== selectedCameraId) return null;
          const camDef = getCameraById(cam.cameraId, useStore.getState().customCameras);
          const lensDef = getLensById(cam.lensId, useStore.getState().customLenses);
          if (!camDef || !lensDef) return null;

          const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
          const fov = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1);
          const fovMin = computeFov(sensor, lensDef.focalLengthMax, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1);
          const fovMax = computeFov(sensor, lensDef.focalLengthMin, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1);
          const range = cam.focusDistance * ppm;
          const isSelected = cam.id === selectedCameraId;

          /*
            Das Schaerfeband (#141).

            Die Zahlen gab es laengst — Nahgrenze, Ferngrenze, hyperfokale
            Distanz standen in Seitenleiste, Vorschau und Export. Die Frage
            beim Planen einer Kameraposition ist aber raeumlich: steht die
            Band im Schaerfebereich von Kamera 3? Sie aus einem Zahlenpaar in
            den Grundriss zu uebertragen ist genau der Schritt, den ein Plan
            abnehmen soll.

            Gezeichnet als Ring im selben Winkel wie der Sichtkegel. Er reicht
            bewusst UEBER den Kegel hinaus: der Kegel endet am Fokusabstand,
            weil er die Bildbreite dort zeigt — die Schaerfe tut das nicht.

            Begrenzt auf die dargestellte Flaeche, sonst zeichnet eine
            unendliche Ferngrenze nichts (Radius Infinity ergibt in Konva
            keine Form, sondern Stille — und zwar genau dann, wenn der
            Schaerfebereich am groessten ist).
          */
          const band = showDof
            ? dofBand(sensor, cam.focalLength, cam.aperture, cam.focusDistance,
                      cam.extenderActive ? 2 : 1, Math.max(venue.widthM, venue.heightM))
            : null;

          return (
            <React.Fragment key={`fov-group-${cam.id}`}>
              {isSelected && lensDef.focalLengthMin !== lensDef.focalLengthMax && (
                <Wedge
                  x={cam.x * ppm} y={cam.y * ppm} radius={range}
                  angle={fovMax.horizontalDeg} rotation={cam.pan - fovMax.horizontalDeg / 2}
                  fill={'#22c55e10'} stroke={'#22c55e55'} strokeWidth={1} dash={[4, 4]} listening={false}
                />
              )}
              {isSelected && lensDef.focalLengthMin !== lensDef.focalLengthMax && (
                <Wedge
                  x={cam.x * ppm} y={cam.y * ppm} radius={range}
                  angle={fovMin.horizontalDeg} rotation={cam.pan - fovMin.horizontalDeg / 2}
                  fill={'#ef444410'} stroke={'#ef444455'} strokeWidth={1} dash={[4, 4]} listening={false}
                />
              )}
              <Wedge
                x={cam.x * ppm} y={cam.y * ppm} radius={range}
                angle={fov.horizontalDeg} rotation={cam.pan - fov.horizontalDeg / 2}
                fill={cam.color + (isSelected ? '30' : '15')}
                stroke={cam.color + (isSelected ? 'cc' : '66')}
                strokeWidth={isSelected ? 2 : 1} listening={false}
              />
              {band && (
                <Arc
                  x={cam.x * ppm} y={cam.y * ppm}
                  innerRadius={band.vonM * ppm} outerRadius={band.bisM * ppm}
                  angle={fov.horizontalDeg} rotation={cam.pan - fov.horizontalDeg / 2}
                  fill={cam.color + (isSelected ? '55' : '2a')}
                  stroke={cam.color + (isSelected ? 'ff' : '88')}
                  // Gestrichelt heisst: das Band hoert hier nicht auf, die
                  // Zeichenflaeche tut es. „Geht weiter" und „endet hier"
                  // muessen unterscheidbar bleiben.
                  dash={band.gekuerzt ? [6, 4] : undefined}
                  strokeWidth={isSelected ? 2 : 1} listening={false}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Stages — click to select (shows resize handles), drag to move,
            right-click for the context menu (issue #42 / #38). */}
        {venue.stages.map((s) => (
          <Group
            key={s.id}
            ref={(node) => { if (node) stageNodeRefs.current[s.id] = node; else delete stageNodeRefs.current[s.id]; }}
            x={s.x * ppm}
            y={s.y * ppm}
            draggable={!drawingWall && !s.locked && !lockStages}
            onDragEnd={(e) => handleStageDragEnd(s.id, e)}
            onClick={(e) => { if (!drawingWall && !calibActive) { e.cancelBubble = true; setSelectedStageId(s.locked || lockStages ? null : s.id); } }}
            onTap={(e) => { if (!drawingWall && !calibActive) { e.cancelBubble = true; setSelectedStageId(s.locked || lockStages ? null : s.id); } }}
            onContextMenu={(e) => openContextMenu('stage', s.id, !!s.locked, e)}
            onTransformEnd={(e) => handleStageTransformEnd(s.id, e)}
          >
            {/* Farbe wie in 3D/Preview, damit dieselbe Buehne ueberall gleich
                aussieht. Die Fuellung bleibt bewusst duenn (nicht `s.opacity`)
                — im Grundriss soll der Hintergrundplan durchscheinen. */}
            <Rect
              width={s.width * ppm}
              height={s.height * ppm}
              fill={stageColor(s) + alphaSuffix(0.15)}
              stroke={selectedStageId === s.id ? shadeHex(stageColor(s), 1.3) : stageColor(s)}
              strokeWidth={selectedStageId === s.id ? 3 : 2}
              cornerRadius={4}
            />
            <Text x={4} y={4} text={s.locked ? `${s.label} 🔒` : s.label} fontSize={12} fill={stageColor(s)} fontStyle="bold" />
            {/* Podesthoehe mit in die Maßzeile, sonst sieht man im Grundriss
                nicht, dass die Buehne erhoeht ist (#73). */}
            <Text
              x={4}
              y={s.height * ppm - 16}
              text={`${s.width}×${s.height}m${stageTopZ(s) > 0 ? ` · ${stageTopZ(s).toFixed(2)}m hoch` : ''}`}
              fontSize={9}
              fill={stageColor(s) + '88'}
            />
          </Group>
        ))}
        {/* Resize handles for the selected stage */}
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          keepRatio={false}
          ignoreStroke
          anchorSize={8}
          anchorStroke="#60a5fa"
          anchorFill="#132040"
          borderStroke="#60a5fa"
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
        />

        {/* Walls */}
        {walls.map((w) => (
          <React.Fragment key={`wall-${w.id}`}>
            <Line
              points={[w.x1 * ppm, w.y1 * ppm, w.x2 * ppm, w.y2 * ppm]}
              stroke="#9ca3af" strokeWidth={3} hitStrokeWidth={10}
              draggable={!drawingWall && !lockWalls}
              onContextMenu={(e) => { e.evt.preventDefault(); if (!lockWalls) openContextMenu('wall', w.id, false, e); }}
              onDragEnd={(e) => {
                const dx = e.target.x() / ppm;
                const dy = e.target.y() / ppm;
                e.target.position({ x: 0, y: 0 });
                updateWall(w.id, { x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy });
              }}
            />
            <Circle x={w.x1 * ppm} y={w.y1 * ppm} radius={5} fill="#132040" stroke="#f59e0b" strokeWidth={2} draggable={!drawingWall && !lockWalls} onDragMove={(e) => handleWallEndpointDragMove(w, 'start', e)} />
            <Circle x={w.x2 * ppm} y={w.y2 * ppm} radius={5} fill="#132040" stroke="#f59e0b" strokeWidth={2} draggable={!drawingWall && !lockWalls} onDragMove={(e) => handleWallEndpointDragMove(w, 'end', e)} />
            <Text x={((w.x1 + w.x2) / 2) * ppm - 20} y={((w.y1 + w.y2) / 2) * ppm - 14} text={w.label} fontSize={9} fill="#9ca3af" align="center" width={40} />
          </React.Fragment>
        ))}
        {drawingWall && wallStart && wallCursor && (
          <>
            <Line points={[wallStart.x * ppm, wallStart.y * ppm, wallCursor.x * ppm, wallCursor.y * ppm]} stroke="#f59e0b" strokeWidth={2} dash={[6, 4]} listening={false} />
            <Circle x={wallStart.x * ppm} y={wallStart.y * ppm} radius={4} fill="#f59e0b" listening={false} />
          </>
        )}

        {/* Persons */}
        {persons.map((p) => {
          const type = p.objectType ?? 'person';
          const col = p.color ?? (
            type === 'drums' ? '#ef4444' :
            type === 'keys' ? '#8b5cf6' :
            type === 'person-guitar' ? '#f97316' :
            type === 'sitting-person' ? '#38bdf8' :
            type === 'mic-stand' ? '#9ca3af' :
            type === 'chair' ? '#a16207' :
            type === 'table' ? '#a16207' :
            type === 'lectern' ? '#7c3aed' :
            type === 'schneetiger' ? '#e0f2fe' :
            '#f59e0b'
          );
          const footW = Math.max(6, p.width * ppm);
          return (
            <Group key={p.id} x={p.x * ppm} y={p.y * ppm} draggable={!p.locked && !lockPersons} onDragEnd={(e) => handlePersonDragEnd(p.id, e)} onContextMenu={(e) => { e.evt.preventDefault(); if (!lockPersons) openContextMenu('person', p.id, !!p.locked, e); }}>
              {type === 'table' || type === 'drums' || type === 'keys' ? (
                <Rect x={-footW / 2} y={-footW / 4} width={footW} height={footW / 2} fill={col} opacity={0.55} stroke={col} strokeWidth={1} cornerRadius={2} />
              ) : type === 'schneetiger' ? (
                <Rect x={-footW / 2} y={-footW / 4} width={footW} height={footW / 2} fill={col} opacity={0.85} stroke="#1f2937" strokeWidth={1} cornerRadius={footW / 4} />
              ) : (
                <Circle radius={Math.max(5, footW / 3)} fill={col} stroke="#fff" strokeWidth={1} opacity={0.85} />
              )}
              <Text x={-26} y={8} text={`${p.locked ? '🔒 ' : ''}${p.label} (${p.height}m)`} fontSize={9} fill={col} align="center" width={52} />
            </Group>
          );
        })}

        {/* Rig in der Draufsicht: Standflaeche, Schiene mit Sektionsstoeßen,
            Ausleger und Fahrweg — aus den echten Maßen des gewaehlten Rigs
            (utils/rigGeometry). Vor der Kamera-Marke gezeichnet, damit die
            Marke oben liegt. */}
        {cameras.map((cam) => {
          if (!showAllFov && cam.id !== selectedCameraId) return null;
          return (
            <RigOverlay
              key={`rig-${cam.id}`}
              cam={cam}
              ppm={ppm}
              isSelected={cam.id === selectedCameraId}
              onRotate={
                cam.id === selectedCameraId && !cam.locked && !lockCameras && !drawingWall
                  ? handleRigRotate
                  : undefined
              }
            />
          );
        })}

        {/* Camera icons (on top). Position uses effectiveCameraPos so the
            live-track slider (jib swing / dolly travel) visibly moves the
            marker along the track line. */}
        {cameras.map((cam) => {
          const isSelected = cam.id === selectedCameraId;
          const pos = effectiveCameraPos(cam);
          return (
            <Group key={`cam-${cam.id}`} x={pos.x * ppm} y={pos.y * ppm} draggable={!drawingWall && !cam.locked && !lockCameras} onDragEnd={(e) => handleCamDragEnd(cam, e)} onClick={() => selectCamera(cam.id)} onTap={() => selectCamera(cam.id)} onContextMenu={(e) => { e.evt.preventDefault(); if (!lockCameras) openContextMenu('camera', cam.id, !!cam.locked, e); }}>
              <Circle radius={isSelected ? 10 : 8} fill={cam.color} stroke={isSelected ? '#fff' : cam.color} strokeWidth={isSelected ? 3 : 1} shadowColor={cam.color} shadowBlur={isSelected ? 12 : 0} />
              <Line points={[0, 0, 14 * Math.cos((cam.pan * Math.PI) / 180), 14 * Math.sin((cam.pan * Math.PI) / 180)]} stroke={cam.color} strokeWidth={2} />
              {/* Pan-rotation handle — drag to aim the camera (issue #36).
                  Hidden while the camera is locked. */}
              {isSelected && !cam.locked && !lockCameras && (
                <>
                  <Line
                    points={[0, 0, PAN_HANDLE_RADIUS * Math.cos((cam.pan * Math.PI) / 180), PAN_HANDLE_RADIUS * Math.sin((cam.pan * Math.PI) / 180)]}
                    stroke="#ffffff" strokeWidth={1} dash={[3, 3]} opacity={0.45} listening={false}
                  />
                  <Circle
                    x={PAN_HANDLE_RADIUS * Math.cos((cam.pan * Math.PI) / 180)}
                    y={PAN_HANDLE_RADIUS * Math.sin((cam.pan * Math.PI) / 180)}
                    radius={6}
                    fill="#132040" stroke="#ffffff" strokeWidth={2}
                    draggable
                    onDragStart={(e) => { e.cancelBubble = true; }}
                    onDragMove={(e) => { e.cancelBubble = true; handlePanRotate(cam, e); }}
                    onDragEnd={(e) => { e.cancelBubble = true; }}
                    onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'crosshair'; }}
                    onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'grab'; }}
                  />
                </>
              )}
              <Text x={-16} y={12} text={cam.locked ? `${cam.label} 🔒` : cam.label} fontSize={11} fill="#fff" fontStyle="bold" align="center" width={32} />
            </Group>
          );
        })}
      </Layer>

      {/* ── Read-only foreign lighting (Lampen aus dem Light-Planner via .avplan) ── */}
      {foreignFixtures.length > 0 && (
        <Layer listening={false} opacity={0.85}>
          {foreignFixtures.map((f) => {
            const color = cctToColor(f.colorTemp);
            const hasAim = f.aimX !== undefined && f.aimY !== undefined;
            return (
              <Group key={`fx-${f.id}`} x={f.x * ppm} y={f.y * ppm}>
                {hasAim && (
                  <Line
                    points={[0, 0, (f.aimX! - f.x) * ppm, (f.aimY! - f.y) * ppm]}
                    stroke={color}
                    strokeWidth={1}
                    dash={[4, 4]}
                    opacity={0.5}
                  />
                )}
                {/* Lampen-Marker: gefuelltes Quadrat-auf-Spitze (Scheinwerfer-Symbol) */}
                <Rect
                  width={8} height={8}
                  offsetX={4} offsetY={4}
                  rotation={45}
                  fill={color}
                  stroke="#132040"
                  strokeWidth={1}
                  opacity={Math.max(0.35, f.dimming ?? 1)}
                />
                <Circle radius={1.6} fill="#132040" />
                {f.name && (
                  <Text x={7} y={-5} text={f.name} fontSize={9} fill={color} listening={false} />
                )}
              </Group>
            );
          })}
        </Layer>
      )}

      {/* ── Layer 3: Calibration overlay (conditional) ── */}
      {calibActive && (
        <Layer>
          <Rect x={0} y={0} width={W} height={30} fill="#000000" opacity={0.7} listening={false} />
          <Text x={W / 2 - 140} y={8} text={calibPoints.length === 0 ? `Click first point (${calibAxis.toUpperCase()} axis, ${calibDistM}m)` : `Click second point (${calibAxis.toUpperCase()} axis)`} fontSize={14} fill="#22c55e" fontStyle="bold" listening={false} />
          {calibPoints.map((p, i) => (
            <Group key={`cp-${i}`}>
              <Circle x={p.x} y={p.y} radius={6} fill="#22c55e" stroke="#fff" strokeWidth={2} listening={false} />
              <Text x={p.x + 8} y={p.y - 6} text={`P${i + 1}`} fontSize={11} fill="#22c55e" fontStyle="bold" listening={false} />
            </Group>
          ))}
          {calibPoints.length === 1 && calibCursor && (
            <Line
              points={
                calibAxis === 'x'
                  ? [calibPoints[0].x, calibPoints[0].y, calibCursor.x, calibPoints[0].y]
                  : [calibPoints[0].x, calibPoints[0].y, calibPoints[0].x, calibCursor.y]
              }
              stroke="#22c55e"
              strokeWidth={2}
              dash={[6, 4]}
              listening={false}
            />
          )}
        </Layer>
      )}
    </Stage>

    {/* Right-click context menu (issue #38) */}
    {menu && (
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: Math.min(menu.x, containerSize.w - 170),
          top: Math.min(menu.y, containerSize.h - 110),
          zIndex: 50,
          minWidth: 150,
          background: 'rgba(15,23,42,0.97)',
          border: '1px solid #334155',
          borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          padding: 4,
          fontSize: 12,
          color: '#e2e8f0',
          backdropFilter: 'blur(6px)',
        }}
      >
        {menu.kind !== 'wall' && (
          <>
            <button type="button" onClick={() => handleMenuAction('duplicate')} style={ctxItemStyle}>
              <FiCopy size={13} /> {t('venue.duplicate', 'Duplicate')}
            </button>
            <button type="button" onClick={() => handleMenuAction('lock')} style={ctxItemStyle}>
              {menu.locked ? <FiUnlock size={13} /> : <FiLock size={13} />} {menu.locked ? t('venue.unlockPosition', 'Unlock position') : t('venue.lockPosition', 'Lock position')}
            </button>
            <div style={{ height: 1, background: '#334155', margin: '4px 6px' }} />
          </>
        )}
        <button type="button" onClick={() => handleMenuAction('delete')} style={{ ...ctxItemStyle, color: '#f87171' }}>
          <FiTrash2 size={13} /> {format(t('venue.delete', 'Delete {kind}'), { kind: menu.kind })}
        </button>
      </div>
    )}
    </div>
  );
}
