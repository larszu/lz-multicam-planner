// Einstellungen → Device library: Server, Anmeldung (mit Zwei-Faktor-Schritt),
// angemeldeter Zustand, Abgleich. Registrieren und Passwort-Zuruecksetzen
// laufen auf der Website der Bibliothek, nicht hier.
import { useState } from 'react';
import { format, useTranslation } from '../../i18n';
import {
  DEFAULT_DEVICE_LIBRARY_URL,
  forgotPasswordUrl,
  registerUrl,
} from '../../utils/deviceLibraryClient';
import { useDeviceLibrary } from '../../library/store';
import LibraryErrorLine from '../Library/LibraryErrorLine';
import { usesKeychain } from '../../library/tokenStore';
import { uploadBucket } from '../../library/upload';

const feld = 'block w-full border border-bc-border bg-bc-dark text-xs text-bc-text-bright';
const knopf = 'border border-bc-border text-xs text-bc-text transition-colors hover:bg-bc-panel-raised disabled:opacity-50';
const knopfHaupt = 'border border-bc-accent bg-bc-accent text-xs text-bc-accent-text disabled:opacity-50';
const kopf = 'text-xs font-bold uppercase tracking-wider text-bc-muted';

export default function DeviceLibrarySection() {
  const { t } = useTranslation();
  const lib = useDeviceLibrary();
  const [serverDraft, setServerDraft] = useState(lib.server);
  const [serverInvalid, setServerInvalid] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const busy = lib.phase === 'signing-in' || lib.phase === 'checking' || lib.phase === 'syncing' || lib.phase === 'uploading';
  const records = Object.values(lib.uploads.records);
  const zaehle = (bucket: ReturnType<typeof uploadBucket>) => records.filter((r) => uploadBucket(r) === bucket).length;
  const cameras = lib.cache.entries.filter((e) => e.kind === 'camera').length;
  const lenses = lib.cache.entries.length - cameras;

  const serverUebernehmen = async (url: string) => {
    const ok = await lib.setServer(url);
    setServerInvalid(!ok);
    if (ok) setServerDraft(url.trim().replace(/\/+$/, ''));
  };

  return (
    <div>
      <p className="text-xs text-bc-muted">
        {t(
          'library.intro',
          'The shared device library adds cameras and lenses to the catalog as a read-only source and keeps your own entries there too. It needs an account.',
        )}
      </p>

      <section style={{ marginTop: '16px' }}>
        <h3 className={kopf}>{t('library.server', 'Server')}</h3>
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void serverUebernehmen(serverDraft);
          }}
        >
          <input
            type="url"
            value={serverDraft}
            onChange={(e) => {
              setServerDraft(e.target.value);
              setServerInvalid(false);
            }}
            className={feld}
            style={{ padding: '6px 8px' }}
            aria-label={t('library.server.aria', 'Device library server address')}
            spellCheck={false}
          />
          <button type="submit" className={knopf} style={{ padding: '6px 12px' }} disabled={busy || serverDraft.trim() === lib.server}>
            {t('library.server.apply', 'Apply')}
          </button>
          <button
            type="button"
            className={knopf}
            style={{ padding: '6px 12px' }}
            disabled={busy || lib.server === DEFAULT_DEVICE_LIBRARY_URL}
            onClick={() => {
              setServerDraft(DEFAULT_DEVICE_LIBRARY_URL);
              void serverUebernehmen(DEFAULT_DEVICE_LIBRARY_URL);
            }}
          >
            {t('library.server.reset', 'Reset')}
          </button>
        </form>
        {serverInvalid && (
          <p className="mt-1 text-xs text-bc-red">
            {t('library.server.invalid', 'Not a usable address. It must start with https:// (http:// only for localhost).')}
          </p>
        )}
        {lib.server !== DEFAULT_DEVICE_LIBRARY_URL && (
          <p className="mt-1 text-xs text-bc-yellow">
            {format(
              t(
                'library.server.custom',
                'Not the default server ({url}). This build only allows the default in its content security policy; another server has to be added there, or every request is blocked.',
              ),
              { url: DEFAULT_DEVICE_LIBRARY_URL },
            )}
          </p>
        )}
        <p className="mt-1 text-xs text-bc-muted">
          {t('library.server.hint', 'Changing the server signs you out: an account and its devices belong to one server. Each server keeps its own cache — switching back brings its devices back.')}
        </p>
      </section>

      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('library.account', 'Account')}</h3>

        {lib.signedIn ? (
          <div className="mt-2">
            <p className="text-xs text-bc-text">
              {lib.user
                ? format(t('library.signedInAs', 'Signed in as {name} ({email}).'), { name: lib.user.username || lib.user.email, email: lib.user.email })
                : t('library.signedInUnchecked', 'Signed in — the server has not confirmed the session yet.')}
            </p>
            <p className="mt-1 text-xs text-bc-muted">
              {lib.sessionOnly
                ? t('library.token.session', 'The sign-in is kept for this session only: no secure storage is available.')
                : usesKeychain()
                  ? t('library.token.keychain', 'The sign-in is kept in the system keychain.')
                  : t('library.token.browser', 'The sign-in is kept in this browser’s local storage. Sign out on a shared computer.')}
            </p>
            <button type="button" className={`${knopf} mt-2`} style={{ padding: '6px 12px' }} onClick={() => void lib.signOut()} disabled={busy}>
              {t('library.signOut', 'Sign out')}
            </button>
          </div>
        ) : lib.phase === 'second-factor' ? (
          <form
            className="mt-2 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void lib.verifyCode(code).then(() => setCode(''));
            }}
          >
            <p className="text-xs text-bc-text">
              {t('library.twoFactor.prompt', 'Enter the six-digit code from your authenticator app.')}
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              className={feld}
              style={{ padding: '6px 8px' }}
              aria-label={t('library.twoFactor.code', 'Code')}
              autoFocus
            />
            <div className="flex gap-1">
              <button type="submit" className={knopfHaupt} style={{ padding: '6px 12px' }} disabled={code.trim() === ''}>
                {t('library.twoFactor.verify', 'Confirm')}
              </button>
              <button type="button" className={knopf} style={{ padding: '6px 12px' }} onClick={lib.cancelSecondFactor}>
                {t('library.cancel', 'Cancel')}
              </button>
            </div>
          </form>
        ) : (
          <form
            className="mt-2 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void lib.signIn(login, password).then(() => setPassword(''));
            }}
          >
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              className={feld}
              style={{ padding: '6px 8px' }}
              placeholder={t('library.login', 'Email or username')}
              aria-label={t('library.login', 'Email or username')}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={feld}
              style={{ padding: '6px 8px' }}
              placeholder={t('library.password', 'Password')}
              aria-label={t('library.password', 'Password')}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className={knopfHaupt}
                style={{ padding: '6px 12px' }}
                disabled={busy || login.trim() === '' || password === ''}
              >
                {lib.phase === 'signing-in' ? t('library.signingIn', 'Signing in…') : t('library.signIn', 'Sign in')}
              </button>
              <a href={registerUrl(lib.server)} target="_blank" rel="noopener noreferrer" className="text-xs text-bc-accent hover:underline">
                {t('library.register', 'Create account')}
              </a>
              <a href={forgotPasswordUrl(lib.server)} target="_blank" rel="noopener noreferrer" className="text-xs text-bc-accent hover:underline">
                {t('library.forgot', 'Forgot password')}
              </a>
            </div>
          </form>
        )}

        {lib.error && <LibraryErrorLine code={lib.error} />}
      </section>

      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('library.sync', 'Sync')}</h3>
        <p className="mt-1 text-xs text-bc-text">
          {format(t('library.sync.count', '{cameras} cameras and {lenses} lenses from the library in the catalog.'), { cameras, lenses })}
        </p>
        {lib.lastSync && (
          <p className="mt-1 text-xs text-bc-muted">
            {format(
              t('library.sync.last', 'Last sync {at}: {added} new, {updated} updated, {removed} removed, {invalid} skipped as invalid.'),
              {
                at: new Date(lib.lastSync.at).toLocaleString(),
                ...lib.lastSync.stats,
              },
            )}
          </p>
        )}
        {records.length > 0 && (
          <p className="mt-1 text-xs text-bc-muted">
            {format(
              t('library.upload.summary', 'Own entries: {live} live, {waiting} waiting for moderation, {blocked} blocked, {failed} failed.'),
              {
                live: zaehle('live'),
                waiting: zaehle('waiting'),
                blocked: zaehle('blocked'),
                failed: zaehle('failed'),
              },
            )}
          </p>
        )}
        <label className="mt-2 flex items-center gap-2 text-xs text-bc-text">
          <input type="checkbox" checked={lib.autoUpload} onChange={(e) => lib.setAutoUpload(e.target.checked)} />
          {t('library.autoUpload', 'Upload own devices automatically')}
        </label>
        <p className="mt-1 text-xs text-bc-muted">
          {t(
            'library.autoUpload.hint',
            'Own and modified cameras and lenses go up on start and a few seconds after each change; the library matches them by manufacturer and model.',
          )}
        </p>
        <button
          type="button"
          className={`${knopf} mt-2`}
          style={{ padding: '6px 12px' }}
          disabled={!lib.signedIn || busy}
          onClick={() => void lib.syncAll({ manual: true })}
        >
          {lib.phase === 'uploading'
            ? t('library.uploading', 'Uploading…')
            : lib.phase === 'syncing'
              ? t('library.syncing', 'Syncing…')
              : t('library.syncNow', 'Sync now')}
        </button>
        <p className="mt-1 text-xs text-bc-muted">
          {t('library.sync.hint', 'Sync now uploads your own entries first, then pulls updates. The app also syncs on start while you are signed in. The cache stays when you sign out, so placed library cameras keep working offline.')}
        </p>
      </section>
    </div>
  );
}
