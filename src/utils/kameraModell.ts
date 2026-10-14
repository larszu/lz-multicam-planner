// Welches 3D-Modell eine Planer-Kamera bekommt: Koerper, Objektiv und
// Halterung aus `@avplan/scene3d`, abgeleitet aus Katalog und Montage.
//
// Nichts davon ist ein Eingabefeld. Fehlt eine Angabe (eigene Kamera ohne
// Typ, Linse unbekannt), gilt ein stimmiger Standard — das Modell ist Bild,
// die Rechnung haengt nicht daran.
import * as THREE from 'three';
import type { Camera, CameraMountType, Lens, VenueCamera } from '../types';
import type { Detail, HalterungArt, KameraRig, KameraRigOptionen, KoerperArt, ObjektivArt, Tally } from '../avplan/scene3d';
import { rigLimits } from './rigLimits';
import { rigYaw } from './camera';

/**
 * Montagen, deren Unterbau das Paket baut. Alle anderen (Cable-Cam, Drohne,
 * Scherenbuehne …) behalten das Skelett aus `rigGeometry`; darauf sitzt nur
 * die Kamera.
 */
const HALTERUNG: Partial<Record<CameraMountType, HalterungArt>> = {
  tripod: 'stativ',
  pedestal: 'pedestal',
  jib: 'kran',
  technocrane: 'kran',
  dolly: 'dolly',
  slider: 'slider',
  handheld: 'schulter',
  fixed: 'wand',
};

/** Rand, den der Wagen auf der Schiene nicht befaehrt (wie in kameraHalterung). */
const SCHIENEN_RAND: Partial<Record<HalterungArt, number>> = { dolly: 0.6, slider: 0.1 };

export type BedienerPose = 'kameraStativ' | 'kameraSchulter';

export interface KameraModell {
  optionen: KameraRigOptionen;
  /** Unterbau aus dem Skelett (`RigStructure`) zeichnen. */
  skelett: boolean;
  /** Pose der Kamerafrau bzw. des Kameramanns; null = niemand steht dort. */
  bediener: BedienerPose | null;
}

// Grossobjektive tragen „box" im Datenblatt-Hinweis; ab 600 mm ist auch ohne
// Hinweis keines mehr in der Hand zu halten.
function istBoxObjektiv(lens: Lens | undefined): boolean {
  if (!lens || lens.mount !== 'B4') return false;
  return /\bbox\b/i.test(lens.notes ?? '') || lens.focalLengthMax >= 600;
}

// Im Katalog als Cinema gefuehrt, gebaut wie eine spiegellose Kamera (FX3-Klasse).
const KLEINE_CINE = /\b(FX2|FX3|FX30|S5 ?IIX?|GH5S|R5 C|ZR|Pocket Cinema|Cinema Camera 6K)\b/i;

export function koerperArt(camDef: Camera | undefined, lens: Lens | undefined): KoerperArt {
  if (camDef?.type === 'cinema' && KLEINE_CINE.test(camDef.model)) return 'spiegellos';
  switch (camDef?.type) {
    case 'ptz': return 'ptz';
    case 'mirrorless': return 'spiegellos';
    case 'eng':
    case 'camcorder': return 'eng';
    // Systemkameras mit B4-Handobjektiv sehen aus wie ein Schulter-Camcorder;
    // erst das Grossobjektiv macht daraus die Studiokamera mit Adapter.
    case 'broadcast': return camDef.mount === 'B4' && !istBoxObjektiv(lens) ? 'eng' : 'studio';
    default: return 'cinema';
  }
}

export function objektivArt(koerper: KoerperArt, lens: Lens | undefined): ObjektivArt {
  if (lens?.mount === 'B4') return istBoxObjektiv(lens) ? 'box' : 'eng';
  if (koerper === 'eng') return 'eng';
  if (koerper === 'cinema' || lens?.mount === 'PL') return lens?.type === 'zoom' ? 'cineZoom' : 'cinePrime';
  return 'foto';
}

export interface ModellUmfeld {
  detail: Detail;
  tally?: Tally;
  /** Deckenhoehe des Raums; ein Deckenhalter haengt dann bis dorthin. */
  deckeM?: number;
}

export function kameraModell(cam: VenueCamera, camDef: Camera | undefined, lens: Lens | undefined, umfeld: ModellUmfeld): KameraModell {
  const koerper = koerperArt(camDef, lens);
  const limits = rigLimits(cam);
  const mount = cam.mountType ?? 'tripod';
  let halterung: HalterungArt = HALTERUNG[mount] ?? 'keine';
  // PTZ fest montiert: unter der Decke, wenn sie hoch haengt oder die Decke
  // nah ist, sonst an der Wand.
  if (koerper === 'ptz' && mount === 'fixed') {
    const nahAnDecke = umfeld.deckeM !== undefined && umfeld.deckeM - cam.z < 1;
    halterung = cam.z >= 2.5 || nahAnDecke ? 'decke' : 'wand';
  }
  const skelett = halterung === 'keine';

  const optionen: KameraRigOptionen = {
    koerper,
    halterung,
    hoeheM: Math.max(0.05, cam.z),
    pan: cam.pan,
    tilt: cam.tilt,
    rigDrehungDeg: rigYaw(cam),
    detail: umfeld.detail,
    tally: umfeld.tally ?? 'aus',
  };
  if (koerper !== 'ptz') {
    optionen.objektiv = { art: objektivArt(koerper, lens), brennweiteMm: lens?.focalLengthMax };
    optionen.matteBox = koerper === 'cinema' && umfeld.detail === 'hoch';
    optionen.cage = koerper === 'spiegellos' && halterung !== 'schulter';
  } else {
    optionen.ptzHell = /panasonic/i.test(camDef?.manufacturer ?? '');
  }
  if (halterung === 'kran') {
    optionen.armLaengeM = limits.armLengthM ?? Math.max(1.5, limits.travelM * 1.4);
  }
  if (halterung === 'dolly' || halterung === 'slider') {
    const laenge = Math.max(0.3, limits.railLengthM || (halterung === 'dolly' ? 3.6 : 1));
    const weg = Math.max(1e-3, laenge / 2 - (SCHIENEN_RAND[halterung] ?? 0));
    optionen.schienenLaengeM = laenge;
    optionen.schienenRichtung = 'laengs';
    optionen.position = Math.max(-1, Math.min(1, (cam.trackOffset ?? 0) / weg));
  }
  if (halterung === 'decke' && umfeld.deckeM !== undefined) {
    optionen.abhaengungM = Math.max(0.05, Math.min(3, umfeld.deckeM - cam.z - 0.2));
  }

  const bediener: BedienerPose | null =
    koerper === 'ptz' ? null
      : halterung === 'schulter' ? 'kameraSchulter'
      : halterung === 'stativ' || halterung === 'pedestal' || halterung === 'dolly' ? 'kameraStativ'
      : null;

  return { optionen, skelett, bediener };
}

/** Schluessel, bei dessen Aenderung das Rig neu gebaut werden muss (Pan/Tilt stellt `stelle`). */
export function modellSchluessel(m: KameraModell): string {
  const { pan: _p, tilt: _t, ...rest } = m.optionen;
  return JSON.stringify(rest);
}

/**
 * Lage der optischen Achse im Neige-Rahmen der Planer-Kamera
 * (Position (x, z, y), Drehung −pan um y, dann tilt um z). Dort haengt der
 * Sichtkegel. Pan und Tilt muessen am Rig bereits gestellt sein, die
 * Rig-Gruppe steht auf der verfahrenen Position (`effectiveCameraPos`).
 */
export function achsVersatz(
  rig: KameraRig,
  rahmen: { x: number; y: number; z: number; pan: number; tilt: number },
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  rig.gruppe.updateMatrixWorld(true);
  const achse = rig.knoten.optischeAchse.matrixWorld.clone();
  const welt = rig.gruppe.parent ? rig.gruppe.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
  achse.premultiply(welt);
  const neige = new THREE.Matrix4().compose(
    new THREE.Vector3(rahmen.x, rahmen.z, rahmen.y),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (-rahmen.pan * Math.PI) / 180, (rahmen.tilt * Math.PI) / 180, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  );
  const relativ = neige.invert().multiply(achse);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  relativ.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion };
}
