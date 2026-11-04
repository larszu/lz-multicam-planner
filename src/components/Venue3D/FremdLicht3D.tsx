// Leuchten aus dem Lichtplan als grobe Kegel (#234) — keine Lichtberechnung,
// nur sichtbar machen, wohin jede Leuchte strahlt. Dieselbe Szene speist die
// gerenderten Kamerabilder, also sieht man die Kegel auch in Vorschau und
// Multiview.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { entsorge } from '../../avplan/scene3d';
import { cctToColor, foreignFixturesFrom, type ForeignFixture } from '../../utils/foreignView';
import { szene3DGeaendert } from '../Render3D/kameraBild3d';

const MAX_LAENGE_M = 40;
const NACH_UNTEN = new THREE.Vector3(0, -1, 0);

function kegel(f: ForeignFixture): THREE.Group {
  const g = new THREE.Group();
  const quelle = new THREE.Vector3(f.x, f.z, f.y);
  const ziel = f.aimX !== undefined && f.aimY !== undefined ? new THREE.Vector3(f.aimX, 0, f.aimY) : new THREE.Vector3(f.x, 0, f.y);
  const achse = ziel.clone().sub(quelle);
  const laenge = Math.min(MAX_LAENGE_M, Math.max(1, achse.length()));
  if (achse.lengthSq() < 1e-6) achse.copy(NACH_UNTEN);
  const farbe = new THREE.Color(cctToColor(f.colorTemp));
  const radius = laenge * Math.tan((f.fieldDeg / 2) * (Math.PI / 180));
  const geo = new THREE.ConeGeometry(radius, laenge, 24, 1, true);
  geo.translate(0, -laenge / 2, 0);
  const strahl = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: farbe, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  strahl.quaternion.setFromUnitVectors(NACH_UNTEN, achse.normalize());
  strahl.renderOrder = 2;
  const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: farbe }));
  g.add(strahl, lampe);
  g.position.copy(quelle);
  g.name = `fremdlicht-${f.id}`;
  return g;
}

export function FremdLicht3D() {
  const lighting = useStore((s) => s.avForeign.lighting);
  const sichtbar = useStore((s) => s.showForeign);
  const obj = useMemo(() => {
    if (!sichtbar) return null;
    const fixtures = foreignFixturesFrom(lighting).filter((f) => !f.hidden);
    if (fixtures.length === 0) return null;
    const g = new THREE.Group();
    for (const f of fixtures) g.add(kegel(f));
    return g;
  }, [lighting, sichtbar]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    szene3DGeaendert();
    invalidate();
    return () => { if (obj) entsorge(obj); };
  }, [obj, invalidate]);
  return obj ? <primitive object={obj} /> : null;
}
