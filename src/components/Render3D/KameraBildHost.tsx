// Der eine Renderer fuer alle gerenderten Kamerabilder (siehe kameraBild3d.ts).
// Sein Canvas liegt ausserhalb des sichtbaren Bereichs; gezeigt wird nur, was
// Vorschau und Multiview daraus in ihre eigenen Flaechen kopieren.
//
// Gerendert wird durch dieselbe Pipeline mit demselben Look wie in der
// 3D-Ansicht (renderLook.ts) — Kamerablick, Vorschau und Multiview zeigen
// dasselbe Bild (#192).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { effectiveCameraPos } from '../../utils/camera';
import { groundHeightAt } from '../../utils/stageBody';
import { bildKamera, kameraBildwinkel } from '../../utils/bildwinkel';
import { SZENEN_ZEIT, SzenenPipeline, stufenWerte, type Stufe } from '../../avplan/scene3d';
import { Figur } from '../Venue3D/Figuren';
import { useKulissenDaten } from '../Venue3D/kulissenDaten';
import { useView3DPrefs } from '../Venue3D/view3dPrefs';
import { useIstHell } from '../../lib/useIstHell';
import { HOST_BREITE, HOST_HOEHE, RenderMessung, bildPixel, setzeRenderer3D, szene3DGeaendert, type BildRolle } from './kameraBild3d';
import { WEBGL_POWER_PREFERENCE } from '../../utils/gpuInfo';
import { renderLook, tiefenschaerfeVon, wendeLookAn } from './renderLook';
import { SzenenGrund } from './SzenenGrund';

export default function KameraBildHost() {
  const [prefs] = useView3DPrefs();
  const simple = prefs.quality === 'simple';
  return (
    <div
      aria-hidden
      style={{ position: 'fixed', left: -20000, top: 0, width: HOST_BREITE, height: HOST_HOEHE, pointerEvents: 'none' }}
    >
      {/* `key`: Schatten legt der Renderer beim Anlegen fest. */}
      {/* Kantenglaettung macht die Pipeline (MSAA im HDR-Ziel); nur die
          einfache Ansicht rendert direkt und braucht sie am Kontext. */}
      <Canvas key={simple ? 'simple' : 'real'} frameloop="demand" dpr={1} shadows={!simple} gl={{ antialias: simple, powerPreference: WEBGL_POWER_PREFERENCE }}>
        <Suspense fallback={null}>
          <HostSzene key={prefs.quality} />
        </Suspense>
      </Canvas>
    </div>
  );
}

/** Eine Pipeline je Rolle, damit Kachel und grosses Bild sich nicht gegenseitig umbauen. */
interface Ziel { p: SzenenPipeline; w: number; h: number }

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

  const tag = show && prefs.daylight;
  const [tagBelichtung, setTagBelichtung] = useState(1);
  const look = useMemo(() => renderLook(show, tag ? tagBelichtung : undefined), [show, tag, tagBelichtung]);
  const onBelichtung = useCallback((b: number) => setTagBelichtung(b), []);

  // Prioritaet 1 uebernimmt das Rendern von react-three-fiber: der Host
  // zeichnet nur auf Anfrage, nicht in jedem Bild.
  useFrame((state) => { SZENEN_ZEIT.value = state.clock.elapsedTime; }, 1);

  const far = daten.farDist * 2;
  const kamera = useMemo(() => new THREE.PerspectiveCamera(40, 16 / 9, 0.1, far), [far]);

  const ziele = useRef(new Map<BildRolle, Ziel>());
  // Wann jedes Bild (Rolle + Kamera) zuletzt gerechnet wurde.
  const zuletzt = useRef(new Map<string, { t: number; stellung: string }>());
  const nachziehen = useRef(0);
  useEffect(() => () => window.clearTimeout(nachziehen.current), []);
  useEffect(() => {
    const z = ziele.current;
    return () => {
      for (const e of z.values()) e.p.dispose();
      z.clear();
    };
  }, [gl, scene, kamera]);

  useEffect(() => {
    const auto = prefs.quality === 'auto';
    setzeRenderer3D({
      render(camId, canvas, cssW, dpr, rolle) {
        const st = useStore.getState();
        const cam = st.cameras.find((c) => c.id === camId);
        if (!cam || !(cssW > 0)) return false;
        const bw = kameraBildwinkel(cam, st);
        if (!bw) return false;
        const pos = effectiveCameraPos(cam);
        const f = bildKamera({ x: pos.x, y: pos.y, z: cam.z, pan: cam.pan, tilt: cam.tilt }, bw.hDeg);
        kamera.position.set(f.pos[0], f.pos[1], f.pos[2]);
        kamera.rotation.order = 'YXZ';
        kamera.rotation.set(f.pitch, f.yaw, 0);
        kamera.fov = f.fovDeg;
        kamera.aspect = f.aspect;
        kamera.updateProjectionMatrix();

        const { w, h } = bildPixel(rolle, cssW, dpr, gesenkt ? 0.6 : 1);
        const t0 = performance.now();
        // Ohne laufende Schleife (frameloop="demand") setzt hier die Zeit fuer
        // Dunst und Videowand.
        SZENEN_ZEIT.value = t0 / 1000;
        gl.setRenderTarget(null);
        gl.setViewport(0, 0, w, h);
        if (simple) {
          gl.setScissorTest(true);
          gl.setScissor(0, 0, w, h);
          gl.render(scene, kamera);
          gl.setScissorTest(false);
        } else {
          // Kacheln (hoechstens 480 px) ohne Verdeckung und Tiefenunschaerfe:
          // in der Groesse sieht man beides nicht, die GPU zahlt es je Kachel.
          // Licht, Tonemapping und Bloom sind dieselben.
          // Waehrend gezogen wird (Bilder dicht hintereinander), rechnet auch
          // das grosse Bild die schnelle Stufe; steht die Hand still, kommt
          // einmal das volle Bild nach.
          // Bewegung heisst: dieselbe Kamera steht anders als beim letzten
          // Bild, und das ist keine 150 ms her. Ein zweites Bild derselben
          // Stellung zaehlt nicht — sonst zoege jedes Nachziehen das naechste nach.
          const jetzt = performance.now();
          const schluessel = `${rolle}:${camId}`;
          const stellung = [pos.x, pos.y, cam.z, cam.pan, cam.tilt, cam.focalLength, cam.focusDistance, cam.extenderActive].join('|');
          const vorher = zuletzt.current.get(schluessel);
          const inBewegung = !!vorher && vorher.stellung !== stellung && jetzt - vorher.t < 150;
          if (!vorher || vorher.stellung !== stellung) zuletzt.current.set(schluessel, { t: jetzt, stellung });
          if (inBewegung && stufe === 'high') {
            window.clearTimeout(nachziehen.current);
            nachziehen.current = window.setTimeout(szene3DGeaendert, 200);
          }
          const q = rolle === 'kachel' || inBewegung ? 'low' : stufe;
          let z = ziele.current.get(rolle);
          if (!z) {
            z = { p: new SzenenPipeline(gl, scene, kamera, { qualitaet: q }), w: 0, h: 0 };
            ziele.current.set(rolle, z);
          }
          z.p.setQualitaet(q);
          wendeLookAn(z.p, look);
          if (z.w !== w || z.h !== h) {
            // Die Pipeline rechnet in CSS-Pixeln mal ihrem Pixelverhaeltnis;
            // der Host-Canvas hat dpr 1, also hier zurueckrechnen.
            const pr = z.p.werte.pixelRatio;
            z.p.setGroesse(w / pr, h / pr);
            z.w = w;
            z.h = h;
          }
          z.p.setTiefenschaerfe(show ? tiefenschaerfeVon(cam, bw.sensor.widthMm) : null);
          gl.setScissorTest(false);
          z.p.render(0);
        }

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
  }, [gl, scene, kamera, prefs.quality, gesenkt, simple, show, stufe, look]);

  // Nach jedem Umbau der Szene sind die kopierten Bilder alt.
  useEffect(() => { szene3DGeaendert(); }, [daten, show, simple, werte, prefs.audience, thema, tag, prefs.sky, look]);

  return (
    <>
      <SzenenGrund
        daten={daten}
        show={show}
        tag={tag}
        sky={prefs.sky}
        simple={simple}
        werte={werte}
        audience={prefs.audience}
        thema={thema}
        far={far}
        look={look}
        onBelichtung={onBelichtung}
      />
      {daten.persons.map((p) => (
        <group key={p.id} position={[p.x, groundHeightAt(daten.venue.stages, p.x, p.y), p.y]}>
          <Figur person={p} facingDeg={daten.personBlick(p.x, p.y)} name={false} objektName={false} />
        </group>
      ))}
    </>
  );
}
