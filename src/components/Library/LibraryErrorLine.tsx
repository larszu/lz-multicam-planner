// Fehlerzeile der Geraetebibliothek; bei geaenderten Richtlinien mit dem Weg
// dorthin, denn annehmen laesst sie sich nur auf der Website.
import { useTranslation } from '../../i18n';
import { guidelinesUrl, libraryErrorText, type LibraryFehler } from '../../library/messages';
import { useDeviceLibrary } from '../../library/store';

export default function LibraryErrorLine({ code, detail }: { code: LibraryFehler; detail?: string }) {
  const { t } = useTranslation();
  const server = useDeviceLibrary((s) => s.server);
  return (
    <p className="mt-2 text-xs text-bc-red" role="alert">
      {libraryErrorText(t, code)}
      {detail ? ` (${detail})` : ''}
      {code === 'guidelines-outdated' && (
        <>
          {' '}
          <a href={guidelinesUrl(server)} target="_blank" rel="noopener noreferrer" className="text-bc-accent hover:underline">
            {t('library.error.guidelinesOpen', 'Open the guidelines')}
          </a>
        </>
      )}
    </p>
  );
}
