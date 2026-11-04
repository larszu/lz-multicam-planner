import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { STUMPF_FLAECHEN, stumpfEcken, type SchaerfeEbene, type SchaerfeKoerper } from '../../utils/schaerfeKoerper';
import { LABEL_FONT } from './labelFont';

function rahmen(e: SchaerfeEbene): THREE.BufferGeometry {
  const { d, halbB: b, halbH: h } = e;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -b, h, -d, b, h, -d,
    b, h, -d, b, -h, -d,
    b, -h, -d, -b, -h, -d,
    -b, -h, -d, -b, h, -d,
  ]), 3));
  return geo;
}

/**
 * Der scharfe Bereich einer Kamera als Koerper (#225), im Bildraum der
 * FOV-Pyramide (Blick entlang −Z): Nah- und Ferngrenze als Rahmen, die
 * Fokusebene kraeftig, die hyperfokale Distanz als Marke auf der Achse.
 * Endet die Schaerfe nicht im gezeichneten Bereich, ist die Fernkante
 * gestrichelt.
 */
export default function SchaerfeKoerper3D({ k, farbe, beschriftung }: { k: SchaerfeKoerper; farbe: string; beschriftung: number }) {
  const koerper = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(stumpfEcken(k), 3));
    geo.setIndex(STUMPF_FLAECHEN);
    return geo;
  }, [k]);
  const nah = useMemo(() => rahmen(k.nah), [k]);
  const fokus = useMemo(() => rahmen(k.fokus), [k]);
  const fern = useMemo(() => {
    const g = rahmen(k.fern);
    if (k.gekuerzt) new THREE.LineSegments(g).computeLineDistances();
    return g;
  }, [k]);
  const hyperImBereich = k.hyperfokalM <= k.fern.d && k.hyperfokalM >= k.nah.d;
  return (
    <group>
      <mesh geometry={koerper} renderOrder={2}>
        <meshBasicMaterial color={farbe} opacity={k.deckkraft} transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={nah}>
        <lineBasicMaterial color={farbe} opacity={0.7} transparent />
      </lineSegments>
      <lineSegments geometry={fokus}>
        <lineBasicMaterial color="#F6F5F0" opacity={0.95} transparent />
      </lineSegments>
      <lineSegments geometry={fern}>
        {k.gekuerzt
          ? <lineDashedMaterial color={farbe} dashSize={0.3} gapSize={0.2} opacity={0.7} transparent />
          : <lineBasicMaterial color={farbe} opacity={0.7} transparent />}
      </lineSegments>
      {hyperImBereich && (
        <Billboard position={[0, 0, -k.hyperfokalM]}>
          <mesh>
            <circleGeometry args={[beschriftung * 0.12, 20]} />
            <meshBasicMaterial color="#F6F5F0" toneMapped={false} />
          </mesh>
          <Text font={LABEL_FONT} position={[0, beschriftung * 0.35, 0]} fontSize={beschriftung * 0.35} color="#F6F5F0" anchorX="center" anchorY="middle"
            outlineWidth={beschriftung * 0.03} outlineColor="#0B1426">
            {`H ${k.hyperfokalM.toFixed(1)} m`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}
