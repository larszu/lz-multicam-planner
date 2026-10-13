import type { VenueCamera } from '../../types';
import { mountTypeLabel } from '../../i18n/mount';

/** Zweite Zeile eines Listeneintrags: Kamera · Brennweitenbereich @ aktuell · Rig. */
export function cameraRowDetail(
  t: (key: string, en: string) => string,
  cam: VenueCamera,
  camName: string | null,
  lens: { focalLengthMin: number; focalLengthMax: number } | null,
): string {
  const parts: string[] = [];
  if (camName) parts.push(camName);
  if (lens) {
    const range = lens.focalLengthMin === lens.focalLengthMax
      ? `${lens.focalLengthMin} mm`
      : `${lens.focalLengthMin}–${lens.focalLengthMax} mm`;
    parts.push(`${range} @ ${Math.round(cam.focalLength * 10) / 10} mm`);
  }
  if (cam.mountType) parts.push(mountTypeLabel(t, cam.mountType));
  return parts.join(' · ');
}
