import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { Camera, Lens } from '../types';
import { CAMERAS } from '../data/cameras';
import { LENSES } from '../data/lenses';
import { cameraToFacet, lensToFacet, facetToItem, libraryIdFor, proposalCore } from '../library/facet';
import { emptyCache, mergeSync, readCache, writeCache } from '../library/sync';
import type { SyncDevice, SyncResponse } from '../utils/deviceLibraryClient';

// ---------------------------------------------------------------------------
// Geraetebibliothek (devices.zumpelars.de): das multicam-Facet hin und
// zurueck, der inkrementelle Abgleich und die Vorgabe-Adresse.
// ---------------------------------------------------------------------------

const fx9 = CAMERAS.find((c) => c.id === 'sony-fx9')!;
const ua107 = LENSES.find((l) => l.id === 'fuj-ua107x8.4')!;

const eigeneKamera: Camera = {
  ...fx9,
  id: 'custom-cam-1726000000000',
  model: 'PXW-FX9 (eigene)',
  specSource: { 'sensor.widthMm': { value: '35.7', source: 'Datenblatt S. 4' } },
};
const eigeneOptik: Lens = { ...ua107, id: 'custom-lens-1', isCustom: true };

const geraet = (slug: string, seq: number, facet: Record<string, unknown> | null, extra: Partial<SyncDevice> = {}): SyncDevice => ({
  slug,
  version: 1,
  seq,
  removed: false,
  status: 'confirmed',
  confirmations: 2,
  core: { manufacturer: 'Sony', model: 'X', category: 'Camera', sourceUrl: 'https://example.com/datasheet.pdf' },
  facet,
  ...extra,
});

const antwort = (latestSeq: number, devices: SyncDevice[]): SyncResponse => ({
  format: 'avplan-device-sync',
  version: 1,
  planner: 'multicam',
  latestSeq,
  devices,
});

describe('facet mapping', () => {
  it('camera → facet → camera keeps the native entry, only the id changes', () => {
    const facet = cameraToFacet(eigeneKamera);
    expect(facet.kind).toBe('camera');
    expect('id' in (facet as { camera: object }).camera).toBe(false);
    const back = facetToItem({ slug: 'sony-pxw-fx9', facet: JSON.parse(JSON.stringify(facet)), core: geraet('s', 1, null).core });
    expect(back).toEqual({ kind: 'camera', camera: { ...eigeneKamera, id: libraryIdFor('sony-pxw-fx9') } });
  });

  it('keeps deviceTypeId, notes, sensor modes and datasheet sources (nested, so the server does not strip notes)', () => {
    const facet = cameraToFacet(eigeneKamera) as unknown as { camera: Camera };
    expect(facet.camera.deviceTypeId).toBe(fx9.deviceTypeId);
    expect(facet.camera.notes).toBe(fx9.notes);
    expect(facet.camera.sensorModes).toEqual(fx9.sensorModes);
    expect(facet.camera.specSource).toEqual(eigeneKamera.specSource);
  });

  it('lens → facet → lens drops id and isCustom and comes back read-only', () => {
    const facet = lensToFacet(eigeneOptik) as { lens: Record<string, unknown> };
    expect(facet.lens.id).toBeUndefined();
    expect(facet.lens.isCustom).toBeUndefined();
    const back = facetToItem({ slug: 'fujinon-ua107', facet: { kind: 'lens', version: 1, lens: facet.lens }, core: geraet('s', 1, null).core });
    expect(back).toEqual({ kind: 'lens', lens: { ...ua107, id: 'devlib-fujinon-ua107', isCustom: false } });
  });

  it('takes the datasheet link from the core when the facet has none', () => {
    const { manufacturerUrl: _u, ...ohne } = eigeneKamera;
    const back = facetToItem({ slug: 'a', facet: cameraToFacet(ohne as Camera), core: geraet('a', 1, null).core });
    expect(back?.kind === 'camera' && back.camera.manufacturerUrl).toBe('https://example.com/datasheet.pdf');
  });

  it('proposal core: category from kind, required datasheet link', () => {
    expect(proposalCore({ kind: 'lens', lens: eigeneOptik }, ' https://x.example/ds.pdf ')).toEqual({
      manufacturer: 'Fujinon',
      model: 'UA107x8.4BESM',
      category: 'Lens',
      sourceUrl: 'https://x.example/ds.pdf',
      description: 'Box lens 107x, 4K Premier',
    });
  });

  it('rejects what the planner would not take from a project file either', () => {
    const core = geraet('x', 1, null).core;
    expect(facetToItem({ slug: 'x', facet: null, core })).toBeNull();
    expect(facetToItem({ slug: 'x', facet: { kind: 'camera', camera: { manufacturer: 'A', model: 'B', mount: 'E' } }, core })).toBeNull();
    expect(facetToItem({ slug: 'x', facet: { kind: 'lens', lens: { ...ua107, focalLengthMin: 0 } }, core })).toBeNull();
    expect(facetToItem({ slug: 'x', facet: { kind: 'tripod', tripod: {} }, core })).toBeNull();
    // Ein flaches Objekt ohne `kind` ist nicht das multicam-Format.
    expect(facetToItem({ slug: 'x', facet: { ...fx9 }, core })).toBeNull();
  });
});

describe('sync merge', () => {
  const kamera = cameraToFacet(eigeneKamera);
  const optik = lensToFacet(eigeneOptik);

  it('adds, updates and advances latestSeq', () => {
    const a = mergeSync(emptyCache('https://s'), antwort(2, [geraet('cam', 1, kamera), geraet('lens', 2, optik)]));
    expect(a.stats).toEqual({ added: 2, updated: 0, removed: 0, invalid: 0 });
    expect(a.cache.latestSeq).toBe(2);
    const b = mergeSync(a.cache, antwort(5, [geraet('cam', 5, kamera, { version: 2, status: 'verified', confirmations: 7 })]));
    expect(b.stats).toEqual({ added: 0, updated: 1, removed: 0, invalid: 0 });
    expect(b.cache.entries).toHaveLength(2);
    expect(b.cache.entries.find((e) => e.slug === 'cam')).toMatchObject({ version: 2, status: 'verified', confirmations: 7 });
    expect(b.cache.latestSeq).toBe(5);
  });

  it('removed takes the entry out', () => {
    const a = mergeSync(emptyCache('https://s'), antwort(1, [geraet('cam', 1, kamera)]));
    const b = mergeSync(a.cache, antwort(3, [geraet('cam', 3, null, { removed: true })]));
    expect(b.stats.removed).toBe(1);
    expect(b.cache.entries).toEqual([]);
    expect(b.cache.latestSeq).toBe(3);
  });

  it('skips and counts invalid facets; an invalid new version drops the old one', () => {
    const a = mergeSync(emptyCache('https://s'), antwort(1, [geraet('cam', 1, kamera)]));
    const b = mergeSync(a.cache, antwort(4, [geraet('cam', 3, { kind: 'camera', camera: {} }), geraet('neu', 4, { foo: 1 })]));
    expect(b.stats).toEqual({ added: 0, updated: 0, removed: 0, invalid: 2 });
    expect(b.cache.entries).toEqual([]);
    expect(b.cache.latestSeq).toBe(4);
  });

  it('a cache of another server is not reused', () => {
    const a = mergeSync(emptyCache('https://a'), antwort(1, [geraet('cam', 1, kamera)]));
    expect(readCache(a.cache, 'https://a').entries).toHaveLength(1);
    expect(readCache(a.cache, 'https://b')).toEqual(emptyCache('https://b'));
    expect(readCache('kaputt', 'https://b')).toEqual(emptyCache('https://b'));
  });

  it('every server has its own slot; writing one keeps the others', () => {
    const a = mergeSync(emptyCache('https://a'), antwort(1, [geraet('cam', 1, kamera)])).cache;
    const b = mergeSync(emptyCache('https://b'), antwort(4, [geraet('lens', 4, optik)])).cache;
    const ablage = writeCache(writeCache(null, a), b);
    expect(readCache(ablage, 'https://a')).toEqual(a);
    expect(readCache(ablage, 'https://b')).toEqual(b);
    // Ein alter Einzelstand wird als Platz seines Servers gelesen.
    expect(readCache(a, 'https://a')).toEqual(a);
    expect(readCache(writeCache(a, b), 'https://a')).toEqual(a);
  });
});

describe('store against a mocked server', () => {
  const speicher: Record<string, string> = {};
  const fetchMock = vi.fn();

  beforeAll(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in speicher ? speicher[k] : null),
      setItem: (k: string, v: string) => {
        speicher[k] = String(v);
      },
      removeItem: (k: string) => {
        delete speicher[k];
      },
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(() => vi.unstubAllGlobals());

  beforeEach(() => {
    for (const k of Object.keys(speicher)) delete speicher[k];
    fetchMock.mockReset();
    vi.resetModules();
  });

  const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  it('without a setting every build talks to https://devices.zumpelars.de', async () => {
    const { loadServer, useDeviceLibrary } = await import('../library/store');
    const { DEFAULT_DEVICE_LIBRARY_URL } = await import('../utils/deviceLibraryClient');
    expect(DEFAULT_DEVICE_LIBRARY_URL).toBe('https://devices.zumpelars.de');
    expect(loadServer()).toBe('https://devices.zumpelars.de');
    expect(useDeviceLibrary.getState().server).toBe('https://devices.zumpelars.de');
  });

  it('signs in, syncs incrementally and puts library cameras into the catalog', async () => {
    const user = { id: 'u1', email: 'a@b.de', username: 'lars', emailVerified: true };
    fetchMock
      .mockResolvedValueOnce(json({ user }, { 'set-auth-token': 'TOKEN-123' }))
      .mockResolvedValueOnce(json(antwort(7, [geraet('sony-fx9-lib', 7, cameraToFacet(eigeneKamera)), geraet('kaputt', 6, { kind: 'lens' })])))
      .mockResolvedValueOnce(json(antwort(9, [geraet('sony-fx9-lib', 9, null, { removed: true })])));

    const { useDeviceLibrary } = await import('../library/store');
    const { getCameraById } = await import('../data/cameras');
    await useDeviceLibrary.getState().signIn('a@b.de', 'geheim');

    expect(fetchMock.mock.calls[0][0]).toBe('https://devices.zumpelars.de/api/auth/sign-in/email');
    expect(fetchMock.mock.calls[1][0]).toBe('https://devices.zumpelars.de/api/sync?planner=multicam&after=0');
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer TOKEN-123' });

    const s = useDeviceLibrary.getState();
    expect(s.signedIn).toBe(true);
    expect(s.lastSync?.stats).toEqual({ added: 1, updated: 0, removed: 0, invalid: 1 });
    expect(getCameraById('devlib-sony-fx9-lib')?.model).toBe('PXW-FX9 (eigene)');
    // Das Token steht nie im Zustand und nie im Cache.
    expect(JSON.stringify(s)).not.toContain('TOKEN-123');
    expect(speicher['multicam-device-library-cache']).not.toContain('TOKEN-123');

    await useDeviceLibrary.getState().syncNow();
    expect(fetchMock.mock.calls[2][0]).toBe('https://devices.zumpelars.de/api/sync?planner=multicam&after=7');
    expect(getCameraById('devlib-sony-fx9-lib')).toBeUndefined();
    expect(JSON.parse(speicher['multicam-device-library-cache']).byServer['https://devices.zumpelars.de'].latestSeq).toBe(9);
  });

  it('second factor: challenge header goes back with the code', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ twoFactorRedirect: true }, { 'x-auth-challenge': 'CH' }))
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json(antwort(0, [])));
    const { useDeviceLibrary } = await import('../library/store');
    await useDeviceLibrary.getState().signIn('lars', 'pw');
    expect(fetchMock.mock.calls[0][0]).toBe('https://devices.zumpelars.de/api/auth/sign-in/username');
    expect(useDeviceLibrary.getState().phase).toBe('second-factor');
    await useDeviceLibrary.getState().verifyCode('123 456');
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ 'x-auth-challenge': 'CH' });
    expect(useDeviceLibrary.getState().signedIn).toBe(true);
  });

  const anmelden = () =>
    fetchMock
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json(antwort(0, [])));

  it('sync now uploads own entries first (native facet), then pulls; the result is kept per entry', async () => {
    const { useDeviceLibrary, registerOwnItems } = await import('../library/store');
    registerOwnItems(() => [{ kind: 'camera', camera: eigeneKamera }, { kind: 'lens', lens: { ...eigeneOptik, manufacturerUrl: undefined } }]);
    // Anmelden laedt schon automatisch hoch (Vorgabe an) …
    fetchMock
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json({ planner: 'multicam', results: [
        { localId: eigeneKamera.id, state: 'edit-proposed', slug: 'sony-pxw-fx9', moderation: 'pending' },
        { localId: 'custom-lens-1', state: 'blocked', findings: [{ kind: 'no-source', blocking: true }] },
      ] }))
      .mockResolvedValueOnce(json(antwort(0, [])));
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://devices.zumpelars.de/api/upload');
    const body = JSON.parse(String(init.body));
    expect(body.planner).toBe('multicam');
    expect(body.items[0]).toEqual(JSON.parse(JSON.stringify({
      localId: eigeneKamera.id,
      core: { manufacturer: 'Sony', model: 'PXW-FX9 (eigene)', category: 'Camera', sourceUrl: fx9.manufacturerUrl, description: fx9.notes },
      facet: cameraToFacet(eigeneKamera),
    })));
    expect(body.items[1].core.sourceUrl).toBeUndefined();
    expect(fetchMock.mock.calls[2][0]).toContain('/api/sync?planner=multicam');

    const r = useDeviceLibrary.getState().uploads.records;
    expect(r[eigeneKamera.id]).toMatchObject({ state: 'edit-proposed', slug: 'sony-pxw-fx9' });
    expect(r['custom-lens-1']).toMatchObject({ state: 'blocked', findings: ['no-source'] });
    expect(JSON.parse(speicher['multicam-device-library-uploads']).records[eigeneKamera.id].state).toBe('edit-proposed');

    // … automatisch geht unveraendert nur noch mit, was in der Moderation
    // wartet (die Kamera), nicht das Blockierte — und die Freigabe kommt an:
    fetchMock
      .mockResolvedValueOnce(json({ results: [{ localId: eigeneKamera.id, state: 'in-sync', moderation: 'approved' }] }))
      .mockResolvedValueOnce(json(antwort(0, [])));
    await useDeviceLibrary.getState().syncAll();
    expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body)).items.map((i: { localId: string }) => i.localId)).toEqual([eigeneKamera.id]);
    expect(useDeviceLibrary.getState().uploads.records[eigeneKamera.id]).toMatchObject({ state: 'in-sync', moderation: 'approved', slug: 'sony-pxw-fx9' });

    // … danach, freigegeben und unveraendert, nur noch der Abgleich:
    fetchMock.mockResolvedValueOnce(json(antwort(0, [])));
    await useDeviceLibrary.getState().syncAll();
    expect(fetchMock.mock.calls[5][0]).toContain('/api/sync');

    // … „Sync now" schickt alles, dann erst den Abgleich.
    fetchMock
      .mockResolvedValueOnce(json({ results: [{ localId: eigeneKamera.id, state: 'in-sync', moderation: 'approved' }, { localId: 'custom-lens-1', state: 'blocked' }] }))
      .mockResolvedValueOnce(json(antwort(0, [])));
    await useDeviceLibrary.getState().syncAll({ manual: true });
    expect(fetchMock.mock.calls[6][0]).toContain('/api/upload');
    expect(fetchMock.mock.calls[7][0]).toContain('/api/sync');
  });

  it('automatic upload can be switched off; manual sync still uploads', async () => {
    const { useDeviceLibrary, registerOwnItems } = await import('../library/store');
    expect(useDeviceLibrary.getState().autoUpload).toBe(true);
    useDeviceLibrary.getState().setAutoUpload(false);
    registerOwnItems(() => [{ kind: 'camera', camera: eigeneKamera }]);
    anmelden();
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain('https://devices.zumpelars.de/api/upload');
    fetchMock
      .mockResolvedValueOnce(json({ results: [{ localId: eigeneKamera.id, state: 'created', slug: 's' }] }))
      .mockResolvedValueOnce(json(antwort(0, [])));
    await useDeviceLibrary.getState().syncAll({ manual: true });
    expect(fetchMock.mock.calls[2][0]).toBe('https://devices.zumpelars.de/api/upload');
  });

  it('409 is `exists`, guidelines-outdated keeps the sign-in', async () => {
    const { useDeviceLibrary, registerOwnItems } = await import('../library/store');
    const { libraryErrorText } = await import('../library/messages');
    const messageText = (c: 'exists' | 'guidelines-outdated') => libraryErrorText((_k, en) => en, c);
    useDeviceLibrary.getState().setAutoUpload(false);
    registerOwnItems(() => [{ kind: 'camera', camera: eigeneKamera }]);
    anmelden();
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');
    fetchMock.mockResolvedValueOnce(json({ error: 'guidelines-outdated' }, {}, 403));
    await useDeviceLibrary.getState().uploadOwn({ force: true });
    expect(useDeviceLibrary.getState().error).toBe('guidelines-outdated');
    expect(useDeviceLibrary.getState().signedIn).toBe(true);
    fetchMock.mockResolvedValueOnce(json({ error: 'exists' }, {}, 409));
    await useDeviceLibrary.getState().uploadOwn({ force: true });
    expect(useDeviceLibrary.getState().error).toBe('exists');
    expect(messageText('exists')).toMatch(/already in the library/);
    expect(messageText('guidelines-outdated')).toMatch(/guidelines/);
  });

  it('a changed server forgets the token; bad addresses are refused', async () => {
    const { useDeviceLibrary, normaliseServerUrl } = await import('../library/store');
    expect(normaliseServerUrl('http://devices.example.com')).toBeNull();
    expect(normaliseServerUrl('http://localhost:8080/')).toBe('http://localhost:8080');
    expect(normaliseServerUrl('https://devices.example.com///')).toBe('https://devices.example.com');
    expect(await useDeviceLibrary.getState().setServer('ftp://x')).toBe(false);
    expect(await useDeviceLibrary.getState().setServer('https://devices.example.com')).toBe(true);
    expect(useDeviceLibrary.getState().server).toBe('https://devices.example.com');
    expect(useDeviceLibrary.getState().signedIn).toBe(false);
    expect(JSON.parse(speicher['multicam-device-library-server'])).toBe('https://devices.example.com');
    await useDeviceLibrary.getState().setServer('https://devices.zumpelars.de');
    expect(JSON.parse(speicher['multicam-device-library-server'])).toBeNull();
  });

  // ── Offline-Vertrag (`syncFrom` im gemeinsamen Client) ──────────────────
  const eineKamera = () => antwort(3, [geraet('sony-fx9-lib', 3, cameraToFacet(eigeneKamera))]);
  const cacheVon = (server: string) => readCache(JSON.parse(speicher['multicam-device-library-cache'] ?? 'null'), server);

  it('switching the server keeps the other server\'s cache; switching back restores it', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json(eineKamera()));
    const { useDeviceLibrary } = await import('../library/store');
    const { getCameraById } = await import('../data/cameras');
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');
    expect(useDeviceLibrary.getState().cache.entries).toHaveLength(1);

    await useDeviceLibrary.getState().setServer('https://devices.example.com');
    expect(useDeviceLibrary.getState().cache).toEqual(emptyCache('https://devices.example.com'));
    expect(getCameraById('devlib-sony-fx9-lib')).toBeUndefined();
    expect(cacheVon('https://devices.zumpelars.de').entries).toHaveLength(1);

    await useDeviceLibrary.getState().setServer('https://devices.zumpelars.de');
    expect(useDeviceLibrary.getState().cache.latestSeq).toBe(3);
    expect(getCameraById('devlib-sony-fx9-lib')?.model).toBe('PXW-FX9 (eigene)');
  });

  it('a legacy single cache is read as the slot of its server and survives the next save', async () => {
    const alt = mergeSync(emptyCache('https://devices.zumpelars.de'), eineKamera()).cache;
    speicher['multicam-device-library-cache'] = JSON.stringify(alt);
    const { useDeviceLibrary } = await import('../library/store');
    expect(useDeviceLibrary.getState().cache).toEqual(alt);
    fetchMock
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json(antwort(3, [])));
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');
    expect(fetchMock.mock.calls[1][0]).toContain('after=3');
    expect(JSON.parse(speicher['multicam-device-library-cache']).format).toBe('multicam-device-library-caches');
    expect(cacheVon('https://devices.zumpelars.de').entries).toHaveLength(1);
  });

  it('a lower latestSeq fetches everything again and replaces the cache', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json(antwort(10, [geraet('alt', 10, cameraToFacet(eigeneKamera))])));
    const { useDeviceLibrary } = await import('../library/store');
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');
    fetchMock
      .mockResolvedValueOnce(json(antwort(2, [])))
      .mockResolvedValueOnce(json(antwort(2, [geraet('neu', 2, lensToFacet(eigeneOptik))])));
    await useDeviceLibrary.getState().syncNow();
    expect(fetchMock.mock.calls[3][0]).toContain('after=0');
    const c = useDeviceLibrary.getState().cache;
    expect(c.entries.map((e) => e.slug)).toEqual(['neu']);
    expect(c.latestSeq).toBe(2);
    expect(cacheVon('https://devices.zumpelars.de').entries.map((e) => e.slug)).toEqual(['neu']);
  });

  it('an empty new server is an error and keeps the cache; so do offline and sign-out', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json(eineKamera()));
    const { useDeviceLibrary } = await import('../library/store');
    const { libraryErrorText } = await import('../library/messages');
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');
    const vorher = speicher['multicam-device-library-cache'];

    fetchMock.mockResolvedValueOnce(json(antwort(0, []))).mockResolvedValueOnce(json(antwort(0, [])));
    await useDeviceLibrary.getState().syncNow();
    expect(useDeviceLibrary.getState().error).toBe('server-empty');
    expect(libraryErrorText((_k, en) => en, 'server-empty')).toMatch(/were kept/);
    expect(useDeviceLibrary.getState().cache.entries).toHaveLength(1);
    expect(speicher['multicam-device-library-cache']).toBe(vorher);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await useDeviceLibrary.getState().syncNow();
    expect(useDeviceLibrary.getState().error).toBe('offline');
    expect(libraryErrorText((_k, en) => en, 'offline')).toMatch(/last sync stay available/);
    expect(useDeviceLibrary.getState().cache.entries).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(json({ error: 'x' }, {}, 401));
    await useDeviceLibrary.getState().syncNow();
    expect(useDeviceLibrary.getState().signedIn).toBe(false);
    expect(useDeviceLibrary.getState().cache.entries).toHaveLength(1);
    expect(speicher['multicam-device-library-cache']).toBe(vorher);
  });

  it('sign-out keeps the cache', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ user: { id: 'u', email: 'a@b.de', username: 'l' } }, { 'set-auth-token': 'T' }))
      .mockResolvedValueOnce(json(eineKamera()))
      .mockResolvedValueOnce(json({}));
    const { useDeviceLibrary } = await import('../library/store');
    const { getCameraById } = await import('../data/cameras');
    await useDeviceLibrary.getState().signIn('a@b.de', 'pw');
    await useDeviceLibrary.getState().signOut();
    expect(useDeviceLibrary.getState().signedIn).toBe(false);
    expect(useDeviceLibrary.getState().cache.entries).toHaveLength(1);
    expect(cacheVon('https://devices.zumpelars.de').entries).toHaveLength(1);
    expect(getCameraById('devlib-sony-fx9-lib')?.model).toBe('PXW-FX9 (eigene)');
  });

  it('guidelines link follows the server address', async () => {
    const { guidelinesUrl } = await import('../library/messages');
    expect(guidelinesUrl('https://devices.zumpelars.de')).toBe('https://devices.zumpelars.de/guidelines');
    expect(guidelinesUrl('http://localhost:8080/')).toBe('http://localhost:8080/guidelines');
  });
});

describe('upload ledger', () => {
  const kamera = { kind: 'camera' as const, camera: eigeneKamera };

  it('only changed or failed entries go up again; key order does not count as a change', async () => {
    const { pendingUploads, applyUploadResults, emptyLedger, hashOf, toUploadItem } = await import('../library/upload');
    const erst = pendingUploads([kamera], emptyLedger('https://s'));
    expect(erst).toHaveLength(1);
    const wartend = applyUploadResults(emptyLedger('https://s'), erst, [{ localId: eigeneKamera.id, state: 'created', slug: 'x', moderation: 'pending' }], '2026-09-27T00:00:00Z');
    // Wartet in der Moderation: geht erneut mit, damit die Freigabe ankommt.
    expect(pendingUploads([kamera], wartend)).toHaveLength(1);
    const ledger = applyUploadResults(wartend, erst, [{ localId: eigeneKamera.id, state: 'in-sync', moderation: 'approved' }], '2026-09-27T00:00:00Z');
    expect(pendingUploads([kamera], ledger)).toHaveLength(0);
    expect(pendingUploads([kamera], ledger, true)).toHaveLength(1);
    const umsortiert = Object.fromEntries(Object.entries(eigeneKamera).reverse()) as unknown as Camera;
    expect(toUploadItem({ kind: 'camera', camera: umsortiert }).hash).toBe(toUploadItem(kamera).hash);
    expect(pendingUploads([{ kind: 'camera', camera: { ...eigeneKamera, notes: 'neu' } }], ledger)).toHaveLength(1);
    const fehler = applyUploadResults(ledger, erst, [{ localId: eigeneKamera.id, state: 'error', error: 'x' }], 'z');
    expect(pendingUploads([kamera], fehler)).toHaveLength(1);
    expect(fehler.records[eigeneKamera.id].slug).toBe('x');
    expect(hashOf({ a: 1, b: 2 })).toBe(hashOf({ b: 2, a: 1 }));
  });

  it('display bucket follows moderation, older records fall back to the state', async () => {
    const { uploadBucket } = await import('../library/upload');
    const r = (state: string, moderation?: 'pending' | 'approved') => ({ hash: 'h', state, at: 'z', ...(moderation ? { moderation } : {}) }) as never;
    expect(uploadBucket(r('in-sync', 'pending'))).toBe('waiting');
    expect(uploadBucket(r('in-sync', 'approved'))).toBe('live');
    expect(uploadBucket(r('created'))).toBe('waiting');
    expect(uploadBucket(r('in-sync'))).toBe('live');
    expect(uploadBucket(r('blocked', 'pending'))).toBe('blocked');
    expect(uploadBucket(r('error'))).toBe('failed');
  });

  it('a ledger of another server is not reused; deleted entries fall out', async () => {
    const { readLedger, pruneLedger, emptyLedger } = await import('../library/upload');
    const l = { server: 'https://a', records: { x: { hash: 'h', state: 'created' as const, at: 'z' } } };
    expect(readLedger(l, 'https://a').records.x).toBeDefined();
    expect(readLedger(l, 'https://b')).toEqual(emptyLedger('https://b'));
    expect(pruneLedger(l, new Set()).records).toEqual({});
  });
});

describe('library entries travel in the project file', () => {
  it('used library entries are written, custom copies take precedence', async () => {
    const { pickProjectLibrary } = await import('../utils/projectLibrary');
    const bib = { ...eigeneKamera, id: 'devlib-a' };
    const bibOptik = { ...ua107, id: 'devlib-l' };
    const placed = [{ cameraId: 'devlib-a', lensId: 'devlib-l' }, { cameraId: 'devlib-b', lensId: 'x' }] as never;
    expect(pickProjectLibrary(placed, [], [], { cameras: [bib, { ...bib, id: 'devlib-unused' }], lenses: [bibOptik] })).toEqual({
      libraryCameras: [bib],
      libraryLenses: [bibOptik],
    });
    expect(pickProjectLibrary(placed, [bib], [], { cameras: [bib], lenses: [] })).toEqual({ customCameras: [bib] });
  });

  it('read back only as devlib entries that pass the check; the cache wins over the file', async () => {
    vi.resetModules();
    const { readCarriedLibrary } = await import('../utils/projectLibrary');
    const reg = await import('../library/registry');
    const r = readCarriedLibrary({
      libraryCameras: [{ ...eigeneKamera, id: 'devlib-a' }, { ...eigeneKamera, id: 'sony-fx9' }, { id: 'devlib-kaputt' }],
      libraryLenses: 'kein Array',
    });
    expect(r.cameras.map((c) => c.id)).toEqual(['devlib-a']);
    expect(r.invalid).toBe(2);
    reg.setProjectLibraryEntries(r);
    expect(reg.libraryCameras().find((c) => c.id === 'devlib-a')?.model).toBe('PXW-FX9 (eigene)');
    expect(reg.isCarriedByProject('devlib-a')).toBe(true);
    reg.setLibraryCatalog({ cameras: [{ ...eigeneKamera, id: 'devlib-a', model: 'aus dem Cache' }], lenses: [] });
    expect(reg.libraryCameras().filter((c) => c.id === 'devlib-a').map((c) => c.model)).toEqual(['aus dem Cache']);
    expect(reg.isCarriedByProject('devlib-a')).toBe(false);
  });
});
