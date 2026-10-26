import { useTranslation } from '../../i18n';
import { useBridgeLive } from '../../store/bridgeLive';

export default function BridgeStatusText() {
  const { t } = useTranslation();
  const status = useBridgeLive((s) => s.status);
  if (status === 'connected') return <span className="text-bc-green-text">{t('bridge.status.connected', 'Bridge connected')}</span>;
  if (status === 'connecting') return <span className="text-bc-muted">{t('bridge.status.connecting', 'Connecting to bridge …')}</span>;
  if (status === 'error') return <span className="text-bc-yellow-text">{t('bridge.status.error', 'Bridge not reachable — retrying')}</span>;
  return <span className="text-bc-muted">{t('bridge.status.off', 'Bridge off')}</span>;
}
