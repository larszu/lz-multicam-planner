// GPU-Diagnose (Windows-Bericht: App lief auf der Intel UHD statt der
// gewaehlten NVIDIA). Zeigt, welche GPU WebGL wirklich bekommt — das ist die
// Zahl, die ein Nutzer mit den Windows-Grafikeinstellungen vergleichen kann.

/** Jede WebGL-Flaeche der App fordert die leistungsstarke GPU an. */
export const WEBGL_POWER_PREFERENCE = 'high-performance' as const;

export interface WebglRendererInfo {
  vendor: string;
  renderer: string;
}

/** Was der Hauptprozess der Desktop-App meldet (`gpu-info:get`). */
export interface MainGpuInfo {
  platform: string;
  execPath: string;
  portableExecutable: string | null;
  switches: { forceHighPerformanceGpu: boolean; useAngle: string | null };
  gpuDevice: { vendorId: number; deviceId: number; active: boolean; vendorString: string | null; deviceString: string | null; driverVersion: string | null }[];
  webgl: string | null;
}

interface GpuBridge { info(): Promise<MainGpuInfo> }

export function gpuBridge(): GpuBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { multicamGpu?: GpuBridge }).multicamGpu;
}

/** Liest UNMASKED_RENDERER_WEBGL aus einem kurzlebigen Kontext mit derselben
 *  Praeferenz wie die 3D-Ansichten. */
export function readWebglRenderer(doc: Document = document): WebglRendererInfo | null {
  const canvas = doc.createElement('canvas');
  const gl = (canvas.getContext('webgl2', { powerPreference: WEBGL_POWER_PREFERENCE })
    ?? canvas.getContext('webgl', { powerPreference: WEBGL_POWER_PREFERENCE })) as WebGLRenderingContext | null;
  if (!gl) return null;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
      renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    };
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

const VENDORS: Record<number, string> = { 0x10de: 'NVIDIA', 0x8086: 'Intel', 0x1002: 'AMD', 0x106b: 'Apple', 0x5143: 'Qualcomm' };
export const vendorName = (id: number): string => VENDORS[id] ?? `0x${id.toString(16).padStart(4, '0')}`;

/** Integrierte Grafik nach dem Renderer-Text. Bewusst grob: entscheidet nur,
 *  ob ein Hinweis erscheint, nie, was die App tut. */
export function looksIntegrated(renderer: string): boolean {
  const r = renderer.toLowerCase();
  if (/nvidia|geforce|quadro|rtx|radeon\s*(rx|pro)|arc\s*a\d/.test(r)) return false;
  return /intel|uhd|iris|hd graphics|radeon\(tm\)\s*graphics|radeon graphics|vega \d+ graphics/.test(r);
}

/**
 * Hinweis fuer Rechner mit zwei GPUs: integrierte aktiv, eine leistungsstarke
 * vorhanden. Ohne Hauptprozess-Daten (Browser) nur nach dem Renderer-Text.
 */
export function integratedWhileDiscreteAvailable(webgl: WebglRendererInfo | null, main: MainGpuInfo | null): boolean {
  if (!webgl || !looksIntegrated(webgl.renderer)) return false;
  if (!main) return false;
  return main.gpuDevice.some((d) => d.vendorId === 0x10de || (d.vendorId === 0x1002 && !d.active));
}
