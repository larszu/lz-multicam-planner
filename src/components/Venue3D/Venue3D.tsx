import React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Text, PerspectiveCamera, Html, TransformControls, Billboard } from '@react-three/drei';
import { useStore } from '../../store/useStore';
import { getCameraById, getEffectiveSensor } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov } from '../../utils/fov';
import { effectiveCameraPos, rigYaw } from '../../utils/camera';
import RigStructure from './RigStructure';
import * as THREE from 'three';
import { getExportRegistry } from '../../store/exportRegistry';
import { FingerNavigation, umsehen } from '../../lib/fingerNavigation';
import type { FramingState } from '../../store/exportRegistry';
import { Suspense, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import LoadingIndicator from '../Layout/LoadingIndicator';
import type { BackgroundPlan, Stage } from '../../types';
import { FLAT_STAGE_M, groundHeightAt, stageColor, stageOpacity, stageTopZ } from '../../utils/stageBody';
import { FiLock, FiUnlock } from 'react-icons/fi';
import { VIEW3D_FOV_DEG, defaultCameraPos, defaultPitchRad } from '../../utils/view3d';
import { useTranslation } from '../../i18n';
import { easeOut, povFraming, shortestAngleDelta, topFraming, type Framing } from '../../utils/view3dScene';
import { useSchmal } from '../../lib/useSchmal';
import { useView3DPrefs } from './view3dPrefs';
import { PLANUNG_JE_THEMA, PLANUNGS_BODEN } from './planungsLook';
import { useIstHell } from '../../lib/useIstHell';
import { Atmosphere, CoverageWedge, ScenePipeline } from './ShowScene';
import { stufenWerte, type Stufe, type StufenWerte, type Tiefenschaerfe } from '../../avplan/scene3d';
import { sitzblockNormal } from '../../avplan/floorplan';
import { Figur } from './Figuren';
import { Kulisse } from './Kulisse';
import { useKulissenDaten } from './kulissenDaten';
import { LABEL_FONT } from './labelFont';
import CameraListPanel, { type CameraRow } from './CameraListPanel';
import { cameraRowDetail } from './cameraRow';

/** Fahrt der Blickkamera (Ansichts-Knoepfe, Klick in der Kameraliste). */
export const FLY_EVENT = 'multicam-3d-fly';
export interface FlyDetail {
  /** Fehlt `framing`, wird nur der Bildwinkel zurueckgefahren. */
  framing?: Framing;
  fovDeg?: number;
  /** Fuer den Blick durch eine Kamera: H-FOV, aus dem das Bildfenster den V-FOV rechnet. */
  povHFovDeg?: number;
  /** Draufsicht auf eine Halle dieser Groesse — gerahmt mit dem Seitenverhaeltnis der Ansicht. */
  topOf?: { widthM: number; depthM: number };
  durationMs?: number;
}


/* ── Draggable group that moves on the XZ ground plane ── */
function DraggableOnFloor({ children, x, z, onDragEnd, onClick }: {
  children: React.ReactNode;
  x: number; z: number;
  onDragEnd?: (newX: number, newZ: number) => void;
  onClick?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const isDragging = useRef(false);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  const offset = useRef(new THREE.Vector3());

  const handlePointerDown = useCallback((e: any) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    isDragging.current = true;
    // Calculate offset between pointer hit and group position
    const raycaster = e.ray ? new THREE.Raycaster(e.ray.origin, e.ray.direction) : null;
    if (raycaster) {
      raycaster.ray.intersectPlane(floorPlane, intersection);
      offset.current.set(intersection.x - x, 0, intersection.z - z);
    }
  }, [floorPlane, x, z, intersection]);

  const handlePointerMove = useCallback((e: any) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    const raycaster = e.ray ? new THREE.Raycaster(e.ray.origin, e.ray.direction) : null;
    if (raycaster && groupRef.current) {
      raycaster.ray.intersectPlane(floorPlane, intersection);
      groupRef.current.position.x = intersection.x - offset.current.x;
      groupRef.current.position.z = intersection.z - offset.current.z;
    }
  }, [floorPlane, intersection]);

  const handlePointerUp = useCallback((e: any) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (groupRef.current && onDragEnd) {
      onDragEnd(groupRef.current.position.x, groupRef.current.position.z);
    }
  }, [onDragEnd]);

  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    onClick?.();
  }, [onClick]);

  // Reset position when props change (external update)
  useEffect(() => {
    if (groupRef.current && !isDragging.current) {
      groupRef.current.position.x = x;
      groupRef.current.position.z = z;
    }
  }, [x, z]);

  return (
    <group
      ref={groupRef}
      position={[x, 0, z]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {children}
    </group>
  );
}

/* ── Floor grid with visible metre labels ── */
function FloorLabels({ widthM, heightM }: { widthM: number; heightM: number }) {
  // React 19 moved JSX out of the global namespace — the equivalent type now
  // lives at React.JSX.Element.
  const labels: React.JSX.Element[] = [];
  // X-axis labels every 5m
  for (let x = 0; x <= widthM; x += 5) {
    labels.push(
      <Text key={`xl-${x}`} font={LABEL_FONT} position={[x, 0.02, -0.4]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.35} color="#6b7280" anchorX="center">
        {x}m
      </Text>,
    );
  }
  // Z-axis labels every 5m
  for (let z = 0; z <= heightM; z += 5) {
    labels.push(
      <Text key={`zl-${z}`} font={LABEL_FONT} position={[-0.5, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.35} color="#6b7280" anchorX="right">
        {z}m
      </Text>,
    );
  }
  return <>{labels}</>;
}

/* ── Venue boundary walls (wireframe) ── */
function VenueWalls({ widthM, heightM }: { widthM: number; heightM: number }) {
  const points = useMemo(() => {
    const h = 4; // wall height
    const pts: THREE.Vector3[] = [];
    // bottom outline
    pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(widthM, 0, 0));
    pts.push(new THREE.Vector3(widthM, 0, 0), new THREE.Vector3(widthM, 0, heightM));
    pts.push(new THREE.Vector3(widthM, 0, heightM), new THREE.Vector3(0, 0, heightM));
    pts.push(new THREE.Vector3(0, 0, heightM), new THREE.Vector3(0, 0, 0));
    // verticals
    for (const [x, z] of [[0, 0], [widthM, 0], [widthM, heightM], [0, heightM]]) {
      pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, h, z));
    }
    // top outline
    pts.push(new THREE.Vector3(0, h, 0), new THREE.Vector3(widthM, h, 0));
    pts.push(new THREE.Vector3(widthM, h, 0), new THREE.Vector3(widthM, h, heightM));
    pts.push(new THREE.Vector3(widthM, h, heightM), new THREE.Vector3(0, h, heightM));
    pts.push(new THREE.Vector3(0, h, heightM), new THREE.Vector3(0, h, 0));
    return pts;
  }, [widthM, heightM]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [points]);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#4a5568" opacity={0.5} transparent />
    </lineSegments>
  );
}

/* ── FPS-style controller (always active) ──
 * WASD      = move forward/back/strafe
 * Space     = up
 * Shift     = down
 * Mouse     = look (hold left-click or right-click)
 * Scroll    = move forward/back (dolly)
 * Ctrl      = sprint (2×)
 */
function FPSControls({ mouseLookEnabled, defaultPitch, onManualMove }: { mouseLookEnabled: boolean; defaultPitch: number; onManualMove?: () => void }) {
  const { camera, gl, size } = useThree();
  // Die Ansicht rendert nur auf Anforderung (frameloop="demand"): die
  // Steuerung fordert Bilder an, solange sich etwas bewegt.
  const invalidate = useThree((s) => s.invalidate);
  // Laufende Fahrt. Haende am Steuer (Maus, Tasten, Rad, Finger) brechen die
  // Bewegung ab — nur der Bildwinkel faehrt zu Ende, sonst bliebe ein Tele-
  // Bildwinkel aus dem Kamerablick am freien Rundgang haengen.
  const fly = useRef<null | {
    t0: number; dur: number;
    fromPos: THREE.Vector3; toPos: THREE.Vector3 | null;
    fromYaw: number; dYaw: number; fromPitch: number; toPitch: number;
    fromFov: number; toFov: number;
  }>(null);
  const manualRef = useRef(onManualMove);
  useEffect(() => { manualRef.current = onManualMove; }, [onManualMove]);
  const takeOver = useCallback(() => {
    const f = fly.current;
    if (f) f.toPos = null;
    manualRef.current?.();
  }, []);
  const keys = useRef<Set<string>>(new Set());
  const yaw = useRef(0);
  const pitch = useRef(defaultPitch);
  const isLooking = useRef(false);
  // Die liegenden Finger. Eine Instanz je Ansicht, nicht je Ereignis — die
  // Geste IST der Zustand zwischen den Ereignissen.
  const fingerRef = useRef(new FingerNavigation());
  const speed = 6; // m/s base

  // Sync yaw from initial camera orientation; die Neigung kommt aus der
  // Hallengroesse (utils/view3d.ts), damit die hintere Hallenkante immer oben
  // im Bild sitzt statt in der Mitte.
  useEffect(() => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    yaw.current = Math.atan2(-dir.x, -dir.z);
    pitch.current = defaultPitch;
  }, [camera, defaultPitch]);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
    const onFly = (e: Event) => {
      const d = (e as CustomEvent<FlyDetail>).detail;
      const target = d.topOf ? topFraming(d.topOf.widthM, d.topOf.depthM, VIEW3D_FOV_DEG, aspect) : d.framing;
      let toFov = d.fovDeg ?? target?.fovDeg ?? persp.fov;
      if (d.povHFovDeg !== undefined) toFov = (2 * Math.atan(Math.tan((d.povHFovDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      fly.current = {
        t0: performance.now(),
        dur: reduce ? 0 : (d.durationMs ?? 700),
        fromPos: camera.position.clone(),
        toPos: target ? new THREE.Vector3(...target.pos) : null,
        fromYaw: yaw.current,
        dYaw: target ? shortestAngleDelta(yaw.current, target.yaw) : 0,
        fromPitch: pitch.current,
        toPitch: target ? target.pitch : pitch.current,
        fromFov: persp.fov,
        toFov,
      };
      invalidate();
    };
    window.addEventListener(FLY_EVENT, onFly);
    return () => window.removeEventListener(FLY_EVENT, onFly);
  }, [camera, size.width, size.height, invalidate]);

  useEffect(() => {
    const registry = getExportRegistry();
    registry.framing3D = {
      save: (): FramingState => ({
        pos: camera.position.toArray() as [number, number, number],
        yaw: yaw.current,
        pitch: pitch.current,
      }),
      apply: (state: FramingState) => {
        camera.position.fromArray(state.pos);
        yaw.current = state.yaw;
        pitch.current = state.pitch;
        invalidate();
      },
      fitVenue: (widthM: number, heightM: number) => {
        const diag = Math.sqrt(widthM * widthM + heightM * heightM);
        const camX = widthM / 2;
        const camY = diag * 0.55;
        const camZ = heightM + diag * 0.4;
        const targetX = widthM / 2;
        const targetY = 0;
        const targetZ = heightM / 2;
        const dx = targetX - camX;
        const dy = targetY - camY;
        const dz = targetZ - camZ;
        const horizDist = Math.sqrt(dx * dx + dz * dz);
        camera.position.set(camX, camY, camZ);
        yaw.current = Math.atan2(-dx, -dz);
        pitch.current = Math.atan2(dy, horizDist);
        invalidate();
      },
    };
    return () => { registry.framing3D = null; };
  }, [camera, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    const finger = fingerRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k) || e.code === 'Space' || e.key === 'Shift' || e.key === 'Control') {
        e.preventDefault();
        if (['w', 'a', 's', 'd'].includes(k) || e.code === 'Space') takeOver();
        keys.current.add(e.code === 'Space' ? ' ' : k === 'control' ? 'ctrl' : k);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      keys.current.delete(e.code === 'Space' ? ' ' : k === 'control' ? 'ctrl' : k);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!mouseLookEnabled) return;
      isLooking.current = true;
      takeOver();
      canvas.style.cursor = 'grabbing';
      // Try pointer lock for smoother FPS look
      if (e.button === 2) {
        canvas.requestPointerLock?.();
      }
    };
    const onMouseUp = () => {
      isLooking.current = false;
      canvas.style.cursor = mouseLookEnabled ? 'grab' : 'default';
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isLooking.current && document.pointerLockElement !== canvas) return;
      const d = umsehen(e.movementX, e.movementY);
      yaw.current += d.dYaw;
      pitch.current += d.dPitch;
      pitch.current = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch.current));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      takeOver();
      // Scroll = zoom in/out along look direction (including vertical)
      const dir = new THREE.Vector3(
        -Math.sin(yaw.current) * Math.cos(pitch.current),
        Math.sin(pitch.current),
        -Math.cos(yaw.current) * Math.cos(pitch.current),
      );
      const dolly = dir.multiplyScalar(-e.deltaY * 0.02);
      camera.position.add(dolly);
    };

    const onContext = (e: Event) => e.preventDefault();

    // ─── FINGER (#137) ───────────────────────────────────────────────────
    //
    // NUTZER-MELDUNG: „Auf mobilen Endgeraeten funktioniert im 3d Mode
    // intuitive ansichts Steuerung nicht."
    //
    // Sie funktionierte nicht, weil es sie nicht gab: Umsehen hing an
    // `mousemove`, Vorfahren am Rad, Gehen an WASD. Ein Telefon hat weder
    // Rad noch Tastatur. Die Nachbildung `mousemove` haette EINEN Finger
    // geliefert — aber `mouseLookEnabled` verlangt vorher ein `mousedown`
    // auf dem Canvas, und Kneifen gibt es als Maus-Ereignis ueberhaupt
    // nicht. Wer die Halle auf dem Telefon oeffnete, sah sie und kam nicht
    // von der Stelle.
    //
    // Die Geste selbst rechnet `lib/fingerNavigation.ts`; hier steht nur,
    // was ihre Deltas an der Kamera bedeuten. Die Umrechnung ist dieselbe
    // wie fuer die Maus (`umsehen`), damit sich beides gleich anfuehlt.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      takeOver();
      finger.runter({ id: e.pointerId, x: e.clientX, y: e.clientY });
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      // Ohne das scrollt die Seite unter der Halle weg. `touch-action: none`
      // im Stil erledigt den Regelfall; dieses `preventDefault` faengt die
      // Browser, die es nur teilweise befolgen.
      e.preventDefault();
      const zug = finger.bewegt({ id: e.pointerId, x: e.clientX, y: e.clientY });
      if (finger.anzahl === 1) {
        const d = umsehen(zug.dreheX, zug.dreheY);
        yaw.current += d.dYaw;
        pitch.current += d.dPitch;
        pitch.current = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch.current));
        return;
      }
      // Zwei Finger: kneifen faehrt vor/zurueck, schieben versetzt seitwaerts
      // und in der Hoehe. Beides zugleich — ein Modus-Umschalter dazwischen
      // waere genau die Bedienung, die der Nutzer „nicht intuitiv" nannte.
      const blick = new THREE.Vector3(
        -Math.sin(yaw.current) * Math.cos(pitch.current),
        Math.sin(pitch.current),
        -Math.cos(yaw.current) * Math.cos(pitch.current),
      );
      camera.position.add(blick.clone().multiplyScalar(zug.fahre * 0.03));
      // Das Bild folgt den Fingern wie beim Umsehen (#174): nach rechts
      // schieben setzt die Kamera nach LINKS — daher der Vektor nach links.
      const links = new THREE.Vector3(-Math.cos(yaw.current), 0, Math.sin(yaw.current));
      camera.position.add(links.multiplyScalar(zug.schiebeX * 0.02));
      camera.position.y += zug.schiebeY * 0.02;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      finger.hoch(e.pointerId);
      canvas.releasePointerCapture?.(e.pointerId);
    };

    // Jede Eingabe weckt die Ansicht; das Weiterlaufen haelt useFrame.
    const weck = () => invalidate();
    const WECKER = ['keydown', 'keyup', 'mousemove', 'mouseup'] as const;
    for (const ev of WECKER) window.addEventListener(ev, weck);
    for (const ev of ['wheel', 'pointerdown', 'pointermove', 'pointerup'] as const) canvas.addEventListener(ev, weck, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.style.cursor = mouseLookEnabled ? 'grab' : 'default';
    // Der Browser wuerde sonst scrollen und hineinzoomen, statt die Geste an
    // die Halle zu geben.
    canvas.style.touchAction = 'none';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      for (const ev of WECKER) window.removeEventListener(ev, weck);
      for (const ev of ['wheel', 'pointerdown', 'pointermove', 'pointerup'] as const) canvas.removeEventListener(ev, weck);
      finger.leeren();
    };
  }, [camera, gl, mouseLookEnabled, takeOver, invalidate]);

  useFrame((_, delta) => {
    const f = fly.current;
    if (f) {
      const k = f.dur > 0 ? easeOut((performance.now() - f.t0) / f.dur) : 1;
      if (f.toPos) {
        camera.position.lerpVectors(f.fromPos, f.toPos, k);
        yaw.current = f.fromYaw + f.dYaw * k;
        pitch.current = f.fromPitch + (f.toPitch - f.fromPitch) * k;
      }
      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = f.fromFov + (f.toFov - f.fromFov) * k;
      persp.updateProjectionMatrix();
      if (k >= 1) fly.current = null;
    }
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const move = new THREE.Vector3();

    if (keys.current.has('w')) move.add(forward);
    if (keys.current.has('s')) move.sub(forward);
    if (keys.current.has('a')) move.add(right);
    if (keys.current.has('d')) move.sub(right);
    if (keys.current.has(' ')) move.y += 1;
    if (keys.current.has('shift')) move.y -= 1;

    if (move.length() > 0) {
      const sprint = keys.current.has('ctrl') ? 2.5 : 1;
      move.normalize().multiplyScalar(speed * sprint * delta);
      camera.position.add(move);
    }

    // Apply look direction – use Euler directly so roll is always 0
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch.current, yaw.current, 0);
    // Fahrt oder gedrueckte Taste: naechstes Bild anfordern.
    if (fly.current || keys.current.size > 0) invalidate();
  });

  return null;
}

function StageMesh({ stage }: { stage: Stage }) {
  const { x, y, width: w, height: h, label } = stage;
  // Podest statt Flaeche (#73): mit `elevationM` wird aus der Buehne ein
  // Koerper, der auf dem Boden steht — die Oberkante liegt dann genau auf der
  // eingestellten Hoehe. Ohne Angabe bleibt die bisherige flache Andeutung.
  const raised = stageTopZ(stage);
  const boxH = raised > 0 ? raised : FLAT_STAGE_M;
  const color = stageColor(stage);
  const opacity = stageOpacity(stage);
  const geo = useMemo(() => new THREE.BoxGeometry(w, boxH, h), [w, boxH, h]);

  return (
    <group position={[x + w / 2, boxH / 2, y + h / 2]}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={color} opacity={opacity} transparent={opacity < 1} />
      </mesh>
      {/* Stage edge glow */}
      <lineSegments>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color="#60a5fa" />
      </lineSegments>
      {/* Beschriftung auf die Oberkante, sonst steckt sie bei einem hohen
          Podest im Koerper. */}
      <Text font={LABEL_FONT} position={[0, boxH / 2 + 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.5} color="#93c5fd" anchorX="center" fontWeight="bold">
        {label}
      </Text>
      {/* Stage dimensions */}
      <Text font={LABEL_FONT} position={[0, boxH / 2 + 0.08, h / 2 + 0.3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.25} color="#60a5fa" anchorX="center" fillOpacity={0.53}>
        {w}×{h}m{raised > 0 ? ` · ${raised.toFixed(2)}m hoch` : ''}
      </Text>
    </group>
  );
}

interface CameraLook {
  /** Pyramide bis zum Schaerfepunkt zeigen (die gewaehlte Kamera immer). */
  showFrustum: boolean;
  /** Gefuellte Pyramide — entfaellt, wenn der Keil am Boden die Abdeckung schon zeigt. */
  showVolume: boolean;
  showLabel: boolean;
  /** Schrifthoehe der Beschriftung in Metern — waechst mit der Halle. */
  labelSize: number;
  tally: 'pgm' | 'pvw' | null;
  /** Durch diese Kamera wird gerade geschaut: Gehaeuse und Pyramide weg. */
  isPov: boolean;
}

// Tally wie am Mischer: Rot = Program, Gruen = Preview. In der Szene ist das
// Bildinhalt, keine Oberflaeche — darum Farbwerte statt Token.
const TALLY_PGM = '#D6402E';
const TALLY_PVW = '#2F7D5C';

function FovPyramid({ cam, isSelected, look }: { cam: ReturnType<typeof useStore.getState>['cameras'][0]; isSelected: boolean; look: CameraLook }) {
  const camDef = getCameraById(cam.cameraId, useStore.getState().customCameras);
  const lensDef = getLensById(cam.lensId, useStore.getState().customLenses);

  // Alle Hooks muessen unbedingt (in gleicher Reihenfolge bei jedem Render)
  // laufen — daher null-safe ableiten und erst NACH den Hooks early-returnen.
  const sensor = camDef && lensDef
    ? getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount)
    : null;
  const fov = sensor ? computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef?.squeeze ?? 1) : null;
  const fovMin = sensor && lensDef ? computeFov(sensor, lensDef.focalLengthMax, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1) : null;
  const fovMax = sensor && lensDef ? computeFov(sensor, lensDef.focalLengthMin, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1) : null;
  const isZoom = !!lensDef && lensDef.focalLengthMin !== lensDef.focalLengthMax;

  const geometry = useMemo(() => {
    if (!fov) return null;
    const halfH = Math.tan(((fov.horizontalDeg / 2) * Math.PI) / 180) * cam.focusDistance;
    const halfV = Math.tan(((fov.verticalDeg / 2) * Math.PI) / 180) * cam.focusDistance;
    const d = cam.focusDistance;

    const vertices = new Float32Array([
      0, 0, 0,
      -halfH, halfV, -d,
      halfH, halfV, -d,
      halfH, -halfV, -d,
      -halfH, -halfV, -d,
    ]);
    const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 1, 2, 3, 1, 3, 4];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [fov?.horizontalDeg, fov?.verticalDeg, cam.focusDistance]);

  const geoMin = useMemo(() => {
    if (!isZoom || !fovMin) return null;
    const halfH = Math.tan(((fovMin.horizontalDeg / 2) * Math.PI) / 180) * cam.focusDistance;
    const halfV = Math.tan(((fovMin.verticalDeg / 2) * Math.PI) / 180) * cam.focusDistance;
    const d = cam.focusDistance;
    const vertices = new Float32Array([0,0,0, -halfH,halfV,-d, halfH,halfV,-d, halfH,-halfV,-d, -halfH,-halfV,-d]);
    const indices = [0,1,2, 0,2,3, 0,3,4, 0,4,1, 1,2,3, 1,3,4];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    return geo;
  }, [isZoom, fovMin?.horizontalDeg, fovMin?.verticalDeg, cam.focusDistance]);

  const geoMax = useMemo(() => {
    if (!isZoom || !fovMax) return null;
    const halfH = Math.tan(((fovMax.horizontalDeg / 2) * Math.PI) / 180) * cam.focusDistance;
    const halfV = Math.tan(((fovMax.verticalDeg / 2) * Math.PI) / 180) * cam.focusDistance;
    const d = cam.focusDistance;
    const vertices = new Float32Array([0,0,0, -halfH,halfV,-d, halfH,halfV,-d, halfH,-halfV,-d, -halfH,-halfV,-d]);
    const indices = [0,1,2, 0,2,3, 0,3,4, 0,4,1, 1,2,3, 1,3,4];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    return geo;
  }, [isZoom, fovMax?.horizontalDeg, fovMax?.verticalDeg, cam.focusDistance]);

  // Guard nach den Hooks: ohne gueltige Kamera/Linse gibt es keine Geometrie.
  if (!geometry || look.isPov) return null;
  const tallyColor = look.tally === 'pgm' ? TALLY_PGM : look.tally === 'pvw' ? TALLY_PVW : null;

  return (
    // The pyramid mesh is modelled looking along -Z. Both the pitch (rotate-X)
    // and the camera-orientation rotate-Y(-90°) used to live on this group, but
    // R3F applies child transforms before parent ones — so the Y rotation
    // landed BEFORE the X rotation, leaving pitch acting around the pyramid's
    // own axis (i.e. rolling it). The reorientation is now applied one level
    // up in CameraRig, AFTER the parent pitchRef, so pitch stays pitch.
    <group>
      {/* Camera body */}
      <mesh>
        <boxGeometry args={[0.3, 0.2, 0.4]} />
        <meshStandardMaterial color={cam.color} emissive={cam.color} emissiveIntensity={isSelected ? 0.5 : 0.15} />
      </mesh>
      {/* FOV volume */}
      {look.showFrustum && look.showVolume && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={cam.color}
            opacity={isSelected ? 0.12 : 0.06}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* Wireframe */}
      {look.showFrustum && (
        <lineSegments geometry={geometry}>
          <lineBasicMaterial color={cam.color} opacity={isSelected ? 0.8 : 0.3} transparent />
        </lineSegments>
      )}
      {/* Min FOV wireframe (red) */}
      {isSelected && geoMin && (
        <lineSegments geometry={geoMin}>
          <lineBasicMaterial color="#ef4444" opacity={0.4} transparent />
        </lineSegments>
      )}
      {/* Max FOV wireframe (green) */}
      {isSelected && geoMax && (
        <lineSegments geometry={geoMax}>
          <lineBasicMaterial color="#22c55e" opacity={0.4} transparent />
        </lineSegments>
      )}
      {/* Tally-Lampe ueber dem Gehaeuse */}
      {tallyColor && (
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[0.18, 0.08, 0.18]} />
          <meshBasicMaterial color={tallyColor} toneMapped={false} />
        </mesh>
      )}
      {/* Label: dreht sich zum Betrachter, damit es auch von oben lesbar ist */}
      {look.showLabel && (
        <NahKleiner groesse={look.labelSize}>
        <Billboard position={[0, 0.35 + look.labelSize * 0.8, 0]}>
          <Text font={LABEL_FONT} fontSize={look.labelSize} color={tallyColor ?? '#F6F5F0'} anchorX="center" anchorY="middle" fontWeight="bold"
            outlineWidth={look.labelSize * 0.08} outlineColor="#0B1426">
            {cam.label}
          </Text>
        </Billboard>
        </NahKleiner>
      )}
    </group>
  );
}

/**
 * Beschriftung, die aus der Naehe nicht waechst: die Schrift ist fuer den
 * Blick ueber die ganze Halle bemessen und stand sonst im Rundgang meterhoch
 * vor dem Bild.
 */
function NahKleiner({ groesse, children }: { groesse: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const welt = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const d = camera.position.distanceTo(g.getWorldPosition(welt));
    g.scale.setScalar(Math.min(1, Math.max(0.15, d / (groesse * 30))));
  });
  return <group ref={ref}>{children}</group>;
}

type CameraEditMode = 'move' | 'height' | 'pan' | 'tilt';

function normalizeDegrees(angle: number) {
  let normalized = angle;
  while (normalized > 180) normalized -= 360;
  while (normalized <= -180) normalized += 360;
  return normalized;
}

function CameraRig({
  cam,
  isSelected,
  isUnlocked,
  editMode,
  onSelect,
  onToggleLock,
  onEditModeChange,
  venueWidth,
  venueHeight,
  look,
}: {
  look: CameraLook;
  cam: ReturnType<typeof useStore.getState>['cameras'][0];
  isSelected: boolean;
  isUnlocked: boolean;
  editMode: CameraEditMode;
  onSelect: (cameraId: string) => void;
  onToggleLock: (cameraId: string) => void;
  onEditModeChange: (mode: CameraEditMode) => void;
  venueWidth: number;
  venueHeight: number;
}) {
  const { t } = useTranslation();
  const { moveCamera, updateCamera } = useStore();
  const baseRef = useRef<THREE.Group>(null);
  const liftRef = useRef<THREE.Group>(null);
  const pitchRef = useRef<THREE.Group>(null);
  // Die Gizmos haengen an diesen Gruppen. Ein Ref allein loest kein Rendern
  // aus — ohne diesen Zustand haette ein frisch eingehaengtes Rig beim ersten
  // Rendern nur `null` und der Gizmo waere nie erschienen.
  const [rigMounted, setRigMounted] = useState(false);
  const attachBase = useCallback((node: THREE.Group | null) => {
    baseRef.current = node;
    // Kinder haengen sich vor dem Elternteil ein, liftRef/pitchRef stehen hier
    // also schon.
    setRigMounted(node !== null && liftRef.current !== null && pitchRef.current !== null);
  }, []);

  useEffect(() => {
    const pos = effectiveCameraPos(cam);
    if (baseRef.current) {
      baseRef.current.position.set(pos.x, 0, pos.y);
      baseRef.current.rotation.set(0, THREE.MathUtils.degToRad(-cam.pan), 0);
    }
    if (liftRef.current) {
      liftRef.current.position.set(0, cam.z, 0);
    }
    if (pitchRef.current) {
      // Tilt rotates around the camera's LOCAL right axis. Once the inner
      // FovPyramid group reorients the model from -Z to +X, the camera's right
      // axis lines up with the parent group's Z (+Z in world for default pan).
      // Rotating around X here would tumble the pyramid around its forward
      // axis (= roll), so the pitch rotation has to go on Z.
      pitchRef.current.rotation.set(0, 0, THREE.MathUtils.degToRad(cam.tilt));
    }
  }, [cam.pan, cam.tilt, cam.x, cam.y, cam.z, cam.trackOffset, cam.rigRotation, cam]);

  // Ausrichtung des Rigs — einmal im Render aufgeloest, damit die Callbacks
  // nur den Winkel als Abhaengigkeit brauchen und nicht das ganze cam-Objekt.
  const camYaw = rigYaw(cam);

  const commitMove = useCallback(() => {
    if (!baseRef.current) return;
    // TransformControls drag operates on the *effective* (offset) position,
    // so back out the trackOffset to recover the parked position before
    // clamping into the venue bounds.
    const offset = cam.trackOffset ?? 0;
    // Der Fahrweg folgt der Rig-Achse (Schiene/Kran), nicht dem Pan.
    const yawRad = (camYaw * Math.PI) / 180;
    const dropX = baseRef.current.position.x - Math.cos(yawRad) * offset;
    const dropY = baseRef.current.position.z - Math.sin(yawRad) * offset;
    const nextX = Math.max(0, Math.min(venueWidth, dropX));
    const nextY = Math.max(0, Math.min(venueHeight, dropY));
    baseRef.current.position.set(nextX + Math.cos(yawRad) * offset, 0, nextY + Math.sin(yawRad) * offset);
    moveCamera(cam.id, nextX, nextY);
  }, [cam.id, camYaw, cam.trackOffset, moveCamera, venueHeight, venueWidth]);

  const commitHeight = useCallback(() => {
    if (!liftRef.current) return;
    const nextZ = Math.max(0, liftRef.current.position.y);
    liftRef.current.position.set(0, nextZ, 0);
    updateCamera(cam.id, { z: nextZ });
  }, [cam.id, updateCamera]);

  const commitPan = useCallback(() => {
    if (!baseRef.current) return;
    const nextPan = normalizeDegrees(-THREE.MathUtils.radToDeg(baseRef.current.rotation.y));
    baseRef.current.rotation.set(0, THREE.MathUtils.degToRad(-nextPan), 0);
    updateCamera(cam.id, { pan: nextPan });
  }, [cam.id, updateCamera]);

  const commitTilt = useCallback(() => {
    if (!pitchRef.current) return;
    const nextTilt = Math.max(-90, Math.min(45, THREE.MathUtils.radToDeg(pitchRef.current.rotation.z)));
    pitchRef.current.rotation.set(0, 0, THREE.MathUtils.degToRad(nextTilt));
    updateCamera(cam.id, { tilt: nextTilt });
  }, [cam.id, updateCamera]);

  // Pill-Segment aus `.bc-seg`; die gedrueckte Stellung zeigt aria-pressed.
  const buttonStyle = (): React.CSSProperties => ({ padding: '0 8px', fontSize: 11, fontWeight: 600 });

  const showGizmo = isSelected && isUnlocked && rigMounted;

  return (
    <>
      {/* Die Gizmos stehen NEBEN dem Rig, nicht darin. Steckt ein
          TransformControls in der Gruppe, die es bewegt, ruft sein
          `updateMatrixWorld` das seines eigenen Vorfahren auf — die Rekursion
          sprengt in jedem Frame den Stack ("Maximum call stack size exceeded"),
          und weder Gizmo noch Ziehen funktionieren. */}
      {showGizmo && editMode === 'move' && baseRef.current && (
        <TransformControls object={baseRef.current} mode="translate" showX showY={false} showZ size={0.9} onMouseUp={commitMove} />
      )}
      {showGizmo && editMode === 'pan' && baseRef.current && (
        <TransformControls object={baseRef.current} mode="rotate" showX={false} showY showZ={false} size={0.9} onMouseUp={commitPan} />
      )}
      {showGizmo && editMode === 'height' && liftRef.current && (
        <TransformControls object={liftRef.current} mode="translate" showX={false} showY showZ={false} size={0.9} onMouseUp={commitHeight} />
      )}
      {/* `space="local"`: der Neigungs-Knoten haengt unter der Pan-Drehung,
          seine Z-Achse zeigt also nur bei Pan 0 in Richtung der Welt-Z-Achse.
          Im Weltraum (Vorgabe) drehte das Gizmo um die Welt-Z — bei Pan 90
          war das die lokale X-Achse, `rotation.z` blieb 0 und die Neigung
          sprang beim Loslassen zurueck. */}
      {showGizmo && editMode === 'tilt' && pitchRef.current && (
        <TransformControls object={pitchRef.current} mode="rotate" space="local" showX={false} showY={false} showZ size={0.9} onMouseUp={commitTilt} />
      )}

      <group
        ref={attachBase}
        position={[cam.x, 0, cam.y]}
        rotation={[0, THREE.MathUtils.degToRad(-cam.pan), 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(cam.id);
        }}
      >
        <group ref={liftRef} position={[0, cam.z, 0]}>
          {isSelected && !look.isPov && (
            // Unter das Gehaeuse, im Bildraum versetzt: die Beschriftung steht
            // darueber, und in der Draufsicht fielen beide sonst auf denselben Punkt.
            <Html position={[0, 0, 0]} center style={{ pointerEvents: 'auto' }}>
              <div
                className="bc-seg bc-seg-kompakt shadow-bc-2"
                style={{ transform: 'translateY(44px)' }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Schloss statt Wortmarke: zu ist der Normalfall und braucht
                    keine Beschriftung. Die Achsen-Knoepfe erscheinen erst mit
                    dem offenen Schloss — vorher waren sie nur ausgegraut und
                    haben das Badge unnoetig breit gemacht. */}
                <button
                  type="button"
                  onClick={() => onToggleLock(cam.id)}
                  style={buttonStyle()}
                  aria-pressed={isUnlocked}
                  aria-label={isUnlocked
                    ? t('venue.lockPosition', 'Lock position')
                    : t('venue.unlockPosition', 'Unlock position')}
                  title={isUnlocked
                    ? t('venue.lockPosition', 'Lock position')
                    : t('venue.unlockPosition', 'Unlock position')}
                >
                  {isUnlocked ? <FiUnlock size={12} /> : <FiLock size={12} />}
                </button>
                {isUnlocked && (
                  <>
                    <button type="button" onClick={() => onEditModeChange('move')} style={buttonStyle()} aria-pressed={editMode === 'move'} title={t('venue.edit.move', 'Position on the floor')}>
                      XY
                    </button>
                    <button type="button" onClick={() => onEditModeChange('height')} style={buttonStyle()} aria-pressed={editMode === 'height'} title={t('venue.edit.height', 'Height')}>
                      Z
                    </button>
                    <button type="button" onClick={() => onEditModeChange('pan')} style={buttonStyle()} aria-pressed={editMode === 'pan'} title={t('venue.edit.pan', 'Pan')}>
                      Pan
                    </button>
                    <button type="button" onClick={() => onEditModeChange('tilt')} style={buttonStyle()} aria-pressed={editMode === 'tilt'} title={t('venue.edit.tilt', 'Tilt')}>
                      Tilt
                    </button>
                  </>
                )}
              </div>
            </Html>
          )}

          <group ref={pitchRef} rotation={[0, 0, THREE.MathUtils.degToRad(cam.tilt)]}>
            {/* Reorient the pyramid (modelled along -Z) so it points along the
                camera's pan axis. Applying this group AFTER pitchRef means pitch
                acts on the camera's right axis (X) before reorientation, giving a
                proper pitch instead of roll. */}
            <group rotation={[0, -Math.PI / 2, 0]}>
              <FovPyramid cam={cam} isSelected={isSelected} look={look} />
            </group>
          </group>
        </group>
      </group>
    </>
  );
}

/* ── Floor plan image texture overlay on ground ── */
function FloorPlanOverlay({ plan }: { plan: BackgroundPlan }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    };
    img.src = plan.dataUrl;
    return () => { texture?.dispose(); };
  }, [plan.dataUrl]);

  if (!texture) return null;

  const w = plan.widthPx * plan.scaleX;
  const h = plan.heightPx * plan.scaleY;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[plan.offsetX + w / 2, 0.02, plan.offsetY + h / 2]}
    >
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} transparent opacity={plan.opacity} depthWrite={false} />
    </mesh>
  );
}


/**
 * Meldet „bereit", sobald die Szene samt Schriften (Suspense) zwei Bilder
 * gezeichnet hat — bis dahin liegt die Lade-Anzeige darueber (#167).
 * Beim Abbau wieder „nicht bereit", damit ein neuer Renderer sie erneut zeigt.
 */
function ErsterFrame({ onBereit }: { onBereit: (b: boolean) => void }) {
  const frames = useRef(0);
  useEffect(() => () => onBereit(false), [onBereit]);
  const invalidate = useThree((s) => s.invalidate);
  // Texturen, Schrift und Modelle laden nach — in den ersten Sekunden ein paar
  // Bilder nachfordern, damit sie ohne Mausbewegung erscheinen.
  useEffect(() => {
    const t = window.setInterval(() => invalidate(), 200);
    const stop = window.setTimeout(() => window.clearInterval(t), 3000);
    return () => { window.clearInterval(t); window.clearTimeout(stop); };
  }, [invalidate]);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 2) onBereit(true);
    else if (frames.current < 2) invalidate();
  });
  return null;
}

type ViewPreset = 'top' | 'perspective' | 'camera';

/** Bildwinkel einer Planer-Kamera, wie ihn Vorschau und Rechner benutzen. */
function cameraFov(cam: ReturnType<typeof useStore.getState>['cameras'][0]) {
  const st = useStore.getState();
  const camDef = getCameraById(cam.cameraId, st.customCameras);
  const lensDef = getLensById(cam.lensId, st.customLenses);
  if (!camDef || !lensDef) return { camDef, lensDef, fov: null, sensor: null };
  const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
  return { camDef, lensDef, sensor, fov: computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1) };
}

export default function Venue3D() {
  const { t } = useTranslation();
  const { venue, cameras, persons, backgroundPlan, updatePerson, selectCamera, selectedCameraId, programCameraId } = useStore();
  const [unlockedCameraId, setUnlockedCameraId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<CameraEditMode>('move');
  const [prefs, updatePrefs] = useView3DPrefs();
  const schmal = useSchmal();
  // Durch welche Kamera gerade geschaut wird. Jede Handbewegung beendet das.
  const [povId, setPovId] = useState<string | null>(null);
  const [preset, setPreset] = useState<ViewPreset>('perspective');
  const [werte, setWerte] = useState<StufenWerte>(() => stufenWerte('high'));
  const [stufe, setStufe] = useState<Stufe>('high');
  const onWerte = useCallback((w: StufenWerte, st: Stufe) => { setWerte(w); setStufe(st); }, []);

  useEffect(() => {
    if (unlockedCameraId && !cameras.some((camera) => camera.id === unlockedCameraId)) {
      setUnlockedCameraId(null);
    }
  }, [cameras, unlockedCameraId]);

  // Startausrichtung: Position und Neigung stammen aus derselben Quelle wie
  // beim Einhaengen, sonst zeigt „Perspektive" woanders hin.
  const tribuenenHoehe = (venue.seatingBlocks ?? []).reduce((m, b) => {
    const n = sitzblockNormal(b);
    return n.standing ? m : Math.max(m, n.baseHeightM + (n.rows - 1) * n.riseM);
  }, 0);
  const minCamY = tribuenenHoehe > 0 ? tribuenenHoehe + 10 : 0;
  const [camX, camY, camZ] = defaultCameraPos(venue.widthM, venue.heightM, minCamY);
  const startPitch = defaultPitchRad(venue.widthM, venue.heightM, minCamY);

  const flyTo = useCallback((detail: FlyDetail) => {
    window.dispatchEvent(new CustomEvent<FlyDetail>(FLY_EVENT, { detail }));
  }, []);

  const goPerspective = useCallback(() => {
    setPovId(null);
    setPreset('perspective');
    flyTo({ framing: { pos: [camX, camY, camZ], yaw: 0, pitch: startPitch, fovDeg: VIEW3D_FOV_DEG } });
  }, [camX, camY, camZ, startPitch, flyTo]);

  const goTop = useCallback(() => {
    setPovId(null);
    setPreset('top');
    flyTo({ topOf: { widthM: venue.widthM, depthM: venue.heightM } });
  }, [venue.widthM, venue.heightM, flyTo]);

  const goCamera = useCallback((id: string, durationMs = 700) => {
    const cam = useStore.getState().cameras.find((c) => c.id === id);
    if (!cam) return;
    const { fov } = cameraFov(cam);
    if (!fov) return;
    const pos = effectiveCameraPos(cam);
    setPovId(id);
    setPreset('camera');
    flyTo({ framing: povFraming({ ...cam, x: pos.x, y: pos.y }, fov.horizontalDeg, 16 / 9), povHFovDeg: fov.horizontalDeg, durationMs });
  }, [flyTo]);

  // Im Kamerablick faehrt die Ansicht mit, wenn die Kamera schwenkt oder
  // zoomt — Rig-Pult und 3D zeigen dann dasselbe Bild.
  // Wird die Kamera geloescht, waehrend man durch sie schaut, gilt der Blick als beendet.
  const povCam = povId ? cameras.find((c) => c.id === povId) : undefined;
  const povKey = povCam ? [povCam.x, povCam.y, povCam.z, povCam.pan, povCam.tilt, povCam.focalLength, povCam.extenderActive, povCam.trackOffset ?? 0, povCam.lensId, povCam.cameraId].join('|') : '';
  const lastPovKey = useRef('');
  useEffect(() => {
    if (!povId || !povKey) { lastPovKey.current = ''; return; }
    if (lastPovKey.current && lastPovKey.current !== povKey) goCamera(povId, 0);
    lastPovKey.current = povKey;
  }, [povId, povKey, goCamera]);

  const povRef = useRef(povId);
  useEffect(() => { povRef.current = povId; }, [povId]);
  const handleManualMove = useCallback(() => {
    if (!povRef.current) return;
    povRef.current = null;
    setPovId(null);
    setPreset('perspective');
    flyTo({ fovDeg: VIEW3D_FOV_DEG, durationMs: 250 });
  }, [flyTo]);

  const pickCamera = useCallback((id: string) => {
    selectCamera(id);
    goCamera(id);
  }, [selectCamera, goCamera]);

  const fovById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof cameraFov>>();
    for (const c of cameras) m.set(c.id, cameraFov(c));
    return m;
  }, [cameras]);

  const rows: CameraRow[] = useMemo(() => cameras.map((cam, i) => {
    const info = fovById.get(cam.id);
    const camName = info?.camDef ? `${info.camDef.manufacturer} ${info.camDef.model}`.trim() : null;
    return {
      cam,
      number: i + 1,
      detail: cameraRowDetail(t, cam, camName, info?.lensDef ?? null),
      hFovDeg: info?.fov?.horizontalDeg ?? null,
    };
  }), [cameras, fovById, t]);

  const diag = Math.hypot(venue.widthM, venue.heightM);
  const labelSize = Math.min(2.2, Math.max(0.35, diag / 55));

  const kulisse = useKulissenDaten(prefs.videoBoard);
  const { draussen, farDist, personBlick } = kulisse;

  // Einfache Ansicht (#167): ohne Pipeline, Schatten und Showlicht.
  const simple = prefs.quality === 'simple';
  const show = prefs.showLight && !simple;
  const [bereit, setBereit] = useState(false);
  const povInfo = povCam ? fovById.get(povCam.id) : undefined;


  // Bildfenster im Seitenverhaeltnis des Sensors, Rest abgedunkelt.
  const povRatio = povInfo?.fov && povInfo.fov.horizontalDeg > 0
    ? Math.tan((povInfo.fov.verticalDeg * Math.PI) / 360) / Math.tan((povInfo.fov.horizontalDeg * Math.PI) / 360)
    : 9 / 16;

  // Im Kamerablick soll die Ansicht wie das Bild dieser Kamera wirken: ohne
  // Planungs-Beiwerk, mit der Schaerfentiefe ihres Objektivs.
  const realPov = show && !!povCam;
  const dof: Tiefenschaerfe | null = useMemo(() => {
    if (!realPov || !povCam || !povInfo?.sensor) return null;
    return {
      fokusM: Math.max(0.3, povCam.focusDistance),
      blende: povCam.aperture,
      brennweiteMm: povCam.focalLength * (povCam.extenderActive || 1),
      sensorBreiteMm: povInfo.sensor.widthMm,
    };
  }, [realPov, povCam, povInfo]);
  const thema = useIstHell() ? 'hell' : 'dunkel';

  return (
    <div className="flex w-full h-full" style={{ minHeight: 500 }}>
      <div className="relative flex-1 min-w-0 h-full overflow-hidden">
        <div className="bc-seg absolute top-3 left-3 z-10 shadow-bc-2" role="group" aria-label={t('venue.view.group', 'View')}>
          {([
            { id: 'top', label: t('venue.view.top', 'Top'), go: goTop },
            { id: 'perspective', label: t('venue.view.perspective', 'Perspective'), go: goPerspective },
            { id: 'camera', label: t('venue.view.camera', 'Camera view'), go: () => { if (selectedCameraId) goCamera(selectedCameraId); }, disabled: !selectedCameraId },
          ] as { id: ViewPreset; label: string; go: () => void; disabled?: boolean }[]).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={b.go}
              disabled={b.disabled}
              aria-pressed={preset === b.id}
              className="px-3 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {b.label}
            </button>
          ))}
        </div>

        {povCam && povInfo?.fov && (
          <div className="absolute inset-0 z-[5] pointer-events-none flex items-center justify-center">
            <div
              className="relative w-full outline outline-1 outline-bc-on-media/60"
              style={{ aspectRatio: `${1 / povRatio}`, boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.45)' }}
            >
              <div className="absolute left-2 bottom-2 px-2 py-1 text-[11px] font-semibold text-bc-on-media bg-bc-media/70 tabular-nums">
                {povCam.label} · {Math.round(povCam.focalLength * 10) / 10} mm · {povInfo.fov.horizontalDeg.toFixed(1)}° H
                {povCam.id === programCameraId && <span className="ml-2 px-1 bg-bc-signal">PGM</span>}
              </div>
            </div>
          </div>
        )}

        {!schmal && !povCam && (
          <div className="absolute bottom-3 left-3 z-10 pointer-events-none rounded-bc-m px-3 py-2 text-[11px] leading-relaxed text-bc-on-media bg-bc-media/60 backdrop-blur-sm">
            <b>{t('venue.selectCamera', 'Select camera')}</b> {t('venue.unlockToEdit', '→ unlock to edit')}<br/>
            <b>XY</b> {t('venue.floorMove', 'floor move')} &nbsp;|&nbsp;
            <b>Z</b> {t('venue.height', 'height')} &nbsp;|&nbsp;
            <b>Pan/Tilt</b> {t('venue.rotateAxes', 'rotate axes')}<br/>
            <b>WASD</b> {t('venue.move', 'Move')} &nbsp;|&nbsp;
            <b>Space/Shift</b> {t('venue.vertical', 'vertical')} &nbsp;|&nbsp;
            <b>Scroll</b> {t('venue.dolly', 'Dolly')}
          </div>
        )}

        {!bereit && <LoadingIndicator overlay label={t('venue.loading', 'Loading 3D scene…')} />}

        {/* `key`: Schatten und Kantenglaettung legt der Renderer beim Anlegen
            fest — der Wechsel zur einfachen Ansicht braucht einen neuen. */}
        <Canvas key={simple ? 'simple' : 'real'} frameloop="demand" gl={{ preserveDrawingBuffer: true, antialias: simple }} dpr={simple ? 1 : [1, 1.5]} shadows={!simple}>
          <Suspense fallback={null}>
          <ErsterFrame onBereit={setBereit} />
          {!simple && <ScenePipeline quality={prefs.quality === 'simple' ? 'low' : prefs.quality} show={show} dof={dof} onWerte={onWerte} />}
          <Atmosphere look={show ? (draussen ? 'nacht' : 'arena') : 'planung'} hintergrund={show ? undefined : PLANUNG_JE_THEMA[thema]} diagM={diag} domeRadius={farDist * 0.8} />
          <PerspectiveCamera makeDefault position={[camX, camY, camZ]} fov={VIEW3D_FOV_DEG} near={0.1} far={farDist} />
          <FPSControls mouseLookEnabled={unlockedCameraId === null} defaultPitch={startPitch} onManualMove={handleManualMove} />

          <Kulisse
            daten={kulisse}
            show={show}
            simple={simple}
            werte={werte}
            audience={prefs.audience}
            planungsBoden={PLANUNGS_BODEN[thema]}
            einfacheBuehne={(st) => <StageMesh stage={st} />}
          />

          {backgroundPlan && prefs.floorPlan && <FloorPlanOverlay plan={backgroundPlan} />}

          {!show && (
            <Grid
              args={[venue.widthM, venue.heightM]}
              position={[venue.widthM / 2, 0.01, venue.heightM / 2]}
              cellSize={1}
              cellThickness={0.6}
              cellColor="#3a4050"
              sectionSize={5}
              sectionThickness={1.5}
              sectionColor="#4a5568"
              fadeDistance={diag * 3}
            />
          )}

          {!show && <VenueWalls widthM={venue.widthM} heightM={venue.heightM} />}
          {prefs.labels && !show && <FloorLabels widthM={venue.widthM} heightM={venue.heightM} />}

          {prefs.coverage && !realPov && cameras.map((cam, i) => {
            const fov = fovById.get(cam.id)?.fov;
            if (!fov) return null;
            const pos = effectiveCameraPos(cam);
            return (
              <CoverageWedge
                key={`cov-${cam.id}`}
                cam={{ ...cam, x: pos.x, y: pos.y }}
                hFovDeg={fov.horizontalDeg}
                index={i}
                emphasis={cam.id === selectedCameraId || cam.id === programCameraId}
              />
            );
          })}

          {/* Rig-Aufbau (Stativ, Schiene, Kran) — eigene Gruppe auf der
              Parkposition, waehrend die Kamera selbst auf der verfahrenen
              Position sitzt. Sonst wuerde die Schiene mitfahren. */}
          {cameras.map((cam) => (
            <RigStructure key={`rig-${cam.id}`} cam={cam} isSelected={cam.id === selectedCameraId} />
          ))}

          {/* Cameras with explicit unlock + gizmo editing */}
          {cameras.map((cam) => (
            <CameraRig
              key={cam.id}
              cam={cam}
              isSelected={cam.id === selectedCameraId}
              isUnlocked={cam.id === unlockedCameraId}
              editMode={editMode}
              onSelect={selectCamera}
              onToggleLock={(cameraId) => {
                // Kein setState im Updater — der muss rein bleiben (React ruft
                // ihn in StrictMode doppelt auf).
                const next = unlockedCameraId === cameraId ? null : cameraId;
                setUnlockedCameraId(next);
                if (next) setEditMode('move');
              }}
              onEditModeChange={setEditMode}
              venueWidth={venue.widthM}
              venueHeight={venue.heightM}
              look={{
                showFrustum: cam.id === selectedCameraId || !prefs.coverage,
                showVolume: !prefs.coverage,
                showLabel: prefs.labels && !realPov,
                labelSize,
                tally: cam.id === programCameraId ? 'pgm' : cam.id === selectedCameraId && programCameraId ? 'pvw' : null,
                isPov: !!povCam && cam.id === povCam.id,
              }}
            />
          ))}

          {/* Reference persons from store – draggable.
              Steht die Person auf einem Podest, hebt `groundHeightAt` sie auf
              dessen Oberkante (#73) — sonst steckt sie im Koerper. Beim Ziehen
              greift das erst beim Loslassen, weil dabei nur x/z laufen. */}
          {persons.map((p) => (
            <DraggableOnFloor
              key={p.id}
              x={p.x}
              z={p.y}
              onDragEnd={(nx, nz) => updatePerson(p.id, { x: nx, y: nz })}
            >
              <group position={[0, groundHeightAt(venue.stages, p.x, p.y), 0]}>
                {/* Menschen sehen in jeder Darstellung gleich aus (#173). */}
                <Figur person={p} facingDeg={personBlick(p.x, p.y)} name={prefs.labels && !show} objektName={!realPov} />
              </group>
            </DraggableOnFloor>
          ))}

          </Suspense>
        </Canvas>
      </div>

      <CameraListPanel
        rows={rows}
        selectedId={selectedCameraId}
        programId={programCameraId}
        povId={povCam?.id ?? null}
        prefs={prefs}
        onPrefs={updatePrefs}
        onPick={pickCamera}
        hasFloorPlan={!!backgroundPlan}
        hasRoomWalls={!!venue.videoWalls?.length}
        stufe={stufe}
      />
    </div>
  );
}
