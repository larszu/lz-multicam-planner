// Einstellungen → AI: die EINE Stelle fuer Anbieter, Schluessel und Modell.
// Grundriss-Analyse und Kamera-Autofill lesen nur von hier
// (`loadAiSettings`) — vorher hielt jede Funktion ihren eigenen Schluessel,
// und das Autofill kannte nur Gemini.
import { useState } from 'react';
import { FiCheck, FiEye, FiEyeOff, FiLoader, FiTrash2 } from 'react-icons/fi';
import { format, useTranslation } from '../../i18n';
import {
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  AiError,
  loadAiKey,
  loadAiModel,
  loadAiProvider,
  migrateAiStorage,
  saveAiKey,
  saveAiModel,
  saveAiProvider,
  testAiConnection,
  type AiProviderId,
} from '../../utils/aiProviders';
import { aiErrorHint } from './aiErrorHint';

const feld = 'block w-full border border-bc-border bg-bc-panel-raised text-xs text-bc-text-bright';
const knopf = 'bc-btn-soft text-xs disabled:opacity-50';
const kopf = 'text-sm font-semibold text-bc-text-bright';

type Test = { state: 'idle' } | { state: 'busy' } | { state: 'ok' } | { state: 'error'; message: string; hint: string };

export default function AiSection() {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState<AiProviderId>(() => {
    migrateAiStorage();
    return loadAiProvider();
  });
  const provider = AI_PROVIDERS[providerId];
  const [apiKey, setApiKey] = useState(() => loadAiKey(providerId));
  const [model, setModel] = useState(() => loadAiModel(providerId));
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<Test>({ state: 'idle' });

  const choose = (id: AiProviderId) => {
    saveAiProvider(id);
    setProviderId(id);
    setApiKey(loadAiKey(id));
    setModel(loadAiModel(id));
    setShowKey(false);
    setTest({ state: 'idle' });
  };

  const runTest = async () => {
    setTest({ state: 'busy' });
    try {
      await testAiConnection(providerId, apiKey, model);
      setTest({ state: 'ok' });
    } catch (e) {
      setTest({
        state: 'error',
        message: e instanceof Error ? e.message : String(e),
        hint: aiErrorHint(e instanceof AiError ? e.kind : 'other', t),
      });
    }
  };

  const listId = `ai-models-${providerId}`;

  return (
    <div>
      <p className="text-xs text-bc-muted">
        {t(
          'settings.ai.intro',
          'Floor-plan analysis and camera auto-fill use the provider chosen here. The key is stored only on this device and sent only to the provider.',
        )}
      </p>

      <section style={{ marginTop: '16px' }}>
        <h3 className={kopf}>{t('settings.ai.provider', 'Provider')}</h3>
        <select
          className={`${feld} mt-2`}
          style={{ padding: '6px 8px' }}
          value={providerId}
          onChange={(e) => choose(e.target.value as AiProviderId)}
          aria-label={t('settings.ai.provider', 'Provider')}
        >
          {AI_PROVIDER_ORDER.map((id) => (
            <option key={id} value={id}>
              {AI_PROVIDERS[id].label}
              {AI_PROVIDERS[id].free ? t('settings.ai.freeKey', ' — free key') : ''}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('settings.ai.key', 'API key')}</h3>
        <div className="mt-2 flex gap-1">
          <input
            type={showKey ? 'text' : 'password'}
            className={feld}
            style={{ padding: '6px 8px' }}
            value={apiKey}
            placeholder={format(t('settings.ai.keyPlaceholder', 'Paste your {label} API key'), { label: provider.label })}
            onChange={(e) => {
              setApiKey(e.target.value);
              saveAiKey(providerId, e.target.value);
              setTest({ state: 'idle' });
            }}
            autoComplete="off"
            spellCheck={false}
            aria-label={t('settings.ai.key', 'API key')}
          />
          <button
            type="button"
            className={knopf}
            style={{ padding: '6px 10px' }}
            onClick={() => setShowKey((v) => !v)}
            disabled={!apiKey}
            aria-label={showKey ? t('settings.ai.hideKey', 'Hide key') : t('settings.ai.showKey', 'Show key')}
            title={showKey ? t('settings.ai.hideKey', 'Hide key') : t('settings.ai.showKey', 'Show key')}
          >
            {showKey ? <FiEyeOff size={13} /> : <FiEye size={13} />}
          </button>
          <button
            type="button"
            className={knopf}
            style={{ padding: '6px 10px' }}
            onClick={() => {
              setApiKey('');
              saveAiKey(providerId, '');
              setShowKey(false);
              setTest({ state: 'idle' });
            }}
            disabled={!apiKey}
            aria-label={t('settings.ai.removeKey', 'Remove key')}
            title={t('settings.ai.removeKey', 'Remove key')}
          >
            <FiTrash2 size={13} />
          </button>
        </div>
        <p className="mt-1 text-xs text-bc-muted">
          {format(t('settings.ai.keyHint', 'Get a key at {url}. Stored only on this device.'), { url: provider.keyUrl })}
        </p>
      </section>

      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('settings.ai.model', 'Model')}</h3>
        <input
          type="text"
          list={listId}
          className={`${feld} mt-2`}
          style={{ padding: '6px 8px' }}
          value={model}
          placeholder={provider.defaultModel}
          onChange={(e) => {
            setModel(e.target.value);
            saveAiModel(providerId, e.target.value);
            setTest({ state: 'idle' });
          }}
          spellCheck={false}
          aria-label={t('settings.ai.model', 'Model')}
        />
        <datalist id={listId}>
          {provider.suggestedModels.map((m) => <option key={m} value={m} />)}
        </datalist>
        <p className="mt-1 text-xs text-bc-muted">
          {format(t('settings.ai.modelHint', 'Empty means the default, {model}.'), { model: provider.defaultModel })}
        </p>
      </section>

      <section style={{ marginTop: '24px' }}>
        <button
          type="button"
          className="bc-btn-primary text-xs"
          style={{ minHeight: '32px' }}
          onClick={() => void runTest()}
          disabled={!apiKey.trim() || test.state === 'busy'}
        >
          {test.state === 'busy' && <FiLoader size={13} className="animate-spin" />}
          {t('settings.ai.test', 'Test connection')}
        </button>
        <div aria-live="polite">
          {test.state === 'ok' && (
            <p className="mt-2 flex items-center gap-1 text-xs text-bc-green-text">
              <FiCheck size={13} />
              {format(t('settings.ai.testOk', '{label} answered — key and model work.'), { label: provider.label })}
            </p>
          )}
          {test.state === 'error' && (
            <div className="mt-2 text-xs">
              <p className="break-words text-bc-red-text">{test.message}</p>
              {test.hint && <p className="mt-1 text-bc-muted">{test.hint}</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
