import { describe, it, expect } from 'vitest';
import { bridgeLine, lineDefaultsFor, normaliseControlRoute, routeFindings } from '../utils/steuerweg';

describe('Steuerweg (#164)', () => {
  it('fasst die Bridge in einer Zeile zusammen', () => {
    expect(bridgeLine({ device: 'Moxa NPort', serial: 'RS-422', baud: 38400, dataBits: 8, parity: 'odd', stopBits: 1, mode: 'tcp-server', port: 4001 }))
      .toBe('Moxa NPort · RS-422 · 38400 8O1 · tcp-server :4001');
    expect(bridgeLine(undefined)).toBe('');
  });

  it('VISCA seriell hat belegte Leitungswerte, VISCA over IP den belegten Port', () => {
    const d = lineDefaultsFor('visca-serial')!;
    expect(d.bridge).toMatchObject({ serial: 'RS-232', baud: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
    expect(d.source).toMatch(/Sony/);
    expect(lineDefaultsFor('visca')!.bridge).toEqual({ mode: 'udp', port: 52381 });
    expect(lineDefaultsFor('canon-bu')).toBeUndefined();
  });

  it('meldet Widersprueche zwischen Protokoll und Weg', () => {
    expect(routeFindings({ controlPath: 'visca-serial', controlRoute: { via: 'direct' } })).toEqual(['serial-path-direct']);
    expect(routeFindings({ controlPath: 'blackmagic', controlRoute: { via: 'serial-bridge' } })).toEqual(['network-path-on-bridge']);
    expect(routeFindings({ controlPath: 'sony-700', controlRoute: { via: 'serial-bridge', bridge: { serial: 'RS-422' } } })).toEqual(['bridge-incomplete']);
    expect(routeFindings({ controlPath: 'sony-700', controlRoute: { via: 'serial-bridge', bridge: { serial: 'RS-422', baud: 38400, port: 4001 } } })).toEqual([]);
    expect(routeFindings({ controlPath: 'visca', controlRoute: { via: 'robotic-head' } })).toEqual(['head-unnamed']);
    expect(routeFindings({ controlRoute: { via: 'direct' } })).toEqual([]);
  });

  it('beim Laden fallen kaputte Werte weg', () => {
    expect(normaliseControlRoute({ controlRoute: { via: 'teleport' } }).controlRoute).toBeUndefined();
    expect(normaliseControlRoute({
      controlRoute: { via: 'serial-bridge', head: '  ', bridge: { serial: 'RS-999', baud: 9600, port: 70000, mode: 'tcp-server', parity: 'odd' } },
    })).toEqual({ controlRoute: { via: 'serial-bridge', bridge: { baud: 9600, mode: 'tcp-server', parity: 'odd' } } });
  });
});
