import type { AiErrorKind } from '../../utils/aiProviders';

type T = (key: string, en: string) => string;

/** What to do about a failed AI request — shown under the provider's own message. */
export function aiErrorHint(kind: AiErrorKind, t: T): string {
  switch (kind) {
    case 'auth':
      return t('settings.ai.err.auth', 'The key was rejected. Check that it is complete and belongs to this provider.');
    case 'model':
      return t('settings.ai.err.model', 'The model is unknown or not available to this key. Pick another one in Settings → AI.');
    case 'rate':
      return t('settings.ai.err.rate', 'Rate limit or quota reached. Wait a moment, or check the plan and billing at the provider.');
    case 'refusal':
      return t('settings.ai.err.refusal', 'The model declined the request. Try again or pick another model.');
    case 'network':
      return t('settings.ai.err.network', 'No connection to the provider — offline, or blocked by the browser. The desktop app is the most reliable place for AI requests.');
    case 'empty':
      return t('settings.ai.err.empty', 'The provider answered without text. Try again or pick another model.');
    default:
      return '';
  }
}
