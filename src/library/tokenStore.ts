// ───────────────────────────────────────────────────────────────────────────
// Wo das Anmelde-Token der Geraetebibliothek liegt.
//
// ELECTRON: im Schluesselbund des Betriebssystems (`safeStorage`), ueber die
// Bruecke aus `electron/preload.cjs`. Der Renderer sieht nur get/set/clear;
// die verschluesselte Datei liegt im userData-Ordner der App. Ist kein
// Schluesselbund da (Linux ohne Secret Service), speichert der Hauptprozess
// NICHT im Klartext, sondern nur fuer die laufende Sitzung.
//
// WEB-BUILD: localStorage. Ein Browser bietet einer Seite keinen sichereren
// Ort; das Token gilt nur fuer diesen Ursprung, ist ohne Cookie kein
// CSRF-Hebel, und Abmelden widerruft es auf dem Server. Wer das nicht will,
// meldet sich nach der Arbeit ab.
//
// In jedem Fall: das Token steht nie in einer Projektdatei, nie im Autosave
// und nie in einer Log-Zeile. Es gehoert zu genau einem Server — mit ihm
// zusammen gespeichert, damit es bei einer geaenderten Adresse nicht an einen
// fremden Server geht.
// ───────────────────────────────────────────────────────────────────────────

export interface StoredToken {
  server: string;
  token: string;
}

interface SecureBridge {
  get: () => Promise<string | null>;
  set: (value: string) => Promise<boolean>;
  clear: () => Promise<void>;
}

declare global {
  interface Window {
    multicamSecureStore?: SecureBridge;
  }
}

const KEY = 'multicam-device-library-token';

const bridge = (): SecureBridge | undefined =>
  typeof window !== 'undefined' ? window.multicamSecureStore : undefined;

function parse(raw: string | null): StoredToken | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredToken>;
    return typeof v.server === 'string' && typeof v.token === 'string' && v.token ? { server: v.server, token: v.token } : null;
  } catch {
    return null;
  }
}

export async function loadToken(): Promise<StoredToken | null> {
  const b = bridge();
  if (b) return parse(await b.get().catch(() => null));
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** `false`, wenn nur fuer diese Sitzung gemerkt werden konnte. */
export async function saveToken(value: StoredToken): Promise<boolean> {
  const raw = JSON.stringify(value);
  const b = bridge();
  if (b) return b.set(raw).catch(() => false);
  try {
    localStorage.setItem(KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export async function clearToken(): Promise<void> {
  const b = bridge();
  if (b) {
    await b.clear().catch(() => undefined);
    return;
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nichts zu loeschen */
  }
}

/** Der Web-Build legt das Token in localStorage, die Desktop-App in den Schluesselbund. */
export const usesKeychain = () => !!bridge();
