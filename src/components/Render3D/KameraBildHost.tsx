// Der eine Renderer fuer alle gerenderten Kamerabilder (siehe kameraBild3d.ts).
// Sein Canvas liegt ausserhalb des sichtbaren Bereichs; gezeigt wird nur, was
// Vorschau und Multiview daraus in ihre eigenen Flaechen kopieren.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { getCameraById, getEffectiveSensor } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov } from '../../utils/fov';
import { effectiveCameraPos } from '../../utils/camera';
import { groundHeightAt } from '../../utils/stageBody';
import { povFraming } from '../../utils/view3dScene';
import { SZENEN_ZEIT, stufenWerte, type Stufe } from '../../avplan/scene3d';
import { Atmosphere } from '../Venue3D/ShowScene';
import { Kulisse } from '../Venue3D/Kulisse';
import { Figur } from '../Venue3D/Figuren';
import { useKulissenDaten } from '../Venue3D/kulissenDaten';
import { useView3DPrefs } from '../Venue3D/view3dPrefs';
import { PLANUNG_JE_THEMA, PLANUNGS_BODEN } from '../Venue3D/planungsLook';
import { useIstHell } from '../../lib/useIstHell';
import { HOST_BREITE, HOST_HOEHE, RenderMessung, bildPixel, setzeRenderer3D, szene3DGeaendert } from './kameraBild3d';

export default function KameraBildHost() {
  const [prefs] = useView3DPrefs();
  const simple = prefs.quality === 'simple';
  return (
    <div
      aria-hidden
      style={{ position: 'fixed', left: -20000, top: 0, width: HOST_BREITE, height: HOST_HOEHE, pointerEvents: 'none' }}
    >
      {/* `key`: Schatten legt der Renderer beim Anlegen fest. */}
      <Canvas key={simple ? 'simple' : 'real'} frameloop="demand" dpr={1} shadows={!simple} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <HostSzene key={prefs.quality} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function HostSzene() {
  const [prefs] = useView3DPrefs();
  const simple = prefs.quality === 'simple';
  const show = prefs.showLight && !simple;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const daten = useKulissenDaten(prefs.videoBoard);
  // Ohne Showlicht folgt der Planungs-Look dem Thema — wie in der 3D-Ansicht.
  const thema = useIstHell() ? 'hell' : 'dunkel';
  // Auto senkt einmal, wenn die Bilder zu lange brauchen. Ein Wechsel der
  // Qualitaet baut die Szene neu (`key` am Aufrufer) und misst von vorn.
  const [gesenkt, setGesenkt] = useState(false);
  const stufe: Stufe = prefs.quality === 'low' || gesenkt ? 'low' : 'high';
  const werte = useMemo(() => stufenWerte(stufe), [stufe]);
  const messung = useRef(new RenderMessung());

  useEffect(() => { stelleRendererEin(gl, show, !simple && werte.schatten); }, [gl, show, simple, werte.schatten]);

  // Prioritaet 1 uebernimmt das Rendern von react-three-fiber: der Host
  // zeichnet nur auf Anfrage, nicht in jedem Bild.
  useFrame((state) => { SZENEN_ZEIT.value = state.clock.elapsedTime; }, 1);

  const kamera = useMemo(() => new THREE.PerspectiveCamera(40, 16 / 9, 0.1, daten.farDist * 2), [daten.farDist]);

  useEffect(() => {
    const auto = prefs.quality === 'auto';
    setzeRenderer3D({
      render(camId, canvas, cssW, dpr, rolle) {
        const st = useStore.getState();
        const cam = st.cameras.find((c) => c.id === camId);
        if (!cam || !(cssW > 0)) return false;
        const camDef = getCameraById(cam.cameraId, st.customCameras);
        const lensDef = getLensById(cam.lensId, st.customLenses);
        if (!camDef || !lensDef) return false;
        const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
        const fov = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1);
        const pos = effectiveCameraPos(cam);
        const f = povFraming({ ...cam, x: pos.x, y: pos.y }, fov.horizontalDeg, 16 / 9);
        kamera.position.set(f.pos[0], f.pos[1], f.pos[2]);
        kamera.rotation.order = 'YXZ';
        kamera.rotation.set(f.pitch, f.yaw, 0);
        kamera.fov = f.fovDeg;
        kamera.aspect = 16 / 9;
        kamera.updateProjectionMatrix();

        const { w, h } = bildPixel(rolle, cssW, dpr, gesenkt ? 0.6 : 1);
        const t0 = performance.now();
        // Ohne laufende Schleife (frameloop="demand") setzt hier die Zeit fuer
        // Dunst und Videowand.
        SZENEN_ZEIT.value = t0 / 1000;
        gl.setRenderTarget(null);
        gl.setScissorTest(true);
        gl.setViewport(0, 0, w, h);
        gl.setScissor(0, 0, w, h);
        gl.render(scene, kamera);
        gl.setScissorTest(false);

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${Math.round((cssW * 9) / 16)}px`;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        // Viewport liegt unten links; im Canvas zaehlt y von oben.
        ctx.drawImage(gl.domElement, 0, gl.domElement.height - h, w, h, 0, 0, w, h);

        if (auto && messung.current.bild(performance.now() - t0)) setGesenkt(true);
        return true;
      },
    });
    return () => setzeRenderer3D(null);
  }, [gl, scene, kamera, prefs.quality, gesenkt]);

  // Nach jedem Umbau der Szene sind die kopierten Bilder alt.
  useEffect(() => { szene3DGeaendert(); }, [daten, show, simple, werte, prefs.audience, thema]);

  return (
    <>
      <Atmosphere look={show ? (daten.draussen ? 'nacht' : 'arena') : 'planung'} hintergrund={show ? undefined : PLANUNG_JE_THEMA[thema]} diagM={daten.diag} domeRadius={daten.farDist * 0.8} />
      <Kulisse daten={daten} show={show} simple={simple} werte={werte} audience={prefs.audience} planungsBoden={PLANUNGS_BODEN[thema]} />
      {daten.persons.map((p) => (
        <group key={p.id} position={[p.x, groundHeightAt(daten.venue.stages, p.x, p.y), p.y]}>
          <Figur person={p} facingDeg={daten.personBlick(p.x, p.y)} name={false} objektName={false} />
        </group>
      ))}
    </>
  );
}

function stelleRendererEin(gl: THREE.WebGLRenderer, show: boolean, schatten: boolean): void {
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = show ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
  gl.toneMappingExposure = show ? 1.05 : 1;
  gl.shadowMap.enabled = schatten;
  gl.shadowMap.needsUpdate = true;
}
