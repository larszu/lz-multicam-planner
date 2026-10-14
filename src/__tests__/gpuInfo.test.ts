import { describe, it, expect } from 'vitest';
import { integratedWhileDiscreteAvailable, looksIntegrated, vendorName, type MainGpuInfo } from '../utils/gpuInfo';

const main = (devices: MainGpuInfo['gpuDevice']): MainGpuInfo => ({
  platform: 'win32', execPath: 'C:\\x.exe', portableExecutable: null,
  switches: { forceHighPerformanceGpu: true, useAngle: 'd3d11' }, gpuDevice: devices, webgl: 'enabled',
});
const dev = (vendorId: number, active: boolean) => ({ vendorId, deviceId: 1, active, vendorString: null, deviceString: null, driverVersion: null });

describe('GPU-Diagnose', () => {
  it('erkennt integrierte Grafik am Renderer-Text', () => {
    expect(looksIntegrated('ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(looksIntegrated('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(looksIntegrated('ANGLE (AMD, AMD Radeon RX 6700M Direct3D11)')).toBe(false);
    expect(looksIntegrated('Apple M2')).toBe(false);
  });

  it('warnt nur, wenn neben der integrierten eine NVIDIA steckt', () => {
    const intel = { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11)' };
    expect(integratedWhileDiscreteAvailable(intel, main([dev(0x8086, true), dev(0x10de, false)]))).toBe(true);
    expect(integratedWhileDiscreteAvailable(intel, main([dev(0x8086, true)]))).toBe(false);
    expect(integratedWhileDiscreteAvailable(intel, null)).toBe(false);
  });

  it('benennt Hersteller-Ids', () => {
    expect(vendorName(0x10de)).toBe('NVIDIA');
    expect(vendorName(0x1234)).toBe('0x1234');
  });
});
