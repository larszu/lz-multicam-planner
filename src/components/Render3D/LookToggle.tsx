import { FiLoader } from 'react-icons/fi';
import { useTranslation } from '../../i18n';
import type { KameraLook } from './kameraBild3d';

/**
 * Umschalter gerendertes Bild (Standard) ↔ einfache 2D-Zeichnung, fuer
 * Vorschau und Multiview (#167, #168). `laedt`: die 3D-Szene ist noch nicht
 * fertig — bis dahin steht die einfache Zeichnung da.
 */
export default function LookToggle({ value, onChange, laedt }: { value: KameraLook; onChange: (v: KameraLook) => void; laedt: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1">
      <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('look.group', 'Picture')}>
      {([
        ['rendered', t('look.rendered', '3D'), t('look.rendered.title', 'Rendered through the 3D scene, like the camera would see it')],
        ['simple', t('look.simple', 'Simple'), t('look.simple.title', 'Simple drawing — fast, with outlines and labels')],
      ] as [KameraLook, string, string][]).map(([v, label, title]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          title={title}
          className="px-3 text-[11px] font-medium"
        >
          {label}
        </button>
      ))}
      </div>
      {value === 'rendered' && laedt && (
        <FiLoader size={12} className="animate-spin motion-reduce:animate-none text-bc-dim" aria-label={t('look.loading', 'Loading 3D scene…')} />
      )}
    </div>
  );
}
