import { useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { ORTE, WETTER, type OrtArt, type WetterArt } from '../../avplan/scene3d';
import { himmelTag, uhrzeit, zeitMarken, type HimmelPrefs } from '../../utils/tageslicht';

const feld = 'w-full border border-bc-border bg-bc-panel-raised px-2 py-1 text-bc-text-bright';
const TAG_MIN = 1440;

/** Datum, Uhrzeit, Ort, Nordrichtung und Wetter fuer den Look „Tageslicht". */
export default function TageslichtEinstellung({ sky, onSky }: { sky: HimmelPrefs; onSky: (patch: Partial<HimmelPrefs>) => void }) {
  const { t } = useTranslation();
  const marken = useMemo(() => zeitMarken(sky), [sky]);
  const tag = himmelTag(sky);
  const datumWert = `${tag.getFullYear()}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`;
  const wetterName: Record<WetterArt, string> = {
    klar: t('venue.sky.weather.clear', 'Clear'),
    'leicht-bewoelkt': t('venue.sky.weather.partly', 'Partly cloudy'),
    bedeckt: t('venue.sky.weather.overcast', 'Overcast'),
    dunst: t('venue.sky.weather.haze', 'Haze'),
  };
  const prozent = (m: number) => `${(Math.max(0, Math.min(TAG_MIN, m)) / TAG_MIN) * 100}%`;

  return (
    <div className="space-y-2 px-3 pb-2 text-[11px]">
      <label className="block">
        <span className="flex items-baseline justify-between text-bc-muted">
          <span>{t('venue.sky.time', 'Time of day')}</span>
          <span className="text-[13px] font-semibold text-bc-text-bright tabular-nums">{uhrzeit(sky.minuten)}</span>
        </span>
        {/* Goldene und blaue Stunde als Baender hinter dem Regler, Auf- und Untergang als Striche. */}
        <span className="relative mt-1 block h-2" aria-hidden>
          {marken.blau.map(([a, b], i) => (
            <span key={`b${i}`} className="absolute inset-y-0 rounded-bc-full bg-bc-accent/50" style={{ left: prozent(a), width: `calc(${prozent(b)} - ${prozent(a)})` }} />
          ))}
          {marken.gold.map(([a, b], i) => (
            <span key={`g${i}`} className="absolute inset-y-0 rounded-bc-full bg-bc-yellow/70" style={{ left: prozent(a), width: `calc(${prozent(b)} - ${prozent(a)})` }} />
          ))}
          {[marken.aufgang, marken.untergang].map((m, i) => m !== null && (
            <span key={`s${i}`} className="absolute -inset-y-0.5 w-0.5 bg-bc-text-bright" style={{ left: prozent(m) }} />
          ))}
        </span>
        <input
          type="range"
          min={0}
          max={TAG_MIN - 5}
          step={5}
          value={sky.minuten}
          onChange={(e) => onSky({ minuten: Number(e.target.value) })}
          aria-valuetext={uhrzeit(sky.minuten)}
          className="w-full"
        />
        <span className="flex justify-between text-bc-muted tabular-nums">
          <span>{marken.aufgang !== null ? `${t('venue.sky.sunrise', 'Sunrise')} ${uhrzeit(marken.aufgang)}` : ''}</span>
          <span>{marken.untergang !== null ? `${t('venue.sky.sunset', 'Sunset')} ${uhrzeit(marken.untergang)}` : ''}</span>
        </span>
        <span className="flex gap-3 text-bc-muted">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-bc-full bg-bc-yellow" aria-hidden />{t('venue.sky.golden', 'Golden hour')}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-bc-full bg-bc-accent" aria-hidden />{t('venue.sky.blue', 'Blue hour')}</span>
        </span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="text-bc-muted">{t('venue.sky.date', 'Date')}</span>
          <input type="date" className={feld} value={datumWert} onChange={(e) => onSky({ datum: e.target.value })} />
        </label>
        <label>
          <span className="text-bc-muted">{t('venue.sky.weather', 'Weather')}</span>
          <select className={feld} value={sky.wetter} onChange={(e) => onSky({ wetter: e.target.value as WetterArt })}>
            {(Object.keys(WETTER) as WetterArt[]).map((w) => <option key={w} value={w}>{wetterName[w]}</option>)}
          </select>
        </label>
        <label>
          <span className="text-bc-muted">{t('venue.sky.place', 'Place')}</span>
          <select
            className={feld}
            value={sky.ort}
            onChange={(e) => {
              const ort = e.target.value as OrtArt | 'eigen';
              onSky(ort === 'eigen' ? { ort } : { ort, lat: ORTE[ort].lat, lon: ORTE[ort].lon });
            }}
          >
            {(Object.keys(ORTE) as OrtArt[]).map((o) => <option key={o} value={o}>{ORTE[o].name}</option>)}
            <option value="eigen">{t('venue.sky.place.custom', 'Coordinates')}</option>
          </select>
        </label>
        <label title={t('venue.sky.north.title', 'Where north points in the floor plan, clockwise from the top edge (90° = right)')}>
          <span className="text-bc-muted">{t('venue.sky.north', 'North (°)')}</span>
          <input
            type="number"
            className={`${feld} tabular-nums`}
            min={0}
            max={359}
            step={15}
            value={sky.nordDeg}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onSky({ nordDeg: ((v % 360) + 360) % 360 });
            }}
          />
        </label>
        {sky.ort === 'eigen' && (
          <>
            <label>
              <span className="text-bc-muted">{t('venue.sky.lat', 'Latitude')}</span>
              <input type="number" className={`${feld} tabular-nums`} min={-90} max={90} step={0.01} value={sky.lat}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onSky({ lat: Math.max(-90, Math.min(90, v)) }); }} />
            </label>
            <label>
              <span className="text-bc-muted">{t('venue.sky.lon', 'Longitude')}</span>
              <input type="number" className={`${feld} tabular-nums`} min={-180} max={180} step={0.01} value={sky.lon}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onSky({ lon: Math.max(-180, Math.min(180, v)) }); }} />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
