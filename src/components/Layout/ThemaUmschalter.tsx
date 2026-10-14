// Auto · Hell · Dunkel als Segment im Kopf (Design-Vertrag 2026-10: der
// Umschalter ist SICHTBAR, nicht nur in den Einstellungen). Dieselbe Wahl
// wie dort — beide hoeren auf `THEMA_EVENT`.
import { useEffect, useState } from 'react';
import { FiMonitor, FiMoon, FiSun } from 'react-icons/fi';
import { liesThema, setzeThema, THEMA_EVENT, type Thema } from '../../lib/thema';
import { useTranslation } from '../../i18n';

export default function ThemaUmschalter() {
  const { t } = useTranslation();
  const [thema, setThema] = useState<Thema>(liesThema);
  useEffect(() => {
    const neu = (e: Event) => setThema((e as CustomEvent<Thema>).detail ?? liesThema());
    window.addEventListener(THEMA_EVENT, neu);
    return () => window.removeEventListener(THEMA_EVENT, neu);
  }, []);
  const stellungen: { id: Thema; label: string; Icon: typeof FiSun }[] = [
    { id: 'system', label: t('settings.theme.system', 'Auto'), Icon: FiMonitor },
    { id: 'hell', label: t('settings.theme.light', 'Light'), Icon: FiSun },
    { id: 'dunkel', label: t('settings.theme.dark', 'Dark'), Icon: FiMoon },
  ];
  return (
    <div className="bc-seg bc-seg-kompakt" role="group" aria-label={t('header.theme.group', 'Appearance')}>
      {stellungen.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={thema === id}
            aria-label={label}
            title={label}
            onClick={() => setzeThema(id)}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
      ))}
    </div>
  );
}
