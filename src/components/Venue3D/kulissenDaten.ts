import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
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
  const walls = useStore((s) => s.walls);

  const diag = Math.hypot(venue.widthM, venue.heightM);
  const audienceCams = useMemo(() => cameras.map((c) => effectiveCameraPos(c)), [cameras]);
  const audiencePersons = useMemo(() => persons.map((p) => ({ x: p.x, y: p.y })), [persons]);
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

export type KulissenDaten = ReturnType<typeof useKulissenDaten>;
