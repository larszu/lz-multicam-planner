// Die Person an der Kamera; ob und in welcher Pose, entscheidet
// `utils/kameraModell` aus der Halterung.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { erzeugeMensch, publikumsVariante } from '../../avplan/scene3d';
import type { BedienerPose } from '../../utils/kameraModell';

function idZahl(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

// Wo die Person relativ zur Pan-Achse steht (Rig-Rahmen: +x Blick, +z rechts),
// abgelesen an den Posen: am Stativ hinter dem Schwenkarm, mit Schulterkamera
// darunter, die Kamera auf der rechten Schulter.
const STAND: Record<BedienerPose, [number, number]> = {
  kameraStativ: [-0.72, -0.12],
  kameraSchulter: [-0.06, -0.18],
};

/** Kamerafrau oder Kameramann an der Kamera; dreht mit dem Schwenk. */
export function Bediener({ id, pose, x, y, z, pan }: { id: string; pose: BedienerPose; x: number; y: number; z: number; pan: number }) {
  // Schulterkamera: die Groesse folgt der Objektivhoehe, sonst schwebt sie.
  const groesse = pose === 'kameraSchulter' ? Math.min(1.95, Math.max(1.55, ((z - 0.05) / 1.45) * 1.75)) : 1.75;
  const mesh = useMemo(() => {
    const v = publikumsVariante(idZahl(id));
    return erzeugeMensch(pose, { oben: '#1c1d21', unten: '#26272b', haut: v.haut, haar: v.haar, langarm: true }, groesse);
  }, [id, pose, groesse]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }, [mesh]);
  const [vor, quer] = STAND[pose];
  return (
    <group position={[x, 0, y]} rotation={[0, (-pan * Math.PI) / 180, 0]}>
      <primitive object={mesh} position={[vor, 0, quer]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}
