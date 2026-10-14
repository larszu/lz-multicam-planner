import { useCallback, useState } from 'react';
import { FiCpu, FiLoader, FiSettings } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { AiError, callVision, splitDataUrl, parseJsonResponse } from '../../utils/aiProviders';
import { buildPlanPrompt, wallsFromResult, stagesFromResult } from '../../utils/planAnalysis';
import type { AnalysisResult, PlanTasks } from '../../utils/planAnalysis';
import { useTranslation, format } from '../../i18n';
import { openSettings } from '../Settings/openSettings';
import { useAiSettings } from '../Settings/useAiSettings';
import { aiErrorHint } from '../Settings/aiErrorHint';

// AI floor-plan analysis (issues #39 / #40): the model from Settings → AI
// extracts walls / stages / scale from the uploaded plan image.
export default function AiPlanAnalysis() {
  const { t } = useTranslation();
  const { backgroundPlan, setBackgroundPlan, addWall, addStage } = useStore();
  const ai = useAiSettings();
  const hasKey = !!ai.apiKey;
  const [tasks, setTasks] = useState<PlanTasks>({ walls: true, stages: true, scale: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    if (!backgroundPlan) { setError(t('sidebar.ai.errUpload', 'Upload a floor plan image/PDF first.')); return; }
    if (!hasKey) { openSettings('ai'); return; }
    if (!tasks.walls && !tasks.stages && !tasks.scale) { setError(t('sidebar.ai.errSelect', 'Select at least one thing to extract.')); return; }

    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const image = splitDataUrl(backgroundPlan.dataUrl);
      const prompt = buildPlanPrompt(tasks);
      const text = await callVision(ai, prompt, image);
      const result = parseJsonResponse<AnalysisResult>(text);

      // Apply the scale first so wall/stage geometry uses the corrected scale.
      let plan = backgroundPlan;
      let scaleNote = '';
      if (tasks.scale && result.scale && typeof result.scale.metersPerPixel === 'number' && result.scale.metersPerPixel > 0) {
        plan = { ...backgroundPlan, scaleX: result.scale.metersPerPixel, scaleY: result.scale.metersPerPixel };
        setBackgroundPlan(plan);
        scaleNote = format(t('sidebar.ai.scaleNote', 'scale {v} mm/px'), { v: (result.scale.metersPerPixel * 1000).toFixed(1) });
      }

      const parts: string[] = [];
      if (tasks.walls) {
        const walls = wallsFromResult(result, plan);
        walls.forEach((w) => addWall(w));
        parts.push(format(t('sidebar.ai.countWalls', '{n} {unit}'), { n: walls.length, unit: walls.length === 1 ? t('sidebar.ai.wall', 'wall') : t('sidebar.ai.walls', 'walls') }));
      }
      if (tasks.stages) {
        const stages = stagesFromResult(result, plan);
        stages.forEach((s) => addStage(s));
        parts.push(format(t('sidebar.ai.countStages', '{n} {unit}'), { n: stages.length, unit: stages.length === 1 ? t('sidebar.ai.stage', 'stage') : t('sidebar.ai.stages', 'stages') }));
      }
      if (scaleNote) parts.push(scaleNote);

      setSummary(parts.length ? format(t('sidebar.ai.summaryAdded', 'Added {parts}.'), { parts: parts.join(', ') }) : t('sidebar.ai.summaryNone', 'Nothing was detected in the plan.'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hint = aiErrorHint(e instanceof AiError ? e.kind : 'other', t);
      setError(hint ? `${msg} — ${hint}` : msg);
    } finally {
      setBusy(false);
    }
  }, [ai, hasKey, backgroundPlan, setBackgroundPlan, addWall, addStage, tasks, t]);

  return (
    <div className="rounded-bc-m p-2 border border-bc-border bg-bc-panel-raised space-y-1.5">
      <div className="flex items-center gap-1 text-bc-text font-medium">
        <FiCpu size={11} /> {t('sidebar.ai.title', 'AI Plan Analysis')}
      </div>
      <p className="text-bc-dim text-[10px] leading-tight">
        {t('sidebar.ai.intro', 'Let an AI read the uploaded plan and draw walls / stages and read the scale.')}
      </p>

      {/* Anbieter, Schluessel und Modell stehen in Einstellungen → AI. */}
      <div className="flex items-center justify-between gap-1 text-[10px]">
        <span className="min-w-0 truncate text-bc-muted" title={`${ai.provider.label} · ${ai.model}`}>
          {hasKey
            ? format(t('sidebar.ai.using', 'Uses {label} · {model}'), { label: ai.provider.label, model: ai.model })
            : t('sidebar.ai.noKey', 'No AI key yet — add one in Settings.')}
        </span>
        <button
          type="button"
          onClick={() => openSettings('ai')}
          className="flex shrink-0 items-center gap-1 text-bc-accent hover:underline"
        >
          <FiSettings size={10} /> {hasKey ? t('sidebar.ai.change', 'Change') : t('sidebar.ai.openSettings', 'Settings')}
        </button>
      </div>

      {/* What to extract */}
      <div className="flex flex-wrap gap-2 text-[10px] text-bc-text">
        {(['walls', 'stages', 'scale'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="accent-bc-accent"
              checked={tasks[k]}
              onChange={(e) => setTasks((t) => ({ ...t, [k]: e.target.checked }))}
            />
            {t(`sidebar.ai.task.${k}`, k.charAt(0).toUpperCase() + k.slice(1))}
          </label>
        ))}
      </div>

      <button
        onClick={analyze}
        disabled={busy || !backgroundPlan || !hasKey}
        className="flex items-center justify-center gap-1 px-2 py-1 bg-bc-accent/20 text-bc-accent text-[11px] hover:bg-bc-accent/30 w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <><FiLoader size={11} className="animate-spin" /> {t('sidebar.ai.analysing', 'Analysing…')}</> : <>{t('sidebar.ai.analyse', 'Analyse plan with AI')}</>}
      </button>

      {!backgroundPlan && <p className="text-bc-faint text-[11px]">{t('sidebar.ai.uploadHint', 'Upload a plan above to enable analysis.')}</p>}
      {error && <p className="text-bc-red-text text-[10px] break-words">{error}</p>}
      {summary && <p className="text-bc-green-text text-[10px]">{summary}</p>}
    </div>
  );
}
