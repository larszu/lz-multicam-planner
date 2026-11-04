// Prozedurale Rig-Geometrie fuer die 2D- und die 3D-Darstellung.
//
// Bewusst KEINE fertigen 3D-Modelle: ein heruntergeladenes Stativ- oder
// Kran-Modell hat genau eine Laenge, ein 12-ft-Jimmy-Jib und ein 30-ft-Jib
// brauchen aber unterschiedliche Geometrie. Hier wird das Rig aus seinen
// Datenblattmaßen aufgebaut, damit die Darstellung automatisch mit
// `armLengthM`, `telescopeM` und der gelegten Schienenlaenge skaliert —
// und die App offline-first ohne zusaetzliche Assets bleibt.
//
// Ein Skelett besteht aus Strecken (`RigSegment`) im RIG-KOORDINATENSYSTEM:
//   f — vor/zurueck entlang der Blickrichtung (pan) der Kamera
//   l — quer nach rechts
//   h — Hoehe ueber dem Boden
// Ursprung ist die PARKPOSITION am Boden (cam.x/cam.y bei trackOffset 0).
//
// Beide Ansichten lesen dasselbe Skelett:
//   Venue2D nimmt die Draufsicht (f/l, h wird ignoriert),
//   Venue3D extrudiert die Strecken zu Zylindern bzw. Kaesten.
import { MOUNT_TYPE_LABELS } from '../types';
import { trackSectionPlan } from '../data/rigs';
import type { RigLimits } from './rigLimits';
import { pathCenter, rotateOnPath } from './travelPath';

export interface RigVec {
  f: number;
  l: number;
  h: number;
}

/**
 * Bauteil-Art. Bestimmt Farbe und Strichstaerke in 2D und ob in 3D ein
 * Zylinder (Rohr, Bein, Ausleger) oder ein Kasten (Chassis, Schiene) entsteht.
 */
export type RigRole =
  | 'leg'        // Stativbein, Stuetze
  | 'mast'       // Saeule, Mittelrohr
  | 'arm'        // Ausleger (Jib, Kran)
  | 'telescope'  // ausgefahrenes Innenrohr des Teleskopkrans
  | 'weight'     // Gegengewicht
  | 'rail'       // Schienenstrang
  | 'sleeper'    // Schwelle / Sektionsstoß
  | 'body'       // Chassis, Wagen, Plattform, Operator
  | 'wheel'      // Rad / Rolle
  | 'wire'       // Seil (Cable-Cam), Rotorarm
  | 'plumb';     // Lot vom Kamerakopf zum Boden (Lesehilfe im Plan)

export interface RigSegment {
  role: RigRole;
  a: RigVec;
  b: RigVec;
  /** Durchmesser bzw. Kantenlaenge in Metern. */
  thicknessM: number;
}

export interface RigSkeleton {
  /** Name des dargestellten Rigs — Rig-Name, sonst die Kategorie. */
  label: string;
  segments: RigSegment[];
  /** Standflaeche in der Draufsicht (Rig-Koordinaten), falls bekannt. */
  footprint?: { centerF: number; centerL: number; f: number; l: number };
  /** Fahrweg in eine Richtung ab Parkposition (m); 0 = starr. */
  travelM: number;
  /** Gelegte Schienenlaenge (m); 0 ohne Schiene. */
  railLengthM: number;
  /**
   * Tatsaechlich gezeichnete Schienenlaenge (m): die Summe der Sektionen, aus
   * denen sie gelegt wird. Weil nur ganze Sektionen existieren, ist sie meist
   * etwas laenger als die gewuenschte `railLengthM`.
   */
  railSpanM: number;
  /** Sektionsstoeße der Schiene als f-Positionen (m) — leer ohne Schiene. */
  sleeperF: number[];
  /** Kamerakopf im Rig-Frame (f = trackOffset). */
  head: RigVec;
}

export interface RigPose {
  /** Objektivhoehe (m) — `cam.z`. */
  heightM: number;
  /** Aktueller Fahrweg-Offset (m) — `cam.trackOffset`. */
  offsetM?: number;
}

const DEG = Math.PI / 180;
/** Normspurweite Filmschiene: 24.5″. */
const RAIL_GAUGE_M = 0.622;

const v = (f: number, l: number, h: number): RigVec => ({ f, l, h });
const seg = (role: RigRole, a: RigVec, b: RigVec, thicknessM: number): RigSegment => ({
  role,
  a,
  b,
  thicknessM,
});

/** Drei Beine im Winkel 90/210/330 Grad — Stativ, Pedestal, Kranfuß. */
function tripodLegs(apex: RigVec, spreadM: number, thicknessM: number): RigSegment[] {
  return [90, 210, 330].map((deg) =>
    seg(
      'leg',
      apex,
      v(apex.f + Math.cos(deg * DEG) * spreadM, apex.l + Math.sin(deg * DEG) * spreadM, 0),
      thicknessM,
    ),
  );
}

/** Vier Raeder an den Ecken eines Chassis (als kurze, dicke Strecken). */
function wheels(centerF: number, lengthF: number, widthL: number, radiusM: number): RigSegment[] {
  const out: RigSegment[] = [];
  for (const df of [-1, 1]) {
    for (const dl of [-1, 1]) {
      const f = centerF + (df * lengthF) / 2 * 0.8;
      const l = (dl * widthL) / 2;
      out.push(seg('wheel', v(f, l, radiusM * 2), v(f, l, 0), radiusM * 2));
    }
  }
  return out;
}

/**
 * Positionen der Schienenstoeße: die Sektionen, aus denen die Schiene
 * tatsaechlich gelegt wird (4/8/10 ft), symmetrisch um die Parkposition.
 * So sieht man im Plan, wie viele Stuecke gebraucht werden.
 */
function sleeperPositions(railLengthM: number): number[] {
  if (railLengthM <= 0) return [];
  const plan = trackSectionPlan(railLengthM);
  // `plan.total` ist auf cm gerundet — fuer die Geometrie muss die Summe der
  // Sektionen exakt sein, sonst liegt die Schiene unsymmetrisch.
  const exact = plan.sections.reduce((sum, s) => sum + s.lengthM * s.count, 0);
  const joints: number[] = [];
  let at = -exact / 2;
  joints.push(at);
  for (const s of plan.sections) {
    for (let i = 0; i < s.count; i += 1) {
      at += s.lengthM;
      joints.push(at);
    }
  }
  return joints;
}

/**
 * Baut das Skelett eines Rigs. Reine Funktion — dieselben Grenzen und dieselbe
 * Pose ergeben immer dieselbe Geometrie, damit 2D und 3D nicht auseinanderlaufen.
 */
export function rigSkeleton(limits: RigLimits, pose: RigPose): RigSkeleton {
  return pathCenter(limits) ? curvedSkeleton(limits, pose) : straightSkeleton(limits, pose);
}

/**
 * Rig auf gebogener Strecke oder schwenkendem Arm (#235): das gerade Rig in
 * Parkstellung, als Ganzes um den Mittelpunkt des Fahrwegs gedreht. Die
 * Schiene selbst faehrt nicht mit — sie wird als Bogen neu gelegt.
 */
function curvedSkeleton(limits: RigLimits, pose: RigPose): RigSkeleton {
  const base = straightSkeleton(limits, { ...pose, offsetM: 0 });
  const s = pose.offsetM ?? 0;
  const move = (p: RigVec): RigVec => ({ ...rotateOnPath(limits, p, s), h: p.h });
  const onArc = (p: RigVec, at: number): RigVec => ({ ...rotateOnPath(limits, { f: 0, l: p.l }, at + p.f), h: p.h });
  const segments: RigSegment[] = [];
  for (const g of base.segments) {
    if (g.role === 'rail') continue;
    if (g.role === 'sleeper') {
      segments.push({ ...g, a: onArc(v(0, g.a.l, g.a.h), g.a.f), b: onArc(v(0, g.b.l, g.b.h), g.b.f) });
      continue;
    }
    segments.push({ ...g, a: move(g.a), b: move(g.b) });
  }
  const rails = base.segments.filter((g) => g.role === 'rail');
  for (const r of rails) {
    const from = Math.min(r.a.f, r.b.f);
    const to = Math.max(r.a.f, r.b.f);
    const n = Math.max(2, Math.ceil((to - from) / 0.25));
    for (let i = 0; i < n; i += 1) {
      const f0 = from + ((to - from) * i) / n;
      const f1 = from + ((to - from) * (i + 1)) / n;
      segments.push({ ...r, a: onArc(v(0, r.a.l, r.a.h), f0), b: onArc(v(0, r.a.l, r.a.h), f1) });
    }
  }
  const fp = base.footprint;
  const fpAt = fp ? move(v(fp.centerF, fp.centerL, 0)) : null;
  return {
    ...base,
    segments,
    footprint: fp && fpAt ? { ...fp, centerF: fpAt.f, centerL: fpAt.l } : undefined,
    head: move(base.head),
  };
}

function straightSkeleton(limits: RigLimits, pose: RigPose): RigSkeleton {
  const h = Math.max(0.05, pose.heightM);
  const off = pose.offsetM ?? 0;
  const fp = limits.footprintM;
  const head = v(off, 0, h);
  const segments: RigSegment[] = [];

  // Nur die Dolly-Schiene wird aus 4/8/10-ft-Sektionen gelegt; ein Slider ist
  // ein Stueck Profil und hat keine Stoeße.
  const sleeperF = limits.type === 'dolly' ? sleeperPositions(limits.railLengthM) : [];
  const skel: RigSkeleton = {
    label: limits.rig?.name ?? MOUNT_TYPE_LABELS[limits.type],
    segments,
    travelM: limits.travelM,
    railLengthM: limits.railLengthM,
    railSpanM: sleeperF.length ? sleeperF[sleeperF.length - 1] - sleeperF[0] : limits.railLengthM,
    sleeperF,
    head,
  };
  const ground = (widthL: number, depthF: number, centerF = off, centerL = 0) => {
    skel.footprint = { centerF, centerL, f: depthF, l: widthL };
  };

  switch (limits.type) {
    case 'tripod':
    case 'hihat': {
      const spread = (fp?.w ?? (limits.type === 'hihat' ? 0.5 : 0.9)) / 2;
      const apexH = Math.max(h * 0.55, h - 0.14);
      const apex = v(off, 0, apexH);
      segments.push(seg('mast', apex, head, 0.05));
      segments.push(...tripodLegs(apex, spread, 0.035));
      ground(spread * 2, spread * 2);
      break;
    }

    case 'pedestal': {
      const spread = (fp?.w ?? 1.0) / 2;
      const hub = v(off, 0, 0.09);
      segments.push(seg('mast', hub, head, 0.12));
      for (const deg of [90, 210, 330]) {
        const p = v(off + Math.cos(deg * DEG) * spread, Math.sin(deg * DEG) * spread, 0.09);
        segments.push(seg('leg', hub, p, 0.05));
        segments.push(seg('wheel', p, v(p.f, p.l, 0), 0.18));
      }
      ground(spread * 2, spread * 2);
      break;
    }

    case 'dolly': {
      const gauge = Math.min(fp?.w ?? RAIL_GAUGE_M, RAIL_GAUGE_M);
      // Die Schiene reicht bis zu den aeussersten Stoeßen — es gibt nur ganze
      // Sektionen, darum ist sie meist etwas laenger als die Wunschlaenge.
      const half = skel.railSpanM / 2;
      for (const dl of [-1, 1]) {
        segments.push(seg('rail', v(-half, (dl * gauge) / 2, 0.04), v(half, (dl * gauge) / 2, 0.04), 0.05));
      }
      for (const f of skel.sleeperF) {
        segments.push(seg('sleeper', v(f, -gauge / 2 - 0.06, 0.02), v(f, gauge / 2 + 0.06, 0.02), 0.06));
      }
      const bodyF = fp?.d ?? 1.2;
      const bodyL = fp?.w ?? 0.8;
      segments.push(seg('body', v(off - bodyF / 2, 0, 0.26), v(off + bodyF / 2, 0, 0.26), bodyL));
      segments.push(...wheels(off, bodyF, gauge, 0.06));
      segments.push(seg('mast', v(off, 0, 0.3), head, 0.1));
      ground(bodyL, bodyF);
      break;
    }

    case 'slider': {
      // Slider-Schienen sind ein Stueck (kein Sektionsbau) — volle Laenge.
      const half = limits.railLengthM / 2;
      const railH = Math.max(0.12, h - 0.16);
      segments.push(seg('rail', v(-half, 0, railH), v(half, 0, railH), 0.06));
      // Slider stehen auf zwei Stativen/Fuessen an den Enden.
      for (const f of [-half, half]) {
        segments.push(seg('leg', v(f, 0, railH), v(f, 0, 0), 0.04));
      }
      segments.push(seg('body', v(off - 0.1, 0, railH + 0.05), v(off + 0.1, 0, railH + 0.05), 0.16));
      segments.push(seg('mast', v(off, 0, railH + 0.05), head, 0.06));
      ground(0.4, limits.railLengthM, 0);
      break;
    }

    case 'jib':
    case 'technocrane': {
      const arm = limits.armLengthM ?? Math.max(1.5, limits.travelM * 1.4);
      // Drehpunkt-Hoehe: typisch auf Stativ-/Chassis-Hoehe. Untergrenze ist die
      // Hoehe, ab der der Ausleger den Kopf ueberhaupt noch erreicht — sonst
      // wuerde der gezeichnete Arm laenger als das Datenblatt.
      const pivotH = Math.max(
        Math.min(Math.max(1.2, h * 0.35), Math.max(0.4, h - 0.3)),
        h - arm * 0.95,
      );
      const dh = h - pivotH;
      // Der Ausleger muss den Kopf erreichen: der horizontale Anteil folgt
      // aus Auslegerlaenge und Hoehendifferenz (Pythagoras), mindestens 0.5 m.
      const reach = limits.pathShape === 'swing' && limits.pathRadiusM
        ? limits.pathRadiusM
        : Math.max(0.5, Math.sqrt(Math.max(0.25, arm * arm - dh * dh)));
      const pivot = v(off - reach, 0, pivotH);
      segments.push(seg('arm', pivot, head, 0.1));
      if (limits.telescopeM) {
        // Innenrohr: die letzten `telescopeM` des Auslegers.
        const t = Math.min(1, limits.telescopeM / arm);
        segments.push(
          seg(
            'telescope',
            v(pivot.f + (head.f - pivot.f) * (1 - t), 0, pivot.h + dh * (1 - t)),
            head,
            0.07,
          ),
        );
      }
      // Gegengewicht hinter dem Drehpunkt.
      const tail = 0.3 * arm;
      segments.push(seg('weight', pivot, v(pivot.f - tail, 0, pivotH - dh * 0.15), 0.09));
      if (limits.type === 'technocrane') {
        const bodyF = fp?.d ?? 3.0;
        const bodyL = fp?.w ?? 1.0;
        segments.push(seg('body', v(pivot.f - bodyF / 2, 0, 0.35), v(pivot.f + bodyF / 2, 0, 0.35), bodyL));
        segments.push(seg('mast', v(pivot.f, 0, 0.35), pivot, 0.14));
        segments.push(...wheels(pivot.f, bodyF, bodyL, 0.15));
        ground(bodyL, bodyF, pivot.f);
      } else {
        segments.push(...tripodLegs(v(pivot.f, 0, pivotH), (fp?.w ?? 1.2) / 2, 0.05));
        // Beim Jib ist die Standflaeche der Schwenkraum (Datenblatt: 12×24 ft
        // fuer 180°), nicht nur die Beinspreizung.
        ground(fp?.w ?? 1.2, fp?.d ?? fp?.w ?? 1.2, pivot.f);
      }
      segments.push(seg('plumb', head, v(head.f, head.l, 0), 0.01));
      break;
    }

    case 'scissorlift': {
      const bodyF = fp?.d ?? 2.5;
      const bodyL = fp?.w ?? 1.2;
      segments.push(seg('body', v(off - bodyF / 2, 0, 0.18), v(off + bodyF / 2, 0, 0.18), bodyL));
      segments.push(...wheels(off, bodyF, bodyL, 0.16));
      // Schere: gekreuzte Streben, Anzahl waechst mit der Hubhoehe.
      const top = Math.max(0.6, h - 0.25);
      const pairs = Math.max(2, Math.min(6, Math.round((top - 0.3) / 1.1)));
      const step = (top - 0.3) / pairs;
      const reach = Math.min(bodyF, 1.4) / 2;
      for (let i = 0; i < pairs; i += 1) {
        const z0 = 0.3 + i * step;
        const z1 = z0 + step;
        segments.push(seg('leg', v(off - reach, 0, z0), v(off + reach, 0, z1), 0.07));
        segments.push(seg('leg', v(off + reach, 0, z0), v(off - reach, 0, z1), 0.07));
      }
      segments.push(seg('body', v(off - reach - 0.2, 0, top), v(off + reach + 0.2, 0, top), bodyL));
      ground(bodyL, bodyF);
      break;
    }

    case 'cablecam': {
      // Seile laufen zu Masten an den Ecken; laenger als ~12 m wird die
      // Darstellung im Plan unleserlich, darum gekappt.
      const r = Math.min(Math.max(limits.travelM, 4), 12);
      const anchorH = h + Math.min(8, r * 0.6);
      for (const df of [-1, 1]) {
        for (const dl of [-1, 1]) {
          segments.push(seg('wire', head, v(off + df * r, dl * r, anchorH), 0.02));
        }
      }
      segments.push(seg('plumb', head, v(head.f, head.l, 0), 0.01));
      break;
    }

    case 'drone': {
      for (const deg of [45, 135, 225, 315]) {
        segments.push(
          seg('wire', head, v(off + Math.cos(deg * DEG) * 0.4, Math.sin(deg * DEG) * 0.4, h + 0.05), 0.03),
        );
      }
      segments.push(seg('plumb', head, v(head.f, head.l, 0), 0.01));
      break;
    }

    case 'carmount': {
      // Fahrzeug schematisch: PKW-Maße, Kamera aussen am Aufbau.
      const bodyF = 4.4;
      const bodyL = 1.8;
      segments.push(seg('body', v(off - bodyF * 0.6, 0, 0.75), v(off + bodyF * 0.4, 0, 0.75), bodyL));
      segments.push(...wheels(off - bodyF * 0.1, bodyF, bodyL - 0.25, 0.32));
      segments.push(seg('mast', v(off, 0, 1.4), head, 0.07));
      ground(bodyL, bodyF, off - bodyF * 0.1);
      break;
    }

    case 'rickshaw': {
      const bodyF = fp?.d ?? 1.6;
      const bodyL = fp?.w ?? 0.8;
      segments.push(seg('body', v(off - bodyF / 2, 0, 0.32), v(off + bodyF / 2, 0, 0.32), bodyL));
      segments.push(...wheels(off, bodyF, bodyL, 0.16));
      segments.push(seg('mast', v(off, 0, 0.36), head, 0.08));
      ground(bodyL, bodyF);
      break;
    }

    case 'remotehead': {
      // Kopf auf einem Unterbau (Stativ/Kran) — hier als kurzer Yoke plus Fuß.
      const yokeH = Math.max(0.1, h - 0.3);
      segments.push(seg('mast', v(off, 0, yokeH), head, 0.08));
      segments.push(seg('leg', v(off, -0.16, yokeH), v(off, 0.16, yokeH), 0.06));
      segments.push(...tripodLegs(v(off, 0, yokeH), (fp?.w ?? 0.8) / 2, 0.035));
      ground(fp?.w ?? 0.8, fp?.w ?? 0.8);
      break;
    }

    case 'gimbal':
    case 'steadicam':
    case 'handheld': {
      // Getragen: Operator als Koerper-Strecke, Kamera vor dem Koerper.
      const shoulder = Math.max(0.3, h - 0.15);
      segments.push(seg('body', v(off - 0.35, 0, 0), v(off - 0.35, 0, shoulder), 0.42));
      segments.push(seg('arm', v(off - 0.35, 0, shoulder), head, 0.05));
      ground(0.6, 0.6, off - 0.3);
      break;
    }

    case 'fixed': {
      // Wand-/Deckenhalter: kurzer Ausleger nach hinten zur Platte.
      segments.push(seg('arm', head, v(off - 0.35, 0, h), 0.05));
      segments.push(seg('body', v(off - 0.4, 0, h - 0.1), v(off - 0.4, 0, h + 0.1), 0.24));
      break;
    }

    default: {
      segments.push(seg('mast', v(off, 0, 0), head, 0.08));
      break;
    }
  }

  return skel;
}

/** true, wenn das Rig auf einer gelegten Schiene faehrt (Draufsicht zeichnet sie). */
export function hasRail(skel: RigSkeleton): boolean {
  return skel.railLengthM > 0;
}
