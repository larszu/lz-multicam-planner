import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PROVIDERS,
  AiError,
  callText,
  callVision,
  loadAiSettings,
  migrateAiStorage,
  saveAiKey,
  saveAiModel,
  saveAiProvider,
  testAiConnection,
  type AiProviderId,
  type PlanImage,
} from '../utils/aiProviders';

const image: PlanImage = { mime: 'image/png', base64: 'QUJD', dataUrl: 'data:image/png;base64,QUJD' };
let store: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};
const settings = (id: AiProviderId, model = AI_PROVIDERS[id].defaultModel) => ({ provider: AI_PROVIDERS[id], apiKey: 'k-123', model });

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('Claude', () => {
  it('calls the Messages API directly from the browser with an image block', async () => {
    fetchMock.mockImplementation(async () => ok({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"walls":[]}' }] }));
    const text = await callVision(settings('anthropic'), 'read the plan', image);
    expect(text).toBe('{"walls":[]}');
    const { url, headers, body } = lastCall();
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('k-123');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } });
    expect(body.messages[0].content[1]).toEqual({ type: 'text', text: 'read the plan' });
    // Settings the current models reject must not be sent.
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
  });

  it('opts into the server-side refusal fallback, but not for Haiku', async () => {
    fetchMock.mockImplementation(async () => ok({ content: [{ type: 'text', text: '{}' }] }));
    await callText(settings('anthropic'), 'x');
    expect(lastCall().body.fallbacks).toBe('default');
    expect(lastCall().headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    await callText(settings('anthropic', 'claude-haiku-5-5'), 'x');
    expect(lastCall().body).not.toHaveProperty('fallbacks');
    expect(lastCall().headers).not.toHaveProperty('anthropic-beta');
  });

  it('sends a text-only request without an image block', async () => {
    fetchMock.mockImplementation(async () => ok({ content: [{ type: 'text', text: '{"a":1}' }] }));
    await callText(settings('anthropic'), 'camera?');
    expect(lastCall().body.messages[0].content).toEqual([{ type: 'text', text: 'camera?' }]);
  });

  it('reports a refusal instead of reading empty content', async () => {
    fetchMock.mockImplementation(async () => ok({ stop_reason: 'refusal', content: [] }));
    await expect(callText(settings('anthropic'), 'x')).rejects.toMatchObject({ kind: 'refusal' });
  });

  it('suggests only current model ids', () => {
    expect(AI_PROVIDERS.anthropic.suggestedModels).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
  });
});

describe('ChatGPT', () => {
  it('sends the image as a data URL to chat completions', async () => {
    fetchMock.mockImplementation(async () => ok({ choices: [{ message: { content: '{"walls":[]}' } }] }));
    await callVision(settings('openai'), 'read', image);
    const { url, headers, body } = lastCall();
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer k-123');
    expect(body.model).toBe('gpt-5.6');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: image.dataUrl } });
    expect(body).not.toHaveProperty('temperature');
  });

  it('sends plain text for auto-fill', async () => {
    fetchMock.mockImplementation(async () => ok({ choices: [{ message: { content: '{}' } }] }));
    await callText(settings('openai'), 'camera?');
    expect(lastCall().body.messages[0].content).toBe('camera?');
  });
});

describe('Gemini, Mistral, Grok', () => {
  it('Gemini sends key header and inline image', async () => {
    fetchMock.mockImplementation(async () => ok({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }));
    await callVision(settings('gemini'), 'read', image);
    const { url, headers, body } = lastCall();
    expect(url).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(headers['x-goog-api-key']).toBe('k-123');
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: 'image/png', data: 'QUJD' } });
  });

  it.each([
    ['mistral', 'https://api.mistral.ai/v1/chat/completions'],
    ['xai', 'https://api.x.ai/v1/chat/completions'],
  ] as const)('%s uses its chat-completions endpoint', async (id, endpoint) => {
    fetchMock.mockImplementation(async () => ok({ choices: [{ message: { content: '{}' } }] }));
    await callText(settings(id), 'x');
    expect(lastCall().url).toBe(endpoint);
  });
});

describe('errors', () => {
  it.each([
    ['anthropic', 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'auth', 'invalid x-api-key'],
    ['openai', 401, { error: { message: 'Incorrect API key provided' } }, 'auth', 'Incorrect API key provided'],
    ['openai', 404, { error: { message: 'The model `gpt-9` does not exist' } }, 'model', 'gpt-9'],
    ['anthropic', 404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-x' } }, 'model', 'claude-x'],
    ['openai', 429, { error: { message: 'Rate limit reached' } }, 'rate', 'Rate limit reached'],
    ['anthropic', 429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'rate', 'slow down'],
    ['gemini', 400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, 'auth', 'API key not valid'],
    ['anthropic', 500, { error: { message: 'boom' } }, 'other', 'boom'],
  ] as const)('%s %i maps to %s with the provider message', async (id, status, body, kind, text) => {
    fetchMock.mockResolvedValue(fail(status, body));
    const err = await callText(settings(id), 'x').catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
    expect(err.message).toContain(String(status));
    expect(err.message).toContain(text);
  });

  it('maps a blocked request to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(callText(settings('anthropic'), 'x')).rejects.toMatchObject({ kind: 'network' });
  });

  it('maps an empty answer to empty', async () => {
    fetchMock.mockImplementation(async () => ok({ choices: [{ message: { content: '' } }] }));
    await expect(callText(settings('openai'), 'x')).rejects.toMatchObject({ kind: 'empty' });
  });
});

describe('connection test', () => {
  it('sends a tiny request and accepts an answer without text', async () => {
    fetchMock.mockImplementation(async () => ok({ stop_reason: 'max_tokens', content: [] }));
    await expect(testAiConnection('anthropic', ' k-1 ', '')).resolves.toBeUndefined();
    const { headers, body } = lastCall();
    expect(headers['x-api-key']).toBe('k-1');
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.max_tokens).toBe(64);
  });

  it('uses the right output cap field per provider', async () => {
    fetchMock.mockImplementation(async () => ok({ choices: [{ message: { content: '' } }] }));
    await testAiConnection('openai', 'k', '');
    expect(lastCall().body.max_completion_tokens).toBe(64);
    expect(lastCall().body).not.toHaveProperty('response_format');
    await testAiConnection('mistral', 'k', '');
    expect(lastCall().body.max_tokens).toBe(64);
  });

  it('passes the provider error through', async () => {
    fetchMock.mockResolvedValue(fail(401, { error: { message: 'bad key' } }));
    await expect(testAiConnection('openai', 'k', '')).rejects.toMatchObject({ kind: 'auth', message: 'OpenAI 401: bad key' });
  });
});

describe('settings storage', () => {
  it('moves the old auto-fill Gemini key into the shared slot', () => {
    store.set('multicam-gemini-api-key', ' AIza-old ');
    migrateAiStorage();
    expect(store.get('multicam-ai-key-gemini')).toBe('AIza-old');
    expect(store.has('multicam-gemini-api-key')).toBe(false);
  });

  it('keeps a newer shared key over the legacy one', () => {
    store.set('multicam-gemini-api-key', 'old');
    store.set('multicam-ai-key-gemini', 'new');
    migrateAiStorage();
    expect(store.get('multicam-ai-key-gemini')).toBe('new');
    expect(store.has('multicam-gemini-api-key')).toBe(false);
  });

  it('reads keys saved by the old floor-plan panel', () => {
    store.set('multicam-ai-provider', 'anthropic');
    store.set('multicam-ai-key-anthropic', 'sk-ant');
    store.set('multicam-ai-model-anthropic', 'claude-opus-5-5');
    const s = loadAiSettings();
    expect(s.provider.id).toBe('anthropic');
    expect(s.apiKey).toBe('sk-ant');
    expect(s.model).toBe('claude-opus-5-5');
  });

  it('without a stored choice, picks the provider that has a key', () => {
    store.set('multicam-gemini-api-key', 'AIza');
    expect(loadAiSettings().provider.id).toBe('gemini');
    store.clear();
    store.set('multicam-ai-key-openai', 'sk');
    expect(loadAiSettings().provider.id).toBe('openai');
  });

  it('saves, clears and falls back to defaults', () => {
    saveAiProvider('openai');
    saveAiKey('openai', ' sk-1 ');
    saveAiModel('openai', 'gpt-5.5');
    expect(loadAiSettings()).toMatchObject({ apiKey: 'sk-1', model: 'gpt-5.5' });
    saveAiKey('openai', '');
    saveAiModel('openai', '');
    expect(store.has('multicam-ai-key-openai')).toBe(false);
    expect(loadAiSettings()).toMatchObject({ apiKey: '', model: 'gpt-5.6' });
  });
});
