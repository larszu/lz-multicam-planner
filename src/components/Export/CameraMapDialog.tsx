// Kamerakarte (#222): die ganze Aufstellung als eine Grafik — SVG, PNG oder
// PDF; mit Schnittliste als animiertes SVG.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { useTranslation, format } from '../../i18n';
import { getCameraById, getEffectiveSensor } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov } from '../../utils/fov';
import { rigLine } from '../../i18n/mount';
import { describeStand, projectStand } from '../../utils/projectStand';
import {
  buildCameraMapSvg,
  CAMERA_MAP_EVENT,
  parseCutText,
  parseFcpxmlCuts,
  pdfWithJpeg,
  planMassstabText,
  type CutSegment,
  type MapCamera,
  type MapNumbering,
  type MapTheme,
} from '../../utils/cameraMap';

function herunterladen(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgAlsCanvas(svg: string, w: number, h: number, faktor = 2): Promise<HTMLCanvasElement> {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * faktor;
      c.height = h * faktor;
      const ctx = c.getContext('2d');
      if (!ctx) return fehler(new Error('canvas'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ok(c);
    };
    img.onerror = () => fehler(new Error('svg'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export default function CameraMapDialog() {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  const [theme, setTheme] = useState<MapTheme>('light');
  const [labels, setLabels] = useState(true);
  const [numbering, setNumbering] = useState<MapNumbering>('number');
  const [cuts, setCuts] = useState<CutSegment[]>([]);
  const [cutName, setCutName] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { venue, walls, cameras, backgroundPlan, customCameras, customLenses } = useStore();

  useEffect(() => {
    const auf = () => setOffen(true);
    window.addEventListener(CAMERA_MAP_EVENT, auf);
    return () => window.removeEventListener(CAMERA_MAP_EVENT, auf);
  }, []);
  useEffect(() => {
    if (!offen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [offen]);

  const karte = useMemo(() => {
    if (!offen) return null;
    const mapCams: MapCamera[] = cameras.map((cam) => {
      const cd = getCameraById(cam.cameraId, customCameras);
      const ld = getLensById(cam.lensId, customLenses);
      let fovDeg: number | undefined;
      if (cd && ld) {
        const sensor = getEffectiveSensor(cd, ld, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
        fovDeg = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, ld.squeeze ?? 1).horizontalDeg;
      }
      const range = ld ? (ld.focalLengthMin === ld.focalLengthMax ? `${ld.focalLengthMin} mm` : `${ld.focalLengthMin}–${ld.focalLengthMax} mm`) : '';
      return {
        cam,
        fovDeg,
        optics: [cd ? `${cd.manufacturer} ${cd.model}` : '', range, `@ ${cam.focalLength.toFixed(0)} mm`].filter(Boolean).join(' · '),
        rig: rigLine(t, cam),
      };
    });
    const s = useStore.getState();
    return buildCameraMapSvg({
      title: `${t('cameraMap.title', 'Camera map')} — ${venue.name}`,
      subtitle: `${describeStand(projectStand(s), t)} · ${format(t('cameraMap.count', '{n} cameras'), { n: cameras.length })}`,
      venue,
      walls,
      plan: backgroundPlan,
      cameras: mapCams,
      theme,
      labels,
      numbering,
      cuts: cuts.length ? cuts : undefined,
      texts: {
        legend: t('cameraMap.legend', 'Cameras'),
        scale: format(t('cameraMap.venue', 'venue {w} × {h} m'), { w: venue.widthM, h: venue.heightM }),
        planSource: backgroundPlan
          ? format(t('cameraMap.planSource', 'Floor plan: {name} · {scale}'), { name: backgroundPlan.sourceName ?? t('cameraMap.planUnnamed', 'image'), scale: planMassstabText(backgroundPlan) })
          : t('cameraMap.noPlan', 'No floor plan'),
        stamp: `LZ Multicam Planner · ${new Date().toLocaleString()}`,
      },
    });
  }, [offen, cameras, customCameras, customLenses, venue, walls, backgroundPlan, theme, labels, numbering, cuts, t]);

  if (!offen || !karte) return null;
  const dateiName = `${t('cameraMap.file', 'camera-map')}_${venue.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const alsSvg = () => herunterladen(new Blob([karte.svg], { type: 'image/svg+xml' }), `${dateiName}.svg`);
  const alsBild = async (art: 'png' | 'pdf') => {
    setLaeuft(true);
    try {
      const canvas = await svgAlsCanvas(karte.svg, karte.width, karte.height);
      if (art === 'png') {
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
        if (blob) herunterladen(blob, `${dateiName}.png`);
      } else {
        const jpeg = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.92));
        if (jpeg) {
          const pdf = pdfWithJpeg(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height, venue.name);
          herunterladen(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `${dateiName}.pdf`);
        }
      }
    } catch {
      alert(t('cameraMap.failed', 'The camera map could not be rendered.'));
    } finally {
      setLaeuft(false);
    }
  };

  const schnittLaden = async (datei: File) => {
    const text = await datei.text();
    const parsed = /<fcpxml[\s>]/.test(text)
      ? parseFcpxmlCuts(text, cameras, numbering)
      : parseCutText(text, cameras, numbering);
    if (!parsed.length) {
      alert(t('cameraMap.cutsNone', 'No cut in this file matched a camera. Name clips like the cameras (CAM 2) or use one line per cut: start time and camera.'));
      return;
    }
    setCuts(parsed);
    setCutName(datei.name);
  };

  const seg = (aktiv: boolean) => (aktiv ? 'true' : 'false');
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-bc-scrim p-4">
      <div role="dialog" aria-modal="true" aria-label={t('cameraMap.title', 'Camera map')} className="bc-dialog flex w-full max-w-[960px] max-h-full flex-col">
        <div className="bc-panel-head justify-between">
          <span className="text-lg font-bold text-bc-text-bright">{t('cameraMap.title', 'Camera map')}</span>
          <button type="button" onClick={() => setOffen(false)} className="grid place-items-center rounded-bc-full text-bc-muted hover:bg-bc-hover hover:text-bc-text-bright" aria-label={t('cameraMap.close', 'Close')}>
            <FiX size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs" style={{ padding: '4px 20px 10px' }}>
          <div className="bc-seg" role="group" aria-label={t('cameraMap.theme', 'Look')}>
            <button type="button" aria-pressed={seg(theme === 'light')} onClick={() => setTheme('light')}>{t('cameraMap.light', 'Light')}</button>
            <button type="button" aria-pressed={seg(theme === 'dark')} onClick={() => setTheme('dark')}>{t('cameraMap.dark', 'Dark')}</button>
          </div>
          <div className="bc-seg" role="group" aria-label={t('cameraMap.numbering', 'Symbols')}>
            <button type="button" aria-pressed={seg(numbering === 'number')} onClick={() => setNumbering('number')}>1 2 3</button>
            <button type="button" aria-pressed={seg(numbering === 'letter')} onClick={() => setNumbering('letter')}>A B C</button>
          </div>
          <label className="flex items-center gap-1.5 text-bc-text cursor-pointer">
            <input type="checkbox" className="accent-bc-accent" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
            {t('cameraMap.labels', 'Lens and rig labels')}
          </label>
          <input ref={fileRef} type="file" accept=".fcpxml,.xml,.txt,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void schnittLaden(f); e.target.value = ''; }} />
          {cuts.length ? (
            <span className="flex items-center gap-1 text-bc-muted">
              {format(t('cameraMap.cutsLoaded', '{n} cuts from {file}'), { n: cuts.length, file: cutName })}
              <button type="button" className="bc-btn-soft" style={{ padding: '2px 8px' }} onClick={() => { setCuts([]); setCutName(''); }}>{t('cameraMap.cutsClear', 'Remove')}</button>
            </span>
          ) : (
            <button type="button" className="bc-btn-soft" style={{ padding: '4px 10px' }} onClick={() => fileRef.current?.click()} title={t('cameraMap.cuts.title', 'FCPXML from the edit, or a text list with start time and camera per line. The SVG then plays the cut.')}>
              {t('cameraMap.cuts', 'Animate from a cut list…')}
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-bc-panel-raised" style={{ padding: '10px 20px' }}>
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(karte.svg)}`}
            alt={t('cameraMap.preview', 'Preview of the camera map')}
            className="block w-full h-auto rounded-bc-m"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs" style={{ padding: '12px 20px' }}>
          {cuts.length > 0 && <span className="mr-auto text-bc-dim">{t('cameraMap.animatedHint', 'Animated in the SVG; PNG and PDF show the plan without animation.')}</span>}
          <button type="button" className="bc-btn-soft" style={{ padding: '6px 12px' }} disabled={laeuft} onClick={alsSvg}>SVG</button>
          <button type="button" className="bc-btn-soft" style={{ padding: '6px 12px' }} disabled={laeuft} onClick={() => void alsBild('png')}>PNG</button>
          <button type="button" className="bc-btn-primary" style={{ padding: '6px 12px' }} disabled={laeuft} onClick={() => void alsBild('pdf')}>PDF</button>
        </div>
      </div>
    </div>
  );
}
