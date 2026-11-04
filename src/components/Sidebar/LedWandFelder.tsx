// LED-Wand an einer Videowand (#227) und Moiré je Kamera (#213).
//
// Eingegeben werden nur Modul, Pixelabstand, Modulanzahl und die Lage in der
// Leinwand; Groesse und Aufloesung folgen daraus. Moduldaten kommen bewusst
// nicht aus einem Katalog: ohne Datenblatt-Beleg gibt es keinen Eintrag, und
// die drei Zahlen stehen auf jedem Datenblatt.
import { useMemo, useRef } from 'react';
import { FiDownload, FiUpload } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { useTranslation, format } from '../../i18n';
import { Zahl, Readout, Note } from './fields';
import {
  istVideoUrl,
  ledAenderung,
  ledEinschalten,
  ledMasse,
  ledNormal,
  leinwand,
  moireFuerKamera,
  sensorPixelBreite,
  LED_INHALTE,
  type LedInhalt,
  type LedVideoWall,
  type LedWandDaten,
  type MoireErgebnis,
} from '../../utils/ledWand';
import { kameraBildwinkel } from '../../utils/bildwinkel';
import { effectiveCameraPos } from '../../utils/camera';
import { pixelkarteCanvas } from '../../utils/pixelkarte';
import { pngSpeichern, dateinameTeil } from '../../utils/multiviewWand';

const mpx = (px: number) => (px / 1e6).toFixed(2);

function useMoire(wand: LedVideoWall): { id: string; label: string; farbe: string; e: MoireErgebnis }[] {
  const cameras = useStore((s) => s.cameras);
  const customCameras = useStore((s) => s.customCameras);
  const customLenses = useStore((s) => s.customLenses);
  return useMemo(() => {
    const out: { id: string; label: string; farbe: string; e: MoireErgebnis }[] = [];
    for (const cam of cameras) {
      const b = kameraBildwinkel(cam, { customCameras, customLenses });
      if (!b) continue;
      const pos = effectiveCameraPos(cam);
      const e = moireFuerKamera({
        x: pos.x, y: pos.y, z: cam.z, pan: cam.pan, tilt: cam.tilt, hDeg: b.hDeg,
        brennweiteMm: cam.focalLength * (cam.extenderActive || 1),
        blende: cam.aperture,
        fokusM: cam.focusDistance,
        sensorBreiteMm: b.sensor.widthMm,
        sensorPx: b.sensor.pixelsW ?? sensorPixelBreite(b.camDef.resolutions),
      }, wand);
      if (e) out.push({ id: cam.id, label: cam.label, farbe: cam.color, e });
    }
    return out;
  }, [cameras, customCameras, customLenses, wand]);
}

const PUNKT: Record<MoireErgebnis['stufe'], string> = {
  likely: 'bg-bc-red',
  possible: 'bg-bc-yellow',
  low: 'bg-bc-green',
  grid: 'bg-bc-yellow',
  offFrame: 'bg-bc-border-strong',
  behind: 'bg-bc-border-strong',
};

export function LedWandFelder({ wand }: { wand: LedVideoWall }) {
  const { t } = useTranslation();
  const walls = useStore((s) => s.venue.videoWalls ?? []);
  const updateVideoWall = useStore((s) => s.updateVideoWall);
  const datei = useRef<HTMLInputElement>(null);
  const d = ledNormal(wand.led);
  const moire = useMoire(wand);

  if (!d) {
    return (
      <button
        type="button"
        onClick={() => updateVideoWall(wand.id, ledEinschalten(wand, walls))}
        className="w-full px-2 py-1 text-xs bg-bc-accent/20 text-bc-accent hover:bg-bc-accent/30"
        title={t('room.led.on.title', 'Build the wall from LED modules: size and resolution follow, cameras get a moiré check')}
      >
        {t('room.led.on', 'LED modules')}
      </button>
    );
  }

  const m = ledMasse(d);
  const setze = (p: Partial<LedWandDaten>) => updateVideoWall(wand.id, ledAenderung({ ...d, ...p }));
  const inhaltName: Record<LedInhalt, string> = {
    show: t('room.led.content.show', 'Show graphic'),
    testbild: t('room.led.content.pattern', 'Test pattern'),
    pixelkarte: t('room.led.content.pixelmap', 'Pixel map'),
    medien: t('room.led.content.media', 'Image or video'),
  };
  const ansichtName = {
    frontal: t('room.led.view.frontal', 'frontal'),
    angled: t('room.led.view.angled', 'angled'),
    grazing: t('room.led.view.grazing', 'grazing'),
  };
  const stufeName: Record<MoireErgebnis['stufe'], string> = {
    likely: t('room.led.moire.likely', 'moiré likely'),
    possible: t('room.led.moire.possible', 'moiré possible'),
    low: t('room.led.moire.low', 'no moiré'),
    grid: t('room.led.moire.grid', 'LED grid resolved'),
    offFrame: t('room.led.moire.offFrame', 'not in shot'),
    behind: t('room.led.moire.back', 'behind the wall'),
  };

  const lokaleDatei = (f: File | undefined) => {
    if (!f) return;
    setze({ inhalt: 'medien', medienUrl: URL.createObjectURL(f), medienArt: f.type.startsWith('video/') ? 'video' : 'bild' });
  };

  return (
    <div className="space-y-1 border-t border-bc-border pt-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-bc-text-bright">{t('room.led.title', 'LED modules')}</span>
        <button type="button" onClick={() => updateVideoWall(wand.id, { led: undefined })} className="text-[11px] text-bc-dim hover:text-bc-text">
          {t('room.led.off', 'Plain wall')}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <Zahl label={t('room.led.pitch', 'Pitch mm')} value={d.pitchMm} step={0.1} min={0.5} max={100} title={t('room.led.pitch.title', 'Pixel pitch from the module datasheet')} onChange={(v) => setze({ pitchMm: v })} />
        <Zahl label={t('room.led.moduleW', 'W mm')} value={d.moduleWmm} step={10} min={50} max={2000} title={t('room.led.moduleW.title', 'Module width')} onChange={(v) => setze({ moduleWmm: v })} />
        <Zahl label={t('room.led.moduleH', 'H mm')} value={d.moduleHmm} step={10} min={50} max={2000} title={t('room.led.moduleH.title', 'Module height')} onChange={(v) => setze({ moduleHmm: v })} />
        <span />
        <Zahl label={t('room.led.modulesX', 'Across')} value={d.modulesX} step={1} min={1} max={500} title={t('room.led.modulesX.title', 'Modules side by side')} onChange={(v) => setze({ modulesX: Math.round(v) })} />
        <Zahl label={t('room.led.modulesY', 'High')} value={d.modulesY} step={1} min={1} max={500} title={t('room.led.modulesY.title', 'Modules stacked')} onChange={(v) => setze({ modulesY: Math.round(v) })} />
        <Zahl label={t('room.led.canvasX', 'Canvas x')} value={d.canvasX} step={1} min={0} max={1000000} title={t('room.led.canvas.title', 'Position in the media server canvas, pixels from the top left')} onChange={(v) => setze({ canvasX: Math.round(v) })} />
        <Zahl label={t('room.led.canvasY', 'Canvas y')} value={d.canvasY} step={1} min={0} max={1000000} title={t('room.led.canvas.title', 'Position in the media server canvas, pixels from the top left')} onChange={(v) => setze({ canvasY: Math.round(v) })} />
      </div>
      <div className="text-[11px] tabular-nums leading-snug">
        <div className="font-semibold text-bc-text-bright">{format(t('room.led.resolution', '{w}×{h} px · {mp} Mpx'), { w: m.breitePx, h: m.hoehePx, mp: mpx(m.breitePx * m.hoehePx) })}</div>
        <div className="text-bc-muted">{format(t('room.led.size', '{w} × {h} m · {mx}×{my} px per module'), { w: m.breiteM.toFixed(2), h: m.hoeheM.toFixed(2), mx: m.pxModulX, my: m.pxModulY })}</div>
      </div>
      <label className="block">
        <span className="text-bc-dim">{t('room.led.content', 'Content')}</span>
        <select
          className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
          value={d.inhalt ?? 'show'}
          onChange={(e) => setze({ inhalt: e.target.value as LedInhalt })}
        >
          {LED_INHALTE.map((k) => <option key={k} value={k}>{inhaltName[k]}</option>)}
        </select>
      </label>
      {d.inhalt === 'medien' && (
        <div className="flex items-center gap-1">
          <input
            type="url"
            className="flex-1 min-w-0 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
            placeholder={t('room.led.url', 'https://… image or video')}
            aria-label={t('room.led.url.label', 'Image or video URL')}
            value={d.medienUrl?.startsWith('blob:') ? '' : (d.medienUrl ?? '')}
            onChange={(e) => {
              const url = e.target.value.trim();
              setze(url ? { medienUrl: url, medienArt: istVideoUrl(url) ? 'video' : 'bild' } : { medienUrl: undefined, medienArt: undefined });
            }}
          />
          <button
            type="button"
            onClick={() => datei.current?.click()}
            style={{ padding: '4px 6px' }}
            className="flex items-center gap-1 text-xs bg-bc-accent/20 text-bc-accent hover:bg-bc-accent/30"
            title={t('room.led.file.title', 'Local image or video — only for this session, not saved with the project')}
          >
            <FiUpload size={12} /> {t('room.led.file', 'File')}
          </button>
          <input ref={datei} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { lokaleDatei(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      {d.inhalt === 'medien' && d.medienUrl?.startsWith('blob:') && (
        <Note tone="info">{t('room.led.file.session', 'Local file in use — it is not saved with the project. Use a URL to keep it.')}</Note>
      )}

      {moire.length > 0 && (
        <div className="space-y-0.5 pt-1">
          <div className="text-[11px] text-bc-muted" title={t('room.led.moire.title', 'LED pitch imaged on the sensor (pitch × focal length ÷ distance, foreshortened by the angle) against the sensor pixel pitch. Above Nyquist the grid aliases; the residual contrast after defocus, diffraction and pixel area decides whether it shows. Worst point in the frame, without optical low-pass filter.')}>
            {t('room.led.moire.head', 'Moiré per camera')}
          </div>
          {moire.map(({ id, label, farbe, e }) => (
            <div key={id} className="text-[11px] tabular-nums leading-snug">
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-bc-full ${PUNKT[e.stufe]}`} />
                <span className="font-semibold whitespace-nowrap" style={{ color: farbe }}>{label}</span>
                <span className="text-bc-text">{stufeName[e.stufe]}</span>
              </div>
              <div className="pl-3.5 text-bc-muted">
                {e.stufe === 'behind' || e.stufe === 'offFrame'
                  ? (e.ansicht ? `${ansichtName[e.ansicht]} ${Math.round(e.winkelDeg)}°` : '')
                  : format(t('room.led.moire.values', '{view} {deg}° · {d} m · {r} px/LED · {c} %'), {
                    view: e.ansicht ? ansichtName[e.ansicht] : '',
                    deg: Math.round(e.winkelDeg),
                    d: e.abstandM.toFixed(1),
                    r: e.sensorPxJeLed.toFixed(2),
                    c: Math.round(e.kontrast * 100),
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Gesamte Leinwand aller LED-Flaechen: Groesse, Pixel, Prozessorgrenze, PNG. */
export function LedLeinwand() {
  const { t } = useTranslation();
  const venue = useStore((s) => s.venue);
  const setVenue = useStore((s) => s.setVenue);
  const lw = useMemo(() => leinwand(venue.videoWalls ?? [], (i) => format(t('room.led.surface', 'LED {n}'), { n: i + 1 })), [venue.videoWalls, t]);
  if (lw.flaechen.length === 0) return null;
  const grenze = venue.ledProcessorMaxPx;
  const ueber = !!grenze && lw.pixel > grenze;
  const speichern = () => {
    const c = pixelkarteCanvas(lw);
    if (c) pngSpeichern(c, `${dateinameTeil(venue.name)}_pixelmap_${lw.breitePx}x${lw.hoehePx}.png`);
  };
  return (
    <div className="bg-bc-dark p-2 border border-bc-border space-y-1">
      <Readout
        label={t('room.led.canvas', 'LED canvas')}
        value={format(t('room.led.canvas.value', '{w}×{h} px · {mp} Mpx in {n} surfaces'), { w: lw.breitePx, h: lw.hoehePx, mp: mpx(lw.pixel), n: lw.flaechen.length })}
      />
      <div className="grid grid-cols-2 gap-1 items-end">
        <label title={t('room.led.limit.title', 'Pixel capacity of the LED processor; empty = not checked')}>
          <span className="text-bc-dim">{t('room.led.limit', 'Processor limit Mpx')}</span>
          <input
            type="number"
            className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs tabular-nums"
            value={grenze ? Math.round((grenze / 1e6) * 1000) / 1000 : ''}
            min={0}
            step={0.1}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              const { ledProcessorMaxPx: _, ...rest } = venue;
              setVenue(Number.isFinite(v) && v > 0 ? { ...rest, ledProcessorMaxPx: Math.round(v * 1e6) } : rest);
            }}
          />
        </label>
        <button type="button" onClick={speichern} style={{ padding: '4px 6px' }} className="flex items-center justify-center gap-1 text-xs bg-bc-accent/20 text-bc-accent hover:bg-bc-accent/30">
          <FiDownload size={12} /> {t('room.led.png', 'Pixel map PNG')}
        </button>
      </div>
      {ueber && <Note tone="warn">{format(t('room.led.limit.over', 'The surfaces need {mp} Mpx — more than the processor drives.'), { mp: mpx(lw.pixel) })}</Note>}
      {lw.ueberlappt && <Note tone="warn">{t('room.led.overlap', 'Two surfaces share canvas pixels — check canvas x/y.')}</Note>}
    </div>
  );
}
