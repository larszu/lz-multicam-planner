// Herkunftszeile unter der Kamera-/Optik-Auswahl, wenn der Eintrag aus der
// Geraetebibliothek kommt: Pruefstand, Bestaetigungen, Link zur Seite.
import { format, useTranslation } from '../../i18n';
import { deviceUrl } from '../../utils/deviceLibraryClient';
import { useDeviceLibrary } from '../../library/store';
import { isLibraryId } from '../../library/facet';
import { isCarriedByProject } from '../../library/registry';
import type { LibraryEntry } from '../../library/sync';

export default function LibraryBadge({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const server = useDeviceLibrary((s) => s.server);
  const entry = useDeviceLibrary((s) =>
    isLibraryId(id) ? s.cache.entries.find((e) => (e.kind === 'camera' ? e.camera.id : e.lens.id) === id) : undefined,
  );
  if (!entry) {
    // Aus der Projektdatei, nicht aus dem eigenen Abgleich: rechnet mit dem
    // Stand, den der Absender hatte.
    return id && isLibraryId(id) && isCarriedByProject(id) ? (
      <div className="mt-0.5 text-[11px] text-bc-muted">
        {t('library.badge.carried', 'Device library entry carried in the project file — not in your synced library.')}
      </div>
    ) : null;
  }

  const STATUS: Record<LibraryEntry['status'], string> = {
    verified: t('library.status.verified', 'verified'),
    confirmed: t('library.status.confirmed', 'confirmed'),
    unconfirmed: t('library.status.unconfirmed', 'unconfirmed'),
    disputed: t('library.status.disputed', 'disputed'),
  };

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-bc-muted">
      <span>
        {format(t('library.badge', 'Device library · {status} · {n} confirmations'), {
          status: STATUS[entry.status] ?? entry.status,
          n: entry.confirmations,
        })}
      </span>
      <a href={deviceUrl(server, entry.slug)} target="_blank" rel="noopener noreferrer" className="text-bc-accent hover:underline">
        {t('library.badge.open', 'View')}
      </a>
    </div>
  );
}
