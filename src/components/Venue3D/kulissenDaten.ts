import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { defaultWallHeight, resolveWallHeights } from '../../utils/wallHeight';
import { effectiveCameraPos } from '../../utils/camera';
import { autoVideoWalls, hatSpielfeld } from '../../utils/showRig';

/**
 * Was die Kulisse aus dem Plan ableitet — gemeinsam fuer die 3D-Ansicht und
 * die gerenderten Kamerabilder, damit beide dieselbe Halle zeigen.
 */
export function useKulissenDaten(videoBoard: boolean) {
  const venue = useStore((s) => s.venue);
  const cameras = useStore((s) => s.cameras);
  const persons = useStore((s) => s.persons);
  const rohWalls = useStore((s) => s.walls);
  const walls = useMemo(() => resolveWallHeights(rohWalls, defaultWallHeight(venue)), [rohWalls, venue]);

  const diag = Math.hypot(venue.widthM, venue.heightM);
  // Nur die STANDORTE, als Zeichenkette verglichen: ein Schwenk, ein Zoom
  // oder ein Fokuszug aendert sie nicht. Vorher hing alles am ganzen
  // Kamera-Array — jede Brennweitenaenderung baute Publikum, Videowaende und
  // Showlicht mit neuen Materialien neu (Shader-Kompilierung, 60–160 ms je
  // Bild, auch bei verdeckter 3D-Ansicht).
  // Und mit Nachlauf: beim Ziehen einer Kamera oder Person zieht die Kulisse
  // erst 250 ms nach dem letzten Schritt nach — einmal statt 60-mal je Sekunde.
  const camKey = useNachlauf(useStore((s) => standortSchluessel(s.cameras.map((c) => effectiveCameraPos(c)))));
  const personKey = useNachlauf(useStore((s) => standortSchluessel(s.persons)));
  const audienceCams = useMemo(() => standorteAus(camKey), [camKey]);
  const audiencePersons = useMemo(() => standorteAus(personKey), [personKey]);
  // Blickziel von Videowand und Personen: Mitte der Kameras.
  const boardLook = useMemo(() => {
    if (audienceCams.length === 0) return { x: venue.widthM / 2, y: venue.heightM / 2 };
    return {
      x: audienceCams.reduce((a, p) => a + p.x, 0) / audienceCams.length,
      y: audienceCams.reduce((a, p) => a + p.y, 0) / audienceCams.length,
    };
  }, [audienceCams, venue.widthM, venue.heightM]);
  const draussen = hatSpielfeld(venue.stages) || (!venue.ceilingHeightM && venue.floorMaterial === 'turf');
  const ledWaende = useMemo(
    () => (venue.videoWalls?.length ? venue.videoWalls : videoBoard ? autoVideoWalls(venue.stages, boardLook) : []),
    [venue.videoWalls, venue.stages, videoBoard, boardLook],
  );
  const farDist = Math.max(500, diag * 6);
  const personBlick = (x: number, y: number) => (Math.atan2(boardLook.y - y, boardLook.x - x) * 180) / Math.PI;

  return { venue, cameras, persons, walls, diag, audienceCams, audiencePersons, boardLook, draussen, ledWaende, farDist, personBlick };
}

const NACHLAUF_MS = 250;

function useNachlauf(wert: string): string {
  const [stand, setStand] = useState(wert);
  useEffect(() => {
    if (wert === stand) return;
    const t = window.setTimeout(() => setStand(wert), NACHLAUF_MS);
    return () => window.clearTimeout(t);
  }, [wert, stand]);
  return stand;
}

/** Zentimetergenau — feiner aendert am Publikum nichts. */
function standortSchluessel(punkte: { x: number; y: number }[]): string {
  return punkte.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';');
}

function standorteAus(key: string): { x: number; y: number }[] {
  if (!key) return [];
  return key.split(';').map((t) => {
    const [x, y] = t.split(',').map(Number);
    return { x, y };
  });
}

export type KulissenDaten = ReturnType<typeof useKulissenDaten>;
