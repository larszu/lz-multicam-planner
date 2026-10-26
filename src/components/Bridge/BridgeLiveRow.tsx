import { useTranslation, format } from '../../i18n';
import type { VenueCamera } from '../../types';
import { useStore } from '../../store/useStore';
import { optikOf, useBridgeLive } from '../../store/bridgeLive';
import { bridgeNumberFor, liveUpdates } from '../../utils/bridgeLive';

/** Live-Kennzeichen, „Apply" und Bridge-Nummer einer Planer-Kamera. */
export default function BridgeLiveRow({ cam, expanded }: { cam: VenueCamera; expanded: boolean }) {
  const { t } = useTranslation();
  const cameras = useStore((s) => s.cameras);
  const updateCamera = useStore((s) => s.updateCamera);
  const index = cameras.findIndex((c) => c.id === cam.id);
  const nummer = bridgeNumberFor(cam, index);
  const enabled = useBridgeLive((s) => s.enabled);
  const live = useBridgeLive((s) => (s.status === 'connected' ? s.live[nummer] : undefined));
  const amPult = useBridgeLive((s) => s.status === 'connected' && s.surfaceCameraNumber === nummer);
  if (!enabled) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ paddingLeft: '4px' }}>
      {live && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-bc-red-text" role="status">
          ● {t('bridge.live', 'Live')}
        </span>
      )}
      {amPult && <span className="text-bc-accent">{t('bridge.onPanel', 'On panel')}</span>}
      {live && (
        <button
          type="button"
          className="bc-btn-soft text-xs"
          style={{ padding: '2px 8px' }}
          onClick={() => updateCamera(cam.id, liveUpdates(cam, live, optikOf(cam)))}
          title={t('bridge.apply.title', 'Write the live pan, tilt and focal length into the plan')}
        >
          {t('bridge.apply', 'Apply')}
        </button>
      )}
      {expanded && (
        <label className="ml-auto flex items-center gap-1 text-bc-muted">
          {t('bridge.number', 'Bridge camera')}
          <input
            type="number"
            min={1}
            className="w-14 border border-bc-border bg-bc-panel-raised text-bc-text-bright"
            style={{ padding: '2px 4px' }}
            value={cam.bridgeCameraNumber ?? ''}
            placeholder={String(nummer)}
            aria-label={format(t('bridge.number.aria', 'Bridge camera number for {name}'), { name: cam.label })}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              updateCamera(cam.id, { bridgeCameraNumber: n > 0 ? n : undefined });
            }}
          />
        </label>
      )}
    </div>
  );
}
