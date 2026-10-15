import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCheck, FiChevronLeft, FiChevronRight, FiCpu, FiCrop, FiLoader, FiSettings, FiX, FiZap } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { AiError } from '../../utils/aiProviders';
import { useTranslation, format } from '../../i18n';
import { openSettings } from '../Settings/openSettings';
import { useAiSettings } from '../Settings/useAiSettings';
import { aiErrorHint } from '../Settings/aiErrorHint';
import { planQuelleFuer } from '../../lib/planQuelle';
import { usePlanLaden } from '../../lib/usePlanLaden';
import { kiLauf, vorschauAusPlan, type PlanLaufBericht, type PlanLaufOptionen } from '../../lib/planLauf';
import { planAusQuelle } from '../../lib/planLesen';
import { vorschauImBereich } from '../../lib/planVorschau';
import type { ErkannterPlan } from '../../avplan/floorplan';
import type { Stage, Wall } from '../../types';

type Zustand = 'idle' | 'running' | 'preview';

/**
 * Wände und Bühnen aus dem Grundriss (#205).
 *
 * Ein Knopf, eine Vorschau, ein „Übernehmen". Vektorpläne (PDF, DXF) liest
 * die Geometrie selbst und maßstäblich; die KI kommt nur dazu, wenn der Plan
 * ein Scan ist oder der Nutzer sie ausdrücklich holt — ihr Ergebnis rastet
 * dann auf die gezeichneten Linien ein.
 */
export default function PlanErkennungPanel() {
  const { t } = useTranslation();
  const backgroundPlan = useStore((s) => s.backgroundPlan);
  const planVorschau = useStore((s) => s.planVorschau);
  const setPlanVorschau = useStore((s) => s.setPlanVorschau);
  const planBereichModus = useStore((s) => s.planBereichModus);
  const setPlanBereichModus = useStore((s) => s.setPlanBereichModus);
  const planUebernehmen = useStore((s) => s.planUebernehmen);
  const ai = useAiSettings();
  const { ladeSeite } = usePlanLaden();

  const [zustand, setZustand] = useState<Zustand>('idle');
  const [fehler, setFehler] = useState<string | null>(null);
  const [bericht, setBericht] = useState<PlanLaufBericht | null>(null);
  const [optionen, setOptionen] = useState<Omit<PlanLaufOptionen, 'bereich'>>({
    walls: true,
    columns: true,
    stages: true,
    applyScale: true,
  });
  const nachlauf = useRef<{ plan?: ErkannterPlan; neuerPlan?: ReturnType<typeof useStore.getState>['backgroundPlan']; venueGroesse?: { widthM: number; heightM: number } }>({});
  // Ein neuer Plan macht jede Vorschau ungültig.
  useEffect(() => {
    setPlanVorschau(null);
    setBericht(null);
    setZustand('idle');
    nachlauf.current = {};
  }, [backgroundPlan?.dataUrl, setPlanVorschau]);

  const quelle = planQuelleFuer(backgroundPlan?.dataUrl);
  const hatSchluessel = !!ai.apiKey;

  const bereich = planVorschau?.bereich;

  const erkennen = useCallback(
    async (mitKi: boolean) => {
      if (!backgroundPlan) return;
      setFehler(null);
      setZustand('running');
      const opt: PlanLaufOptionen = { ...optionen, bereich };
      try {
        if (quelle && !mitKi) {
          const t0 = Date.now();
          const plan = await planAusQuelle(quelle);
          const e = vorschauAusPlan(plan, backgroundPlan, opt, Date.now() - t0);
          nachlauf.current = { plan, neuerPlan: e.plan, venueGroesse: e.venueGroesse };
          setPlanVorschau(e.vorschau);
          setBericht(e.bericht);
        } else {
          if (!hatSchluessel) {
            openSettings('ai');
            setZustand('idle');
            return;
          }
          const img = await bildLaden(backgroundPlan.dataUrl);
          const e = await kiLauf({ ai, img, plan: backgroundPlan, optionen: opt });
          nachlauf.current = { neuerPlan: e.plan };
          setPlanVorschau(e.vorschau);
          setBericht(e.bericht);
        }
        setZustand('preview');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const hinweis = e instanceof AiError ? aiErrorHint(e.kind, t) : '';
        setFehler(hinweis ? `${msg} — ${hinweis}` : msg);
        setZustand('idle');
      }
    },
    [ai, backgroundPlan, bereich, hatSchluessel, optionen, quelle, setPlanVorschau, t],
  );

  const uebernehmen = useCallback(() => {
    if (!planVorschau) return;
    const { waende, buehnen } = vorschauImBereich(planVorschau);
    planUebernehmen({
      waende: waende.map<Omit<Wall, 'id'>>((w) => ({
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        // Ohne eigene Höhe folgt die Wand der Standardhöhe des Projekts (#198).
        ...(w.hoehe !== undefined ? { height: w.hoehe } : {}),
        label: w.label,
        thicknessM: w.dicke,
        ...(w.oeffnungen.length ? { openings: w.oeffnungen } : {}),
      })),
      buehnen: buehnen.map<Omit<Stage, 'id'>>((b) => ({ x: b.x, y: b.y, width: b.breite, height: b.tiefe, label: b.label })),
      backgroundPlan: nachlauf.current.neuerPlan ?? undefined,
      venueGroesse: nachlauf.current.venueGroesse,
    });
    setBericht(null);
    setZustand('idle');
  }, [planUebernehmen, planVorschau]);

  const verwerfen = useCallback(() => {
    setPlanVorschau(null);
    setBericht(null);
    setZustand('idle');
  }, [setPlanVorschau]);

  if (!backgroundPlan) return null;

  const imBereich = planVorschau ? vorschauImBereich(planVorschau) : null;

  return (
    <div className="rounded-bc-m p-2 border border-bc-border bg-bc-panel-raised space-y-1.5">
      <div className="flex items-center gap-1 text-bc-text font-medium">
        <FiZap size={11} /> {t('plan.detect.title', 'Walls and stages')}
      </div>
      <p className="text-bc-dim text-[10px] leading-tight">
        {quelle
          ? t('plan.detect.introVector', 'The PDF/DXF carries the drawing itself — walls, openings and rooms come out to scale, no AI needed.')
          : t('plan.detect.introRaster', 'This plan is an image. An AI can trace it; the result snaps onto the drawn lines. Drop the PDF or DXF instead for exact geometry.')}
      </p>

      {/* Mehrgeschossig: ein Blatt je Geschoss. Die Datei bleibt dieselbe,
          nur die Seite wechselt — Kalibrierung und Lage bleiben stehen. */}
      {quelle && quelle.seiten > 1 && (
        <div className="flex items-center justify-between gap-1 text-[10px] text-bc-text">
          <span className="text-bc-muted">
            {format(t('plan.detect.page', 'Sheet {n} of {all}'), { n: quelle.seite + 1, all: quelle.seiten })}
          </span>
          <span className="flex gap-1">
            <button
              type="button"
              disabled={quelle.seite === 0 || zustand === 'running'}
              onClick={() => void ladeSeite(quelle.seite - 1)}
              className="rounded-bc-s border border-bc-border px-1.5 py-0.5 text-bc-muted hover:text-bc-text disabled:opacity-40"
            >
              <FiChevronLeft size={11} />
            </button>
            <button
              type="button"
              disabled={quelle.seite + 1 >= quelle.seiten || zustand === 'running'}
              onClick={() => void ladeSeite(quelle.seite + 1)}
              className="rounded-bc-s border border-bc-border px-1.5 py-0.5 text-bc-muted hover:text-bc-text disabled:opacity-40"
            >
              <FiChevronRight size={11} />
            </button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-[10px] text-bc-text">
        {(['walls', 'columns', 'stages'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="accent-bc-accent"
              checked={optionen[k]}
              onChange={(e) => setOptionen((o) => ({ ...o, [k]: e.target.checked }))}
            />
            {t(`plan.detect.part.${k}`, k === 'walls' ? 'Walls' : k === 'columns' ? 'Columns' : 'Stages')}
          </label>
        ))}
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            className="accent-bc-accent"
            checked={optionen.applyScale}
            onChange={(e) => setOptionen((o) => ({ ...o, applyScale: e.target.checked }))}
          />
          {t('plan.detect.applyScale', 'Scale the plan too')}
        </label>
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => void erkennen(false)}
          disabled={zustand === 'running'}
          className="flex flex-1 items-center justify-center gap-1 rounded-bc-m px-2 py-1 bg-bc-accent/20 text-bc-accent text-[11px] hover:bg-bc-accent/30 disabled:opacity-40"
        >
          {zustand === 'running' ? <><FiLoader size={11} className="animate-spin" /> {t('plan.detect.running', 'Reading plan…')}</> : t('plan.detect.run', 'Detect walls and stages')}
        </button>
        <button
          onClick={() => setPlanBereichModus(!planBereichModus)}
          title={t('plan.detect.areaHint', 'Limit to an area you drag on the 2D plan')}
          className={`rounded-bc-m px-2 py-1 border text-[11px] ${planBereichModus ? 'border-bc-accent text-bc-accent' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
        >
          <FiCrop size={11} />
        </button>
      </div>

      {quelle && (
        <button
          onClick={() => void erkennen(true)}
          disabled={zustand === 'running'}
          className="flex w-full items-center justify-center gap-1 text-[10px] text-bc-muted hover:text-bc-text disabled:opacity-40"
        >
          <FiCpu size={10} /> {t('plan.detect.alsoAi', 'Unclear plan? Let the AI trace it instead')}
        </button>
      )}
      {!quelle && (
        <div className="flex items-center justify-between gap-1 text-[10px]">
          <span className="min-w-0 truncate text-bc-muted">
            {hatSchluessel
              ? format(t('plan.detect.using', 'Uses {label} · {model}'), { label: ai.provider.label, model: ai.model })
              : t('plan.detect.noKey', 'No AI key yet — add one in Settings.')}
          </span>
          <button type="button" onClick={() => openSettings('ai')} className="flex shrink-0 items-center gap-1 text-bc-accent hover:underline">
            <FiSettings size={10} /> {hatSchluessel ? t('plan.detect.change', 'Change') : t('plan.detect.settings', 'Settings')}
          </button>
        </div>
      )}

      {bericht && imBereich && (
        <div className="rounded-bc-m border border-bc-border bg-bc-panel p-1.5 space-y-1">
          <p className="text-[10px] text-bc-text">
            {format(t('plan.detect.found', '{walls} walls, {stages} stages, {rooms} rooms'), {
              walls: imBereich.waende.length,
              stages: imBereich.buehnen.length,
              rooms: planVorschau?.raeume.length ?? 0,
            })}
            {bericht.tueren + bericht.fenster > 0 &&
              ` · ${format(t('plan.detect.openings', '{doors} doors, {windows} windows'), { doors: bericht.tueren, windows: bericht.fenster })}`}
          </p>
          {bericht.massstab?.massstab && (
            <p className="text-[10px] text-bc-muted">
              {format(t('plan.detect.scale', 'Scale 1:{n} ({src}, {hits} of {read} dimensions)'), {
                n: bericht.massstab.massstab,
                src: bericht.massstab.quelle,
                hits: bericht.massstab.passend,
                read: bericht.massstab.gelesen,
              })}
            </p>
          )}
          {bericht.kiEingerastet && (
            <p className="text-[10px] text-bc-muted">
              {format(t('plan.detect.snapped', '{n} of {all} AI parts snapped onto the drawing'), {
                n: bericht.kiEingerastet.waende + bericht.kiEingerastet.buehnen,
                all: bericht.kiEingerastet.von,
              })}
            </p>
          )}
          <div className="flex gap-1">
            <button
              onClick={uebernehmen}
              className="flex flex-1 items-center justify-center gap-1 rounded-bc-m px-2 py-1 bg-bc-green/20 text-bc-green-text text-[11px] hover:bg-bc-green/30"
            >
              <FiCheck size={11} /> {t('plan.detect.apply', 'Apply')}
            </button>
            <button
              onClick={verwerfen}
              className="flex items-center justify-center gap-1 rounded-bc-m px-2 py-1 border border-bc-border text-bc-muted text-[11px] hover:text-bc-text"
            >
              <FiX size={11} /> {t('plan.detect.discard', 'Discard')}
            </button>
          </div>
        </div>
      )}
      {fehler && <p className="text-bc-red-text text-[10px] break-words">{fehler}</p>}
    </div>
  );
}

function bildLaden(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error('image'));
    img.src = src;
  });
}
