import { useState } from 'react';
import { useTranslation, format } from '../../i18n';
import { BRIDGE_DEFAULT_URL, useBridgeLive } from '../../store/bridgeLive';
import BridgeStatusText from '../Bridge/BridgeStatusText';

const feld = 'block w-full border border-bc-border bg-bc-panel-raised text-xs text-bc-text-bright';
const kopf = 'text-sm font-semibold text-bc-text-bright';

export default function BridgeSection() {
  const { t } = useTranslation();
  const { enabled, url, setEnabled, setUrl, mixerNumber, setMixerNumber } = useBridgeLive();
  const [entwurf, setEntwurf] = useState(url);
  const uebernehmen = () => setUrl(entwurf.trim() || BRIDGE_DEFAULT_URL);

  return (
    <div>
      <section>
        <h3 className={kopf}>{t('settings.bridge.title', 'Live from LZ Camera Bridge')}</h3>
        <p className="mt-1 text-xs text-bc-muted">
          {t(
            'settings.bridge.desc',
            'Pan, tilt and zoom reported by the bridge (for example from a control panel joystick) move the planned cameras in 2D and 3D. The plan only changes when you click "Apply" on a camera.',
          )}
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-bc-text">
          <input type="checkbox" className="accent-bc-accent" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('settings.bridge.enable', 'Connect to the bridge')}
        </label>
        <p className="mt-2 text-xs"><BridgeStatusText /></p>
      </section>
      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('settings.bridge.url', 'Address')}</h3>
        <input
          type="text"
          className={`${feld} mt-2`}
          style={{ padding: '6px 8px' }}
          value={entwurf}
          placeholder={BRIDGE_DEFAULT_URL}
          onChange={(e) => setEntwurf(e.target.value)}
          onBlur={uebernehmen}
          onKeyDown={(e) => { if (e.key === 'Enter') uebernehmen(); }}
          spellCheck={false}
          aria-label={t('settings.bridge.url', 'Address')}
        />
        <p className="mt-1 text-xs text-bc-muted">
          {t('settings.bridge.mapping', 'Each planned camera follows the bridge camera with the number in its name (CAM 2 → 2). A different number can be set on the camera.')}
        </p>
      </section>
      <section style={{ marginTop: '24px' }}>
        <h3 className={kopf}>{t('settings.bridge.mixer', 'Multiview follows a bridge mixer')}</h3>
        <select
          className={`${feld} mt-2`}
          style={{ padding: '6px 8px' }}
          value={mixerNumber ?? 0}
          onChange={(e) => setMixerNumber(Number(e.target.value) || null)}
          aria-label={t('settings.bridge.mixer', 'Multiview follows a bridge mixer')}
        >
          <option value={0}>{t('settings.bridge.mixer.off', 'No – the planner switches on its own')}</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>{format(t('settings.bridge.mixer.n', 'Mixer {n}'), { n })}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-bc-muted">
          {t(
            'settings.bridge.mixer.desc',
            'Program and preview come from that mixer in the bridge – for example its virtual mixer, switched from a control panel. A cut in the planner goes back to the bridge, so tally and panel buttons stay right. Input n is the camera with bridge number n.',
          )}
        </p>
      </section>
    </div>
  );
}
