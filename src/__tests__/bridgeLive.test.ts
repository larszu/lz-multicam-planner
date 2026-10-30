import { describe, expect, it } from 'vitest';
import type { VenueCamera } from '../types';
import { applyLive, bridgeNumberFor, bussesFromMixer, cameraIdForNumber, focalFromLive, inputForCamera, liveUpdates, mixerInputs, parseBridgeMessage } from '../utils/bridgeLive';

const cam = (over: Partial<VenueCamera> = {}): VenueCamera => ({
  id: 'a', label: 'CAM 1', cameraId: 'x', lensId: 'y', x: 0, y: 0, z: 1.5, pan: 30, tilt: 0,
  focalLength: 50, aperture: 2.8, focusDistance: 5, color: 'c', extenderActive: 1, ...over,
}) as VenueCamera;

describe('bridgeNumberFor', () => {
  it('nimmt das Feld vor dem Namen', () => expect(bridgeNumberFor(cam({ bridgeCameraNumber: 7 }), 0)).toBe(7));
  it('nimmt die Zahl im Namen', () => expect(bridgeNumberFor(cam({ label: 'CAM 12' }), 0)).toBe(12));
  it('faellt auf die Position zurueck', () => expect(bridgeNumberFor(cam({ label: 'Totale' }), 2)).toBe(3));
  it('findet die Id zur Nummer', () => {
    const list = [cam({ id: 'a', label: 'Totale' }), cam({ id: 'b', label: 'CAM 5' })];
    expect(cameraIdForNumber(list, 5)).toBe('b');
    expect(cameraIdForNumber(list, 1)).toBe('a');
    expect(cameraIdForNumber(list, 9)).toBeNull();
    expect(cameraIdForNumber(list, null)).toBeNull();
  });
});

describe('Umrechnung', () => {
  it('Kopf-Pan ist relativ zur geplanten Blickrichtung', () => {
    expect(liveUpdates(cam({ pan: 30 }), { pose: { pan: 60, tilt: -10 } })).toEqual({ pan: 90, tilt: -10 });
  });
  it('Heimrichtung ist die Rig-Drehung, wenn gesetzt', () => {
    expect(liveUpdates(cam({ pan: 30, rigRotation: 170 }), { pose: { pan: 20, tilt: 0 } }).pan).toBe(-170);
  });
  it('zoom 0..1 linear zwischen Weit und Tele', () => {
    expect(focalFromLive({ pose: { pan: 0, tilt: 0, zoom: 0.5 } }, { focalMin: 10, focalMax: 110 })).toBe(60);
  });
  it('hfovDeg zaehlt vor zoom', () => {
    const f = focalFromLive({ pose: { pan: 0, tilt: 0, zoom: 1 }, hfovDeg: 90 }, { sensorWidthMm: 36, focalMin: 10, focalMax: 110 });
    expect(f).toBeCloseTo(18, 5);
  });
  it('ohne Optikdaten bleibt die Brennweite unberuehrt', () => {
    expect(liveUpdates(cam(), { pose: { pan: 0, tilt: 0, zoom: 0.5 } })).not.toHaveProperty('focalLength');
  });
  it('applyLive laesst Kameras ohne Live-Pose und die Referenz ohne Daten', () => {
    const list = [cam({ id: 'a', label: 'CAM 1' }), cam({ id: 'b', label: 'CAM 2' })];
    expect(applyLive(list, {}, () => ({}))).toBe(list);
    const out = applyLive(list, { 2: { pose: { pan: 10, tilt: 0 } } }, () => ({}));
    expect(out[0]).toBe(list[0]);
    expect(out[1].pan).toBe(40);
    expect(list[1].pan).toBe(30);
  });
});

describe('parseBridgeMessage', () => {
  it('liest pose samt hfovDeg', () => {
    expect(parseBridgeMessage(JSON.stringify({ type: 'pose', cameraNumber: 1, pose: { pan: 1, tilt: 2, zoom: 0.3 }, hfovDeg: 40 })))
      .toEqual({ type: 'pose', cameraNumber: 1, pose: { pan: 1, tilt: 2, zoom: 0.3 }, hfovDeg: 40 });
  });
  it('liest die Pultkamera aus surfaceInput', () => {
    expect(parseBridgeMessage(JSON.stringify({ type: 'surfaceInput', id: 's', cameraNumber: 3, mode: 'x', input: { joystick: { pan: 50, tilt: -20 } } })))
      .toEqual({ type: 'surfaceInput', cameraNumber: 3, joystick: { pan: 50, tilt: -20 } });
  });
  it('verwirft Kaputtes', () => {
    expect(parseBridgeMessage('nope')).toBeNull();
    expect(parseBridgeMessage(JSON.stringify({ type: 'pose', cameraNumber: 1 }))).toBeNull();
    expect(parseBridgeMessage(JSON.stringify({ type: 'state' }))).toBeNull();
  });
});

describe('Bridge-Mischer', () => {
  const cams = [
    { id: 'a', label: 'CAM 1' },
    { id: 'b', label: 'CAM 2' },
    { id: 'c', label: 'Totale', bridgeCameraNumber: 5 },
  ];

  it('liest einen Mischer aus switcherState und alle aus switchers', () => {
    expect(parseBridgeMessage(JSON.stringify({ type: 'switcherState', switcherNumber: 2, state: { program: 1, preview: 5, inTransition: true } })))
      .toEqual({ type: 'mixer', mixers: [{ switcherNumber: 2, program: 1, preview: 5, inTransition: true }] });
    const list = parseBridgeMessage(JSON.stringify({ type: 'switchers', switchers: [{ switcherNumber: 1, state: { program: 2 } }, { switcherNumber: 3, state: null }] }));
    expect(list).toEqual({ type: 'mixer', mixers: [{ switcherNumber: 1, program: 2, preview: 0, inTransition: false }] });
  });

  it('Eingang n ist die Kamera mit Bridge-Nummer n, in beide Richtungen', () => {
    expect(bussesFromMixer(cams, { program: 5, preview: 2 })).toEqual({ programId: 'c', previewId: 'b' });
    expect(bussesFromMixer(cams, { program: 0, preview: 9 })).toEqual({ programId: null, previewId: null });
    expect(inputForCamera(cams, 'c')).toBe(5);
    expect(inputForCamera(cams, null)).toBe(0);
  });

  it('meldet Kameranamen als Eingangsnamen, jede Nummer einmal', () => {
    expect(mixerInputs([...cams, { label: 'CAM 2 Ersatz' }])).toEqual([
      { id: 1, name: 'CAM 1' }, { id: 2, name: 'CAM 2' }, { id: 5, name: 'Totale' },
    ]);
  });
});
