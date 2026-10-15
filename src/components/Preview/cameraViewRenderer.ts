// ───────────────────────────────────────────────────────────────────────────
// KAMERABILD OHNE GEMOUNTETE VORSCHAU (#172)
//
// Das gezeichnete Kamerabild (Horizont, Buehne, Waende, Personen, andere
// Kameras, Hilfslinien) lebte als `draw` in der Vorschau-Komponente. Das
// Multiview lieh es sich ueber die Export-Registry — und hatte kein Bild,
// sobald die Vorschau nicht gemountet war. Im Raster lagen beide im selben
// Reiterblock; wer das Multiview hineinzog, verdeckte die Vorschau, und
// zusammen gingen sie nie.
//
// Hier steht das Zeichnen als Funktion ueber (Kamera, Szene, Ziel-Canvas).
// Die Vorschau ruft sie fuer ihr Bild, das Multiview fuer jede Kachel —
// keiner braucht den anderen.
// ───────────────────────────────────────────────────────────────────────────
import { useStore } from '../../store/useStore';
import { defaultWallHeight, resolveWallHeights, type ResolvedWall } from '../../utils/wallHeight';
import { getCameraById, getEffectiveSensor } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov } from '../../utils/fov';
import { bildVDeg, kameraProjektion } from '../../utils/bildwinkel';
import { effectiveCameraPos } from '../../utils/camera';
import type { Camera, Lens, ReferencePerson, Stage, StageObjectType, Venue, VenueCamera, Wall } from '../../types';
import type { StageFace } from '../../utils/stageBody';
import { groundHeightAt, stageColor, stageFaces, stageLabelAnchor, stageOpacity } from '../../utils/stageBody';
import { alphaSuffix, shadeHex } from '../../utils/color';
import { format, translate } from '../../i18n';
import {
  DEFAULT_PATTERN_ROWS,
  paintWallSurface,
  stripCount,
  stripRanges,
  stripTransform,
  surfaceKey,
  textureSize,
} from '../../utils/wallSurface';

type TFn = (key: string, en: string) => string;

export interface ProjectedPerson { id: string; sx: number; sy: number; topSy: number; dist: number }

export interface CameraViewOverlays { grid: boolean; safeAreas: boolean; thirds: boolean; crosshair: boolean }

export interface CameraViewScene {
  venue: Venue;
  persons: ReferencePerson[];
  walls: Wall[];
  cameras: VenueCamera[];
  customCameras: Camera[];
  customLenses: Lens[];
}

/**
 * Wandflaechen (#45, #74): Bilder dekodieren und fertig gemalte Muster
 * zwischenspeichern. EINE Instanz fuer alle Zeichner, damit Vorschau und
 * Multiview dieselbe Wand nicht zweimal malen. Wer neu zeichnen muss, sobald
 * ein Bild fertig geladen ist, meldet sich mit `subscribe` an.
 */
export class WallSurfaces {
  private images = new Map<string, HTMLImageElement>();
  private textures = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
  private listeners = new Set<() => void>();
  /** Zaehlt geladene Bilder — als Schluessel fuer „neu zeichnen". */
  version = 0;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  image(dataUrl: string): HTMLImageElement | null {
    const existing = this.images.get(dataUrl);
    if (existing) return existing.complete && existing.naturalWidth > 0 ? existing : null;
    const img = new Image();
    img.onload = () => {
      this.version += 1;
      this.listeners.forEach((fn) => fn());
    };
    img.src = dataUrl;
    this.images.set(dataUrl, img);
    return null;
  }

  texture(wall: ResolvedWall, lengthM: number): HTMLCanvasElement | null {
    const pattern = wall.pattern ?? 'solid';
    if (pattern === 'solid') return null;
    const img = pattern === 'image' && wall.patternImage ? this.image(wall.patternImage) : null;
    if (pattern === 'image' && !img) return null;
    const key = surfaceKey(wall, lengthM);
    const cached = this.textures.get(wall.id);
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
    this.textures.set(wall.id, { key, canvas });
    return canvas;
  }
}

export const wallSurfaces = new WallSurfaces();

export interface DrawCameraViewArgs {
  canvas: HTMLCanvasElement;
  /** Breite in CSS-Pixeln; die Hoehe folgt aus 16:9. */
  cssW: number;
  dpr: number;
  cam: VenueCamera;
  /** Ohne Bedien-Overlays (Lineale, Hilfslinien, Badges) — fuer Multiview-Kacheln. */
  bare: boolean;
  scene: CameraViewScene;
  overlays: CameraViewOverlays;
  t: TFn;
  surfaces?: WallSurfaces;
  /**
   * Gerendertes Kamerabild (#167): ersetzt die gezeichnete Szene, die
   * Bedien-Overlays (Lineale, Hilfslinien, Fadenkreuz, Badges) liegen darauf.
   * Die Szene wird trotzdem durchgerechnet — sie liefert die projizierten
   * Personen fuers Antippen und die Zaehlung „im Bild".
   */
  hintergrund?: CanvasImageSource | null;
}

/**
 * Zeichnet das Bild einer Kamera in `canvas`. Liefert die projizierten
 * Personen (fuer das Antippen in der Vorschau) oder `undefined`, wenn nichts
 * zu zeichnen war (Kamera/Objektiv unbekannt, Breite 0).
 */
export function drawCameraView(args: DrawCameraViewArgs): ProjectedPerson[] | undefined {
  const { canvas, cssW, dpr, cam, bare, t } = args;
  const { venue, persons, cameras, customCameras, customLenses } = args.scene;
  const walls = resolveWallHeights(args.scene.walls, defaultWallHeight(venue));
  const { grid: showGrid, safeAreas: showSafeAreas, thirds: showThirds, crosshair: showCrosshair } = args.overlays;
  const surfaces = args.surfaces ?? wallSurfaces;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const camDef = getCameraById(cam.cameraId, customCameras);
  const lensDef = getLensById(cam.lensId, customLenses);
  if (!camDef || !lensDef) return;

  const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);

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
  // Das Bild ist 16:9 so breit wie der Sensor — der vertikale Winkel folgt
  // daraus (utils/bildwinkel), nicht aus der Sensorhoehe. Sonst waere ein
  // 3:2-Sensor in der 16:9-Flaeche senkrecht gestaucht.
  const vDeg = bildVDeg(fov.horizontalDeg);

  const imgW = fov.imageWidthAtDistance;
  const imgH = (imgW * 9) / 16;

  // ── Pan/Tilt offsets ──
  // For a level camera the horizon sits at H/2 regardless of camera height — cam.z only
  // affects where individual objects project (handled in worldToScreen below).
  // Positive tilt = looking up → horizon must move DOWN in the frame (larger y).
  const tiltOffsetPx = (Math.tan((cam.tilt * Math.PI) / 180) / Math.tan((vDeg / 2) * Math.PI / 180)) * (H / 2);
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
  const NEAR = 0.1;

  type CamPoint = { x: number; y: number; z: number };

  const camPos = effectiveCameraPos(cam!);
  // Dieselbe Lochkamera wie der Kamerablick und das gerenderte Bild (#192).
  const projektion = kameraProjektion({ x: camPos.x, y: camPos.y, z: cam.z, pan: cam.pan, tilt: cam.tilt }, fov.horizontalDeg, W, H);
  const worldToCamera = projektion.zuKamera;
  const cameraToScreen = projektion.zuBild;

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
  const drawWall = (wall: ResolvedWall, dist: number) => {
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
      const texture = surfaces.texture(wall, len);
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

  const projectedPersons = { current: [] as ProjectedPerson[] };
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

  if (args.hintergrund) ctx.drawImage(args.hintergrund, 0, 0, W, H);

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
    const py = groundYClamped - (m / imgH) * H;
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

  // ═══ VIGNETTE ═══ (nur auf der Zeichnung; das gerenderte Bild ist fertig)
  if (!args.hintergrund) {
    const vigR = Math.max(W, H) * 0.8;
    const vig = ctx.createRadialGradient(W / 2, H / 2, vigR * 0.4, W / 2, H / 2, vigR);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.7, 'rgba(0,0,0,0.05)');
    vig.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

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

  return projectedPersons.current;
}

/** Overlays der Multiview-Kacheln: Bodenraster ja, Bedienhilfen nein. */
const KACHEL_OVERLAYS: CameraViewOverlays = { grid: true, safeAreas: false, thirds: false, crosshair: false };

/**
 * Eine Kamera aus dem Store ohne Bedien-Overlays zeichnen — braucht keine
 * gemountete Vorschau. `false`, wenn es die Kamera nicht (mehr) gibt.
 */
export function renderCamera(camId: string, canvas: HTMLCanvasElement, cssW: number, dpr = 1): boolean {
  const s = useStore.getState();
  const cam = s.cameras.find((c) => c.id === camId);
  if (!cam) return false;
  const projected = drawCameraView({
    canvas,
    cssW,
    dpr,
    cam,
    bare: true,
    scene: { venue: s.venue, persons: s.persons, walls: s.walls, cameras: s.cameras, customCameras: s.customCameras, customLenses: s.customLenses },
    overlays: KACHEL_OVERLAYS,
    t: (key, en) => translate(s.language, key, en),
  });
  return projected !== undefined && canvas.width > 0;
}
