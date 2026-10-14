import { FiChevronRight, FiChevronLeft } from 'react-icons/fi';
import type { VenueCamera } from '../../types';
import { useTranslation } from '../../i18n';
import type { View3DPrefs, View3DQuality } from './view3dPrefs';
import type { Stufe } from '../../avplan/scene3d';

export interface CameraRow {
  cam: VenueCamera;
  number: number;
  /** „ARRI ALEXA 35 · 25–1000 mm @ 53 mm · Tripod" */
  detail: string;
  hFovDeg: number | null;
}

type ToggleKey = 'coverage' | 'labels' | 'audience' | 'showLight' | 'videoBoard' | 'floorPlan';

/**
 * Kameraliste rechts in der 3D-Ansicht. Ein Klick faehrt die Ansicht in den
 * Blick dieser Kamera — die Liste ist der schnellste Weg von „wo steht sie"
 * zu „was sieht sie".
 */
export default function CameraListPanel({
  rows, selectedId, programId, povId, prefs, onPrefs, onPick, hasFloorPlan, hasRoomWalls, stufe,
}: {
  /** Der Raum hat eigene Videowaende — dann gibt es nichts anzudeuten. */
  hasRoomWalls: boolean;
  /** Wirksame Stufe — bei Auto die, auf die gesenkt wurde. */
  stufe: Stufe;
  rows: CameraRow[];
  selectedId: string | null;
  programId: string | null;
  povId: string | null;
  prefs: View3DPrefs;
  onPrefs: (patch: Partial<View3DPrefs>) => void;
  onPick: (id: string) => void;
  hasFloorPlan: boolean;
}) {
  const { t } = useTranslation();

  if (!prefs.listOpen) {
    return (
      <button
        type="button"
        onClick={() => onPrefs({ listOpen: true })}
        className="h-full w-7 shrink-0 flex flex-col items-center gap-2 pt-2 bg-bc-panel border-l border-bc-border text-bc-dim hover:text-bc-text-bright hover:bg-bc-hover"
        title={t('venue.list.open', 'Show camera list')}
        aria-label={t('venue.list.open', 'Show camera list')}
      >
        <FiChevronLeft size={14} />
        <span className="text-[11px] font-semibold [writing-mode:vertical-rl]">{t('venue.list.title', 'Cameras')}</span>
      </button>
    );
  }

  const toggles: { key: ToggleKey; label: string; disabled?: boolean; why?: string }[] = [
    { key: 'coverage', label: t('venue.toggle.coverage', 'Coverage') },
    { key: 'labels', label: t('venue.toggle.labels', 'Labels') },
    { key: 'audience', label: t('venue.toggle.audience', 'Audience') },
    { key: 'showLight', label: t('venue.toggle.showLight', 'Show light'), disabled: prefs.quality === 'simple', why: t('venue.toggle.showLightSimple', 'Not in the simple view') },
    { key: 'videoBoard', label: t('venue.toggle.videoBoard', 'Video wall'), disabled: hasRoomWalls, why: t('venue.toggle.videoBoardRoom', 'The room has its own video walls (sidebar, Room)') },
    { key: 'floorPlan', label: t('venue.toggle.floorPlan', 'Floor plan'), disabled: !hasFloorPlan, why: t('venue.toggle.floorPlanNone', 'No floor plan loaded') },
  ];

  return (
    <aside className="h-full w-[300px] max-w-[45%] shrink-0 flex flex-col bg-bc-panel border-l border-bc-border text-bc-text">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="text-sm font-semibold text-bc-text-bright">{t('venue.list.title', 'Cameras')}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onPrefs({ listOpen: false })}
          className="grid place-items-center rounded-bc-full p-1 text-bc-dim hover:text-bc-text-bright hover:bg-bc-hover"
          title={t('venue.list.close', 'Hide camera list')}
          aria-label={t('venue.list.close', 'Hide camera list')}
        >
          <FiChevronRight size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 px-3 pb-2" role="group" aria-label={t('venue.toggle.group', 'Show in 3D')}>
        {toggles.map(({ key, label, disabled, why }) => {
          const on = prefs[key] && !disabled;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onPrefs({ [key]: !prefs[key] } as Partial<View3DPrefs>)}
              className={`rounded-bc-full px-3 py-0.5 text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-bc-accent-soft text-bc-text-bright' : 'bg-bc-panel-raised text-bc-muted hover:text-bc-text'}`}
              title={disabled ? why : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-3 pb-2">
        <span className="text-[11px] text-bc-muted">{t('venue.quality.label', 'Quality')}</span>
        <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('venue.quality.label', 'Quality')}>
          {([
            ['auto', t('venue.quality.auto', 'Auto')],
            ['high', t('venue.quality.high', 'High')],
            ['low', t('venue.quality.low', 'Low')],
            ['simple', t('venue.quality.simple', 'Simple')],
          ] as [View3DQuality, string][]).map(([q, label]) => (
            <button
              key={q}
              type="button"
              aria-pressed={prefs.quality === q}
              onClick={() => onPrefs({ quality: q })}
              title={q === 'simple' ? t('venue.quality.simple.title', 'Simple 3D view: no lighting effects or shadows — fast on any computer') : undefined}
              className="px-3 text-[11px] font-medium"
            >
              {label}
            </button>
          ))}
        </div>
        {prefs.quality === 'auto' && stufe === 'low' && (
          <span className="text-[11px] text-bc-muted" title={t('venue.quality.lowered.title', 'The frame rate was too low, so the view switched to the faster setting.')}>
            {t('venue.quality.lowered', 'lowered')}
          </span>
        )}
      </div>

      <p className="px-3 pb-1 text-[11px] text-bc-muted">{t('venue.list.hint', 'Click a camera for its view')}</p>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {rows.length === 0 && (
          <li className="px-3 py-3 text-xs text-bc-dim">{t('venue.list.empty', 'No cameras yet — add one in the sidebar.')}</li>
        )}
        {rows.map(({ cam, number, detail, hFovDeg }) => {
          const selected = cam.id === selectedId;
          const program = cam.id === programId;
          return (
            <li key={cam.id}>
              <button
                type="button"
                onClick={() => onPick(cam.id)}
                aria-current={cam.id === povId ? 'true' : undefined}
                className={`w-full flex items-start gap-2 rounded-bc-m px-2.5 py-1.5 text-left ${selected ? 'bg-bc-accent-soft' : 'hover:bg-bc-hover'}`}
              >
                <span
                  className="mt-0.5 w-6 h-6 shrink-0 flex items-center justify-center rounded-bc-s text-[11px] font-bold text-bc-on-media"
                  style={{ background: cam.color }}
                >
                  {number}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-bc-text-bright truncate">{cam.label}</span>
                    {program && <span className="px-1 text-[10px] font-bold bg-bc-signal text-bc-on-media">PGM</span>}
                    {selected && !program && programId && <span className="px-1 text-[10px] font-bold border border-bc-green text-bc-text-bright">PVW</span>}
                  </span>
                  <span className="block text-[11px] text-bc-muted leading-snug">{detail}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-[13px] font-semibold text-bc-text-bright">{hFovDeg !== null ? `${hFovDeg.toFixed(1)}°` : '–'}</span>
                  <span className="block text-[10px] text-bc-muted">{t('venue.list.hfov', 'H FOV')}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
