import type { BridgeMode, ControlPath, ControlRoute, ControlRouteVia, SerialBridgePlan, SerialInterface, VenueCamera } from '../types';

/**
 * Der Steuerweg je Kamera (#164): WIE die Befehle des Protokolls
 * (`controlPath`) physisch zur Kamera kommen — direkt, getunnelt durch einen
 * Robotik-Kopf oder ueber eine Netzwerk-Seriell-Bridge mit Schnittstelle,
 * Belegung, Leitungsparametern, TCP-Modus und Port.
 *
 * Adressen gehoeren nicht in den Plan: der Port ist eine Einstellung der
 * Bridge, die IP eine der Anlage.
 */
export const CONTROL_ROUTE_VIAS: readonly ControlRouteVia[] = ['direct', 'robotic-head', 'serial-bridge'];
export const SERIAL_INTERFACES: readonly SerialInterface[] = ['RS-232', 'RS-422', 'RS-485-2w', 'RS-485-4w'];
export const BRIDGE_MODES: readonly BridgeMode[] = ['tcp-server', 'tcp-client', 'udp', 'rfc2217'];

/** Protokolle, die auf einer seriellen Leitung laufen. */
export const SERIAL_PATHS: ReadonlySet<ControlPath> = new Set<ControlPath>([
  'serial', 'visca-serial', 'sony-700', 'panasonic-serial', 'canon-bu', 'hitachi-rcz', 'gv-ldk', 'marshall-cv420',
]);

const SONY_VISCA = 'Sony, VISCA-Befehlsliste SRG-XP1/SRG-XB25, F-162-100-02 (1), 2020';

/** Leitungs- und Netzparameter mit Herstellerbeleg. Was hier fehlt, steht im Handbuch der Kamera. */
export const ROUTE_DEFAULTS: Partial<Record<ControlPath, { bridge: SerialBridgePlan; source: string }>> = {
  'visca-serial': {
    bridge: { serial: 'RS-232', baud: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
    source: `${SONY_VISCA}: 9600/38400 bps, 8 Datenbits, 1 Start-, 1 Stopbit, keine Parität, keine Flusskontrolle`,
  },
  visca: {
    bridge: { mode: 'udp', port: 52381 },
    source: `${SONY_VISCA}: VISCA over IP, UDP, Port 52381`,
  },
};

export function lineDefaultsFor(path: ControlPath | undefined) {
  return path ? ROUTE_DEFAULTS[path] : undefined;
}

const PARITY_CHAR = { none: 'N', even: 'E', odd: 'O' } as const;

/** „RS-422 · 9600 8N1 · TCP server :4001" — nur, was eingetragen ist. */
export function bridgeLine(b: SerialBridgePlan | undefined): string {
  if (!b) return '';
  const teile: string[] = [];
  if (b.device) teile.push(b.device);
  if (b.serial) teile.push(b.serial);
  if (b.baud) teile.push(`${b.baud} ${b.dataBits ?? 8}${PARITY_CHAR[b.parity ?? 'none']}${b.stopBits ?? 1}`);
  if (b.mode || b.port) teile.push(`${b.mode ?? ''}${b.port ? ` :${b.port}` : ''}`.trim());
  return teile.join(' · ');
}

export type RouteFinding = 'serial-path-direct' | 'network-path-on-bridge' | 'bridge-incomplete' | 'head-unnamed';

export function routeFindings(cam: Pick<VenueCamera, 'controlPath' | 'controlRoute'>): RouteFinding[] {
  const r = cam.controlRoute;
  if (!r || !cam.controlPath || cam.controlPath === 'none') return [];
  const seriell = SERIAL_PATHS.has(cam.controlPath);
  const out: RouteFinding[] = [];
  if (r.via === 'direct' && seriell) out.push('serial-path-direct');
  if (r.via === 'serial-bridge' && !seriell) out.push('network-path-on-bridge');
  if (r.via === 'serial-bridge' && seriell && !(r.bridge?.serial && r.bridge.baud && r.bridge.port)) out.push('bridge-incomplete');
  if (r.via === 'robotic-head' && !r.head) out.push('head-unnamed');
  return out;
}

const num = (v: unknown, ok: (n: number) => boolean) => (typeof v === 'number' && Number.isFinite(v) && ok(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const oneOf = <T extends string | number>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined);

export function normaliseControlRoute(raw: unknown): Pick<VenueCamera, 'controlRoute'> {
  const r = (raw as { controlRoute?: Record<string, unknown> } | null)?.controlRoute;
  const via = oneOf(r?.via, CONTROL_ROUTE_VIAS);
  if (!r || !via) return { controlRoute: undefined };
  const b = r.bridge as Record<string, unknown> | undefined;
  const bridge: SerialBridgePlan | undefined = b
    ? Object.fromEntries(
        Object.entries({
          device: str(b.device),
          serial: oneOf(b.serial, SERIAL_INTERFACES),
          pinout: str(b.pinout),
          baud: num(b.baud, (n) => n > 0 && Number.isInteger(n)),
          dataBits: oneOf(b.dataBits, [7, 8] as const),
          parity: oneOf(b.parity, ['none', 'even', 'odd'] as const),
          stopBits: oneOf(b.stopBits, [1, 2] as const),
          mode: oneOf(b.mode, BRIDGE_MODES),
          port: num(b.port, (n) => Number.isInteger(n) && n > 0 && n < 65536),
        }).filter(([, v]) => v !== undefined),
      )
    : undefined;
  const route: ControlRoute = { via };
  const head = str(r.head);
  if (head) route.head = head;
  if (bridge && Object.keys(bridge).length > 0) route.bridge = bridge;
  return { controlRoute: route };
}
