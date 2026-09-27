// ───────────────────────────────────────────────────────────────────────────
// Die Exporte, die aus dem Projektstand ABGELEITET werden: die Kamera-Liste
// fuer den cable-planner und die .avplan.
//
// Aus der Kopfzeile herausgezogen, weil die .avplan seit cable-planner#908
// die Kamera-Liste in MultiCams eigenem Slot mitfuehrt
// (`domains.cameras.cameraList`) — und was eine Datei zusichert, muss sich
// pruefen lassen, ohne einen Download auszuloesen. Beide Wege bauen die Liste
// hier und nirgends sonst: eine zweite Stelle waere eine zweite Liste.
// ───────────────────────────────────────────────────────────────────────────
import { APP_VERSION, type useStore } from './useStore';
import type { ProjectFile } from '../types';
import { getCameraById } from '../data/cameras';
import { getLensById } from '../data/lenses';
import { toCameraList, type CameraListExchange } from '../utils/cameraExport';
import { toVenueExchange } from '../utils/venueExchange';
import { makeAvPlan, type AvPlan } from '../utils/avplan';
import { pickProjectLibrary } from '../utils/projectLibrary';
import { libraryCameras, libraryLenses } from '../library/registry';

type Stand = Pick<
  ReturnType<typeof useStore.getState>,
  | 'projectId' | 'projectVersion' | 'venue' | 'cameras' | 'persons' | 'walls' | 'backgroundPlan'
  | 'customCameras' | 'customLenses' | 'avForeign'
  | 'stageForeign' | 'floorPlanForeign' | 'wallForeign' | 'personForeign'
>;

/**
 * MultiCams Slot in der .avplan: die Projektdatei plus die daraus abgeleitete
 * Kamera-Liste. Der cable-planner liest die Liste und muss dafuer MultiCams
 * Projektformat nicht kennen. Beim Einlesen verwirft MultiCam sie
 * (`importAvPlan`) — sie wird bei jedem Export neu erzeugt.
 */
export type AvPlanCamerasSlot = ProjectFile & { cameraList?: CameraListExchange };

export function cameraListOf(s: Stand, exportedAt: string): CameraListExchange {
  return toCameraList(
    s.cameras,
    (id) => getCameraById(id, s.customCameras),
    { appVersion: APP_VERSION, exportedAt, projectId: s.projectId },
    (id) => getLensById(id, s.customLenses),
  );
}

export function buildAvPlanExport(s: Stand, now: string): AvPlan {
  const cameraDoc: AvPlanCamerasSlot = {
    formatVersion: 1, appVersion: APP_VERSION, projectVersion: s.projectVersion,
    projectId: s.projectId,
    savedAt: now, venue: s.venue, cameras: s.cameras, persons: s.persons,
    walls: s.walls ?? [], backgroundPlan: s.backgroundPlan,
    ...pickProjectLibrary(s.cameras, s.customCameras, s.customLenses, { cameras: libraryCameras(), lenses: libraryLenses() }),
    cameraList: cameraListOf(s, now),
  };
  const venue = toVenueExchange({
    venue: s.venue, persons: s.persons, walls: s.walls, backgroundPlan: s.backgroundPlan,
    appVersion: APP_VERSION, exportedAt: now,
    stageForeign: s.stageForeign,
    floorPlanForeign: s.floorPlanForeign,
    wallForeign: s.wallForeign,
    personForeign: s.personForeign,
  }).venue;
  return makeAvPlan({
    app: 'multicam-planner', appVersion: APP_VERSION, exportedAt: now, venue,
    domains: {
      // Fremde Slots zuerst: so kann ein gleichnamiger fremder Slot nie den
      // eigenen ueberschreiben.
      ...(s.avForeign.unknownDomains ?? {}),
      cameras: cameraDoc,
      lighting: s.avForeign.lighting,
      cabling: s.avForeign.cabling,
    },
  });
}
