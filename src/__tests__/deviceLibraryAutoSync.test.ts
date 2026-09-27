import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Eigene Geraete gehen nach einer Aenderung entprellt hoch — nur angemeldet
// und nur mit „automatisch hochladen".

const speicher: Record<string, string> = {};

describe('startAutoSync', () => {
  beforeEach(() => {
    for (const k of Object.keys(speicher)) delete speicher[k];
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => speicher[k] ?? null,
      setItem: (k: string, v: string) => { speicher[k] = v; },
      removeItem: (k: string) => { delete speicher[k]; },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('debounces changes of own cameras/lenses into one syncAll', async () => {
    const { useStore } = await import('../store/useStore');
    const { useDeviceLibrary } = await import('../library/store');
    const { startAutoSync, ownItems } = await import('../library/autoSync');
    const syncAll = vi.fn(async () => {});
    useDeviceLibrary.setState({ signedIn: true, autoUpload: true, syncAll });
    const stop = startAutoSync(1000);

    const lensId = useStore.getState().addCustomLens({ manufacturer: 'A', model: 'B', focalLengthMin: 10, focalLengthMax: 20, maxApertureWide: 2, mount: 'E', type: 'zoom' });
    vi.advanceTimersByTime(500);
    useStore.getState().updateCustomLens(lensId, { manufacturerUrl: 'https://a.example/b.pdf' });
    vi.advanceTimersByTime(999);
    expect(syncAll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(ownItems()).toEqual([{ kind: 'lens', lens: expect.objectContaining({ id: lensId, manufacturerUrl: 'https://a.example/b.pdf' }) }]);

    useDeviceLibrary.setState({ autoUpload: false });
    useStore.getState().removeCustomLens(lensId);
    vi.advanceTimersByTime(2000);
    expect(syncAll).toHaveBeenCalledTimes(1);

    // Aenderungen an anderem als der Bibliothek loesen nichts aus.
    useDeviceLibrary.setState({ autoUpload: true });
    useStore.getState().addCamera();
    vi.advanceTimersByTime(2000);
    expect(syncAll).toHaveBeenCalledTimes(1);
    stop();
  });
});
