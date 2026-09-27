import type { UploadState } from '../utils/deviceLibraryClient';
import type { UploadRecord } from './upload';

type T = (key: string, en: string) => string;

/** Was der letzte Upload eines eigenen Eintrags ergab — in einem Satz. */
export function uploadStateText(t: T, r: UploadRecord | undefined, changed: boolean): string {
  if (!r) return t('library.upload.none', 'Not in the device library yet.');
  if (changed) return t('library.upload.changed', 'Changed since the last upload — goes up with the next sync.');
  if (r.state === 'in-sync' || r.state === 'approved') {
    if (r.moderation === 'pending') return t('library.upload.inSyncPending', 'Uploaded — still waiting for moderation.');
    if (r.moderation === 'approved') return t('library.upload.approved', 'Live in the device library.');
  }
  const TEXT: Record<UploadState, string> = {
    created: t('library.upload.created', 'Uploaded as a new device — waiting for moderation.'),
    'edit-proposed': t('library.upload.editProposed', 'Uploaded as the next version of an existing device — waiting for moderation.'),
    'pending-updated': t('library.upload.pendingUpdated', 'Your waiting upload was replaced with this version.'),
    approved: t('library.upload.approved', 'Live in the device library.'),
    'in-sync': t('library.upload.inSync', 'The device library holds exactly this.'),
    blocked: t('library.upload.blocked', 'Blocked by the library’s checks.'),
    error: t('library.upload.error', 'Upload failed.'),
  };
  return TEXT[r.state] ?? r.state;
}

/** Befund-Kennungen des Servers, die ein Nutzer selbst beheben kann. */
export function findingText(t: T, kind: string): string {
  switch (kind) {
    case 'no-source':
      return t('library.finding.noSource', 'datasheet link missing');
    case 'source-not-link':
      return t('library.finding.sourceNotLink', 'datasheet link is not a link');
    case 'no-manufacturer':
      return t('library.finding.noManufacturer', 'manufacturer missing');
    case 'no-model':
      return t('library.finding.noModel', 'model missing');
    default:
      return kind;
  }
}
