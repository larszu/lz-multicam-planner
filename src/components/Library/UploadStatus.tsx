// Stand eines eigenen Eintrags in der Geraetebibliothek, unter der
// Kamera-/Optik-Auswahl — mit dem Weg zum Hochladen.
import { FiUploadCloud } from 'react-icons/fi';
import { useTranslation } from '../../i18n';
import { deviceUrl } from '../../utils/deviceLibraryClient';
import { useDeviceLibrary } from '../../library/store';
import { toUploadItem } from '../../library/upload';
import { findingText, uploadStateText } from '../../library/uploadText';
import type { LibraryItem } from '../../library/facet';

export default function UploadStatus({ item, onUpload }: { item: LibraryItem; onUpload: () => void }) {
  const { t } = useTranslation();
  const id = item.kind === 'camera' ? item.camera.id : item.lens.id;
  const record = useDeviceLibrary((s) => s.uploads.records[id]);
  const server = useDeviceLibrary((s) => s.server);
  const changed = !!record && toUploadItem(item).hash !== record.hash;
  const befunde = record?.state === 'blocked' && !changed ? record.findings ?? [] : [];

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-bc-muted">
      <span className={record?.state === 'blocked' || record?.state === 'error' ? 'text-bc-red' : undefined}>
        {uploadStateText(t, record, changed)}
        {befunde.length > 0 ? ` (${befunde.map((k) => findingText(t, k)).join(', ')})` : ''}
        {record?.state === 'error' && record.error ? ` (${record.error})` : ''}
      </span>
      {record?.slug && (
        <a href={deviceUrl(server, record.slug)} target="_blank" rel="noopener noreferrer" className="text-bc-accent hover:underline">
          {t('library.badge.open', 'View')}
        </a>
      )}
      <button
        type="button"
        onClick={onUpload}
        className="flex items-center gap-1 text-bc-dim hover:text-bc-accent"
        title={t('library.upload.buttonTitle', 'Upload this entry to the shared device library now')}
      >
        <FiUploadCloud size={12} />
        {t('library.upload.button', 'Upload…')}
      </button>
    </div>
  );
}
