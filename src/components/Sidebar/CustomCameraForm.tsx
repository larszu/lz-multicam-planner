import { useState } from 'react';
import { FiPlus, FiTrash2, FiKey, FiZap, FiX } from 'react-icons/fi';
import { SENSORS } from '../../data/cameras';
import { CABLE_CAMERA_IDS } from '../../data/cableCameraCatalogIds';
import type { Camera, SensorSize } from '../../types';
import { isEstimate } from '../../types';
import { useTranslation } from '../../i18n';

/**
 * Shared form for both creating and editing a custom camera. Used inline in the
 * camera-card "Custom+" dropdown entry AND in the standalone Custom Camera
 * Library section of the sidebar.
 *
 *  - `initial` populates the fields for edit mode; undefined means create mode.
 *  - The form supports an arbitrary list of sensor crop modes (e.g. mirror an
 *    URSA Broadcast G2's 6K / 4K S16 / 2/3" B4 modes) with auto-calculated
 *    crop factor against the 43.267 mm full-frame diagonal.
 *  - Adapter mounts are a multi-select (mount plates the body can swap to).
 *  - When a Gemini API key is stored in localStorage, an "Auto-fill from AI"
 *    button calls the Gemini API to populate the fields from a manufacturer +
 *    model name. The key is set/cleared via the inline ⚙ key button.
 */

const GEMINI_KEY_STORAGE = 'multicam-gemini-api-key';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

const MOUNTS = ['B4', 'EF', 'PL', 'E', 'MFT', 'RF', 'L', 'FZ', 'integrated', 'M12'] as const;
const TYPES = [
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'ptz', label: 'PTZ' },
  { value: 'mirrorless', label: 'Mirrorless' },
  { value: 'camcorder', label: 'Camcorder' },
  { value: 'eng', label: 'ENG' },
] as const;

type ModeRow = { name: string; widthMm: string; heightMm: string };

interface CustomCameraFormProps {
  /** Populated for edit mode, undefined for create mode. */
  initial?: Camera;
  onSubmit: (cam: Omit<Camera, 'id'>) => void;
  onCancel: () => void;
  submitLabel?: string;
  /** Title shown at the top of the form. */
  title?: string;
}

function diagToCropFactor(w: number, h: number) {
  if (!w || !h) return 1;
  return 43.267 / Math.sqrt(w * w + h * h);
}

function detectSensorPreset(sensor?: SensorSize): string {
  if (!sensor) return 'S35';
  for (const [key, s] of Object.entries(SENSORS)) {
    if (Math.abs(s.widthMm - sensor.widthMm) < 0.05 && Math.abs(s.heightMm - sensor.heightMm) < 0.05) {
      return key;
    }
  }
  return '__custom__';
}

export function CustomCameraForm({ initial, onSubmit, onCancel, submitLabel, title }: CustomCameraFormProps) {
  const { t } = useTranslation();
  const resolvedSubmitLabel = submitLabel ?? t('sidebar.form.create', 'Create');
  const resolvedTitle = title ?? t('sidebar.form.newCamera', 'New Custom Camera');
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  // Anschluss-Vorlage (#145): eine eigene Kamera bekommt ihre Ports im
  // cable-planner nur ueber eine GUID aus dessen Katalog. Gewaehlt wird sie
  // von Hand und nie aus dem Namen erschlossen — ein gleich klingendes Modell
  // hat nicht zwingend dasselbe Anschlussfeld.
  const [deviceTypeId, setDeviceTypeId] = useState(initial?.deviceTypeId ?? '');
  // Mount: the initial value might be a known mount or a custom one (e.g. "Z",
  // "PV", "M43-Box"). We track which mode we're in so the UI shows either the
  // dropdown or the free-text input.
  const initialMountIsKnown = !initial?.mount || (MOUNTS as readonly string[]).includes(initial.mount);
  const [mount, setMount] = useState<string>(initial?.mount ?? 'EF');
  const [mountIsCustom, setMountIsCustom] = useState<boolean>(!initialMountIsKnown);
  const [type, setType] = useState<Camera['type']>(initial?.type ?? 'cinema');
  const [adaptedMounts, setAdaptedMounts] = useState<string[]>(initial?.adaptedMounts ?? []);
  const [customAdapterDraft, setCustomAdapterDraft] = useState('');

  // Sensor: either a preset key or '__custom__' with explicit dimensions.
  const initialPreset = detectSensorPreset(initial?.sensor);
  const [sensorKey, setSensorKey] = useState<string>(initialPreset);
  const [sensorW, setSensorW] = useState<string>(initialPreset === '__custom__' ? String(initial?.sensor.widthMm ?? '') : '');
  const [sensorH, setSensorH] = useState<string>(initialPreset === '__custom__' ? String(initial?.sensor.heightMm ?? '') : '');
  const [sensorName, setSensorName] = useState<string>(initialPreset === '__custom__' ? (initial?.sensor.name ?? '') : '');

  const [modes, setModes] = useState<ModeRow[]>(
    (initial?.sensorModes ?? []).map((m) => ({ name: m.name, widthMm: String(m.widthMm), heightMm: String(m.heightMm) })),
  );

  // Gemini state
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(GEMINI_KEY_STORAGE) ?? '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [pendingKey, setPendingKey] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Der Beleg je Feld, wie ihn die Abfrage geliefert hat. Ohne ihn sah eine
  // geratene Sensorbreite genauso aus wie eine aus dem Datenblatt — und die
  // Sensormasse treiben die Bildwinkel-Rechnung.
  const [aiSources, setAiSources] = useState<Camera['specSource']>(initial?.specSource);

  const addMode = () => setModes([...modes, { name: '', widthMm: '', heightMm: '' }]);
  const removeMode = (i: number) => setModes(modes.filter((_, idx) => idx !== i));
  const patchMode = (i: number, patch: Partial<ModeRow>) =>
    setModes(modes.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const handleSubmit = () => {
    if (!manufacturer.trim() || !model.trim()) return;

    let sensor: SensorSize;
    if (sensorKey === '__custom__') {
      const w = parseFloat(sensorW);
      const h = parseFloat(sensorH);
      if (!w || !h) { alert(t('sidebar.form.alertSensorDims', 'Enter sensor width and height in mm.')); return; }
      sensor = {
        name: sensorName.trim() || `${w}×${h}mm`,
        widthMm: w,
        heightMm: h,
        cropFactor: diagToCropFactor(w, h),
      };
    } else {
      sensor = SENSORS[sensorKey];
    }

    // Build sensorModes from non-empty rows
    const parsedModes: SensorSize[] = [];
    for (const m of modes) {
      const w = parseFloat(m.widthMm);
      const h = parseFloat(m.heightMm);
      if (!w || !h) continue;
      parsedModes.push({
        name: m.name.trim() || `${w}×${h}mm`,
        widthMm: w,
        heightMm: h,
        cropFactor: diagToCropFactor(w, h),
      });
    }

    onSubmit({
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      sensor,
      mount,
      adaptedMounts: adaptedMounts.length > 0 ? adaptedMounts : undefined,
      resolutions: initial?.resolutions ?? ['HD'],
      type,
      sensorModes: parsedModes.length > 0 ? parsedModes : undefined,
      specSource: aiSources,
      deviceTypeId: deviceTypeId || undefined,
    });
  };

  const runAiAutofill = async () => {
    if (!apiKey) { setShowKeyInput(true); return; }
    if (!manufacturer.trim() && !model.trim()) {
      setAiError(t('sidebar.form.aiErrNeedName', 'Enter at least a manufacturer or model first.'));
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const prompt = buildPrompt(manufacturer, model);
      const data = await callGemini(apiKey, prompt);
      applyAiResult(data);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : t('sidebar.form.aiErrFailed', 'AI request failed'));
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiResult = (data: GeminiCameraResult) => {
    if (Array.isArray(data.verification)) {
      const entries = data.verification
        .filter((v) => typeof v?.field === 'string' && typeof v?.source === 'string')
        .map((v) => [v.field as string, { value: String(v.value ?? ''), source: v.source as string }] as const);
      if (entries.length > 0) setAiSources(Object.fromEntries(entries));
    }
    if (data.manufacturer && !manufacturer.trim()) setManufacturer(String(data.manufacturer));
    if (data.model && !model.trim()) setModel(String(data.model));
    if (typeof data.mount === 'string' && data.mount.trim()) {
      const m = data.mount.trim();
      setMount(m);
      setMountIsCustom(!(MOUNTS as readonly string[]).includes(m));
    }
    if (data.type && TYPES.some((ty) => ty.value === data.type)) setType(data.type as Camera['type']);
    if (Array.isArray(data.adaptedMounts)) {
      setAdaptedMounts(
        data.adaptedMounts
          .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
          .map((m) => m.trim()),
      );
    }
    if (data.sensor && typeof data.sensor.widthMm === 'number' && typeof data.sensor.heightMm === 'number') {
      setSensorKey('__custom__');
      setSensorName(String(data.sensor.name ?? ''));
      setSensorW(String(data.sensor.widthMm));
      setSensorH(String(data.sensor.heightMm));
    }
    if (Array.isArray(data.sensorModes)) {
      setModes(
        data.sensorModes
          .filter((m): m is { name?: string; widthMm: number; heightMm: number } =>
            !!m && typeof m.widthMm === 'number' && typeof m.heightMm === 'number')
          .map((m) => ({
            name: String(m.name ?? ''),
            widthMm: String(m.widthMm),
            heightMm: String(m.heightMm),
          })),
      );
    }
  };

  const saveKey = () => {
    const trimmed = pendingKey.trim();
    if (trimmed) {
      localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
      setApiKey(trimmed);
    }
    setPendingKey('');
    setShowKeyInput(false);
  };

  const clearKey = () => {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    setApiKey('');
    setPendingKey('');
    setShowKeyInput(false);
  };

  return (
    <div className="bg-bc-dark p-2 border border-bc-border space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-bc-text font-medium text-[11px]">{resolvedTitle}</span>
        <div className="flex items-center gap-1">
          {apiKey && (
            <button
              type="button"
              onClick={runAiAutofill}
              disabled={aiLoading}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30 disabled:opacity-50"
              title={t('sidebar.form.aiAutofillTitle', 'Auto-fill the form from Gemini AI based on the manufacturer + model')}
            >
              <FiZap size={10} /> {aiLoading ? t('sidebar.form.askingAi', 'Asking AI…') : t('sidebar.form.aiAutofill', 'AI auto-fill')}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setPendingKey(apiKey); setShowKeyInput(!showKeyInput); }}
            className="p-1 text-bc-dim hover:text-bc-accent"
            title={apiKey ? t('sidebar.form.manageKey', 'Manage Gemini API key') : t('sidebar.form.setKey', 'Set Gemini API key for AI auto-fill')}
          >
            <FiKey size={11} />
          </button>
          <button onClick={onCancel} className="text-bc-dim hover:text-bc-text-bright text-xs">
            <FiX size={11} />
          </button>
        </div>
      </div>

      {showKeyInput && (
        <div className="bg-bc-panel p-1.5 border border-bc-border space-y-1">
          <div className="text-[10px] text-bc-dim leading-tight">
            {t('sidebar.form.keyHintPre', 'Paste a free Gemini API key from')} <span className="text-bc-accent">aistudio.google.com</span>.
            {' '}{t('sidebar.form.keyHintPost', 'Stored locally only.')}
          </div>
          <input
            type="password"
            className="w-full bg-bc-dark border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
            placeholder="AIza…"
            value={pendingKey}
            onChange={(e) => setPendingKey(e.target.value)}
          />
          <div className="flex gap-1">
            <button onClick={saveKey} className="flex-1 py-0.5 bg-bc-green/20 text-bc-green text-[10px] hover:bg-bc-green/30">{t('sidebar.form.save', 'Save')}</button>
            {apiKey && (
              <button onClick={clearKey} className="flex-1 py-0.5 bg-bc-red/20 text-bc-red text-[10px] hover:bg-bc-red/30">{t('sidebar.form.clear', 'Clear')}</button>
            )}
            <button onClick={() => setShowKeyInput(false)} className="flex-1 py-0.5 bg-bc-dark border border-bc-border text-bc-muted text-[10px] hover:text-bc-text">{t('sidebar.form.cancel', 'Cancel')}</button>
          </div>
        </div>
      )}

      {aiError && (
        <div className="text-[10px] text-bc-red bg-bc-red/10 border border-bc-red/30 px-1.5 py-1">
          {aiError}
        </div>
      )}

      {/* Woher die Werte stammen. Die Abfrage liefert je Feld eine Quelle;
          ohne diese Liste stuende im Formular eine geratene Sensorbreite
          genauso da wie eine aus dem Datenblatt — und sie treibt die
          Bildwinkel-Rechnung. Schaetzungen sind eigens gekennzeichnet, weil
          sie der Grund sind, warum es die Liste ueberhaupt braucht. */}
      {aiSources && Object.keys(aiSources).length > 0 && (
        <div className="text-[10px] border border-bc-line px-1.5 py-1 space-y-0.5">
          <div className="opacity-70">
            {t('sidebar.form.specSourceHead', 'Where the values come from — please verify:')}
          </div>
          {Object.entries(aiSources).map(([field, entry]) => (
            <div key={field} className="flex gap-1">
              <span className={isEstimate(entry) ? 'text-bc-amber' : 'opacity-60'}>
                {isEstimate(entry) ? '≈' : '✓'}
              </span>
              <span className="opacity-70">{field}:</span>
              <span className="opacity-90 truncate" title={entry.source}>{entry.source}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        <input
          placeholder={t('sidebar.form.manufacturer', 'Manufacturer')}
          className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
        />
        <input
          placeholder={t('sidebar.form.model', 'Model')}
          className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>

      <label className="block" title={t('sidebar.form.portTemplateTitle', 'The Cable Planner gives this camera the connectors of the chosen catalog device. Only choose a device whose connector panel matches this body.')}>
        <span className="text-bc-dim text-[10px]">{t('sidebar.form.portTemplate', 'Port template from catalog')}</span>
        <select
          className="block w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
          value={deviceTypeId}
          onChange={(e) => setDeviceTypeId(e.target.value)}
        >
          <option value="">{t('sidebar.form.portTemplateNone', 'None — connectors unknown')}</option>
          {CABLE_CAMERA_IDS.map((e) => (
            <option key={e.deviceTypeId} value={e.deviceTypeId}>{e.name}</option>
          ))}
          {/* Eine GUID, die der aktuelle Abzug nicht mehr kennt, bleibt
              waehlbar stehen, statt beim naechsten Speichern still zu fallen. */}
          {deviceTypeId && !CABLE_CAMERA_IDS.some((e) => e.deviceTypeId === deviceTypeId) && (
            <option value={deviceTypeId}>{deviceTypeId}</option>
          )}
        </select>
      </label>

      <label className="block">
        <span className="text-bc-dim text-[10px]">{t('sidebar.form.sensor', 'Sensor')}</span>
        <select
          className="block w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
          value={sensorKey}
          onChange={(e) => setSensorKey(e.target.value)}
        >
          {Object.entries(SENSORS).map(([key, s]) => (
            <option key={key} value={key}>{s.name} ({s.widthMm}×{s.heightMm}mm)</option>
          ))}
          <option value="__custom__">{t('sidebar.form.customSize', 'Custom size…')}</option>
        </select>
      </label>
      {sensorKey === '__custom__' && (
        <div className="grid grid-cols-3 gap-1">
          <input
            placeholder={t('sidebar.form.name', 'Name')}
            className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
            value={sensorName}
            onChange={(e) => setSensorName(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder={t('sidebar.form.widthMm', 'Width mm')}
            className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
            value={sensorW}
            onChange={(e) => setSensorW(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder={t('sidebar.form.heightMm', 'Height mm')}
            className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
            value={sensorH}
            onChange={(e) => setSensorH(e.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        <label>
          <span className="text-bc-dim text-[10px]">{t('sidebar.form.nativeMount', 'Native Mount')}</span>
          <select
            className="block w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
            value={mountIsCustom ? '__custom__' : mount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__custom__') {
                setMountIsCustom(true);
                setMount('');
                return;
              }
              setMountIsCustom(false);
              setMount(v);
              setAdaptedMounts(adaptedMounts.filter((x) => x !== v));
            }}
          >
            {MOUNTS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">{t('sidebar.form.custom', 'Custom…')}</option>
          </select>
        </label>
        <label>
          <span className="text-bc-dim text-[10px]">{t('sidebar.form.type', 'Type')}</span>
          <select
            className="block w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
            value={type}
            onChange={(e) => setType(e.target.value as Camera['type'])}
          >
            {TYPES.map((ty) => (
              <option key={ty.value} value={ty.value}>{t(`sidebar.form.camType.${ty.value}`, ty.label)}</option>
            ))}
          </select>
        </label>
      </div>
      {mountIsCustom && (
        <input
          placeholder={t('sidebar.form.customMountPlaceholder', 'Custom mount name (e.g. Z, PV, M4/3 Studio…)')}
          className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
          value={mount}
          onChange={(e) => {
            const v = e.target.value;
            setMount(v);
            setAdaptedMounts(adaptedMounts.filter((x) => x !== v));
          }}
        />
      )}

      <div>
        <span className="text-bc-dim text-[10px]">{t('sidebar.form.availableAdapters', 'Available adapters / mount plates')}</span>
        <div className="grid grid-cols-4 gap-1 mt-0.5">
          {/* Known mounts (excluding the native one) + any custom adapter mounts
              the user has already added in this session. Custom adapter mounts
              get a small × button so they can be removed from the list entirely
              rather than just unchecked. */}
          {[
            ...MOUNTS.filter((m) => m !== mount && m !== 'integrated' && m !== 'M12'),
            ...adaptedMounts.filter((m) => !(MOUNTS as readonly string[]).includes(m)),
          ].map((m) => {
            const checked = adaptedMounts.includes(m);
            const isCustomAdapter = !(MOUNTS as readonly string[]).includes(m);
            return (
              <label key={m} className="flex items-center gap-1 text-[10px] text-bc-text cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-bc-accent"
                  checked={checked}
                  onChange={(e) => {
                    setAdaptedMounts(
                      e.target.checked ? [...adaptedMounts, m] : adaptedMounts.filter((x) => x !== m),
                    );
                  }}
                />
                <span className={isCustomAdapter ? 'text-bc-accent' : ''}>{m}</span>
              </label>
            );
          })}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <input
            placeholder={t('sidebar.form.addAdapterPlaceholder', 'Add custom adapter mount (e.g. Z, PV)')}
            className="flex-1 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[11px]"
            value={customAdapterDraft}
            onChange={(e) => setCustomAdapterDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const trimmed = customAdapterDraft.trim();
              if (!trimmed || trimmed === mount || adaptedMounts.includes(trimmed)) {
                setCustomAdapterDraft('');
                return;
              }
              setAdaptedMounts([...adaptedMounts, trimmed]);
              setCustomAdapterDraft('');
            }}
          />
          <button
            type="button"
            onClick={() => {
              const trimmed = customAdapterDraft.trim();
              if (!trimmed || trimmed === mount || adaptedMounts.includes(trimmed)) {
                setCustomAdapterDraft('');
                return;
              }
              setAdaptedMounts([...adaptedMounts, trimmed]);
              setCustomAdapterDraft('');
            }}
            disabled={!customAdapterDraft.trim()}
            className="px-2 py-0.5 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30 disabled:opacity-40"
            title={t('sidebar.form.addAdapterTitle', 'Add this name as a selectable adapter mount')}
          >
            <FiPlus size={10} />
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-bc-dim text-[10px]">{t('sidebar.form.sensorModes', 'Sensor modes (hardware crops, optional)')}</span>
          <button
            type="button"
            onClick={addMode}
            className="flex items-center gap-1 px-1 py-0.5 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30"
          >
            <FiPlus size={10} /> {t('sidebar.form.addMode', 'Add mode')}
          </button>
        </div>
        {modes.map((m, i) => {
          const w = parseFloat(m.widthMm);
          const h = parseFloat(m.heightMm);
          const cf = w && h ? diagToCropFactor(w, h) : 0;
          return (
            <div key={i} className="grid grid-cols-12 gap-1 mt-0.5 items-center">
              <input
                placeholder={t('sidebar.form.name', 'Name')}
                className="col-span-5 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[11px]"
                value={m.name}
                onChange={(e) => patchMode(i, { name: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                placeholder={t('sidebar.form.wMm', 'W mm')}
                className="col-span-3 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[11px]"
                value={m.widthMm}
                onChange={(e) => patchMode(i, { widthMm: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                placeholder={t('sidebar.form.hMm', 'H mm')}
                className="col-span-3 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[11px]"
                value={m.heightMm}
                onChange={(e) => patchMode(i, { heightMm: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeMode(i)}
                className="col-span-1 p-0.5 text-bc-dim hover:text-bc-red"
                title={t('sidebar.form.removeMode', 'Remove mode')}
              >
                <FiTrash2 size={11} />
              </button>
              {cf > 0 && (
                <span className="col-span-12 text-[11px] text-bc-dim -mt-0.5">
                  → {t('sidebar.form.cropFactor', 'crop factor')} ×{cf.toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!manufacturer.trim() || !model.trim()}
        className="flex items-center gap-1 px-2 py-1 bg-bc-green/20 text-bc-green text-xs hover:bg-bc-green/30 w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FiPlus size={12} /> {resolvedSubmitLabel}
      </button>
    </div>
  );
}

// ── Gemini helpers ───────────────────────────────────────────────────────────

function buildPrompt(manufacturer: string, model: string): string {
  return [
    'You are a broadcast/cinema camera specification database.',
    'Return ONLY a JSON object matching this schema (no markdown, no commentary):',
    '{',
    '  "manufacturer": string,',
    '  "model": string,',
    '  "sensor": { "name": string, "widthMm": number, "heightMm": number },',
    '  "mount": "B4"|"EF"|"PL"|"E"|"MFT"|"RF"|"L"|"FZ"|"integrated"|"M12",',
    '  "adaptedMounts": string[],   // mount plates the body can swap to, excluding the native mount',
    '  "type": "broadcast"|"cinema"|"ptz"|"mirrorless"|"camcorder"|"eng",',
    '  "sensorModes": [{ "name": string, "widthMm": number, "heightMm": number }],',
    '  "verification": [{ "field": string, "value": string, "source": string }]',
    '}',
    '',
    'For EVERY field you deliver, add one entry to "verification" naming the',
    'field, the value, and where it comes from — a concrete citation such as',
    '"Sony FX9 spec sheet: 35.7 x 18.8 mm". If a value is not documented and',
    'you are inferring it, say so and start the source with "estimate:". The',
    'sensor dimensions drive the field-of-view calculation, so a guess that',
    'looks like a datasheet reading is worse than no answer.',
    '',
    'Fill every field you can confirm; omit any you cannot. sensorModes should',
    "list ALL distinct hardware sensor crop modes the body exposes (e.g. URSA",
    "Broadcast G2 has 6K Full, 4K UHD S16, 2/3\" B4 crop). Skip sensorModes if",
    'there is only one. adaptedMounts must NOT include the native mount.',
    '',
    `Camera:`,
    `Manufacturer: ${manufacturer || '(unknown)'}`,
    `Model: ${model || '(unknown)'}`,
  ].join('\n');
}

interface GeminiCameraResult {
  manufacturer?: string;
  model?: string;
  /** Beleg je geliefertem Feld — siehe `Camera.specSource`. */
  verification?: { field?: string; value?: string; source?: string }[];
  sensor?: { name?: string; widthMm: number; heightMm: number };
  mount?: string;
  adaptedMounts?: string[];
  type?: string;
  sensorModes?: { name?: string; widthMm: number; heightMm: number }[];
}

async function callGemini(apiKey: string, prompt: string): Promise<GeminiCameraResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status}: ${text.slice(0, 200) || response.statusText}`);
  }
  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(stripped);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Gemini returned a non-object response');
  }
  return parsed as GeminiCameraResult;
}
