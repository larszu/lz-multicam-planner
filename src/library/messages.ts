import type { LibraryErrorCode } from '../utils/deviceLibraryClient';

type T = (key: string, en: string) => string;

/** Die Codes des Clients plus `server-empty`: ein `server`-Fehler mit dieser
 *  Meldung aus `syncFrom` (neu aufgesetzter Server ohne Geraete). Er bekommt
 *  einen eigenen Satz, weil er sagen muss, dass die lokalen Geraete bleiben. */
export type LibraryFehler = LibraryErrorCode | 'server-empty';

/** Die Fehlercodes des Clients in Saetzen, die sagen, was jetzt zu tun ist. */
export function libraryErrorText(t: T, code: LibraryFehler): string {
  switch (code) {
    case 'wrong-credentials':
      return t('library.error.wrongCredentials', 'Email/username or password is wrong.');
    case 'email-not-verified':
      return t('library.error.emailNotVerified', 'Your email address is not confirmed yet. Open the link in the confirmation mail, then sign in again.');
    case 'guidelines-outdated':
      return t('library.error.guidelinesOutdated', 'The community guidelines of the library have changed. Accept them again on the website, then retry.');
    case 'exists':
      return t('library.error.exists', 'This manufacturer and model are already in the library. Open it there and confirm or correct the entry instead of submitting it again.');
    case 'wrong-code':
      return t('library.error.wrongCode', 'The code is wrong or has expired. Enter the current code from your authenticator app.');
    case 'rate-limited':
      return t('library.error.rateLimited', 'Too many attempts. Wait a minute and try again.');
    case 'not-signed-in':
      return t('library.error.notSignedIn', 'You are not signed in (or the session has expired). Sign in again.');
    case 'offline':
      return t('library.error.offline', 'The server cannot be reached. The devices from the last sync stay available. Check the connection — and, for a server other than the default, that its address is allowed in the content security policy of this build.');
    case 'server-empty':
      return t('library.error.serverEmpty', 'The server was set up anew and has no devices yet. The devices from the last sync were kept.');
    case 'server':
    default:
      return t('library.error.server', 'The server answered with an error. Try again later.');
  }
}

/** Was der Server zu einem `server`-Fehler mitgab: HTTP-Status und `error`-Code der Antwort. */
export interface ServerDetail {
  status: number;
  code: string;
}

/** Ein `server`-Fehler mit dem Grund, den Status und Code verraten (#156). */
export function serverReasonText(t: T, d: ServerDetail): string {
  const { status, code } = d;
  let satz: string;
  if (status === 507 || code === 'storage-full')
    satz = t('library.error.storageFull', 'The library server has run out of storage. Nothing was saved there; your devices stay local. The server administrator has to free up space.');
  else if (status === 404 || code === 'not-found')
    satz = t('library.error.notFound', 'The server does not offer this function. It probably runs an older version of the device library, or the address points to another server.');
  else if (code === 'invalid')
    satz = t('library.error.invalid', 'The server refused the data as invalid. Check manufacturer, model, notes and datasheet link of the entry.');
  else if (status === 413 || code === 'file-too-large' || code === 'bad-request')
    satz = t('library.error.badRequest', 'The server could not take the request (too large or malformed).');
  else if (status === 502 || status === 503 || status === 504)
    satz = t('library.error.unavailable', 'The server is temporarily unavailable (restarting or overloaded). Try again in a few minutes.');
  else if (status >= 500)
    satz = t('library.error.internal', 'The server ran into an internal error; the cause is in its log. Try again later — if it keeps happening, report it with the time.');
  else satz = t('library.error.server', 'The server answered with an error. Try again later.');
  const ref = [status ? `HTTP ${status}` : '', code].filter(Boolean).join(' · ');
  return ref ? `${satz} (${ref})` : satz;
}

/** Wo die Richtlinien neu angenommen werden — der Client kennt keine eigene Funktion dafuer. */
export const guidelinesUrl = (server: string) => `${server.replace(/\/+$/, '')}/guidelines`;
