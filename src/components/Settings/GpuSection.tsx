import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { gpuBridge, integratedWhileDiscreteAvailable, readWebglRenderer, vendorName, type MainGpuInfo, type WebglRendererInfo } from '../../utils/gpuInfo';

/**
 * Welche Grafikkarte die App gerade benutzt. Damit laesst sich pruefen, ob
 * die Wahl in den Windows-Grafikeinstellungen ankommt — vorher war das nur
 * am Ruckeln zu merken.
 */
export default function GpuSection() {
  const { t } = useTranslation();
  const [webgl] = useState<WebglRendererInfo | null>(() => {
    try { return readWebglRenderer(); } catch { return null; }
  });
  const [main, setMain] = useState<MainGpuInfo | null>(null);
  useEffect(() => {
    let aktiv = true;
    gpuBridge()?.info().then((i) => { if (aktiv) setMain(i); }).catch(() => {});
    return () => { aktiv = false; };
  }, []);

  const exe = main?.portableExecutable ?? main?.execPath ?? null;
  const warnen = integratedWhileDiscreteAvailable(webgl, main);

  return (
    <section style={{ marginTop: '24px' }}>
      <h3 className="text-sm font-semibold text-bc-text-bright">{t('settings.gpu', 'Graphics')}</h3>
      <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs" style={{ gridTemplateColumns: 'max-content minmax(0, 1fr)' }}>
        <dt className="text-bc-muted">{t('settings.gpu.renderer', 'WebGL renderer')}</dt>
        <dd className="min-w-0 break-words text-bc-text select-text">{webgl ? webgl.renderer : t('settings.gpu.noWebgl', 'WebGL not available')}</dd>
        {main && main.gpuDevice.length > 0 && (<>
          <dt className="text-bc-muted">{t('settings.gpu.devices', 'Graphics cards')}</dt>
          <dd className="min-w-0 text-bc-text">
            {main.gpuDevice.map((d, i) => (
              <span key={i} className="block break-words">
                {d.deviceString ?? `${vendorName(d.vendorId)} 0x${d.deviceId.toString(16).padStart(4, '0')}`}
                {d.active && <span className="text-bc-accent"> · {t('settings.gpu.active', 'in use')}</span>}
              </span>
            ))}
          </dd>
        </>)}
        {main?.platform === 'win32' && exe && (<>
          <dt className="text-bc-muted">{t('settings.gpu.exe', 'Program file')}</dt>
          <dd className="min-w-0 break-all text-bc-text select-text">{exe}</dd>
        </>)}
      </dl>
      {warnen && (
        <p role="status" className="mt-2 rounded-bc-m bg-bc-yellow/15 text-xs text-bc-yellow-text" style={{ padding: '8px 10px' }}>
          {t('settings.gpu.integratedHint', 'The app is running on the integrated graphics although a dedicated card is installed. In Windows Settings → System → Display → Graphics, set the program file above to “High performance” and restart the app. The portable version runs from a temporary folder — use the installer for a lasting setting.')}
        </p>
      )}
    </section>
  );
}
