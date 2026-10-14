import { useEffect, useState } from 'react';
import { AI_SETTINGS_EVENT, loadAiSettings, type AiSettings } from '../../utils/aiProviders';

/** Settings → AI, live: re-reads when the section saves. */
export function useAiSettings(): AiSettings {
  const [s, setS] = useState<AiSettings>(loadAiSettings);
  useEffect(() => {
    const update = () => setS(loadAiSettings());
    window.addEventListener(AI_SETTINGS_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(AI_SETTINGS_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return s;
}
