// Rig-Steuerung: das Pult zum Fahren der Kamera.
//
// Kern ist eine einzige rAF-Schleife, die pro Frame ALLE ausgelenkten Achsen
// zusammen verrechnet (`applyDrive`). Genau darum laesst sich der Dolly
// verschieben, waehrend man neigt — Tastatur und Pad koennen dabei
// gleichzeitig anliegen.
//
// Die Schleife liest den Kamerazustand ueber `useStore.getState()` statt ueber
// Props: sonst wuerde sich der Effekt bei jedem geschriebenen Frame neu
// aufsetzen. Abhaengig ist er nur von "scharf" und "Tempo".
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCircle, FiPlay, FiSquare, FiTrash2, FiRepeat, FiCrosshair } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { getLensById } from '../../data/lenses';
import type { RigTake, TakeSample } from '../../types';
import { rigYaw } from '../../utils/camera';
import { rigLimits } from '../../utils/rigLimits';
import { profileForMount } from '../../utils/motionProfile';
import { useTranslation, format } from '../../i18n';
import { motionProfileLabel, mountTypeLabel, speedStepHint, speedStepLabel } from '../../i18n/mount';
import {
  DEFAULT_SPEED_INDEX,
  DRIVE_KEYS,
  PARK_KEY,
  SPEED_STEPS,
  applyDrive,
  driveFromKeys,
  isIdle,
  mergeInput,
  type DriveInput,
} from '../../utils/rigDrive';
import {
  TAKE_MIN_DURATION_S,
  appendSample,
  defaultTakeName,
  formatTakeTime,
  sampleFromCamera,
  sampleTakeAt,
  takeDuration,
} from '../../utils/rigTake';

/** Nach so langem Leerlauf haelt die Fahr-Schleife wieder an (ms). */
const LOOP_IDLE_STOP_MS = 700;

/** Auslenkungs-Flaeche: Zeiger ziehen = Achse auslenken, loslassen = zurueck auf 0. */
function Deflector({
  label,
  hint,
  axes,
  onChange,
  disabled,
  size,
}: {
  label: string;
  hint: string;
  /** 'xy' = Pan/Tilt-Pad, 'x' = einachsiger Jog. */
  axes: 'xy' | 'x';
  onChange: (input: DriveInput) => void;
  disabled?: boolean;
  /** Kantenlaenge des Pads bzw. Hoehe des Jogs (px). */
  size: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const update = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      const next = { x: nx, y: axes === 'xy' ? ny : 0 };
      setPos(next);
      // Bildschirm-y zeigt nach unten, Tilt nach oben — daher das Minus.
      onChange(axes === 'xy' ? { pan: next.x, tilt: -next.y } : { travel: next.x });
    },
    [axes, onChange],
  );

  const release = useCallback(() => {
    setPos({ x: 0, y: 0 });
    onChange({});
  }, [onChange]);

  return (
    <div className={axes === 'xy' ? 'shrink-0' : 'w-full'} style={axes === 'xy' ? { width: size } : undefined}>
      <div className="text-[10px] text-bc-dim mb-1">{label}</div>
      <div
        ref={ref}
        title={hint}
        style={{ height: axes === 'xy' ? size : 40 }}
        className={`relative border ${disabled ? 'border-bc-border/50 bg-bc-dark/40' : 'border-bc-border bg-bc-dark cursor-crosshair'}`}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e);
        }}
        onPointerMove={(e) => {
          if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          update(e);
        }}
        onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); release(); }}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        {/* Fadenkreuz */}
        <div className="absolute inset-x-2 top-1/2 border-t border-bc-border/60" />
        <div className="absolute inset-y-2 left-1/2 border-l border-bc-border/60" />
        {!disabled && (
          <div
            className="absolute w-3 h-3 bg-bc-yellow"
            style={{
              left: `calc(50% + ${pos.x * 45}% - 6px)`,
              top: `calc(50% + ${pos.y * 45}% - 6px)`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Spielt eine aufgezeichnete Fahrt auf `cameraId` ab und liefert eine
 * Abbruch-Funktion. Die Schleife setzt am Ende nur die Zeitbasis zurueck —
 * kein rekursiver Neustart, damit der Cancel-Griff derselbe bleibt.
 */
function runTakePlayback(
  take: RigTake,
  cameraId: string,
  shouldLoop: () => boolean,
  onDone: () => void,
): () => void {
  const duration = takeDuration(take);
  if (duration <= 0) {
    onDone();
    return () => {};
  }
  let raf = 0;
  let cancelled = false;
  let startTs = performance.now();

  const frame = (now: number) => {
    if (cancelled) return;
    let t = (now - startTs) / 1000;
    if (t >= duration) {
      if (shouldLoop()) {
        startTs = now;
        t = 0;
      } else {
        const end = sampleTakeAt(take, duration);
        if (end) useStore.getState().updateCamera(cameraId, end);
        onDone();
        return;
      }
    }
    const patch = sampleTakeAt(take, t);
    if (patch) useStore.getState().updateCamera(cameraId, patch);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

export default function RigControlPanel() {
  const { t } = useTranslation();
  const cameras = useStore((s) => s.cameras);
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const selectCamera = useStore((s) => s.selectCamera);
  const rigTakes = useStore((s) => s.rigTakes);
  const addRigTake = useStore((s) => s.addRigTake);
  const removeRigTake = useStore((s) => s.removeRigTake);
  const renameRigTake = useStore((s) => s.renameRigTake);
  const takeStorageFull = useStore((s) => s.takeStorageFull);

  const cam = cameras.find((c) => c.id === selectedCameraId) ?? cameras[0] ?? null;
  const limits = cam ? rigLimits(cam) : null;
  const profile = profileForMount(cam?.mountType);

  const [armed, setArmed] = useState(true);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  // Der laufende Take fragt die Schleifen-Einstellung ueber diesen Ref ab,
  // damit ein Umschalten waehrend der Wiedergabe sofort greift.
  const loopRef = useRef(false);

  // Live-Eingaben. Refs statt State: sie aendern sich pro Frame und duerfen
  // keinen Re-Render ausloesen.
  const keysRef = useRef<Set<string>>(new Set());
  const padRef = useRef<DriveInput>({});
  const jogRef = useRef<DriveInput>({});
  const recRef = useRef<{ startedAt: number; camId: string; samples: TakeSample[] } | null>(null);

  // Tempo im Ref: die Fahr-Schleife soll beim Umschalten nicht neu starten
  // (sonst geht die Zeitbasis und damit ein Stueck Fahrweg verloren).
  const speedRef = useRef<number>(SPEED_STEPS[DEFAULT_SPEED_INDEX].factor);
  const setSpeed = useCallback((i: number) => {
    speedRef.current = SPEED_STEPS[i].factor;
    setSpeedIndex(i);
  }, []);

  // ── Fahr-Schleife ───────────────────────────────────────────────────────
  // Laeuft nur, solange wirklich etwas passiert: das Panel ist wegen
  // `tabEnableRenderOnDemand: false` immer gemountet, ein Dauer-rAF waere also
  // auch dann aktiv, wenn der Nutzer im 2D-Plan arbeitet. Tastendruck, Pad und
  // Aufnahme starten die Schleife; nach kurzem Leerlauf haelt sie wieder an.
  const loopRaf = useRef(0);
  const loopIdleSince = useRef(0);

  const startLoop = useCallback(() => {
    if (loopRaf.current) return;
    let last = performance.now();
    loopIdleSince.current = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const st = useStore.getState();
      const live = st.cameras.find((c) => c.id === st.selectedCameraId) ?? st.cameras[0];
      const input = mergeInput(mergeInput(driveFromKeys(keysRef.current), padRef.current), jogRef.current);
      const idle = isIdle(input);

      if (live && !idle) {
        const lens = getLensById(live.lensId);
        const patch = applyDrive(
          {
            cam: live,
            limits: rigLimits(live),
            profile: profileForMount(live.mountType),
            focalRange: lens ? { min: lens.focalLengthMin, max: lens.focalLengthMax } : undefined,
          },
          input,
          dt,
          speedRef.current,
        );
        if (patch) st.updateCamera(live.id, patch);
      }

      // Aufnahme laeuft unabhaengig davon, ob gerade gefahren wird — eine
      // Pause im Take ist Teil der Fahrt.
      const rec = recRef.current;
      if (rec) {
        const t = (now - rec.startedAt) / 1000;
        const after = st.cameras.find((c) => c.id === rec.camId);
        if (after) rec.samples = appendSample(rec.samples, sampleFromCamera(after, t));
        // Die Anzeige nur zehnmal je Sekunde nachziehen: ein setState pro Frame
        // rendert das ganze Panel mit und bringt fuer eine Zehntel-Anzeige
        // nichts.
        setRecSeconds((prev) => (Math.abs(t - prev) >= 0.1 ? t : prev));
      }

      if (idle && !rec) {
        if (!loopIdleSince.current) loopIdleSince.current = now;
        if (now - loopIdleSince.current > LOOP_IDLE_STOP_MS) {
          loopRaf.current = 0;
          return;
        }
      } else {
        loopIdleSince.current = 0;
      }
      loopRaf.current = requestAnimationFrame(tick);
    };
    loopRaf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(
    () => () => {
      if (loopRaf.current) cancelAnimationFrame(loopRaf.current);
      loopRaf.current = 0;
    },
    [],
  );

  // ── Tastatur ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!armed) {
      keysRef.current.clear();
      return;
    }
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const held = keysRef.current;
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
      const k = e.key.toLowerCase();
      if (DRIVE_KEYS[k]) {
        e.preventDefault();
        keysRef.current.add(k);
        startLoop();
        return;
      }
      if (k === PARK_KEY) {
        e.preventDefault();
        const st = useStore.getState();
        const live = st.cameras.find((c) => c.id === st.selectedCameraId);
        if (live) st.updateCamera(live.id, { trackOffset: 0 });
        return;
      }
      const step = SPEED_STEPS.findIndex((s) => s.key === k);
      if (step >= 0) {
        e.preventDefault();
        setSpeed(step);
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    // Beim Fensterwechsel bleiben sonst Tasten "haengen" und das Rig faehrt weiter.
    const blur = () => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      held.clear();
    };
  }, [armed, startLoop, setSpeed]);

  // ── Aufnahme ────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    const st = useStore.getState();
    const live = st.cameras.find((c) => c.id === st.selectedCameraId) ?? st.cameras[0];
    if (!live) return;
    recRef.current = { startedAt: performance.now(), camId: live.id, samples: [sampleFromCamera(live, 0)] };
    setRecSeconds(0);
    setRecording(true);
    startLoop();
  }, [startLoop]);

  const stopRecording = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!rec) return;
    const duration = rec.samples.length ? rec.samples[rec.samples.length - 1].t : 0;
    if (duration < TAKE_MIN_DURATION_S || rec.samples.length < 2) return;
    const live = useStore.getState().cameras.find((c) => c.id === rec.camId);
    addRigTake({
      name: live ? defaultTakeName(live, duration) : `Fahrt ${duration.toFixed(1)}s`,
      cameraId: rec.camId,
      mountType: live?.mountType,
      samples: rec.samples,
      createdAt: Date.now(),
    });
  }, [addRigTake]);

  // ── Wiedergabe ──────────────────────────────────────────────────────────
  const playCancel = useRef<(() => void) | null>(null);

  const stopPlayback = useCallback(() => {
    playCancel.current?.();
    playCancel.current = null;
    setPlayingId(null);
  }, []);

  const playTake = useCallback(
    (take: RigTake) => {
      playCancel.current?.();
      const st = useStore.getState();
      // Auf die aufgezeichnete Kamera zurueckfallen, sonst auf die gewaehlte —
      // ein Take soll auch nach dem Loeschen "seiner" Kamera abspielbar sein.
      const target =
        st.cameras.find((c) => c.id === take.cameraId) ??
        st.cameras.find((c) => c.id === st.selectedCameraId) ??
        st.cameras[0];
      if (!target) return;
      playCancel.current = runTakePlayback(
        take,
        target.id,
        () => loopRef.current,
        () => {
          playCancel.current = null;
          setPlayingId(null);
        },
      );
      setPlayingId(take.id);
    },
    [],
  );

  useEffect(() => () => { playCancel.current?.(); }, []);

  if (!cam || !limits) {
    return (
      <div className="h-full flex items-center justify-center text-bc-dim text-sm">
        {t('rig.noCamera', 'No camera yet — create one in the „Cameras" panel on the left.')}
      </div>
    );
  }

  const takes = rigTakes.filter((t) => t.cameraId === cam.id);
  const otherTakes = rigTakes.filter((t) => t.cameraId !== cam.id);
  const hasTravel = limits.travelM > 0;

  return (
    <div className="h-full overflow-auto bg-bc-panel text-xs text-bc-text-bright" data-rig-control>
      <div className="p-3 space-y-3 max-w-[860px]">
        {/* Kopf: welche Kamera, welches Rig */}
        <div className="flex items-center gap-2">
          <select
            className="border border-bc-border bg-bc-panel-raised px-2 py-1 text-bc-text-bright"
            value={cam.id}
            onChange={(e) => selectCamera(e.target.value)}
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <span className="text-bc-muted truncate">
            {limits.rig?.name ?? mountTypeLabel(t, limits.type)} · {motionProfileLabel(t, limits.type)}
          </span>
          <button
            onClick={() => setArmed((a) => !a)}
            className={`ml-auto px-2 py-1 border ${armed ? 'border-bc-yellow text-bc-yellow-text' : 'border-bc-border text-bc-muted'}`}
            title={t('rig.keys.title', 'Arm keyboard control. Off when the keys are needed elsewhere.')}
          >
            {armed ? t('rig.keysArmed', 'Keys armed') : t('rig.keysOff', 'Keys off')}
          </button>
        </div>

        {/* Tempo */}
        <div className="flex items-center gap-1">
          <span className="text-bc-dim">{t('rig.speed', 'Speed')}</span>
          {SPEED_STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setSpeed(i)}
              title={format(t('rig.speedStep', '{hint} (key {key})'), { hint: speedStepHint(t, s.key), key: s.key })}
              className={`px-2 py-0.5 border ${i === speedIndex ? 'border-bc-yellow text-bc-yellow-text' : 'border-bc-border text-bc-muted'}`}
            >
              {speedStepLabel(t, s.key)}
            </button>
          ))}
          <span className="ml-auto text-bc-faint">
            {format(t('rig.limits', 'max {travel} m/s · {rot}°/s · {lift} m/s lift'), {
              travel: profile.maxTravelMps.toFixed(2),
              rot: profile.maxRotDps,
              lift: profile.maxLiftMps.toFixed(2),
            })}
          </span>
        </div>

        {/* Pult */}
        <div className="flex gap-3 items-start">
          <Deflector
            label={t('rig.panTilt', 'Pan / Tilt (← → ↑ ↓)')}
            hint={t('rig.panTilt.hint', 'Dragging pans and tilts — possible at the same time as the move.')}
            axes="xy"
            size={220}
            onChange={(i) => { padRef.current = i; startLoop(); }}
          />
          <div className="flex-1 min-w-0 space-y-2">
            <Deflector
              label={hasTravel ? t('rig.track.keys', 'Track (J / L)') : t('rig.track.none', 'Track - this rig does not travel')}
              hint={hasTravel ? t('rig.track.hint', 'Dragging moves the dolly; releasing stops it.') : t('rig.track.noneHint', 'Tripods, hi-hats and the like have no track.')}
              axes="x"
              size={40}
              disabled={!hasTravel}
              onChange={(i) => { jogRef.current = i; startLoop(); }}
            />
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              <Readout label={t('rig.track', 'Track')} value={hasTravel ? `${(cam.trackOffset ?? 0).toFixed(2)} m` : '—'} sub={hasTravel ? `±${limits.travelM.toFixed(2)} m` : ''} />
              <Readout label={t('rig.height', 'Height')} value={`${cam.z.toFixed(2)} m`} sub={`${limits.minHeightM.toFixed(2)}–${limits.maxHeightM.toFixed(2)}`} />
              <Readout label="Pan" value={`${cam.pan.toFixed(1)}°`} />
              <Readout label="Tilt" value={`${cam.tilt.toFixed(1)}°`} />
              <Readout label={t('rig.orientation', 'Orientation')} value={`${rigYaw(cam).toFixed(0)}°`} sub={cam.rigRotation === undefined ? t('rig.followsCamera', 'follows camera') : t('rig.fixedYaw', 'fixed')} />
              <Readout label={t('rig.focalLength', 'Focal length')} value={`${cam.focalLength.toFixed(0)} mm`} />
            </div>
          </div>
        </div>

        {/* Tastenlegende */}
        <div className="border border-bc-border bg-bc-panel-raised px-2 py-1.5 text-[10px] text-bc-muted leading-relaxed">
          <b className="text-bc-text">{t('rig.keys', 'Keys')}</b> — <b>J/L</b> {t('rig.key.track', 'track')} · <b>← →</b> {t('rig.key.pan', 'pan')} · <b>↑ ↓</b> {t('rig.key.tilt', 'tilt')} ·
          {' '}<b>R/F</b> {t('rig.key.height', 'height')} · <b>[ ]</b> {t('rig.key.align', 'align rig')} · <b>, .</b> {t('rig.key.zoom', 'zoom')} · <b>0</b> {t('rig.key.park', 'park')} ·
          {' '}<b>1/2/3</b> {t('rig.key.speed', 'speed')}. {t('rig.keys.hint', 'Several keys at once move several axes together.')}
        </div>

        {/* Aufnahme */}
        <div className="flex items-center gap-2">
          {recording ? (
            <button onClick={stopRecording} className="flex items-center gap-1 px-2 py-1 bg-bc-red text-bc-text-bright">
              <FiSquare size={11} /> Stop {formatTakeTime(recSeconds)}
            </button>
          ) : (
            <button onClick={startRecording} className="flex items-center gap-1 px-2 py-1 border border-bc-border text-bc-red-text hover:border-bc-red">
              <FiCircle size={11} /> {t('rig.recordTake', 'Record take')}
            </button>
          )}
          <button
            onClick={() => { loopRef.current = !loopRef.current; setLoop(loopRef.current); }}
            className={`flex items-center gap-1 px-2 py-1 border ${loop ? 'border-bc-yellow text-bc-yellow-text' : 'border-bc-border text-bc-muted'}`}
            title={t('rig.loop', 'Replay the recorded take in a loop')}
          >
            <FiRepeat size={11} /> Loop
          </button>
          {playingId && (
            <button onClick={stopPlayback} className="px-2 py-1 border border-bc-border text-bc-text">
              {t('rig.stopPlayback', 'Stop playback')}
            </button>
          )}
          <span className="ml-auto text-bc-faint">{format(t('rig.takesFor', '{count} take(s) for {name}'), { count: takes.length, name: cam.label })}</span>
        </div>

        {takeStorageFull && (
          <div className="border border-bc-red/60 bg-bc-red/10 px-2 py-1 text-[11px] text-bc-red-text">
            {t('rig.storageFull', 'Storage is full — the last take could not be saved. Delete older takes.')}
          </div>
        )}

        {/* Takes */}
        <div className="space-y-1">
          {takes.length === 0 && (
            <p className="text-bc-faint text-[11px]">
              {t('rig.noTakes', 'No take recorded yet. Press „Record take", move, then „Stop" — the movement can be replayed as often as you like afterwards.')}
            </p>
          )}
          {takes.map((fahrt) => (
            <div key={fahrt.id} className={`flex items-center gap-1 border px-2 py-1 ${playingId === fahrt.id ? 'border-bc-yellow' : 'border-bc-border'}`}>
              <button onClick={() => (playingId === fahrt.id ? stopPlayback() : playTake(fahrt))} className="text-bc-text hover:text-bc-text-bright p-0.5" title={t('rig.play', 'Play')}>
                {playingId === fahrt.id ? <FiSquare size={12} /> : <FiPlay size={12} />}
              </button>
              <input
                className="flex-1 bg-transparent outline-none text-bc-text-bright"
                value={fahrt.name}
                title={t('rig.rename', 'Name the take')}
                onChange={(e) => renameRigTake(fahrt.id, e.target.value)}
              />
              <span className="text-bc-dim">{formatTakeTime(takeDuration(fahrt))}</span>
              <span className="text-bc-faint text-[10px]">{format(t('rig.samples', '{n} pts'), { n: fahrt.samples.length })}</span>
              <button
                onClick={() => { if (playingId === fahrt.id) stopPlayback(); removeRigTake(fahrt.id); }}
                className="text-bc-dim hover:text-bc-red-text p-0.5"
                title={t('rig.delete', 'Delete take')}
              >
                <FiTrash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {otherTakes.length > 0 && (
          <div className="text-[10px] text-bc-faint flex items-center gap-1">
            <FiCrosshair size={10} /> {format(t('rig.otherTakes', '{count} further take(s) belong to other cameras.'), { count: otherTakes.length })}
          </div>
        )}
      </div>
    </div>
  );
}

function Readout({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-bc-border bg-bc-panel-raised px-2 py-1">
      <div className="text-bc-dim text-[10px]">{label}</div>
      <div className="text-bc-text-bright tabular-nums">{value}</div>
      {sub && <div className="text-bc-faint text-[10px]">{sub}</div>}
    </div>
  );
}

