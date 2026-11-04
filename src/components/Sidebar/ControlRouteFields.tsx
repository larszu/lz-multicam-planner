import type { ControlRoute, ControlRouteVia, SerialBridgePlan, VenueCamera } from '../../types';
import { useTranslation } from '../../i18n';
import { BRIDGE_MODES, CONTROL_ROUTE_VIAS, SERIAL_INTERFACES, bridgeLine, lineDefaultsFor, routeFindings, type RouteFinding } from '../../utils/steuerweg';
import { Note } from './fields';

const feldCls = 'block w-full border border-bc-border bg-bc-panel-raised px-1.5 py-1 text-xs text-bc-text-bright';

/** #164 — wie die Befehle zur Kamera kommen. */
export default function ControlRouteFields({
  cam,
  onChange,
}: {
  cam: Pick<VenueCamera, 'id' | 'controlPath' | 'controlRoute'>;
  onChange: (route: ControlRoute | undefined) => void;
}) {
  const { t } = useTranslation();
  const route = cam.controlRoute;
  const bridge = route?.bridge ?? {};
  const setBridge = (patch: Partial<SerialBridgePlan>) => {
    const next = Object.fromEntries(Object.entries({ ...bridge, ...patch }).filter(([, v]) => v !== undefined && v !== '')) as SerialBridgePlan;
    onChange({ ...(route ?? { via: 'serial-bridge' }), bridge: next });
  };
  const zahl = (v: string) => {
    const n = Number(v);
    return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
  };
  const viaLabel: Record<ControlRouteVia, string> = {
    direct: t('route.via.direct', 'Direct (network or own port)'),
    'robotic-head': t('route.via.head', 'Through a robotic head'),
    'serial-bridge': t('route.via.bridge', 'Through a network-serial bridge'),
  };
  const findingLabel: Record<RouteFinding, string> = {
    'serial-path-direct': t('route.finding.serialDirect', 'This protocol runs on a serial line — plan a serial port or a bridge.'),
    'network-path-on-bridge': t('route.finding.networkOnBridge', 'This protocol is network-native — a serial bridge is not needed.'),
    'bridge-incomplete': t('route.finding.bridgeIncomplete', 'Bridge needs interface, baud rate and port.'),
    'head-unnamed': t('route.finding.headUnnamed', 'Name the robotic head that tunnels the camera commands.'),
  };
  const defaults = lineDefaultsFor(cam.controlPath);
  const line = bridgeLine(route?.bridge);

  return (
    <div className="flex flex-col gap-1.5">
      <select
        className={feldCls}
        aria-label={t('route.via.aria', 'Control route of this position')}
        value={route?.via ?? ''}
        onChange={(e) => {
          const via = e.target.value as ControlRouteVia | '';
          onChange(via ? { ...route, via } : undefined);
        }}
      >
        <option value="">{t('route.unstated', 'Route not stated')}</option>
        {CONTROL_ROUTE_VIAS.map((v) => (
          <option key={v} value={v}>{viaLabel[v]}</option>
        ))}
      </select>

      {route?.via === 'robotic-head' && (
        <input
          className={feldCls}
          placeholder={t('route.headPh', 'Robotic head (model / inventory name)')}
          aria-label={t('route.head.aria', 'Robotic head')}
          value={route.head ?? ''}
          onChange={(e) => onChange({ ...route, head: e.target.value || undefined })}
        />
      )}

      {(route?.via === 'serial-bridge' || route?.via === 'robotic-head') && (
        <>
          <input
            className={feldCls}
            placeholder={t('route.devicePh', 'Bridge device (model / inventory name)')}
            aria-label={t('route.device.aria', 'Bridge device')}
            value={bridge.device ?? ''}
            onChange={(e) => setBridge({ device: e.target.value || undefined })}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <select className={feldCls} aria-label={t('route.serial.aria', 'Serial interface')} value={bridge.serial ?? ''}
              onChange={(e) => setBridge({ serial: (e.target.value || undefined) as SerialBridgePlan['serial'] })}>
              <option value="">{t('route.serialPh', 'Interface')}</option>
              {SERIAL_INTERFACES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className={feldCls} type="number" min={1} placeholder={t('route.baudPh', 'Baud')} aria-label={t('route.baud.aria', 'Baud rate')}
              value={bridge.baud ?? ''} onChange={(e) => setBridge({ baud: zahl(e.target.value) })} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <select className={feldCls} aria-label={t('route.dataBits.aria', 'Data bits')} value={bridge.dataBits ?? 8}
              onChange={(e) => setBridge({ dataBits: Number(e.target.value) as 7 | 8 })}>
              <option value={8}>8</option>
              <option value={7}>7</option>
            </select>
            <select className={feldCls} aria-label={t('route.parity.aria', 'Parity')} value={bridge.parity ?? 'none'}
              onChange={(e) => setBridge({ parity: e.target.value as SerialBridgePlan['parity'] })}>
              <option value="none">{t('route.parity.none', 'No parity')}</option>
              <option value="even">{t('route.parity.even', 'Even')}</option>
              <option value="odd">{t('route.parity.odd', 'Odd')}</option>
            </select>
            <select className={feldCls} aria-label={t('route.stopBits.aria', 'Stop bits')} value={bridge.stopBits ?? 1}
              onChange={(e) => setBridge({ stopBits: Number(e.target.value) as 1 | 2 })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select className={feldCls} aria-label={t('route.mode.aria', 'Bridge operating mode')} value={bridge.mode ?? ''}
              onChange={(e) => setBridge({ mode: (e.target.value || undefined) as SerialBridgePlan['mode'] })}>
              <option value="">{t('route.modePh', 'Mode')}</option>
              {BRIDGE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input className={feldCls} type="number" min={1} max={65535} placeholder={t('route.portPh', 'Port')} aria-label={t('route.port.aria', 'Bridge port')}
              value={bridge.port ?? ''} onChange={(e) => setBridge({ port: zahl(e.target.value) })} />
          </div>
          <input
            className={feldCls}
            placeholder={t('route.pinoutPh', 'Pinout (e.g. RJ45: 3 RX−, 6 RX+, 4 TX−, 5 TX+)')}
            aria-label={t('route.pinout.aria', 'Pinout')}
            value={bridge.pinout ?? ''}
            onChange={(e) => setBridge({ pinout: e.target.value || undefined })}
          />
        </>
      )}

      {route && defaults && (
        <button
          type="button"
          className="self-start border border-bc-border bg-bc-panel-raised px-2 py-1 text-xs text-bc-text hover:border-bc-accent"
          title={defaults.source}
          onClick={() => setBridge(defaults.bridge)}
        >
          {t('route.applyDefaults', 'Fill in values from the manufacturer document')}
        </button>
      )}

      {line && <p className="text-bc-text text-[11px]">{line}</p>}
      {routeFindings(cam).map((f) => (
        <Note key={f} tone="info">{findingLabel[f]}</Note>
      ))}
    </div>
  );
}
