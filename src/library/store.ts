// ───────────────────────────────────────────────────────────────────────────
// Zustand der Geraetebibliothek: Server, Anmeldung, Abgleich, Einreichen.
//
// Das Token steht NICHT im Zustand, sondern in einer Modulvariablen und im
// Token-Speicher (`tokenStore.ts`): was im Store steht, landet leicht in einem
// Debug-Dump oder einer Ausgabe. Hier steht nur, OB jemand angemeldet ist.
//
// SERVER-ADRESSE. Ohne Einstellung spricht jeder Build
// `DEFAULT_DEVICE_LIBRARY_URL` an. Eine geaenderte Adresse
//   - meldet am alten Server ab und vergisst das Token — es gehoert zu ihm
//     und darf nie an einen anderen Server gehen;
//   - beginnt einen leeren Cache (Slugs gelten je Server);
//   - braucht einen Eintrag in der Content-Security-Policy (`index.html`
//     und `electron/main.cjs`). Ohne ihn blockiert der Build die Anfrage,
//     und der Client meldet `offline` — die Einstellungen sagen das dazu.
// Nur https, ausser fuer localhost: das Token ginge sonst im Klartext.
// ───────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import {
  DEFAULT_DEVICE_LIBRARY_URL,
  LibraryError,
  currentUser,
  signIn as signInRequest,
  signOut as signOutRequest,
  sync as syncRequest,
  upload as uploadRequest,
  verifySecondFactor,
  type LibraryErrorCode,
  type LibraryUser,
  type SignInResult,
} from '../utils/deviceLibraryClient';
import { loadJSON, saveJSON } from '../utils/storage';
import type { LibraryItem } from './facet';
import { applyUploadResults, emptyLedger, pendingUploads, pruneLedger, readLedger, type UploadLedger } from './upload';
import { setLibraryCatalog } from './registry';
import { emptyCache, mergeSync, readCache, type LibraryCache, type SyncStats } from './sync';
import { clearToken, loadToken, saveToken } from './tokenStore';

const SERVER_KEY = 'multicam-device-library-server';
const CACHE_KEY = 'multicam-device-library-cache';
const LEDGER_KEY = 'multicam-device-library-uploads';
const AUTO_KEY = 'multicam-device-library-auto-upload';

/** Die eigenen Eintraege liefert der Katalog-Store; hier nur die Frage danach,
 *  damit dieser Store den grossen nicht importieren muss. */
let ownItems: () => LibraryItem[] = () => [];
export const registerOwnItems = (fn: () => LibraryItem[]) => {
  ownItems = fn;
};

/** Bereinigte Adresse oder `null`, wenn sie nicht taugt. */
export function normaliseServerUrl(input: string): string | null {
  const s = input.trim().replace(/\/+$/, '');
  try {
    const u = new URL(s);
    const lokal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && lokal)) return null;
    if (u.search || u.hash) return null;
    return s;
  } catch {
    return null;
  }
}

export function loadServer(): string {
  const v = loadJSON<string | null>(SERVER_KEY, null);
  return (v && normaliseServerUrl(v)) || DEFAULT_DEVICE_LIBRARY_URL;
}

export type LibraryPhase = 'idle' | 'checking' | 'signing-in' | 'second-factor' | 'uploading' | 'syncing';

interface LibraryState {
  server: string;
  signedIn: boolean;
  user: LibraryUser | null;
  phase: LibraryPhase;
  error: LibraryErrorCode | null;
  /** Token nur fuer diese Sitzung gemerkt (kein Schluesselbund / Speicher voll). */
  sessionOnly: boolean;
  cache: LibraryCache;
  lastSync: { at: string; stats: SyncStats } | null;
  /** Was mit jedem eigenen Eintrag zuletzt beim Hochladen geschah. */
  uploads: UploadLedger;
  /** Eigene Geraete automatisch hochladen (Start, nach Aendern). Vorgabe an. */
  autoUpload: boolean;

  init: () => Promise<void>;
  setServer: (url: string) => Promise<boolean>;
  signIn: (login: string, password: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  cancelSecondFactor: () => void;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Eigene Eintraege hochladen; `force` schickt auch Unveraendertes. */
  uploadOwn: (opts?: { force?: boolean; only?: string[] }) => Promise<void>;
  /** Erst hoch (wenn `manual` oder automatisch erlaubt), dann runter. */
  syncAll: (opts?: { manual?: boolean }) => Promise<void>;
  setAutoUpload: (on: boolean) => void;
}

let token: string | null = null;
let challenge: string | null = null;

function publish(cache: LibraryCache) {
  setLibraryCatalog({
    cameras: cache.entries.flatMap((e) => (e.kind === 'camera' ? [e.camera] : [])),
    lenses: cache.entries.flatMap((e) => (e.kind === 'lens' ? [e.lens] : [])),
  });
}

function initialCache(server: string): LibraryCache {
  const c = readCache(loadJSON<unknown>(CACHE_KEY, null), server);
  publish(c);
  return c;
}

const initialServer = loadServer();

export const useDeviceLibrary = create<LibraryState>()((set, get) => {
  const vergiss = async () => {
    token = null;
    challenge = null;
    await clearToken();
    set({ signedIn: false, user: null, sessionOnly: false });
  };

  const angemeldet = async (r: Extract<SignInResult, { kind: 'ok' }>) => {
    token = r.token;
    challenge = null;
    const dauerhaft = await saveToken({ server: get().server, token: r.token });
    set({ signedIn: true, user: r.user, phase: 'idle', error: null, sessionOnly: !dauerhaft });
    await get().syncAll();
  };

  const abgemeldetWenn = async (e: unknown) => {
    const code = e instanceof LibraryError ? e.code : 'server';
    if (code === 'not-signed-in' || code === 'wrong-credentials') await vergiss();
    return code === 'wrong-credentials' ? 'not-signed-in' : code;
  };

  return {
    server: initialServer,
    signedIn: false,
    user: null,
    phase: 'idle',
    error: null,
    sessionOnly: false,
    cache: initialCache(initialServer),
    lastSync: null,
    uploads: readLedger(loadJSON<unknown>(LEDGER_KEY, null), initialServer),
    autoUpload: loadJSON<boolean>(AUTO_KEY, true) !== false,

    init: async () => {
      const gespeichert = await loadToken();
      if (!gespeichert) return;
      if (gespeichert.server !== get().server) {
        await clearToken();
        return;
      }
      token = gespeichert.token;
      set({ phase: 'checking', signedIn: true });
      try {
        const user = await currentUser(get().server, token);
        if (!user) {
          await vergiss();
          set({ phase: 'idle', error: 'not-signed-in' });
          return;
        }
        set({ user, phase: 'idle', error: null });
      } catch (e) {
        // Offline: angemeldet bleiben, der Cache traegt weiter.
        set({ phase: 'idle', error: e instanceof LibraryError ? e.code : 'offline' });
        return;
      }
      await get().syncAll();
    },

    setServer: async (url) => {
      const neu = normaliseServerUrl(url);
      if (!neu) return false;
      const alt = get().server;
      if (neu === alt) return true;
      if (token) await signOutRequest(alt, token);
      await vergiss();
      saveJSON(SERVER_KEY, neu === DEFAULT_DEVICE_LIBRARY_URL ? null : neu);
      const cache = emptyCache(neu);
      saveJSON(CACHE_KEY, cache);
      publish(cache);
      const uploads = emptyLedger(neu);
      saveJSON(LEDGER_KEY, uploads);
      set({ server: neu, cache, uploads, lastSync: null, error: null, phase: 'idle' });
      return true;
    },

    signIn: async (login, password) => {
      set({ phase: 'signing-in', error: null });
      const r = await signInRequest(get().server, login, password);
      if (r.kind === 'ok') return angemeldet(r);
      if (r.kind === 'second-factor') {
        challenge = r.challenge;
        set({ phase: 'second-factor' });
        return;
      }
      set({ phase: 'idle', error: r.code });
    },

    verifyCode: async (code) => {
      if (!challenge) {
        set({ phase: 'idle', error: 'wrong-code' });
        return;
      }
      set({ error: null });
      const r = await verifySecondFactor(get().server, challenge, code);
      if (r.kind === 'ok') return angemeldet(r);
      set({ phase: 'second-factor', error: r.kind === 'error' ? r.code : 'server' });
    },

    cancelSecondFactor: () => {
      challenge = null;
      set({ phase: 'idle', error: null });
    },

    signOut: async () => {
      if (token) await signOutRequest(get().server, token);
      await vergiss();
      set({ phase: 'idle', error: null });
    },

    syncNow: async () => {
      if (!token) {
        set({ error: 'not-signed-in' });
        return;
      }
      set({ phase: 'syncing', error: null });
      try {
        const { server, cache } = get();
        const antwort = await syncRequest(server, token, 'multicam', cache.latestSeq);
        const r = mergeSync(cache, antwort);
        saveJSON(CACHE_KEY, r.cache);
        publish(r.cache);
        set({ cache: r.cache, lastSync: { at: new Date().toISOString(), stats: r.stats }, phase: 'idle' });
      } catch (e) {
        set({ phase: 'idle', error: await abgemeldetWenn(e) });
      }
    },

    uploadOwn: async (opts = {}) => {
      if (!token) {
        set({ error: 'not-signed-in' });
        return;
      }
      const alle = ownItems();
      const ids = new Set(alle.map((i) => (i.kind === 'camera' ? i.camera.id : i.lens.id)));
      const ledger = pruneLedger(get().uploads, ids);
      const auswahl = opts.only ? alle.filter((i) => opts.only!.includes(i.kind === 'camera' ? i.camera.id : i.lens.id)) : alle;
      const offen = pendingUploads(auswahl, ledger, opts.force);
      if (offen.length === 0) {
        if (ledger !== get().uploads) {
          saveJSON(LEDGER_KEY, ledger);
          set({ uploads: ledger });
        }
        return;
      }
      set({ phase: 'uploading', error: null });
      try {
        const ergebnis = await uploadRequest(
          get().server,
          token,
          'multicam',
          offen.map(({ hash: _h, ...item }) => item),
        );
        const uploads = applyUploadResults(ledger, offen, ergebnis, new Date().toISOString());
        saveJSON(LEDGER_KEY, uploads);
        set({ uploads, phase: 'idle' });
      } catch (e) {
        set({ phase: 'idle', error: await abgemeldetWenn(e) });
      }
    },

    syncAll: async (opts = {}) => {
      if (!token) {
        set({ error: 'not-signed-in' });
        return;
      }
      if (opts.manual || get().autoUpload) await get().uploadOwn({ force: opts.manual });
      if (token) await get().syncNow();
    },

    setAutoUpload: (on) => {
      saveJSON(AUTO_KEY, on);
      set({ autoUpload: on });
    },
  };
});
