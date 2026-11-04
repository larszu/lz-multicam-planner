import { lazy, Suspense, useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiDownload, FiSmartphone } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { libraryLenses } from '../../library/registry';
import { useTranslation } from '../../i18n';
import type { Camera, Lens, SensorSize, VenueCamera } from '../../types';
import { blaettern, bildMitSchild, kompatibleObjektive, objektivSet, objektivWechsel, sucherZeilen } from '../../utils/sucherSchild';
import { dateinameTeil, pngSpeichern } from '../../utils/multiviewWand';
import { kontrastText } from '../../utils/color';

const HandySucherDialog = lazy(() => import('../HandySucher/HandySucherDialog'));

const KNOPF = 'grid h-9 w-9 shrink-0 place-items-center rounded-bc-full text-bc-on-media hover:bg-bc-scrim disabled:opacity-30';

/**
 * Sucher-Schild unter dem Kamerablick (#224): Kamera, Format, Blende, Crop,
 * Objektiv und Brennweite — und ‹ › durch die Objektive des Sets, der
 * Ausschnitt wechselt mit.
 */
export default function SucherSchild({ cam, camDef, lensDef, sensor, nummer, maxBreite, bild }: {
  cam: VenueCamera;
  camDef: Camera;
  lensDef: Lens;
  sensor: SensorSize;
  nummer: number;
  maxBreite?: number;
  bild: () => HTMLCanvasElement | null;
}) {
  const { t } = useTranslation();
  const customLenses = useStore((s) => s.customLenses);
  const favoriten = useStore((s) => s.favoriteLensIds);
  const set = useMemo(
    () => objektivSet(kompatibleObjektive(camDef, cam.activeMount, customLenses, libraryLenses()), favoriten, cam.lensId),
    [camDef, cam.activeMount, cam.lensId, customLenses, favoriten],
  );
  const zeilen = sucherZeilen(camDef, lensDef, sensor, cam);
  const position = set.findIndex((l) => l.id === cam.lensId);

  const wechseln = (richtung: 1 | -1) => {
    const naechstes = blaettern(set, cam.lensId, richtung);
    if (naechstes) useStore.getState().updateCamera(cam.id, objektivWechsel(cam, naechstes, camDef.mount));
  };
  const speichern = () => {
    const quelle = bild();
    if (!quelle || quelle.width === 0) return;
    const out = bildMitSchild(quelle, zeilen, { nummer, label: cam.label, farbe: cam.color });
    pngSpeichern(out, `sucher_${dateinameTeil(cam.label)}_${dateinameTeil(lensDef.model)}_${Math.round(cam.focalLength)}mm.png`);
  };
  const kannBlaettern = set.length > 1;
  const [handy, setHandy] = useState(false);

  return (
    <div className="mx-auto -mt-2 flex w-full items-center gap-2 rounded-bc-l bg-bc-media px-2 py-1.5 text-bc-on-media" style={{ maxWidth: maxBreite }} aria-label={t('preview.viewfinder', 'Viewfinder label')}>
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-bc-full text-xs font-bold"
        style={{ background: cam.color, color: kontrastText(cam.color) }}
      >
        {nummer}
      </span>
      <button type="button" onClick={() => wechseln(-1)} disabled={!kannBlaettern} className={KNOPF} aria-label={t('preview.lensPrev', 'Previous lens')} title={t('preview.lensPrev', 'Previous lens')}>
        <FiChevronLeft size={18} />
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold">{zeilen.objektiv}</div>
        <div className="truncate font-mono text-[11px] opacity-80">{zeilen.kamera}</div>
      </div>
      {kannBlaettern && (
        <span className="hidden shrink-0 text-[11px] tabular-nums opacity-70 sm:inline" title={t('preview.lensSetHint', 'Lenses that fit this camera — only your favourites when you have marked at least two')}>
          {position + 1}/{set.length}
        </span>
      )}
      <button type="button" onClick={() => wechseln(1)} disabled={!kannBlaettern} className={KNOPF} aria-label={t('preview.lensNext', 'Next lens')} title={t('preview.lensNext', 'Next lens')}>
        <FiChevronRight size={18} />
      </button>
      <button type="button" onClick={speichern} className={KNOPF} aria-label={t('preview.saveFrame', 'Save picture with label (PNG)')} title={t('preview.saveFrame', 'Save picture with label (PNG)')}>
        <FiDownload size={16} />
      </button>
      <button type="button" onClick={() => setHandy(true)} className={KNOPF} aria-label={t('handy.open', 'Phone as viewfinder')} title={t('handy.open', 'Phone as viewfinder')}>
        <FiSmartphone size={16} />
      </button>
      {handy && (
        <Suspense fallback={null}>
          <HandySucherDialog camId={cam.id} onClose={() => setHandy(false)} />
        </Suspense>
      )}
    </div>
  );
}
