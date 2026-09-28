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

/** Wo die Richtlinien neu angenommen werden — der Client kennt keine eigene Funktion dafuer. */
export const guidelinesUrl = (server: string) => `${server.replace(/\/+$/, '')}/guidelines`;
