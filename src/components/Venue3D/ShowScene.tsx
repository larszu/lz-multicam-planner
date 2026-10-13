// ───────────────────────────────────────────────────────────────────────────
// Kulisse der 3D-Ansicht: Publikum, Showlicht, LED-Wand, Abdeckungskeile.
//
// Alles hier ist Bild, nicht Planung — die Vorschau und die Sichtlinien
// rechnen nicht damit. Es soll die Halle so aussehen lassen, wie sie am
// Abend aussieht, damit man Kamerapositionen nicht auf einem leeren Gitter
// beurteilt. Darum gilt: billig rechnen. Publikum als zwei InstancedMesh
// (ein Draw-Call je Teil, egal wie viele Menschen), keine Schattenkarten,
// hoechstens acht echte Scheinwerfer.
// ───────────────────────────────────────────────────────────────────────────
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SpotLight } from '@react-three/drei';
import type { Stage, VenueCamera } from '../../types';
import { stageTopZ } from '../../utils/stageBody';
import { audienceSeats, coverageWedge, videoBoardPlacement, type AudienceInput } from '../../utils/view3dScene';

// Kleidung in gedeckten Toenen — bunt genug, dass es nach Menschen aussieht,
// gedaempft genug, dass die Kamerafarben davor lesbar bleiben.
const CLOTHES = ['#3b4a63', '#5a4a3f', '#6b7280', '#2f3b52', '#7c6a58', '#46566e', '#8a7f72', '#394150', '#5b6b5a', '#6e5f73'];
const SKIN = ['#e0b899', '#c99a76', '#a87756', '#7a5238', '#f0cdb0'];

/* ── Publikum ── */
export function Audience({ input }: { input: AudienceInput }) {
  const seats = useMemo(() => audienceSeats(input), [input]);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const bodyGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.16, 0.21, 1, 6);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const headGeo = useMemo(() => new THREE.SphereGeometry(0.11, 7, 5), []);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    seats.forEach((s, i) => {
      // Sitzend, 1,15–1,35 m Kopfhoehe: deckt den Boden, verstellt aber keine
      // Kamera auf Stativhoehe.
      const h = 1.15 + s.r * 0.2;
      m.makeScale(1, h - 0.2, 1).setPosition(s.x, 0, s.y);
      body.setMatrixAt(i, m);
      body.setColorAt(i, c.set(CLOTHES[Math.floor(s.r * 997) % CLOTHES.length]));
      m.makeTranslation(s.x, h - 0.08, s.y);
      head.setMatrixAt(i, m);
      head.setColorAt(i, c.set(SKIN[Math.floor(s.r * 389) % SKIN.length]));
    });
    body.count = seats.length;
    head.count = seats.length;
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (head.instanceColor) head.instanceColor.needsUpdate = true;
    body.computeBoundingSphere();
    head.computeBoundingSphere();
  }, [seats]);

  if (seats.length === 0) return null;
  // `key` mit der Anzahl: ein InstancedMesh kann nicht ueber seine angelegte
  // Groesse hinaus wachsen, also bei neuer Groesse neu anlegen.
  return (
    <group key={seats.length}>
      <instancedMesh ref={bodyRef} args={[bodyGeo, undefined, seats.length]} frustumCulled={false}>
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[headGeo, undefined, seats.length]} frustumCulled={false}>
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}

/* ── Showlicht: Scheinwerfer mit sichtbarem Kegel ueber jeder Buehne ── */
const MAX_SPOTS = 8;
const MAX_SPOT_STAGE_M = 30;

function Spot({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    target.position.set(...to);
    target.updateMatrixWorld();
  }, [target, to]);
  const dist = Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]);
  return (
    <>
      <primitive object={target} />
      <SpotLight
        position={from}
        target={target}
        color={color}
        angle={0.32}
        penumbra={0.6}
        distance={dist * 1.6}
        decay={1.2}
        intensity={2.2 * Math.pow(dist, 1.2)}
        attenuation={dist * 1.1}
        anglePower={4}
        opacity={0.55}
        radiusTop={0.15}
        radiusBottom={dist * 0.33}
      />
    </>
  );
}

export function StageLights({ stages, depthM }: { stages: Stage[]; depthM: number }) {
  const spots = useMemo(() => {
    const out: { from: [number, number, number]; to: [number, number, number]; color: string }[] = [];
    // Ab Spielfeldgroesse haengen keine Spots mehr ueber der Flaeche, sondern
    // Flutlicht — das liefert die Grundbeleuchtung, nicht diese Kegel.
    const list = stages
      .filter((s) => Math.max(s.width, s.height) <= MAX_SPOT_STAGE_M)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    for (const s of list) {
      const top = stageTopZ(s);
      const n = Math.max(1, Math.min(4, Math.round(s.width / 4)));
      const rigH = top + Math.max(6, Math.min(14, s.width * 0.6));
      // Die Traverse haengt vor der Buehne, zum Publikum hin: Licht von vorn
      // oben, wie es in jeder Halle haengt.
      const front = s.y + s.height / 2 < depthM / 2 ? s.y + s.height + 2 : s.y - 2;
      for (let i = 0; i < n && out.length < MAX_SPOTS; i++) {
        const x = s.x + ((i + 0.5) / n) * s.width;
        out.push({
          from: [x, rigH, front],
          to: [x, top, s.y + s.height / 2],
          color: i % 2 === 0 ? '#fff4e0' : '#dbe6ff',
        });
      }
      if (out.length >= MAX_SPOTS) break;
    }
    return out;
  }, [stages, depthM]);
  return <>{spots.map((s, i) => <Spot key={i} {...s} />)}</>;
}

/* ── LED-Wand hinter der Buehne ── */
function boardTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#132040';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1D324F';
  ctx.fillRect(0, c.height * 0.62, c.width, c.height * 0.38);
  ctx.fillStyle = '#F6F5F0';
  ctx.fillRect(64, c.height * 0.62 - 6, c.width - 128, 4);
  ctx.font = '900 92px "Public Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(text.toUpperCase().slice(0, 18), 64, c.height * 0.5);
  ctx.fillStyle = '#D6402E';
  ctx.fillRect(64, c.height * 0.5 + 24, 18, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function VideoBoards({ stages, look, title }: { stages: Stage[]; look: { x: number; y: number }; title: string }) {
  const tex = useMemo(() => boardTexture(title), [title]);
  useLayoutEffect(() => () => tex.dispose(), [tex]);
  return (
    <>
      {stages.map((s) => {
        const p = videoBoardPlacement(s, look);
        const h = Math.min(10, p.width * 9 / 16);
        const top = stageTopZ(s);
        return (
          <mesh key={s.id} position={[p.x, top + 0.6 + h / 2, p.y]} rotation={[0, p.rotY, 0]}>
            <planeGeometry args={[p.width, h]} />
            <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </>
  );
}

/* ── Abdeckung am Boden: ein Keil je Kamera bis zum Schaerfepunkt ── */
export function CoverageWedge({ cam, hFovDeg, index, emphasis }: { cam: VenueCamera; hFovDeg: number; index: number; emphasis: boolean }) {
  const [a, b, c] = coverageWedge(cam, hFovDeg);
  const y = 0.03 + index * 0.002;
  const fill = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([a[0], y, a[1], c[0], y, c[1], b[0], y, b[1]]), 3));
    return g;
  }, [a[0], a[1], b[0], b[1], c[0], c[1], y]); // eslint-disable-line react-hooks/exhaustive-deps
  const edges = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const aim = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      a[0], y, a[1], b[0], y, b[1],
      b[0], y, b[1], c[0], y, c[1],
      c[0], y, c[1], a[0], y, a[1],
      // Sehlinie von der Kamera (auf ihrer Hoehe) zum Ziel.
      a[0], cam.z, a[1], aim[0], y, aim[1],
    ]), 3));
    return g;
  }, [a[0], a[1], b[0], b[1], c[0], c[1], y, cam.z]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => { fill.dispose(); edges.dispose(); }, [fill, edges]);
  return (
    <group>
      <mesh geometry={fill}>
        <meshBasicMaterial color={cam.color} transparent opacity={emphasis ? 0.22 : 0.11} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={cam.color} transparent opacity={emphasis ? 0.95 : 0.6} />
      </lineSegments>
    </group>
  );
}
