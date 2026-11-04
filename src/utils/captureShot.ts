// "Shot aufnehmen" (#62 Punkt 5) — gemeinsame Aufnahme-Logik.
//
// Wird sowohl vom Button im Kamerablick als auch vom Shotlist-Panel aufgerufen,
// damit es nur EINE Definition davon gibt, was ein Shot beim Aufnehmen ist.
import { useStore } from '../store/useStore';
import { getExportRegistry } from '../store/exportRegistry';
import { makeThumbnail } from './shotThumbnail';
import { defaultShotName, shotStateFromCamera } from './shot';
import { renderSelectedCameraView } from '../components/Preview/cameraViewRenderer';

export interface CaptureShotResult {
  ok: boolean;
  shotId?: string;
  shotlistId?: string;
  /** false, wenn kein Framegrab moeglich war (keine Kamera gewaehlt oder ohne Objektiv). */
  hadThumbnail: boolean;
  /** Grund bei `ok: false` — fuer die Meldung an den Nutzer. */
  reason?: string;
}

/**
 * Friert die aktuell gewaehlte Kamera als Shot ein und haengt ihn an die
 * aktive Shotlist. Existiert noch keine Liste, wird eine angelegt, damit der
 * erste Klick sofort etwas bewirkt.
 *
 * Der Framegrab kommt aus dem Kamerablick ueber die Export-Registry; ist er
 * nicht offen, wird die gewaehlte Kamera direkt gezeichnet. Gibt es kein Bild,
 * wird der Shot trotzdem gespeichert (die Kamera-Werte sind der eigentliche
 * Inhalt) und der Aufrufer kann das per `hadThumbnail` melden.
 */
export function captureCurrentShot(): CaptureShotResult {
  const state = useStore.getState();
  const cam = state.cameras.find((c) => c.id === state.selectedCameraId);
  if (!cam) return { ok: false, hadThumbnail: false, reason: 'Keine Kamera ausgewählt.' };

  const shotlistId = state.activeShotlistId ?? state.addShotlist('Shotlist 1');

  // Bevorzugt offscreen rendern statt den sichtbaren Canvas zu kopieren.
  //
  // Grund: ein nie gezeichneter <canvas> ist NICHT 0x0, sondern per HTML-Default
  // 300x150. `capturePreviewCanvas` prueft nur auf 0 und liefert dann ein
  // schwarzes Bild zurueck, wenn der Preview-Tab noch nie sichtbar war — der
  // Shot bekaeme also stillschweigend einen leeren Framegrab. Der Offscreen-
  // Render zeichnet dagegen denselben Zustand garantiert frisch und in fester
  // Groesse, egal welcher Tab gerade vorne ist.
  const registry = getExportRegistry();
  const canvas = registry.renderPreviewOffscreen?.() ?? registry.capturePreviewCanvas?.() ?? renderSelectedCameraView();
  const thumbnail = makeThumbnail(canvas) ?? undefined;

  const shotId = useStore.getState().addShot(shotlistId, {
    name: defaultShotName(cam),
    cameraId: cam.id,
    state: shotStateFromCamera(cam),
    transition: 'fast',
    thumbnail,
  });

  return { ok: true, shotId, shotlistId, hadThumbnail: !!thumbnail };
}
