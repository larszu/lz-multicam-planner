import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { kontrastText } from '../../utils/color';
import { LABEL_FONT } from './labelFont';

/**
 * Nummernmarke ueber der Kamera (#233): Scheibe in der Kamerafarbe mit der
 * Nummer aus Liste und Multiview, zum Betrachter gedreht. Am Schirm bleibt
 * sie gleich gross — aus der Ferne lesbar, aus der Naehe nicht im Bild.
 */
export default function KameraMarke({ nummer, label, farbe, tally, groesse }: {
  nummer: number;
  label: string;
  farbe: string;
  tally: string | null;
  /** Durchmesser in Metern bei Bezugsabstand (≈ halbe Hallendiagonale). */
  groesse: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const welt = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const d = camera.position.distanceTo(g.getWorldPosition(welt));
    g.scale.setScalar(Math.min(6, Math.max(0.1, d / (groesse * 30))));
  });
  const r = groesse * 0.7;
  return (
    <group position={[0, 0.35 + groesse, 0]}>
      <group ref={ref}>
        <Billboard>
          {tally && (
            <mesh position={[0, 0, -0.002]}>
              <circleGeometry args={[r * 1.18, 40]} />
              <meshBasicMaterial color={tally} toneMapped={false} />
            </mesh>
          )}
          <mesh>
            <circleGeometry args={[r, 40]} />
            <meshBasicMaterial color={farbe} toneMapped={false} />
          </mesh>
          <Text font={LABEL_FONT} position={[0, 0, 0.002]} fontSize={r * 1.1} color={kontrastText(farbe)} anchorX="center" anchorY="middle" fontWeight="bold">
            {String(nummer)}
          </Text>
          <Text font={LABEL_FONT} position={[0, -r * 1.55, 0]} fontSize={groesse * 0.55} color={tally ?? '#F6F5F0'} anchorX="center" anchorY="middle"
            outlineWidth={groesse * 0.05} outlineColor="#0B1426">
            {label}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}
