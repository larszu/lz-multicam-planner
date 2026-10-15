// Ein Durchlauf der Plan-Erkennung: Vektoren lesen, KI befragen, einrasten
// und daraus die Vorschau in Welt-Metern bauen.
//
// Die Erkennung selbst steht in `@avplan/floorplan`; hier steht nur, wie
// MultiCam sie fuettert und wohin das Ergebnis faellt. Zwei Koordinatenwelten
// treffen sich dabei:
//   Zeichnung  — Meter ab der linken oberen Blattecke (die Erkennung)
//   Welt       — Meter im Venue (`offsetX/offsetY`, `scaleX/scaleY` des Plans)
// Dazwischen steht genau ein Faktor. Wird der erkannte Massstab uebernommen,
// ist er 1 — dann liegt das Planbild massstaeblich im Venue.
import {
  KI_BILD_KANTE,
  grauAus,
  kiAntwortLesen,
  kiErgebnis,
  kiGitterZeichnen,
  kiPlanPrompt,
  planUebernahme,
  rasterKanten,
  rechteckEinrasten,
  wandAufRaster,
  wandEinrasten,
  type ErkannterPlan,
  type KiPlanErgebnis,
  type Rahmen,
  type Strecke,
  type UebernahmeBuehne,
  type UebernahmeWand,
} from '../avplan/floorplan';
import type { PlanVorschau } from './planVorschau';
import type { BackgroundPlan } from '../types';
import { callVision, splitDataUrl, type AiSettings } from '../utils/aiProviders';

export interface PlanLaufOptionen {
  walls: boolean;
  columns: boolean;
  stages: boolean;
  /** Erkannten Massstab auf den Plan anwenden (Bild massstaeblich legen). */
  applyScale: boolean;
  /** Ausschnitt in Welt-Metern; ohne: das ganze Blatt. */
  bereich?: Rahmen;
}

export interface PlanLaufBericht {
  quelle: 'vektor' | 'ki' | 'vektor+ki';
  /** Gegenprobe: erkannte Raumflaeche gegen die Flaeche im Raumstempel. */
  raumProbe?: { anzahl: number; verhaeltnisMedian: number };
  massstab?: { massstab?: number; quelle: string; passend: number; gelesen: number; fehlerMedianM?: number };
  waende: number;
  tueren: number;
  fenster: number;
  stuetzen: number;
  buehnen: number;
  raeume: number;
  /** KI-Teile, die auf die Zeichnung gerastet werden konnten. */
  kiEingerastet?: { von: number; waende: number; buehnen: number };
  dauerMs: number;
}

export interface PlanLaufErgebnis {
  vorschau: PlanVorschau;
  bericht: PlanLaufBericht;
  /** Gesetzt, wenn der Massstab uebernommen wird. */
  plan?: BackgroundPlan;
  venueGroesse?: { widthM: number; heightM: number };
}

/** Zeichnungsmeter → Weltmeter. */
interface Abbildung {
  s: number;
  dx: number;
  dy: number;
}

function abbildung(plan: BackgroundPlan, breiteM: number, uebernehmen: boolean): { ab: Abbildung; neuerPlan?: BackgroundPlan } {
  if (uebernehmen) {
    const s = breiteM / plan.widthPx;
    return { ab: { s: 1, dx: plan.offsetX, dy: plan.offsetY }, neuerPlan: { ...plan, scaleX: s, scaleY: s } };
  }
  // Ohne Uebernahme bleibt die Kalibrierung des Nutzers: die Zeichnung wird
  // auf die Breite gestaucht, die der Plan im Venue gerade einnimmt.
  const s = (plan.widthPx * plan.scaleX) / breiteM;
  return { ab: { s, dx: plan.offsetX, dy: plan.offsetY } };
}

const inWelt = (ab: Abbildung, x: number, y: number) => ({ x: ab.dx + x * ab.s, y: ab.dy + y * ab.s });
const inZeichnung = (ab: Abbildung, r: Rahmen): Rahmen => ({
  minX: (r.minX - ab.dx) / ab.s,
  minY: (r.minY - ab.dy) / ab.s,
  maxX: (r.maxX - ab.dx) / ab.s,
  maxY: (r.maxY - ab.dy) / ab.s,
});

/** Erkannten Plan in die Vorschau umsetzen. */
export function vorschauAusPlan(p: ErkannterPlan, plan: BackgroundPlan, o: PlanLaufOptionen, dauerMs: number): PlanLaufErgebnis {
  const { ab, neuerPlan } = abbildung(plan, p.breiteM, o.applyScale);
  const u = planUebernahme(p, {
    waende: o.walls,
    stuetzen: o.columns,
    buehnen: o.stages,
    bereich: o.bereich ? inZeichnung(ab, o.bereich) : undefined,
  });
  const waende: UebernahmeWand[] = u.waende.map((w) => ({
    ...w,
    x1: ab.dx + w.x1 * ab.s,
    y1: ab.dy + w.y1 * ab.s,
    x2: ab.dx + w.x2 * ab.s,
    y2: ab.dy + w.y2 * ab.s,
    dicke: w.dicke * ab.s,
    oeffnungen: w.oeffnungen.map((q) => ({ ...q, offset: q.offset * ab.s, width: q.width * ab.s })),
  }));
  const buehnen: UebernahmeBuehne[] = u.buehnen.map((b) => ({
    ...b,
    x: ab.dx + b.x * ab.s,
    y: ab.dy + b.y * ab.s,
    breite: b.breite * ab.s,
    tiefe: b.tiefe * ab.s,
  }));
  const raeume = p.raeume
    .filter((r) => r.umriss)
    .map((r) => ({
      umriss: r.umriss!.map((q) => inWelt(ab, q.x, q.y)),
      label: [r.nummer, r.name].filter(Boolean).join(' ') || `${r.flaecheM2 ?? ''} m²`,
    }));
  return {
    vorschau: { waende, buehnen, raeume, bereich: o.bereich },
    plan: neuerPlan,
    venueGroesse: neuerPlan ? { widthM: Math.ceil(p.breiteM), heightM: Math.ceil(p.tiefeM) } : undefined,
    bericht: {
      quelle: 'vektor',
      massstab: {
        massstab: p.massstab.massstab,
        quelle: p.massstab.quelle,
        passend: p.massstab.passend,
        gelesen: p.massstab.gelesen,
        fehlerMedianM: p.massstab.fehlerMedianM,
      },
      raumProbe: p.raumProbe,
      waende: waende.filter((w) => w.art === 'wall').length,
      tueren: p.oeffnungen.filter((q) => q.art === 'door').length,
      fenster: p.oeffnungen.filter((q) => q.art === 'window').length,
      stuetzen: waende.filter((w) => w.art === 'column').length,
      buehnen: buehnen.length,
      raeume: p.raeume.length,
      dauerMs,
    },
  };
}

// ── KI-Weg (Scans, Fotos, unklare Faelle) ──────────────────────────────────

/** Bildausschnitt mit Gitter fuer die KI. */
export function kiBildBauen(
  img: HTMLImageElement,
  ausschnittPx: { x: number; y: number; breite: number; hoehe: number },
): { dataUrl: string; breite: number; hoehe: number; grau: ReturnType<typeof grauAus> } {
  const f = Math.min(1, KI_BILD_KANTE / Math.max(ausschnittPx.breite, ausschnittPx.hoehe));
  const breite = Math.max(1, Math.round(ausschnittPx.breite * f));
  const hoehe = Math.max(1, Math.round(ausschnittPx.hoehe * f));
  const c = document.createElement('canvas');
  c.width = breite;
  c.height = hoehe;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, breite, hoehe);
  ctx.drawImage(img, ausschnittPx.x, ausschnittPx.y, ausschnittPx.breite, ausschnittPx.hoehe, 0, 0, breite, hoehe);
  const grau = grauAus(ctx.getImageData(0, 0, breite, hoehe).data, breite, hoehe);
  // Das Gitter kommt NACH dem Graubild: es ist Lesehilfe fuer die KI, aber
  // beim Einrasten waeren seine Linien sonst falsche Waende.
  kiGitterZeichnen(ctx, breite, hoehe);
  return { dataUrl: c.toDataURL('image/png'), breite, hoehe, grau };
}

export interface KiLaufEingabe {
  ai: AiSettings;
  img: HTMLImageElement;
  plan: BackgroundPlan;
  optionen: PlanLaufOptionen;
  /** Vektorgeometrie, falls vorhanden — dann rastet die KI darauf ein. */
  vektor?: { plan: ErkannterPlan; ab: Abbildung };
}

export async function kiLauf(e: KiLaufEingabe): Promise<PlanLaufErgebnis> {
  const t0 = Date.now();
  const { plan, optionen: o } = e;
  // Ausschnitt in Bildpixeln
  const px = (x: number) => (x - plan.offsetX) / plan.scaleX;
  const py = (y: number) => (y - plan.offsetY) / plan.scaleY;
  const aus = o.bereich
    ? {
        x: Math.max(0, px(o.bereich.minX)),
        y: Math.max(0, py(o.bereich.minY)),
        breite: Math.min(plan.widthPx, px(o.bereich.maxX)) - Math.max(0, px(o.bereich.minX)),
        hoehe: Math.min(plan.heightPx, py(o.bereich.maxY)) - Math.max(0, py(o.bereich.minY)),
      }
    : { x: 0, y: 0, breite: plan.widthPx, hoehe: plan.heightPx };
  const bild = kiBildBauen(e.img, aus);
  const prompt = kiPlanPrompt(
    { waende: o.walls, buehnen: o.stages, raeume: false, massstab: !e.vektor },
    { breitePx: bild.breite, hoehePx: bild.hoehe, vektorBekannt: !!e.vektor },
  );
  const text = await callVision(e.ai, prompt, splitDataUrl(bild.dataUrl));
  const roh = kiErgebnis(kiAntwortLesen(text), { x0: 0, y0: 0, breite: bild.breite, hoehe: bild.hoehe });
  return kiEinrasten(roh, bild, aus, e, t0);
}

function kiEinrasten(
  roh: KiPlanErgebnis,
  bild: { breite: number; hoehe: number; grau: ReturnType<typeof grauAus> },
  aus: { x: number; y: number; breite: number; hoehe: number },
  e: KiLaufEingabe,
  t0: number,
): PlanLaufErgebnis {
  const { plan } = e;
  // Gitterbild-Pixel → Planbild-Pixel → Welt
  const f = bild.breite / aus.breite;
  const weltX = (bx: number) => plan.offsetX + (aus.x + bx / f) * plan.scaleX;
  const weltY = (by: number) => plan.offsetY + (aus.y + by / f) * plan.scaleY;
  const inWeltStrecke = (s: Strecke): Strecke => ({ x1: weltX(s.x1), y1: weltY(s.y1), x2: weltX(s.x2), y2: weltY(s.y2) });

  const waende: UebernahmeWand[] = [];
  const buehnen: UebernahmeBuehne[] = [];
  let gerastetW = 0;
  let gerastetB = 0;

  // Massstab aus der abgelesenen Masskette, wenn keine Vektoren da sind.
  let meterJePixel = plan.scaleX;
  let neuerPlan: BackgroundPlan | undefined;
  if (!e.vektor && roh.masskette && e.optionen.applyScale) {
    const mjePx = roh.masskette.meter / (roh.masskette.laenge / f);
    if (mjePx > 0 && Number.isFinite(mjePx)) {
      meterJePixel = mjePx;
      neuerPlan = { ...plan, scaleX: mjePx, scaleY: mjePx };
    }
  }
  const weltMitMassstab = (bx: number, by: number) => ({
    x: plan.offsetX + (aus.x + bx / f) * meterJePixel,
    y: plan.offsetY + (aus.y + by / f) * meterJePixel,
  });

  // Referenzgeometrie zum Einrasten
  const refWaende: (Strecke & { dicke: number })[] = e.vektor
    ? e.vektor.plan.waende.map((w) => ({
        x1: e.vektor!.ab.dx + w.x1 * e.vektor!.ab.s,
        y1: e.vektor!.ab.dy + w.y1 * e.vektor!.ab.s,
        x2: e.vektor!.ab.dx + w.x2 * e.vektor!.ab.s,
        y2: e.vektor!.ab.dy + w.y2 * e.vektor!.ab.s,
        dicke: w.dickeM * e.vektor!.ab.s,
      }))
    : [];

  if (e.optionen.walls) {
    for (const w of roh.waende) {
      if (e.vektor) {
        const r = wandEinrasten(inWeltStrecke(w), refWaende, 1.2);
        if (r.eingerastet) gerastetW++;
        waende.push({
          ...r.ergebnis,
          dicke: r.treffer[0]?.dicke ?? w.dicke ?? 0.15,
          label: 'Wall',
          oeffnungen: [],
          art: 'wall',
        });
      } else {
        const r = wandAufRaster(w, bild.grau, Math.max(6, bild.breite / 120));
        if (r.eingerastet) gerastetW++;
        const a = weltMitMassstab(r.ergebnis.x1, r.ergebnis.y1);
        const b = weltMitMassstab(r.ergebnis.x2, r.ergebnis.y2);
        waende.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          dicke: r.dickePx ? (r.dickePx / f) * meterJePixel : (w.dicke ?? 0.15),
          label: 'Wall',
          oeffnungen: [],
          art: 'wall',
        });
      }
    }
  }
  if (e.optionen.stages) {
    for (const b of roh.buehnen) {
      const kanten: Strecke[] = e.vektor
        ? refWaende
        : rasterKanten(bild.grau, { x: b.x - 20, y: b.y - 20, breite: b.breite + 40, tiefe: b.tiefe + 40 }, Math.max(8, bild.breite / 100));
      const imBild = e.vektor
        ? { x: weltX(b.x), y: weltY(b.y), breite: (b.breite / f) * plan.scaleX, tiefe: (b.tiefe / f) * plan.scaleY }
        : { x: b.x, y: b.y, breite: b.breite, tiefe: b.tiefe };
      const tol = e.vektor ? 1.2 : Math.max(6, bild.breite / 120);
      const r = rechteckEinrasten(imBild, kanten, tol);
      if (r.eingerastet) gerastetB++;
      const ecke = e.vektor ? { x: r.ergebnis.x, y: r.ergebnis.y } : weltMitMassstab(r.ergebnis.x, r.ergebnis.y);
      const groesse = e.vektor
        ? { breite: r.ergebnis.breite, tiefe: r.ergebnis.tiefe }
        : { breite: (r.ergebnis.breite / f) * meterJePixel, tiefe: (r.ergebnis.tiefe / f) * meterJePixel };
      buehnen.push({
        x: ecke.x,
        y: ecke.y,
        breite: groesse.breite,
        tiefe: groesse.tiefe,
        label: b.label || (b.art === 'podium' ? 'Podium' : b.art === 'tribune' ? 'Tribune' : b.art === 'riser' ? 'Riser' : 'Stage'),
      });
    }
  }
  return {
    vorschau: { waende, buehnen, raeume: [], bereich: e.optionen.bereich },
    plan: neuerPlan,
    bericht: {
      quelle: e.vektor ? 'vektor+ki' : 'ki',
      waende: waende.length,
      tueren: 0,
      fenster: 0,
      stuetzen: 0,
      buehnen: buehnen.length,
      raeume: 0,
      kiEingerastet: { von: roh.waende.length + roh.buehnen.length, waende: gerastetW, buehnen: gerastetB },
      dauerMs: Date.now() - t0,
    },
  };
}
