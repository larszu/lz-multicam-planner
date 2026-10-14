import { useCallback, useState } from 'react';
import { FiCpu, FiKey, FiLoader } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { AI_PROVIDERS, AI_PROVIDER_ORDER, splitDataUrl, parseJsonResponse, loadAiModel, saveAiModel } from '../../utils/aiProviders';
import type { AiProviderId } from '../../utils/aiProviders';
import { buildPlanPrompt, wallsFromResult, stagesFromResult } from '../../utils/planAnalysis';
import type { AnalysisResult, PlanTasks } from '../../utils/planAnalysis';
import { useTranslation, format } from '../../i18n';

const PROVIDER_STORAGE = 'multicam-ai-provider';

// AI floor-plan analysis (issues #39 / #40): pick a provider, paste a key, and
// have the model extract walls / stages / scale from the uploaded plan image.
export default function AiPlanAnalysis() {
  const { t } = useTranslation();
  const { backgroundPlan, setBackgroundPlan, addWall, addStage } = useStore();

  const initialProviderId: AiProviderId = (localStorage.getItem(PROVIDER_STORAGE) as AiProviderId) in AI_PROVIDERS
    ? (localStorage.getItem(PROVIDER_STORAGE) as AiProviderId)
    : 'gemini';
  const [providerId, setProviderId] = useState<AiProviderId>(initialProviderId);
  const provider = AI_PROVIDERS[providerId];
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(AI_PROVIDERS[initialProviderId].keyStorageKey) ?? '');
  const [model, setModel] = useState(
    () => loadAiModel(initialProviderId),
  );
  const [tasks, setTasks] = useState<PlanTasks>({ walls: true, stages: true, scale: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // Load the stored key + model whenever the provider changes.
  const selectProvider = useCallback((id: AiProviderId) => {
    setProviderId(id);
    localStorage.setItem(PROVIDER_STORAGE, id);
    setApiKey(localStorage.getItem(AI_PROVIDERS[id].keyStorageKey) ?? '');
    setModel(loadAiModel(id));
    setError(null);
    setSummary(null);
  }, []);

  const persistKey = useCallback((value: string) => {
    setApiKey(value);
    if (value.trim()) localStorage.setItem(provider.keyStorageKey, value.trim());
    else localStorage.removeItem(provider.keyStorageKey);
  }, [provider.keyStorageKey]);

  const persistModel = useCallback((value: string) => {
    setModel(value);
    saveAiModel(providerId, value);
  }, [providerId]);

  const analyze = useCallback(async () => {
    if (!backgroundPlan) { setError(t('sidebar.ai.errUpload', 'Upload a floor plan image/PDF first.')); return; }
    if (!apiKey.trim()) { setError(format(t('sidebar.ai.errKey', 'Enter your {label} API key.'), { label: provider.label })); return; }
    if (!tasks.walls && !tasks.stages && !tasks.scale) { setError(t('sidebar.ai.errSelect', 'Select at least one thing to extract.')); return; }

    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const image = splitDataUrl(backgroundPlan.dataUrl);
      const prompt = buildPlanPrompt(tasks);
      const text = await provider.callVision(apiKey.trim(), model.trim() || provider.defaultModel, prompt, image);
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [apiKey, backgroundPlan, model, provider, setBackgroundPlan, addWall, addStage, tasks, t]);

  return (
    <div className="rounded-bc-m p-2 border border-bc-border bg-bc-panel-raised space-y-1.5">
      <div className="flex items-center gap-1 text-bc-text font-medium">
        <FiCpu size={11} /> {t('sidebar.ai.title', 'AI Plan Analysis')}
      </div>
      <p className="text-bc-dim text-[10px] leading-tight">
        {t('sidebar.ai.intro', 'Let an AI read the uploaded plan and draw walls / stages and read the scale.')}
      </p>

      {/* Provider + model */}
      <select
        className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[11px]"
        value={providerId}
        onChange={(e) => selectProvider(e.target.value as AiProviderId)}
      >
        {AI_PROVIDER_ORDER.map((id) => (
          <option key={id} value={id}>
            {AI_PROVIDERS[id].label}{AI_PROVIDERS[id].free ? t('sidebar.ai.freeKey', ' — free key') : ''}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <FiKey size={11} className="text-bc-dim shrink-0" />
        <input
          type="password"
          placeholder={format(t('sidebar.ai.apiKeyPlaceholder', '{label} API key'), { label: provider.label })}
          className="flex-1 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[11px]"
          value={apiKey}
          onChange={(e) => persistKey(e.target.value)}
        />
      </div>
      <p className="text-bc-faint text-[11px]">{provider.keyHint}</p>

      <input
        type="text"
        placeholder={t('sidebar.ai.modelPlaceholder', 'model')}
        className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[10px]"
        value={model}
        onChange={(e) => persistModel(e.target.value)}
        title={t('sidebar.ai.modelTitle', 'Model id — defaults to a vision-capable model for the provider')}
      />

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
        disabled={busy || !backgroundPlan}
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
