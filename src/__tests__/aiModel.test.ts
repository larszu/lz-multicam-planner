import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GEMINI_DEFAULT_MODEL, loadAiModel, saveAiModel } from '../utils/aiProviders';

describe('AI model choice (#157)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });

  it('defaults Gemini to a model that is still offered', () => {
    expect(loadAiModel('gemini')).toBe(GEMINI_DEFAULT_MODEL);
    expect(GEMINI_DEFAULT_MODEL).not.toMatch(/2\.[05]-flash/);
  });

  it('remembers a chosen model and falls back when cleared', () => {
    saveAiModel('gemini', ' gemini-x ');
    expect(loadAiModel('gemini')).toBe('gemini-x');
    saveAiModel('gemini', '');
    expect(loadAiModel('gemini')).toBe(GEMINI_DEFAULT_MODEL);
  });
});
