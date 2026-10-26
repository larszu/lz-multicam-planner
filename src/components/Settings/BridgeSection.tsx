import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { BRIDGE_DEFAULT_URL, useBridgeLive } from '../../store/bridgeLive';
import BridgeStatusText from '../Bridge/BridgeStatusText';

const feld = 'block w-full border border-bc-border bg-bc-panel-raised text-xs text-bc-text-bright';
const kopf = 'text-sm font-semibold text-bc-text-bright';

export default function BridgeSection() {
  const { t } = useTranslation();
  const { enabled, url, setEnabled, setUrl } = useBridgeLive();
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
    </div>
  );
}
