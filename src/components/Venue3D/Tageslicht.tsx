// Himmel, Sonne und Mond statt der Hallenkuppel — der Look „Tageslicht".
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Himmel } from '../../avplan/scene3d';
import { LUX_PRO_EINHEIT, TAG_BELICHTUNG_MAX, himmelOrt, himmelZeitpunkt, type HimmelPrefs } from '../../utils/tageslicht';

export function Tageslicht({ sky, diagM, mitte, farDist, onBelichtung }: {
  sky: HimmelPrefs;
  diagM: number;
  mitte: { x: number; y: number };
  /** camera.far; der Himmelswuerfel muss mit seinen Ecken darin liegen. */
  farDist: number;
  onBelichtung: (belichtung: number) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const himmel = useMemo(() => new Himmel({ luxProEinheit: LUX_PRO_EINHEIT, himmelGroesse: farDist * 0.9, szenenGroesseM: diagM }), [farDist, diagM]);
  useEffect(() => () => himmel.dispose(), [himmel]);
  useEffect(() => () => {
    scene.environment = null;
    scene.fog = null;
  }, [scene]);

  const zeit = himmelZeitpunkt(sky).getTime();
  const { lat, lon } = himmelOrt(sky);
  const { nordDeg, wetter } = sky;
  useEffect(() => {
    const m = new THREE.Vector3(mitte.x, 0, mitte.y);
    himmel.himmel.position.copy(m);
    himmel.sterne.position.copy(m);
    himmel.passeSchattenAn(diagM, m);
    const eingabe = { datum: new Date(zeit), lat, lon, nordDeg, wetter };
    const belichtung = Math.min(himmel.aktualisiere(eingabe).belichtung, TAG_BELICHTUNG_MAX);
    // Zweiter Lauf mit der tatsaechlichen Belichtung: Sterne und Mond richten sich danach.
    const z = himmel.aktualisiere({ ...eingabe, belichtung });
    himmel.mondScheibe.position.add(m);
    himmel.wendeNebelAn(scene, z);
    scene.environment = himmel.umgebungAusHimmel(gl);
    scene.environmentIntensity = 1;
    onBelichtung(belichtung);
  }, [himmel, gl, scene, zeit, lat, lon, nordDeg, wetter, diagM, mitte.x, mitte.y, onBelichtung]);

  return <primitive object={himmel.gruppe} />;
}
