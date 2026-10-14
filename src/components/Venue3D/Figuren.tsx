// Figuren der 3D-Szene: Referenzpersonen und Buehnenobjekte. Eigene Datei,
// weil die 3D-Ansicht und die gerenderten Kamerabilder (Vorschau, Multiview)
// dieselben Figuren zeigen.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { LABEL_FONT } from './labelFont';
import type { ReferencePerson, StageObjectType } from '../../types';
import { erzeugeMensch, publikumsVariante } from '../../avplan/scene3d';
import { personDarstellung, type PersonDarstellung } from '../../utils/personGestalt';

export function PersonMesh({ x, z, height, label, objectType, color, showLabel = true }: { x: number; z: number; height: number; label: string; objectType?: StageObjectType; color?: string; showLabel?: boolean }) {
  const type = objectType ?? 'person';
  const defaultColor =
    type === 'drums' ? '#ef4444' :
    type === 'keys' ? '#8b5cf6' :
    type === 'person-guitar' ? '#f97316' :
    type === 'sitting-person' ? '#38bdf8' :
    type === 'mic-stand' ? '#6b7280' :
    type === 'chair' ? '#a16207' :
    type === 'table' ? '#a16207' :
    type === 'lectern' ? '#7c3aed' :
    type === 'schneetiger' ? '#e0f2fe' :
    '#f59e0b';
  const col = color ?? defaultColor;

  return (
    <group position={[x, height / 2, z]}>
      {type === 'drums' ? (
        <>
          <mesh position={[0, -height * 0.15, 0]}>
            <cylinderGeometry args={[0.5, 0.6, height * 0.5, 12]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.2} opacity={0.6} transparent />
          </mesh>
          <mesh position={[-0.3, height * 0.1, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.05, 12]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.3} opacity={0.7} transparent />
          </mesh>
          <mesh position={[0.3, height * 0.15, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 12]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.3} opacity={0.7} transparent />
          </mesh>
        </>
      ) : type === 'keys' ? (
        <>
          <mesh position={[0, -height * 0.1, 0]}>
            <boxGeometry args={[1.2, height * 0.15, 0.4]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.2} opacity={0.6} transparent />
          </mesh>
          <mesh position={[-0.4, -height * 0.35, 0]}>
            <cylinderGeometry args={[0.03, 0.03, height * 0.5, 6]} />
            <meshStandardMaterial color="#9ca3af" opacity={0.5} transparent />
          </mesh>
          <mesh position={[0.4, -height * 0.35, 0]}>
            <cylinderGeometry args={[0.03, 0.03, height * 0.5, 6]} />
            <meshStandardMaterial color="#9ca3af" opacity={0.5} transparent />
          </mesh>
        </>
      ) : type === 'chair' ? (
        <>
          <mesh position={[0, -height * 0.05, 0]}>
            <boxGeometry args={[0.5, 0.05, 0.5]} />
            <meshStandardMaterial color={col} opacity={0.75} transparent />
          </mesh>
          <mesh position={[0, height * 0.25, -0.22]}>
            <boxGeometry args={[0.5, height * 0.55, 0.05]} />
            <meshStandardMaterial color={col} opacity={0.75} transparent />
          </mesh>
          {[[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, -height * 0.3, lz]}>
              <boxGeometry args={[0.04, height * 0.5, 0.04]} />
              <meshStandardMaterial color="#57534e" />
            </mesh>
          ))}
        </>
      ) : type === 'table' ? (
        <>
          <mesh position={[0, height * 0.35, 0]}>
            <boxGeometry args={[1.4, 0.06, 0.8]} />
            <meshStandardMaterial color={col} opacity={0.8} transparent />
          </mesh>
          {[[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, -height * 0.07, lz]}>
              <boxGeometry args={[0.06, height * 0.8, 0.06]} />
              <meshStandardMaterial color="#57534e" />
            </mesh>
          ))}
        </>
      ) : type === 'lectern' ? (
        <>
          {/* Slanted top */}
          <mesh position={[0, height * 0.42, 0]} rotation={[-0.3, 0, 0]}>
            <boxGeometry args={[0.7, 0.05, 0.45]} />
            <meshStandardMaterial color={col} opacity={0.85} transparent />
          </mesh>
          {/* Column */}
          <mesh position={[0, -height * 0.05, 0]}>
            <boxGeometry args={[0.35, height * 0.85, 0.35]} />
            <meshStandardMaterial color={col} opacity={0.65} transparent />
          </mesh>
        </>
      ) : type === 'sitting-person' ? (
        <>
          {/* Torso shorter, lower */}
          <mesh position={[0, -height * 0.05, 0]}>
            <cylinderGeometry args={[0.18, 0.18, height * 0.45, 8]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.2} opacity={0.6} transparent />
          </mesh>
          {/* Head */}
          <mesh position={[0, height * 0.32, 0]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.2} opacity={0.6} transparent />
          </mesh>
          {/* Legs flat */}
          <mesh position={[0, -height * 0.4, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.5, 6]} />
            <meshStandardMaterial color={col} opacity={0.5} transparent />
          </mesh>
        </>
      ) : type === 'schneetiger' ? (
        <>
          {/* Body */}
          <mesh position={[0, -height * 0.05, 0]}>
            <boxGeometry args={[1.5, height * 0.25, 0.6]} />
            <meshStandardMaterial color={col} opacity={0.95} transparent />
          </mesh>
          {/* Head */}
          <mesh position={[0.85, height * 0.12, 0]}>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshStandardMaterial color={col} opacity={0.95} transparent />
          </mesh>
          {/* Tail */}
          <mesh position={[-0.85, -0.05, 0]} rotation={[0, 0, 0.4]}>
            <cylinderGeometry args={[0.04, 0.04, 0.8, 6]} />
            <meshStandardMaterial color={col} />
          </mesh>
          {/* Legs */}
          {[[-0.55, -0.22], [0.55, -0.22], [-0.55, 0.22], [0.55, 0.22]].map(([lx, lz], i) => (
            <mesh key={i} position={[lx, -height * 0.35, lz]}>
              <cylinderGeometry args={[0.08, 0.08, height * 0.4, 6]} />
              <meshStandardMaterial color={col} />
            </mesh>
          ))}
          {/* Stripe band hint */}
          <mesh position={[0, height * 0.13, 0]}>
            <boxGeometry args={[1.51, 0.03, 0.61]} />
            <meshStandardMaterial color="#1f2937" opacity={0.6} transparent />
          </mesh>
        </>
      ) : (
        <>
          {/* Generic person (or guitarist / mic-stand) */}
          <mesh position={[0, -height * 0.1, 0]}>
            <cylinderGeometry args={[0.15, 0.15, height * 0.65, 8]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.2} opacity={0.6} transparent />
          </mesh>
          <mesh position={[0, height * 0.3, 0]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.2} opacity={0.6} transparent />
          </mesh>
          {type === 'person-guitar' && (
            <mesh position={[0.2, -height * 0.05, 0.15]} rotation={[0, 0, 0.3]}>
              <boxGeometry args={[0.12, height * 0.4, 0.06]} />
              <meshStandardMaterial color="#92400e" emissive="#92400e" emissiveIntensity={0.15} opacity={0.7} transparent />
            </mesh>
          )}
          {type === 'mic-stand' && (
            <mesh position={[0, height * 0.15, 0]}>
              <cylinderGeometry args={[0.015, 0.015, height * 0.8, 6]} />
              <meshStandardMaterial color="#9ca3af" opacity={0.7} transparent />
            </mesh>
          )}
        </>
      )}
      {showLabel && (
        <Text font={LABEL_FONT} position={[0, height * 0.5, 0]} fontSize={0.22} color={col} anchorX="center"
          outlineWidth={0.015} outlineColor="#000000">
          {label} ({height}m)
        </Text>
      )}
    </group>
  );
}

function idZahl(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/**
 * Referenzperson als Mensch in voller Detailstufe. Pose, Kleidung und Statur
 * aus `personDarstellung`, Farben aus der Id, damit dieselbe Person immer
 * gleich aussieht; die Farbe der Person (falls gesetzt) wird das Oberteil.
 * Blickt zur Mitte der Kameras.
 */
export function RealPerson({ id, height, darstellung, color, facingDeg }: { id: string; height: number; darstellung: PersonDarstellung; color?: string; facingDeg: number }) {
  const { pose, gestalt } = darstellung;
  const mesh = useMemo(() => {
    const v = publikumsVariante(idZahl(id));
    // Sitzend ist `height` die Hoehe im Sitzen; die Figur misst stehend.
    const stehend = pose === 'sitzen' ? Math.max(1.2, height / 0.72) : height;
    return erzeugeMensch(pose, { oben: color ?? v.oben, unten: v.unten, haut: v.haut, haar: v.haar, langarm: v.langarm }, stehend, gestalt);
  }, [id, height, pose, gestalt, color]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }, [mesh]);
  return <primitive object={mesh} rotation={[0, Math.PI / 2 - (facingDeg * Math.PI) / 180, 0]} />;
}

/**
 * Eine Referenzperson oder ein Buehnenobjekt, wie es in jeder Darstellung
 * erscheint (#173): Menschen detailliert, Objekte als Koerper.
 * `name` zeigt den Namen ueber dem Menschen, `objektName` den am Objekt.
 */
export function Figur({ person, facingDeg, name, objektName }: { person: ReferencePerson; facingDeg: number; name: boolean; objektName: boolean }) {
  const darstellung = useMemo(() => personDarstellung(person), [person.id, person.label, person.objectType]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!darstellung) {
    return <PersonMesh x={0} z={0} height={person.height} label={person.label} objectType={person.objectType} color={person.color} showLabel={objektName} />;
  }
  return (
    <>
      <RealPerson id={person.id} height={person.height} darstellung={darstellung} color={person.color} facingDeg={facingDeg} />
      {name && (
        <Text font={LABEL_FONT} position={[0, person.height + 0.25, 0]} fontSize={0.22} color={person.color ?? '#f59e0b'} anchorX="center"
          outlineWidth={0.015} outlineColor="#000000">
          {person.label}
        </Text>
      )}
    </>
  );
}
