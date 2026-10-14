// Rig-Aufbau in 3D fuer die Montagen, die `@avplan/scene3d` nicht baut
// (Cable-Cam, Drohne, Scherenbuehne, Steadicam …; siehe utils/kameraModell).
//
// Liest dasselbe prozedurale Skelett wie die 2D-Draufsicht
// (`utils/rigGeometry`) und extrudiert jede Strecke zu einem Zylinder (Rohre,
// Beine, Seile) bzw. zu einem Kasten (Chassis, Schiene, Schwelle). Dadurch
// stimmen Plan und 3D-Ansicht zwangslaeufig ueberein, und ein 30-ft-Kran ist
// wirklich doppelt so lang wie ein 15-ft-Kran — ohne gebundelte 3D-Assets.
//
// Die Gruppe sitzt auf der PARKPOSITION (cam.x/cam.y) und ist um -pan gedreht.
// Damit gilt lokal: x = Blickrichtung (f), y = Hoehe (h), z = quer (l) — genau
// die Achsen des Rig-Frames.
import * as THREE from 'three';
import type { VenueCamera } from '../../types';
import { rigYaw } from '../../utils/camera';
import { rigLimits } from '../../utils/rigLimits';
import { rigSkeleton, type RigRole, type RigSegment } from '../../utils/rigGeometry';

const UP = new THREE.Vector3(0, 1, 0);

/** Kasten statt Rohr — flache/breite Bauteile. */
const BOXY: ReadonlySet<RigRole> = new Set<RigRole>(['body', 'rail', 'sleeper']);

function roleMaterial(role: RigRole, camColor: string): { color: string; opacity: number; metal: number } {
  switch (role) {
    case 'arm':
    case 'telescope':
      return { color: camColor, opacity: 0.95, metal: 0.5 };
    case 'rail':
      return { color: '#d1d5db', opacity: 1, metal: 0.9 };
    case 'sleeper':
      return { color: '#78716c', opacity: 1, metal: 0.1 };
    case 'body':
      return { color: '#4b5563', opacity: 0.95, metal: 0.3 };
    case 'weight':
      return { color: '#1f2937', opacity: 1, metal: 0.4 };
    case 'wheel':
      return { color: '#111827', opacity: 1, metal: 0.2 };
    case 'wire':
      return { color: camColor, opacity: 0.45, metal: 0 };
    case 'plumb':
      return { color: '#e2e8f0', opacity: 0.18, metal: 0 };
    default:
      return { color: '#9ca3af', opacity: 0.95, metal: 0.6 };
  }
}

/**
 * Eine Strecke des Skeletts. Die Geometrie entsteht entlang der lokalen
 * y-Achse und wird per Quaternion auf die Richtung a→b gedreht.
 */
function Strut({ s, camColor }: { s: RigSegment; camColor: string }) {
  const a = new THREE.Vector3(s.a.f, s.a.h, s.a.l);
  const b = new THREE.Vector3(s.b.f, s.b.h, s.b.l);
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) return null;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const { color, opacity, metal } = roleMaterial(s.role, camColor);
  const t = s.thicknessM;

  return (
    <mesh position={mid} quaternion={quat}>
      {BOXY.has(s.role) ? (
        // Schwellen/Schienen sind flach, Chassis eher kastig.
        <boxGeometry args={[t, len, s.role === 'body' ? Math.max(0.12, t * 0.35) : Math.max(0.04, t * 0.6)]} />
      ) : (
        <cylinderGeometry args={[t / 2, t / 2, len, 8]} />
      )}
      <meshStandardMaterial
        color={color}
        opacity={opacity}
        transparent={opacity < 1}
        metalness={metal}
        roughness={0.55}
      />
    </mesh>
  );
}

export default function RigStructure({ cam, isSelected }: { cam: VenueCamera; isSelected: boolean }) {
  const limits = rigLimits(cam);
  const skel = rigSkeleton(limits, { heightM: cam.z, offsetM: cam.trackOffset ?? 0 });

  return (
    <group position={[cam.x, 0, cam.y]} rotation={[0, THREE.MathUtils.degToRad(-rigYaw(cam)), 0]}>
      {skel.segments.map((s, i) => (
        <Strut key={i} s={s} camColor={cam.color} />
      ))}

      {/* Standflaeche als hauchdünne Platte — zeigt den Platzbedarf am Boden. */}
      {skel.footprint && isSelected && (
        <mesh position={[skel.footprint.centerF, 0.008, skel.footprint.centerL]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[skel.footprint.f, skel.footprint.l]} />
          <meshBasicMaterial color={cam.color} opacity={0.12} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
