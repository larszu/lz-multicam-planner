import type { VenueCamera } from '../types';
import { pathShift } from './travelPath';

/**
 * Ausrichtung des Rigs im Raum (Grad). Ohne eigene `rigRotation` folgt das Rig
 * dem Pan der Kamera — so war es vor der frei drehbaren Montage, und fuer ein
 * Stativ ist es auch der natuerliche Default.
 *
 * Sobald der Nutzer die Schiene/den Kran ausgerichtet hat, ist der Winkel fest:
 * die Kamera schwenkt darauf, das Rig dreht sich nicht mit.
 */
export function rigYaw(cam: Pick<VenueCamera, 'pan' | 'rigRotation'>): number {
  return cam.rigRotation ?? cam.pan;
}

/**
 * Effective camera position once the live-motion track slider (jib / dolly)
 * is applied. The "parked" position is `cam.x` / `cam.y`; the track shifts
 * along the **rig's** axis (`rigYaw`) — a dolly rolls along its rail no matter
 * where the camera happens to look — or along its arc / crane swing (#235). Returns the unmodified parked position
 * when no offset is set.
 */
export function effectiveCameraPos(cam: VenueCamera): { x: number; y: number } {
  const offset = cam.trackOffset ?? 0;
  if (!offset) return { x: cam.x, y: cam.y };
  if (!cam.travelShape || cam.travelShape === 'line') {
    const yawRad = (rigYaw(cam) * Math.PI) / 180;
    return {
      x: cam.x + Math.cos(yawRad) * offset,
      y: cam.y + Math.sin(yawRad) * offset,
    };
  }
  const { dx, dy } = pathShift(cam, offset);
  return { x: cam.x + dx, y: cam.y + dy };
}
