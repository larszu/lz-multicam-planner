import { useEffect, useMemo } from 'react';
import { erzeugeKameraRig } from '../../avplan/scene3d';
import { achsVersatz, modellSchluessel, type KameraModell } from '../../utils/kameraModell';

/**
 * Baut das Rig neu, wenn sich Bauart, Hoehe oder Schiene aendern; Pan und
 * Tilt stellt es nur. Liefert dazu die Lage der optischen Achse im
 * Neige-Rahmen der Planer-Kamera — dort setzt der Sichtkegel an.
 */
export function useKameraRig(modell: KameraModell, rahmen: { x: number; y: number; z: number; pan: number; tilt: number }) {
  const schluessel = modellSchluessel(modell);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- der Schluessel fasst die Optionen ohne Pan/Tilt
  const rig = useMemo(() => erzeugeKameraRig(modell.optionen), [schluessel]);
  useEffect(() => () => {
    // StrictMode raeumt im Entwicklungsbetrieb einmal zum Schein auf und
    // haengt das Objekt danach nicht neu ein; der Cache bleibt ohnehin.
    const eltern = rig.gruppe.parent;
    rig.dispose();
    eltern?.add(rig.gruppe);
  }, [rig]);

  const { x, y, z, pan, tilt } = rahmen;
  const versatz = useMemo(() => {
    rig.gruppe.position.set(x, 0, y);
    rig.stelle(pan, tilt);
    return achsVersatz(rig, { x, y, z, pan, tilt });
  }, [rig, x, y, z, pan, tilt]);
  return { rig, versatz };
}
