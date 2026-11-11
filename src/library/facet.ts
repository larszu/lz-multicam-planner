// ───────────────────────────────────────────────────────────────────────────
// Das multicam-Facet der Geraetebibliothek (devices.zumpelars.de).
//
// FORMAT — beim Hochladen und beim Import dasselbe:
//
//   { kind: 'camera', version: 1, camera: <Camera ohne id> }
//   { kind: 'lens',   version: 1, lens:   <Lens ohne id und isCustom> }
//
// Der innere Eintrag ist der NATIVE Katalogeintrag dieses Planners
// (`src/types` → `Camera` / `Lens`), mit allem, was er fuehrt: Sensor,
// Crop-Modi, Mount-Adapter, `deviceTypeId` (die Geraetetyp-GUID, mit der der
// Cable Planner die Ports aufloest), `manufacturerUrl` und `specSource` (die
// Datenblatt-Belege je Feld).
//
// WARUM VERSCHACHTELT und nicht flach: der Server entfernt aus jedem Facet
// die obersten Schluessel, die er fuer privat haelt — darunter `id` und
// `notes`. Flach gingen die Hinweise einer Kamera („POV camera, global
// shutter") beim Speichern verloren. Die lokale `id` bleibt trotzdem draussen:
// `custom-cam-1726…` bedeutet auf keinem anderen Rechner etwas. Beim Import
// bekommt der Eintrag `devlib-<slug>`; der Slug ist die Identitaet in der
// Bibliothek, die GUID bleibt die Identitaet des Geraetetyps.
//
// GEPRUEFT wird mit derselben Validierung, die mitgebrachte Eintraege einer
// Projektdatei durchlaufen (`istKamera` / `istOptik`): was der Planner aus
// einer Datei nicht aufnaehme, nimmt er aus der Bibliothek auch nicht.
// ───────────────────────────────────────────────────────────────────────────
import type { Camera, Lens } from '../types';
import type { ProposalCore, SyncDevice } from '../utils/deviceLibraryClient';
import { istKamera, istOptik } from '../utils/projectLibrary.ts';

export const FACET_VERSION = 1;
export const LIBRARY_ID_PREFIX = 'devlib-';

export type MulticamFacet =
  | { kind: 'camera'; version: number; camera: Omit<Camera, 'id'> }
  | { kind: 'lens'; version: number; lens: Omit<Lens, 'id' | 'isCustom'> };

export type LibraryItem =
  | { kind: 'camera'; camera: Camera }
  | { kind: 'lens'; lens: Lens };

export const libraryIdFor = (slug: string) => `${LIBRARY_ID_PREFIX}${slug}`;
export const isLibraryId = (id: string | undefined) => !!id && id.startsWith(LIBRARY_ID_PREFIX);

const ohneLeeres = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function cameraToFacet(camera: Camera): MulticamFacet {
  const { id: _id, ...rest } = camera;
  return { kind: 'camera', version: FACET_VERSION, camera: ohneLeeres(rest) };
}

export function lensToFacet(lens: Lens): MulticamFacet {
  const { id: _id, isCustom: _custom, ...rest } = lens;
  return { kind: 'lens', version: FACET_VERSION, lens: ohneLeeres(rest) };
}

/** Der gemeinsame Kern eines Uploads. Der Datenblattlink ist Pflicht — ohne
 *  ihn blockiert der Server; er kommt aus `manufacturerUrl`. */
/**
 * Fachliche Eigenschaften und Schnittstellen fuer den KERN des Geraets.
 *
 * WARUM SIE NICHT IM FACET BLEIBEN. Das multicam-Facet traegt den nativen
 * Katalogeintrag — gut fuer multicam, unlesbar fuer alle anderen. Brennweite
 * und Mount sind aber keine multicam-Eigenschaft: der Kabelplaner will
 * wissen, ob ein Objektiv an die Kamera passt, der Inventarplaner, was da
 * im Koffer liegt. Deshalb gehen dieselben Angaben zusaetzlich in den Kern,
 * in der Form, die alle Planner lesen (`shared/specs.ts` des Servers).
 *
 * Den ANTRIEB (Zoom-/Fokus-/Iris-Servo) traegt der Server selbst nach: er
 * steht bei Fujinon und Canon in der Typenbezeichnung, und die
 * Buchstabentabelle gehoert an EINE Stelle, nicht in jeden Planner.
 */
function kernEigenschaften(item: LibraryItem): Pick<ProposalCore, 'specs' | 'interfaces'> {
  if (item.kind === 'lens') {
    const l = item.lens;
    return {
      specs: ohneLeeres({
        kind: 'lens' as const,
        focalMinMm: l.focalLengthMin,
        focalMaxMm: l.focalLengthMax,
        apertureWide: l.maxApertureWide,
        apertureTele: l.maxApertureTele,
        // Bei einer Festbrennweite ist das Verhaeltnis 1 und sagt nichts;
        // dann bleibt das Feld leer, statt eine 1 zu behaupten.
        zoomRatio: l.focalLengthMax > l.focalLengthMin ? Math.round((l.focalLengthMax / l.focalLengthMin) * 10) / 10 : undefined,
        extenderFactors: l.extenderFactors?.length ? l.extenderFactors : undefined,
      }),
      // Ein Objektiv BRAUCHT einen Anschluss, eine Kamera BIETET ihn — so
      // findet der Planer heraus, was zusammenpasst.
      interfaces: l.mount ? [{ kind: 'lens-mount' as const, standard: l.mount.toLowerCase(), role: 'requires' as const }] : [],
    };
  }
  const c = item.camera;
  const mounts = [c.mount, ...(c.adaptedMounts ?? [])].filter(Boolean);
  return {
    interfaces: mounts.map((m, i) => ({
      kind: 'lens-mount' as const,
      standard: String(m).toLowerCase(),
      role: 'provides' as const,
      // Ein adaptierter Anschluss ist kein nativer: das gehoert dazugesagt,
      // sonst plant jemand ein B4-Objektiv an eine FZ-Kamera ohne Adapter.
      ...(i > 0 ? { note: 'nur mit Adapter' } : {}),
    })),
  };
}

export function proposalCore(item: LibraryItem, sourceUrl: string): ProposalCore {
  const entry = item.kind === 'camera' ? item.camera : item.lens;
  const { specs, interfaces } = kernEigenschaften(item);
  const core: ProposalCore = {
    manufacturer: entry.manufacturer.trim(),
    model: entry.model.trim(),
    category: item.kind === 'camera' ? 'Camera' : 'Lens',
    sourceUrl: sourceUrl.trim(),
    ...(entry.notes ? { description: entry.notes } : {}),
    ...(specs ? { specs } : {}),
    ...(interfaces?.length ? { interfaces } : {}),
  };
  // Ohne Link kein leeres Feld: der Server meldet dann `no-source`, und das
  // ist die Auskunft, die der Nutzer braucht.
  if (!core.sourceUrl) delete (core as Partial<ProposalCore>).sourceUrl;
  return core;
}

const istObjekt = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Facet → Katalogeintrag, oder `null`, wenn der Eintrag die Pruefung des
 * Planners nicht besteht. Fehlt im Facet der Datenblattlink, traegt der Kern
 * ihn (`core.sourceUrl`) — derselbe Beleg, nur an anderer Stelle.
 */
export function facetToItem(device: Pick<SyncDevice, 'slug' | 'facet' | 'core'>): LibraryItem | null {
  const f = device.facet;
  if (!istObjekt(f)) return null;
  const id = libraryIdFor(device.slug);
  const beleg = device.core?.sourceUrl || undefined;
  if (f.kind === 'camera' && istObjekt(f.camera)) {
    const camera = { manufacturerUrl: beleg, ...f.camera, id };
    if (camera.manufacturerUrl === undefined) delete camera.manufacturerUrl;
    return istKamera(camera) ? { kind: 'camera', camera } : null;
  }
  if (f.kind === 'lens' && istObjekt(f.lens)) {
    const lens = { manufacturerUrl: beleg, ...f.lens, id, isCustom: false };
    if (lens.manufacturerUrl === undefined) delete lens.manufacturerUrl;
    return istOptik(lens) ? { kind: 'lens', lens } : null;
  }
  return null;
}
