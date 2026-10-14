// ── Multi-provider AI adapter (issues #39 / #40) ─────────────────────────────
//
// A small, provider-neutral layer that sends a prompt (optionally with a
// floor-plan image) to one of five AI APIs and returns the raw text answer.
// Each provider is called via plain `fetch` against its public REST endpoint so
// the browser bundle stays light and the call shape is uniform.
//
// Provider, key and model are chosen ONCE in Settings → AI and shared by every
// AI feature (floor-plan analysis, camera auto-fill). The key stays in
// localStorage on this device.
//
// NOTE: outbound requests are gated by the app's Content-Security-Policy
// (`connect-src`) — see index.html and electron/main.cjs. A blocked or
// CORS-refused request surfaces as a `network` error, not as an HTTP status.

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'mistral' | 'xai';

export interface PlanImage {
  /** e.g. "image/png" */
  mime: string;
  /** base64 payload without the data: prefix */
  base64: string;
  /** full data URL (data:image/png;base64,...) */
  dataUrl: string;
}

/** What went wrong, so the UI can say what to do about it. */
export type AiErrorKind = 'auth' | 'model' | 'rate' | 'refusal' | 'empty' | 'network' | 'other';

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

interface RequestOptions {
  image?: PlanImage;
  /** Output cap; the connection test keeps it tiny. */
  maxTokens?: number;
  /** Connection test: any 2xx counts, even without text. */
  allowEmpty?: boolean;
}

export interface AiProvider {
  id: AiProviderId;
  label: string;
  /** Sensible default model — editable in Settings. */
  defaultModel: string;
  /** Offered in the model field; any other id can be typed. */
  suggestedModels: string[];
  /** localStorage key holding this provider's API key. */
  keyStorageKey: string;
  /** Where the user gets a key. */
  keyUrl: string;
  /** True for providers that hand out a free key. */
  free?: boolean;
  request: (apiKey: string, model: string, prompt: string, opts?: RequestOptions) => Promise<string>;
}

/** Split a data URL into mime + base64. */
export function splitDataUrl(dataUrl: string): PlanImage {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Floor plan image is not a base64 data URL');
  return { mime: match[1], base64: match[2], dataUrl };
}

/** Strip markdown fences and parse a JSON object out of a model response. */
export function parseJsonResponse<T = unknown>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Models sometimes wrap JSON in ```json … ``` or add prose around it.
    const fenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try {
      return JSON.parse(fenced) as T;
    } catch {
      const start = fenced.indexOf('{');
      const end = fenced.lastIndexOf('}');
      if (start !== -1 && end > start) return JSON.parse(fenced.slice(start, end + 1)) as T;
      throw new Error('Could not parse JSON from the AI response');
    }
  }
}

/** All five APIs put a readable message in `error.message` (or `message`). */
function errorDetail(body: string): string {
  try {
    const data = JSON.parse(body);
    const msg = data?.error?.message ?? data?.message ?? (typeof data?.error === 'string' ? data.error : undefined);
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  } catch { /* not JSON */ }
  return body.trim();
}

function kindForStatus(status: number, detail: string): AiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'model';
  if (status === 429) return 'rate';
  // Gemini answers an invalid key with 400 API_KEY_INVALID, a bad model id with 400/404.
  if (status === 400 && /api[_ ]?key/i.test(detail)) return 'auth';
  if (status === 400 && /model/i.test(detail) && /(not found|does not exist|invalid|unknown|not supported)/i.test(detail)) return 'model';
  return 'other';
}

async function send(name: string, url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new AiError(`${name}: ${why}`, 'network');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const detail = errorDetail(body).slice(0, 300) || res.statusText;
    throw new AiError(`${name} ${res.status}: ${detail}`, kindForStatus(res.status, detail), res.status);
  }
  return res.json();
}

function textOrFail(name: string, text: string | undefined, opts?: RequestOptions): string {
  if (text) return text;
  if (opts?.allowEmpty) return '';
  throw new AiError(`${name} returned an empty response`, 'empty');
}

// OpenAI / Mistral / xAI all speak the same chat-completions shape. No
// `temperature`: the GPT-5 family rejects anything but the default.
async function callOpenAiCompatible(
  endpoint: string,
  name: string,
  maxTokensField: 'max_completion_tokens' | 'max_tokens',
  apiKey: string,
  model: string,
  prompt: string,
  opts?: RequestOptions,
): Promise<string> {
  const content = opts?.image
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: opts.image.dataUrl } },
      ]
    : prompt;
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content }],
  };
  if (!opts?.allowEmpty) body.response_format = { type: 'json_object' };
  if (opts?.maxTokens) body[maxTokensField] = opts.maxTokens;
  const data = (await send(name, endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })) as { choices?: { message?: { content?: string } }[] };
  return textOrFail(name, data?.choices?.[0]?.message?.content, opts);
}

// Google schaltet Modelle ab (2.0/2.5-flash-lite meldeten 2026 „no longer
// available to new users"). Deshalb ist das Modell waehlbar und wird EINMAL
// je Anbieter gespeichert.
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** Server-side refusal fallback exists for these Claude models only (not Haiku). */
const CLAUDE_FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5)/;

export const AI_PROVIDERS: Record<AiProviderId, AiProvider> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: GEMINI_DEFAULT_MODEL,
    suggestedModels: [GEMINI_DEFAULT_MODEL],
    keyStorageKey: 'multicam-ai-key-gemini',
    keyUrl: 'aistudio.google.com',
    free: true,
    async request(apiKey, model, prompt, opts) {
      const parts: unknown[] = [{ text: prompt }];
      if (opts?.image) parts.push({ inline_data: { mime_type: opts.image.mime, data: opts.image.base64 } });
      const generationConfig: Record<string, unknown> = { temperature: 0.1 };
      if (!opts?.allowEmpty) generationConfig.responseMimeType = 'application/json';
      if (opts?.maxTokens) generationConfig.maxOutputTokens = opts.maxTokens;
      const data = (await send(
        'Gemini',
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
        },
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return textOrFail('Gemini', data?.candidates?.[0]?.content?.parts?.[0]?.text, opts);
    },
  },

  openai: {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    // Checked 2026-10-14 against OpenAI's vision guide, which uses gpt-5.6.
    defaultModel: 'gpt-5.6',
    suggestedModels: ['gpt-5.6', 'gpt-5.5', 'gpt-4.1-mini'],
    keyStorageKey: 'multicam-ai-key-openai',
    keyUrl: 'platform.openai.com/api-keys',
    request(apiKey, model, prompt, opts) {
      return callOpenAiCompatible('https://api.openai.com/v1/chat/completions', 'OpenAI', 'max_completion_tokens', apiKey, model, prompt, opts);
    },
  },

  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    // Fast and capable for reading a plan; Opus is the deeper, slower choice.
    defaultModel: 'claude-sonnet-5-5',
    suggestedModels: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
    keyStorageKey: 'multicam-ai-key-anthropic',
    keyUrl: 'console.anthropic.com',
    async request(apiKey, model, prompt, opts) {
      const content: unknown[] = [];
      if (opts?.image) {
        content.push({ type: 'image', source: { type: 'base64', media_type: opts.image.mime, data: opts.image.base64 } });
      }
      content.push({ type: 'text', text: prompt });
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required to call the Messages API directly from a browser origin.
        'anthropic-dangerous-direct-browser-access': 'true',
      };
      const body: Record<string, unknown> = {
        model,
        max_tokens: opts?.maxTokens ?? 16000,
        messages: [{ role: 'user', content }],
      };
      // A safety classifier can decline a harmless request; "default" lets the
      // API retry it on the recommended fallback model.
      if (CLAUDE_FALLBACK_MODELS.test(model)) {
        headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
        body.fallbacks = 'default';
      }
      const data = (await send('Claude', 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })) as { stop_reason?: string; content?: { type: string; text?: string }[] };
      if (data?.stop_reason === 'refusal') throw new AiError('Claude declined the request (refusal)', 'refusal');
      const text = data?.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      return textOrFail('Claude', text, opts);
    },
  },

  mistral: {
    id: 'mistral',
    label: 'Mistral',
    defaultModel: 'mistral-medium-latest',
    suggestedModels: ['mistral-medium-latest', 'mistral-small-latest'],
    keyStorageKey: 'multicam-ai-key-mistral',
    keyUrl: 'console.mistral.ai',
    request(apiKey, model, prompt, opts) {
      return callOpenAiCompatible('https://api.mistral.ai/v1/chat/completions', 'Mistral', 'max_tokens', apiKey, model, prompt, opts);
    },
  },

  xai: {
    id: 'xai',
    label: 'Grok (xAI)',
    defaultModel: 'grok-4',
    suggestedModels: ['grok-4'],
    keyStorageKey: 'multicam-ai-key-xai',
    keyUrl: 'console.x.ai',
    request(apiKey, model, prompt, opts) {
      return callOpenAiCompatible('https://api.x.ai/v1/chat/completions', 'Grok', 'max_tokens', apiKey, model, prompt, opts);
    },
  },
};

export const AI_PROVIDER_ORDER: AiProviderId[] = ['gemini', 'openai', 'anthropic', 'mistral', 'xai'];

// ── Settings storage ────────────────────────────────────────────────────────

const PROVIDER_STORAGE = 'multicam-ai-provider';
/** The camera auto-fill kept its own Gemini key before Settings → AI existed. */
const LEGACY_GEMINI_KEY = 'multicam-gemini-api-key';
/** Fired on window whenever provider, key or model change. */
export const AI_SETTINGS_EVENT = 'multicam:ai-settings';

export const aiModelStorageKey = (id: AiProviderId) => `multicam-ai-model-${id}`;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* blocked storage: lasts until reload */ }
}
function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AI_SETTINGS_EVENT));
}

/** Move keys from older storage names into the shared ones. Idempotent. */
export function migrateAiStorage() {
  const legacy = read(LEGACY_GEMINI_KEY);
  if (legacy === null) return;
  if (!read(AI_PROVIDERS.gemini.keyStorageKey) && legacy.trim()) write(AI_PROVIDERS.gemini.keyStorageKey, legacy.trim());
  write(LEGACY_GEMINI_KEY, null);
}

export function loadAiProvider(): AiProviderId {
  const id = read(PROVIDER_STORAGE);
  if (id && id in AI_PROVIDERS) return id as AiProviderId;
  // No choice yet: take the first provider that already has a key.
  return AI_PROVIDER_ORDER.find((p) => !!read(AI_PROVIDERS[p].keyStorageKey)) ?? 'gemini';
}

export function saveAiProvider(id: AiProviderId) {
  write(PROVIDER_STORAGE, id);
  changed();
}

export function loadAiKey(id: AiProviderId): string {
  return read(AI_PROVIDERS[id].keyStorageKey)?.trim() ?? '';
}

export function saveAiKey(id: AiProviderId, key: string) {
  write(AI_PROVIDERS[id].keyStorageKey, key.trim() || null);
  changed();
}

export function loadAiModel(id: AiProviderId): string {
  return read(aiModelStorageKey(id))?.trim() || AI_PROVIDERS[id].defaultModel;
}

export function saveAiModel(id: AiProviderId, model: string) {
  const m = model.trim();
  write(aiModelStorageKey(id), m && m !== AI_PROVIDERS[id].defaultModel ? m : null);
  changed();
}

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

/** The active choice from Settings → AI. */
export function loadAiSettings(): AiSettings {
  migrateAiStorage();
  const id = loadAiProvider();
  return { provider: AI_PROVIDERS[id], apiKey: loadAiKey(id), model: loadAiModel(id) };
}

// ── Calls ───────────────────────────────────────────────────────────────────

export function callVision(s: AiSettings, prompt: string, image: PlanImage): Promise<string> {
  return s.provider.request(s.apiKey, s.model, prompt, { image });
}

export function callText(s: AiSettings, prompt: string): Promise<string> {
  return s.provider.request(s.apiKey, s.model, prompt);
}

/** Minimal request: proves key, model and network path in one round trip. */
export async function testAiConnection(id: AiProviderId, apiKey: string, model: string): Promise<void> {
  await AI_PROVIDERS[id].request(apiKey.trim(), model.trim() || AI_PROVIDERS[id].defaultModel, 'Reply with: ok', {
    maxTokens: 64,
    allowEmpty: true,
  });
}
