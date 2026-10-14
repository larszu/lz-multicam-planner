// ── Multi-provider AI vision adapter (issues #39 / #40) ───────────────────────
//
// A small, provider-neutral layer that sends a floor-plan image + a prompt to
// one of the five most common AI APIs and returns the raw text response. Each
// provider is called via plain `fetch` against its public REST endpoint so the
// browser bundle stays light and the call shape is uniform. The user picks the
// provider and pastes their own API key (stored in localStorage); Gemini is
// included because Google AI Studio hands out a free key.
//
// NOTE: outbound requests are gated by the app's Content-Security-Policy
// (`connect-src`) — see index.html and electron/main.cjs. Browser CORS applies
// in web builds; the Electron desktop build is the most reliable place to run
// these calls.

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'mistral' | 'xai';

export interface PlanImage {
  /** e.g. "image/png" */
  mime: string;
  /** base64 payload without the data: prefix */
  base64: string;
  /** full data URL (data:image/png;base64,...) */
  dataUrl: string;
}

export interface AiProvider {
  id: AiProviderId;
  label: string;
  /** Sensible default vision model — editable in the UI. */
  defaultModel: string;
  /** localStorage key holding this provider's API key. */
  keyStorageKey: string;
  /** Where the user gets a key (shown in the UI). */
  keyHint: string;
  /** True for providers that hand out a free key. */
  free?: boolean;
  /** Send image + prompt, resolve with the model's raw text answer. */
  callVision: (apiKey: string, model: string, prompt: string, image: PlanImage) => Promise<string>;
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

async function failOnError(res: Response, name: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw new Error(`${name} ${res.status}: ${body.slice(0, 240) || res.statusText}`);
}

// OpenAI / Mistral / xAI all speak the same chat-completions shape.
async function callOpenAiCompatible(
  endpoint: string,
  name: string,
  apiKey: string,
  model: string,
  prompt: string,
  image: PlanImage,
): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image.dataUrl } },
          ],
        },
      ],
    }),
  });
  await failOnError(res, name);
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${name} returned an empty response`);
  return text;
}

// Google schaltet Modelle ab (2.0/2.5-flash-lite meldeten 2026 „no longer
// available to new users"). Deshalb ist das Modell an jeder Stelle waehlbar
// und wird EINMAL je Anbieter gespeichert — Grundriss-Analyse und KI-Autofill
// teilen sich Schluessel und Modell.
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export const aiModelStorageKey = (id: AiProviderId) => `multicam-ai-model-${id}`;

export function loadAiModel(id: AiProviderId): string {
  try {
    return localStorage.getItem(aiModelStorageKey(id)) || AI_PROVIDERS[id].defaultModel;
  } catch {
    return AI_PROVIDERS[id].defaultModel;
  }
}

export function saveAiModel(id: AiProviderId, model: string) {
  try {
    if (model.trim()) localStorage.setItem(aiModelStorageKey(id), model.trim());
    else localStorage.removeItem(aiModelStorageKey(id));
  } catch { /* gesperrter Speicher: gilt bis zum Neuladen */ }
}

export const AI_PROVIDERS: Record<AiProviderId, AiProvider> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: GEMINI_DEFAULT_MODEL,
    keyStorageKey: 'multicam-ai-key-gemini',
    keyHint: 'Free key from aistudio.google.com',
    free: true,
    async callVision(apiKey, model, prompt, image) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inline_data: { mime_type: image.mime, data: image.base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      });
      await failOnError(res, 'Gemini');
      const data = await res.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned an empty response');
      return text;
    },
  },

  openai: {
    id: 'openai',
    label: 'OpenAI (GPT)',
    defaultModel: 'gpt-4o',
    keyStorageKey: 'multicam-ai-key-openai',
    keyHint: 'Key from platform.openai.com',
    callVision(apiKey, model, prompt, image) {
      return callOpenAiCompatible('https://api.openai.com/v1/chat/completions', 'OpenAI', apiKey, model, prompt, image);
    },
  },

  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-opus-4-8',
    keyStorageKey: 'multicam-ai-key-anthropic',
    keyHint: 'Key from console.anthropic.com',
    async callVision(apiKey, model, prompt, image) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Required to call the Messages API directly from a browser origin.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      });
      await failOnError(res, 'Claude');
      const data = await res.json();
      const text: string | undefined = data?.content?.find((b: { type: string }) => b.type === 'text')?.text;
      if (!text) throw new Error('Claude returned an empty response');
      return text;
    },
  },

  mistral: {
    id: 'mistral',
    label: 'Mistral (Pixtral)',
    defaultModel: 'pixtral-12b-2409',
    keyStorageKey: 'multicam-ai-key-mistral',
    keyHint: 'Key from console.mistral.ai',
    callVision(apiKey, model, prompt, image) {
      return callOpenAiCompatible('https://api.mistral.ai/v1/chat/completions', 'Mistral', apiKey, model, prompt, image);
    },
  },

  xai: {
    id: 'xai',
    label: 'xAI (Grok)',
    defaultModel: 'grok-2-vision-1212',
    keyStorageKey: 'multicam-ai-key-xai',
    keyHint: 'Key from console.x.ai',
    callVision(apiKey, model, prompt, image) {
      return callOpenAiCompatible('https://api.x.ai/v1/chat/completions', 'Grok', apiKey, model, prompt, image);
    },
  },
};

export const AI_PROVIDER_ORDER: AiProviderId[] = ['gemini', 'openai', 'anthropic', 'mistral', 'xai'];
