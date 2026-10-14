import { FiLoader } from 'react-icons/fi';

/**
 * Lade-Anzeige fuer Ansichten, die spuerbar brauchen (3D-Szene, gerenderte
 * Kamerabilder, #167). `overlay` legt sie ueber eine schon sichtbare Flaeche
 * — etwa die Zeichenflaeche, deren Szene noch Schriften und Modelle laedt.
 */
export default function LoadingIndicator({ label, overlay = false }: { label: string; overlay?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${overlay ? 'absolute inset-0 z-20 bg-bc-media/60' : 'w-full h-full'} flex flex-col items-center justify-center gap-2 text-bc-dim pointer-events-none`}
    >
      <FiLoader size={22} className="animate-spin motion-reduce:animate-none" aria-hidden />
      <span className={`text-xs font-medium ${overlay ? 'text-bc-on-media' : ''}`}>{label}</span>
    </div>
  );
}
