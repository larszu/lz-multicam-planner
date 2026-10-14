// Wie eine Referenzperson als Mensch aussieht: Pose, Kleidung und Statur.
//
// Kein Eingabefeld — abgeleitet aus Objekttyp, Bezeichnung und Id. Dieselbe
// Person sieht deshalb in jeder Ansicht und nach jedem Laden gleich aus, und
// „Moderation" steht anders auf der Buehne als „Gitarre".
import type { ReferencePerson, StageObjectType } from '../types';
import type { MenschGestalt, Oberteil, Pose, Schuhe, Statur, Unterteil } from '../avplan/scene3d';

export interface PersonDarstellung {
  pose: Pose;
  gestalt: MenschGestalt;
}

/** Objekttypen, die als Mensch erscheinen; alle anderen bleiben Koerper. */
const POSE_JE_TYP: Partial<Record<StageObjectType, Pose>> = {
  person: 'stehen',
  'person-guitar': 'gitarre',
  'mic-stand': 'mikrofon',
  'sitting-person': 'sitzen',
};

const REDE = /moder|host|speaker|redner|sprecher|pastor|predig|present|anchor|interview/i;
const GESANG = /sing|vocal|s(ä|ae)nger|lead|chor|choir/i;
const STEHEN: readonly Pose[] = ['stehen', 'haendeVorn', 'handHuefte', 'armeVerschraenkt', 'sprechen'];

function idZahl(id: string, salz: number): number {
  let h = 2166136261 ^ salz;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const wahl = <T,>(liste: readonly T[], r: number): T => liste[Math.min(liste.length - 1, Math.floor(r * liste.length))];

export function personDarstellung(p: Pick<ReferencePerson, 'id' | 'label' | 'objectType'>): PersonDarstellung | null {
  const typPose = POSE_JE_TYP[p.objectType ?? 'person'];
  if (!typPose) return null;
  const r = (salz: number) => idZahl(p.id, salz);
  const rede = REDE.test(p.label);
  let pose = typPose;
  if (p.objectType === 'person' || !p.objectType) {
    pose = rede ? 'sprechen' : GESANG.test(p.label) ? 'mikrofon' : wahl(STEHEN, r(1));
  }
  const band = pose === 'gitarre' || pose === 'mikrofon';
  const weiblich = r(2) < 0.5;
  const statur: Statur = wahl(['schlank', 'mittel', 'mittel', 'kraeftig'] as const, r(3));
  const oberteil: Oberteil = rede
    ? (weiblich && r(4) < 0.4 ? 'kleid' : 'sakko')
    : band ? wahl(['tshirt', 'tshirt', 'hemd'] as const, r(4))
    : wahl(['tshirt', 'hemd', 'hemd', 'sakko'] as const, r(4));
  const unterteil: Unterteil = weiblich && !band && r(5) < 0.35 ? 'rock' : 'hose';
  const schuhe: Schuhe = rede ? 'halbschuh' : band ? wahl(['stiefel', 'sneaker'] as const, r(6)) : wahl(['sneaker', 'halbschuh'] as const, r(6));
  return {
    pose,
    gestalt: {
      geschlecht: weiblich ? 0.8 + r(7) * 0.2 : r(7) * 0.2,
      statur,
      haarLaenge: weiblich ? 0.12 + r(8) * 0.23 : 0.02 + r(8) * 0.06,
      oberteil,
      unterteil,
      schuhe,
      requisit: true,
      ruhe: 1,
      phase: r(9),
    },
  };
}
