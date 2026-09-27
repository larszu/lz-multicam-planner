// Einen eigenen Eintrag sofort hochladen. Der Datenblattlink ist Pflicht und
// wird am Eintrag selbst gespeichert (`manufacturerUrl`) — so geht er bei
// jedem spaeteren automatischen Upload mit, statt nur dieses eine Mal.
import { useEffect, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { format, useTranslation } from '../../i18n';
import { deviceUrl } from '../../utils/deviceLibraryClient';
import { useDeviceLibrary } from '../../library/store';
import { useStore } from '../../store/useStore';
import type { LibraryItem } from '../../library/facet';
import { findingText, uploadStateText } from '../../library/uploadText';
import LibraryErrorLine from './LibraryErrorLine';
import { openSettings } from '../Settings/openSettings';

const istLink = (s: string) => /^https?:\/\/\S+\.\S+$/i.test(s.trim());

export default function UploadDialog({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const { t } = useTranslation();
  const lib = useDeviceLibrary();
  const entry = item.kind === 'camera' ? item.camera : item.lens;
  const [sourceUrl, setSourceUrl] = useState(entry.manufacturerUrl ?? '');
  const [sent, setSent] = useState(false);
  const record = lib.uploads.records[entry.id];
  const busy = lib.phase === 'uploading' || lib.phase === 'syncing';

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const name = `${entry.manufacturer} ${entry.model}`.trim();
  const knopf = 'border border-bc-border text-xs text-bc-text transition-colors hover:bg-bc-panel-raised disabled:opacity-50';

  const hochladen = async () => {
    const url = sourceUrl.trim();
    if (url !== (entry.manufacturerUrl ?? '')) {
      if (item.kind === 'camera') useStore.getState().updateCustomCamera(entry.id, { manufacturerUrl: url });
      else useStore.getState().updateCustomLens(entry.id, { manufacturerUrl: url });
    }
    await lib.uploadOwn({ only: [entry.id], force: true });
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-bc-scrim p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('library.upload.title', 'Upload to device library')}
        className="flex w-full max-w-[480px] flex-col border border-bc-border bg-bc-panel"
      >
        <div className="bc-panel-head justify-between">
          <span className="text-sm font-bold text-bc-text-bright">{t('library.upload.title', 'Upload to device library')}</span>
          <button type="button" onClick={onClose} className="text-bc-muted hover:text-bc-text-bright" aria-label={t('library.close', 'Close')}>
            <FiX size={16} />
          </button>
        </div>
        <div className="text-xs" style={{ padding: '16px' }}>
          <p className="text-bc-text">
            {format(
              item.kind === 'camera'
                ? t('library.propose.camera', 'Camera “{name}” with its sensor, mounts, adapters and sources.')
                : t('library.propose.lens', 'Lens “{name}” with its focal range, aperture, mount and image circle.'),
              { name },
            )}
          </p>
          <p className="mt-1 text-bc-muted">
            {t(
              'library.upload.matchHint',
              'If the library already has this manufacturer and model, your data becomes its next version instead of a second device.',
            )}
          </p>

          {!lib.signedIn ? (
            <div style={{ marginTop: '12px' }}>
              <p className="text-bc-muted">
                {t('library.propose.signInFirst', 'Uploading needs an account at the device library. Sign in first.')}
              </p>
              <button
                type="button"
                className={`${knopf} mt-2`}
                style={{ padding: '6px 12px' }}
                onClick={() => {
                  onClose();
                  openSettings('library');
                }}
              >
                {t('library.propose.goSignIn', 'Sign in…')}
              </button>
            </div>
          ) : (
            <form
              style={{ marginTop: '12px' }}
              onSubmit={(e) => {
                e.preventDefault();
                void hochladen();
              }}
            >
              <label className="block text-bc-muted">
                {t('library.propose.source', 'Datasheet link (required)')}
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://"
                  className="mt-1 block w-full border border-bc-border bg-bc-dark text-bc-text-bright"
                  style={{ padding: '6px 8px' }}
                />
              </label>
              {sourceUrl.trim() !== '' && !istLink(sourceUrl) && (
                <p className="mt-1 text-bc-red">{t('library.propose.sourceInvalid', 'Enter a full link (https://…) to the manufacturer’s datasheet.')}</p>
              )}
              <button
                type="submit"
                className="mt-3 border border-bc-accent bg-bc-accent text-bc-accent-text disabled:opacity-50"
                style={{ padding: '6px 12px' }}
                disabled={busy || !istLink(sourceUrl)}
              >
                {busy ? t('library.propose.sending', 'Uploading…') : t('library.upload.submit', 'Upload')}
              </button>
            </form>
          )}

          {sent && record && (
            <div style={{ marginTop: '12px' }}>
              <p className={record.state === 'blocked' || record.state === 'error' ? 'text-bc-red' : 'text-bc-green'}>
                {uploadStateText(t, record, false)}
                {record.state === 'blocked' && record.findings?.length
                  ? ` (${record.findings.map((k) => findingText(t, k)).join(', ')})`
                  : ''}
                {record.state === 'error' && record.error ? ` (${record.error})` : ''}
              </p>
              {record.slug && (
                <a href={deviceUrl(lib.server, record.slug)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-bc-accent hover:underline">
                  {t('library.propose.open', 'Open in the library')}
                </a>
              )}
            </div>
          )}

          {lib.error && <LibraryErrorLine code={lib.error} />}
        </div>
      </div>
    </div>
  );
}
