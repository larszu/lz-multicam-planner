import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useStore } from '../../store/useStore';
import { mischerBefehl, useBridgeLive, useMixerFollow } from '../../store/bridgeLive';
import { inputForCamera, inputName } from '../../utils/bridgeLive';
import { renderCamera, wallSurfaces } from '../Preview/cameraViewRenderer';
import LookToggle from '../Render3D/LookToggle';
import { bereit3D, bildVersion3D, render3D, useBedarf3D, useBildVersion3D, useKameraLook, type BildRolle } from '../Render3D/kameraBild3d';
import { getCameraById, getEffectiveSensor } from '../../data/cameras';
import { getLensById } from '../../data/lenses';
import { computeFov } from '../../utils/fov';
import { loadJSON, saveJSON } from '../../utils/storage';
import { format, useTranslation } from '../../i18n';
import type { VenueCamera } from '../../types';
import { timecodeOfDay } from './timecode';

const AUTO_SECONDS_KEY = 'multicam-mv-auto-seconds';
/** Rechenzeit je Bild fuer Kacheln, bevor der Rest aufs naechste Bild wartet. */
const BUDGET_MS = 12;

interface Mix { from: string | null; to: string; start: number; durMs: number }

function lensLine(cam: VenueCamera): string {
  const { customCameras, customLenses } = useStore.getState();
  const camDef = getCameraById(cam.cameraId, customCameras);
  const lensDef = getLensById(cam.lensId, customLenses);
  if (!camDef || !lensDef) return '';
  const sensor = getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount);
  const fov = computeFov(sensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1);
  const range = lensDef.focalLengthMin === lensDef.focalLengthMax
    ? `${lensDef.focalLengthMin}mm`
    : `${lensDef.focalLengthMin}–${lensDef.focalLengthMax}mm`;
  return `${camDef.model} · ${range} @ ${Math.round(cam.focalLength * cam.extenderActive)}mm · ${fov.horizontalDeg.toFixed(1)}° H`;
}

// Multiview wie am Bildmischer: grosse Preview- und Program-Fenster, darunter
// jede Kamera als Kachel mit Tally. Preview-Bus = ausgewaehlte Kamera, damit
// 2D, 3D und Preview immer mitzeigen, was als Naechstes kommt.
export default function Multiview() {
  const { t } = useTranslation();
  const cameras = useStore((s) => s.cameras);
  const selectedId = useStore((s) => s.selectedCameraId);
  const programId = useStore((s) => s.programCameraId);
  // Echter Mischer der Bridge: Preview kommt vom Mischer, nicht aus der
  // Auswahl im Plan; Tasten schalten ihn nur, wenn das erlaubt ist.
  const follow = useMixerFollow(cameras);
  const extern = follow?.extern === true;
  const previewId = extern ? follow.previewId : selectedId;
  const previewRef = useRef(previewId);
  useEffect(() => { previewRef.current = previewId; }, [previewId]);
  const selectCamera = useStore((s) => s.selectCamera);
  const setProgramCamera = useStore((s) => s.setProgramCamera);

  const [autoSeconds, setAutoSeconds] = useState(() => loadJSON<number>(AUTO_SECONDS_KEY, 1));
  const [mixTo, setMixTo] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const pvwRef = useRef<HTMLCanvasElement>(null);
  const pgmRef = useRef<HTMLCanvasElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);
  const tileRefs = useRef(new Map<string, HTMLCanvasElement>());
  const mixRef = useRef<Mix | null>(null);
  // Puffer fuer die Blende: beide Quellen werden getrennt gerendert und dann
  // mit Deckkraft uebereinandergelegt.
  const bufA = useRef<HTMLCanvasElement | null>(null);
  const bufB = useRef<HTMLCanvasElement | null>(null);

  const externRef = useRef(extern);
  useEffect(() => { externRef.current = extern; }, [extern]);
  const finishTake = useCallback((to: string, from: string | null) => {
    setProgramCamera(to);
    // Wie am Mischer: die bisherige Program-Quelle rutscht auf Preview —
    // am echten Mischer meldet er das selbst.
    if (from && !externRef.current) selectCamera(from);
    mixRef.current = null;
    setMixTo(null);
  }, [selectCamera, setProgramCamera]);

  const schnitt = useCallback(() => {
    if (!previewId || mixRef.current) return;
    finishTake(previewId, programId);
  }, [finishTake, previewId, programId]);

  const blende = useCallback(() => {
    if (!previewId || mixRef.current) return;
    if (autoSeconds <= 0 || !programId) { schnitt(); return; }
    mixRef.current = { from: programId, to: previewId, start: performance.now(), durMs: autoSeconds * 1000 };
    setMixTo(previewId);
  }, [autoSeconds, schnitt, previewId, programId]);

  const drives = follow?.drives === true;
  const gesperrt = extern && !drives;
  const cut = useCallback(() => {
    if (!extern) schnitt();
    else if (drives) mischerBefehl('cut');
  }, [drives, extern, schnitt]);
  const auto = useCallback(() => {
    if (!extern) blende();
    else if (drives) mischerBefehl('auto');
  }, [blende, drives, extern]);
  const vorschau = useCallback((id: string) => {
    selectCamera(id);
    const n = inputForCamera(cameras, id);
    if (drives && n > 0) mischerBefehl('preview', n);
  }, [cameras, drives, selectCamera]);

  // AUTO an einem Pult der Bridge: dieselbe Blende wie mit dem eigenen Knopf.
  const autoRequest = useBridgeLive((s) => s.autoRequest);
  const autoRef = useRef(blende);
  useEffect(() => { autoRef.current = blende; }, [blende]);
  // Nur neue Anforderungen: beim Oeffnen der Multiview laeuft keine alte nach.
  const gesehenRef = useRef(autoRequest);
  useEffect(() => {
    if (autoRequest === gesehenRef.current) return;
    gesehenRef.current = autoRequest;
    autoRef.current();
  }, [autoRequest]);

  const takeDirect = useCallback((id: string) => {
    if (mixRef.current || gesperrt) return;
    const n = inputForCamera(cameras, id);
    if (extern) { if (n > 0) mischerBefehl('take', n); return; }
    setProgramCamera(id);
  }, [cameras, extern, gesperrt, setProgramCamera]);

  // Gerendert durch die 3D-Szene (Standard) oder die einfache Zeichnung (#168).
  const [look, setLook] = useKameraLook('multicam-mv-look');
  useBedarf3D(look === 'rendered');
  const lookRef = useRef(look);
  useEffect(() => { lookRef.current = look; }, [look]);
  useBildVersion3D(); // neu zeichnen, sobald die 3D-Szene bereit ist
  const laedt3D = !bereit3D();

  // Render-Schleife: zeichnet nur neu, wenn sich Szene, Busse, Groessen oder
  // die 3D-Szene geaendert haben. Gezeichnet wird ueber eigene Renderer —
  // ohne dass die Vorschau gemountet sein muss (#172).
  //
  // Gerenderte Bilder kosten GPU-Zeit: nach einer Aenderung kommen erst die
  // grossen Fenster, dann die Kacheln, und je Bild nur so viele, wie in
  // `BUDGET_MS` passen — der Rest im naechsten Bild. 20 Kacheln bauen sich so
  // in wenigen Bildern auf, statt die Oberflaeche einzufrieren.
  useEffect(() => {
    let raf = 0;
    let lastKey: unknown[] = [];
    let offen: (() => void)[] = [];
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (tcRef.current) tcRef.current.textContent = timecodeOfDay(new Date());

      const r3 = lookRef.current === 'rendered' && bereit3D();
      const render = (id: string, el: HTMLCanvasElement, w: number, dpr: number, rolle: BildRolle) => {
        if (!(r3 && render3D(id, el, w, dpr, rolle))) renderCamera(id, el, w, dpr);
      };

      const s = useStore.getState();
      const dpr = window.devicePixelRatio || 1;
      const pvw = pvwRef.current;
      const pgm = pgmRef.current;
      const widthOf = (c: HTMLCanvasElement | null) => c?.parentElement?.clientWidth ?? 0;
      const tiles = s.cameras.map((c) => [c.id, tileRefs.current.get(c.id) ?? null] as const);
      const tileW = tiles.map(([, el]) => widthOf(el));
      const pvwW = widthOf(pvw);
      const pgmW = widthOf(pgm);

      const mix = mixRef.current;
      const key = [r3, bildVersion3D(), wallSurfaces.version, s.cameras, s.persons, s.venue, s.walls, s.customCameras, s.customLenses, s.language, previewRef.current, s.programCameraId, dpr, pvwW, pgmW, ...tileW];
      if (key.length !== lastKey.length || key.some((v, i) => v !== lastKey[i])) {
        lastKey = key;
        offen = [];
        if (pvw && pvwW > 0) {
          offen.push(() => {
            if (previewRef.current) render(previewRef.current, pvw, pvwW, dpr, 'gross');
            else blank(pvw, pvwW, dpr);
          });
        }
        if (pgm && pgmW > 0 && !mix) {
          offen.push(() => {
            if (s.programCameraId) render(s.programCameraId, pgm, pgmW, dpr, 'gross');
            else blank(pgm, pgmW, dpr);
          });
        }
        tiles.forEach(([id, el], i) => {
          if (el && tileW[i] > 0) offen.push(() => render(id, el, tileW[i], dpr, 'kachel'));
        });
      }
      const start = performance.now();
      while (offen.length > 0) {
        offen.shift()!();
        if (performance.now() - start > BUDGET_MS) break;
      }

      if (!mix || !pgm || pgmW <= 0) return;
      const p = Math.min(1, (now - mix.start) / mix.durMs);
      bufA.current ??= document.createElement('canvas');
      bufB.current ??= document.createElement('canvas');
      if (mix.from) render(mix.from, bufA.current, pgmW, dpr, 'gross'); else blank(bufA.current, pgmW, dpr);
      render(mix.to, bufB.current, pgmW, dpr, 'gross');
      blank(pgm, pgmW, dpr);
      const ctx = pgm.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.drawImage(bufA.current, 0, 0, pgm.width, pgm.height);
        ctx.globalAlpha = p;
        ctx.drawImage(bufB.current, 0, 0, pgm.width, pgm.height);
        ctx.globalAlpha = 1;
      }
      if (p >= 1) {
        finishTake(mix.to, mix.from);
        lastKey = [];
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finishTake]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); cut(); return; }
    if (e.key === 'Enter') { e.preventDefault(); auto(); return; }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= 9 && cameras[n - 1]) {
      e.preventDefault();
      if (e.shiftKey) takeDirect(cameras[n - 1].id);
      else vorschau(cameras[n - 1].id);
    }
  };

  // Liegt auf dem Bus ein Eingang ohne Kamera (Farbbalken, Clip …), steht sein Name da.
  const labelOf = (id: string | null, eingang?: number) =>
    cameras.find((c) => c.id === id)?.label
    ?? (extern && eingang ? inputName(follow.bus.inputs, eingang) : '—');

  if (cameras.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-bc-dim">
        {t('multiview.empty', 'Place cameras in the 2D plan — each one gets a tile here.')}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={() => rootRef.current?.focus()}
      className="flex h-full flex-col overflow-auto bg-bc-dark text-bc-text outline-none"
      aria-label={t('multiview.title', 'Multiview')}
    >
      <div className="flex flex-wrap items-center gap-2 border-b pr-4 border-bc-border bg-bc-sunken px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-bc-dim">TOD</span>
        <span ref={tcRef} className="font-mono text-sm text-bc-text-bright tabular-nums" />
        <div className="flex-1" />
        {follow && (
          <span className="text-[10px] text-bc-dim" title={gesperrt ? t('multiview.readOnlyHint', 'The planner shows what this mixer does. Switching from here can be allowed in Settings → Bridge & mixer.') : undefined}>
            {follow.bus.label ?? format(t('settings.bridge.mixer.n', 'Mixer {n}'), { n: follow.bus.switcherNumber })}
            {gesperrt ? ` · ${t('multiview.readOnly', 'view only')}` : ''}
          </span>
        )}
        <LookToggle value={look} onChange={setLook} laedt={laedt3D} />
        <button
          type="button"
          onClick={cut}
          disabled={gesperrt || (!extern && !previewId) || mixTo !== null}
          title={t('multiview.cutHint', 'Cut preview to program (Space)')}
          className="border border-bc-border px-3 py-1 text-xs font-semibold hover:bg-bc-hover disabled:opacity-40"
        >
          {t('multiview.cut', 'CUT')}
        </button>
        <button
          type="button"
          onClick={auto}
          disabled={gesperrt || (!extern && !previewId) || mixTo !== null}
          title={t('multiview.autoHint', 'Dissolve preview to program (Enter)')}
          className={`border px-3 py-1 text-xs font-semibold disabled:opacity-40 ${mixTo ? 'border-bc-red bg-bc-red text-bc-on-media' : 'border-bc-border hover:bg-bc-hover'}`}
        >
          {t('multiview.auto', 'AUTO')}
        </button>
        <label className="flex items-center gap-1 text-[10px] text-bc-dim">
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={autoSeconds}
            onChange={(e) => {
              const v = Math.max(0, Math.min(10, Number(e.target.value) || 0));
              setAutoSeconds(v);
              saveJSON(AUTO_SECONDS_KEY, v);
            }}
            className="w-14 border border-bc-border bg-bc-panel-raised px-1 py-0.5 text-xs text-bc-text"
            aria-label={t('multiview.autoSeconds', 'Dissolve duration in seconds')}
          />
          s
        </label>
      </div>

      <div className="grid grid-cols-2 gap-1 p-1">
        <BusWindow tally="pvw" title={`${t('multiview.preview', 'PREVIEW')} · ${labelOf(previewId, follow?.bus.preview)}`} canvasRef={pvwRef} />
        <BusWindow tally="pgm" title={`${t('multiview.program', 'PROGRAM')} · ${labelOf(mixTo ?? programId, follow?.bus.program)}`} canvasRef={pgmRef} />
      </div>

      <div className="grid gap-1 px-1 pb-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {cameras.map((cam, i) => {
          const onPgm = cam.id === programId || cam.id === mixTo;
          const onPvw = !onPgm && cam.id === previewId;
          return (
            <button
              key={cam.id}
              type="button"
              onClick={() => vorschau(cam.id)}
              onDoubleClick={() => takeDirect(cam.id)}
              title={t('multiview.tileHint', 'Click: preview · Double-click: straight to program')}
              className={`relative block border-2 text-left ${onPgm ? 'border-bc-red' : onPvw ? 'border-bc-green' : 'border-bc-border'}`}
            >
              <canvas
                ref={(el) => { if (el) tileRefs.current.set(cam.id, el); else tileRefs.current.delete(cam.id); }}
                className="block w-full"
              />
              <span className="absolute left-0 top-0 max-w-full truncate bg-bc-scrim px-1 font-mono text-[10px] text-bc-on-media">
                {lensLine(cam)}
              </span>
              <span
                className={`absolute bottom-0 left-0 right-0 truncate px-1 py-0.5 text-center font-mono text-[10px] font-semibold ${onPgm ? 'bg-bc-red text-bc-on-media' : onPvw ? 'bg-bc-green text-bc-on-media' : 'bg-bc-scrim text-bc-on-media'}`}
              >
                {i < 9 ? `${i + 1} · ` : ''}{cam.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-3 py-2 text-[10px] text-bc-dim">
        {t('multiview.keys', 'Click a tile for preview, double-click to take it straight to program · Space = cut · Enter = auto · 1–9 = preview · Shift+1–9 = program')}
      </p>
    </div>
  );
}

function BusWindow({ tally, title, canvasRef }: { tally: 'pvw' | 'pgm'; title: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className={`relative border-2 ${tally === 'pgm' ? 'border-bc-red' : 'border-bc-green'}`}>
      <canvas ref={canvasRef} className="block w-full" />
      <span
        className={`absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 font-mono text-[11px] font-semibold text-bc-on-media ${tally === 'pgm' ? 'bg-bc-red' : 'bg-bc-green'}`}
      >
        {title}
      </span>
    </div>
  );
}

function blank(canvas: HTMLCanvasElement, cssW: number, dpr: number) {
  const cssH = Math.round(cssW * 9 / 16);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
