import { FiChevronRight } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../i18n';
import type { ShowLightMood, ShowLightSettings } from '../../types';
import { SHOW_LICHT_STANDARD, showLichtAus } from '../../utils/showRig';
import Regler from '../ui/Regler';

const chip = (an: boolean) =>
  `rounded-bc-full px-2.5 py-0.5 text-[11px] font-medium ${an ? 'bg-bc-accent-soft text-bc-text-bright' : 'bg-bc-panel-raised text-bc-muted hover:text-bc-text'}`;

/**
 * Showlicht der Halle einstellen. Die Lampen entstehen aus den Buehnen; hier
 * stehen nur Helligkeit, Farbe, Dunst und Art der Scheinwerfer. Die Werte
 * liegen im Projekt und gelten in 3D-Ansicht, Vorschau und Multiview.
 */
export default function ShowLichtEinstellung() {
  const { t } = useTranslation();
  const roh = useStore((s) => s.venue.showLight);
  const e = showLichtAus(roh);
  const setze = (patch: Partial<ShowLightSettings>) => {
    const { venue, setVenue } = useStore.getState();
    setVenue({ ...venue, showLight: { ...showLichtAus(venue.showLight), ...patch } });
  };
  const zuruecksetzen = () => {
    const { venue, setVenue } = useStore.getState();
    const rest = { ...venue };
    delete rest.showLight;
    setVenue(rest);
  };
  const stimmungen: [ShowLightMood, string][] = [
    ['white', t('venue.showLight.mood.white', 'White')],
    ['warm', t('venue.showLight.mood.warm', 'Warm')],
    ['blueMagenta', t('venue.showLight.mood.blueMagenta', 'Blue / magenta')],
    ['concert', t('venue.showLight.mood.concert', 'Concert colours')],
    ['custom', t('venue.showLight.mood.custom', 'Own colour')],
  ];

  return (
    <details className="group px-3 pb-2 text-[11px]">
      <summary title={t('venue.showLight.hint', 'The lights are generated from your stages — adjust them here.')} className="flex cursor-pointer list-none items-center gap-1.5 rounded-bc-s py-1 text-bc-text hover:text-bc-text-bright">
        <FiChevronRight size={12} className="transition-transform group-open:rotate-90" aria-hidden />
        {t('venue.showLight.adjust', 'Adjust show light')}
      </summary>
      <div className="space-y-2 pt-1">
        <p className="text-bc-muted">{t('venue.showLight.hint', 'The lights are generated from your stages — adjust them here.')}</p>

        <div className="flex flex-wrap gap-1" role="group" aria-label={t('venue.showLight.mood', 'Colour')}>
          {stimmungen.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={e.mood === m} onClick={() => setze({ mood: m })} className={chip(e.mood === m)}>
              {label}
            </button>
          ))}
          {e.mood === 'custom' && (
            <input
              type="color"
              value={e.color}
              onChange={(ev) => setze({ color: ev.target.value })}
              aria-label={t('venue.showLight.color', 'Beam colour')}
              className="h-6 w-8 cursor-pointer rounded-bc-s border border-bc-border bg-bc-panel-raised"
            />
          )}
        </div>

        <Regler
          label={t('venue.showLight.brightness', 'Brightness')}
          value={Math.round(e.brightness * 100)}
          min={25}
          max={200}
          schritt={5}
          standard={100}
          raster={[50, 100, 150]}
          marken={[25, 100, 200]}
          formatMarke={(v) => `${v}`}
          format={(v) => `${v} %`}
          einheit="%"
          onChange={(v) => setze({ brightness: v / 100 })}
        />

        <Regler
          label={t('venue.showLight.haze', 'Haze')}
          value={Math.round(e.haze * 100)}
          min={0}
          max={100}
          schritt={5}
          standard={50}
          marken={[0, 50, 100]}
          formatMarke={(v) => `${v}`}
          format={(v) => `${v} %`}
          einheit="%"
          onChange={(v) => setze({ haze: v / 100 })}
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-bc-muted">{t('venue.showLight.fixtures', 'Fixtures')}</span>
          <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('venue.showLight.fixtures', 'Fixtures')}>
            {([
              ['both', t('venue.showLight.fixtures.both', 'Wash + beams')],
              ['wash', t('venue.showLight.fixtures.wash', 'Wash')],
              ['beams', t('venue.showLight.fixtures.beams', 'Beams')],
            ] as [ShowLightSettings['fixtures'], string][]).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={e.fixtures === v} onClick={() => setze({ fixtures: v })} className="px-2.5 text-[11px] font-medium">
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-bc-muted">{t('venue.showLight.amount', 'Amount')}</span>
          <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('venue.showLight.amount', 'Amount')}>
            {([
              ['few', t('venue.showLight.amount.few', 'Few')],
              ['normal', t('venue.showLight.amount.normal', 'Normal')],
              ['many', t('venue.showLight.amount.many', 'Many')],
            ] as [ShowLightSettings['amount'], string][]).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={e.amount === v} onClick={() => setze({ amount: v })} className="px-2.5 text-[11px] font-medium">
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-bc-text">
          <input type="checkbox" checked={e.aimAtStage} disabled={e.fixtures === 'wash'} onChange={(ev) => setze({ aimAtStage: ev.target.checked })} />
          {t('venue.showLight.aim', 'Point beams at the stage')}
        </label>

        {roh && JSON.stringify(e) !== JSON.stringify(SHOW_LICHT_STANDARD) && (
          <button type="button" onClick={zuruecksetzen} className="text-bc-accent-text hover:underline">
            {t('venue.showLight.reset', 'Reset to defaults')}
          </button>
        )}
      </div>
    </details>
  );
}
