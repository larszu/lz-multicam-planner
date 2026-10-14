import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiCamera,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiPlay,
  FiPlus,
  FiPrinter,
  FiSquare,
  FiTrash2,
} from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { captureCurrentShot } from '../../utils/captureShot';
import {
  TRANSITION_LABEL,
  nextTransitionMode,
  runCameraTransition,
  transitionSeconds,
} from '../../utils/cameraTransition';
import { indexOfShot, shotTargetFromState, stepShotIndex } from '../../utils/shot';
import {
  MOTION_PROFILES,
  feasibleDurationRounded,
  profileForMount,
} from '../../utils/motionProfile';
import type { CameraMountType } from '../../types';
import { exportStoryboardPng, printStoryboard, shotOpticsLabel } from '../../utils/storyboard';
import { storyboardFingerprint } from '../../utils/documentContent';
import { useTranslation, format } from '../../i18n';
import { motionProfileHint, motionProfileLabel, mountTypeLabel } from '../../i18n/mount';
import { stampForStand } from '../../utils/documentStamp';
import type { Shot } from '../../types';

/**
 * Shotlist-/Storyboard-Panel (#62 Punkt 5).
 *
 * Ein Preset ist ein einzelner Kamera-Zustand — ein Shot ist derselbe Zustand,
 * benannt, mit Framegrab und als Teil einer geordneten Sequenz. Das Panel
 * nimmt Shots auf, faehrt sie einzeln oder als Sequenz an (mit derselben
 * Transition-Engine wie die Presets, #62 Punkt 4) und exportiert sie als
 * Storyboard (PNG-Kontaktbogen oder Druck/PDF).
 */
export default function ShotlistPanel() {
  const { t } = useTranslation();
  const {
    shotlists,
    activeShotlistId,
    currentShotId,
    shotlistStorageFull,
    addShotlist,
    removeShotlist,
    renameShotlist,
    setActiveShotlist,
    updateShot,
    removeShot,
    moveShot,
    setCurrentShotId,
    cameras,
    selectedCameraId,
    selectCamera,
    updateCamera,
    venue,
  } = useStore();

  const list = shotlists.find((l) => l.id === activeShotlistId) ?? null;
  // Memoisiert, damit die Sequenz-Callbacks stabile Dependencies haben (sonst
  // ist `?? []` bei jedem Render ein neues Array).
  const shots = useMemo(() => list?.shots ?? [], [list]);

  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Abbruch-Handle der laufenden Fahrt. Ein neuer Sprung bricht die alte Fahrt
  // ab, damit sich zwei Interpolationen nicht gegenseitig ueberschreiben.
  const cancelRef = useRef<(() => void) | null>(null);
  const playingRef = useRef(false);

  const stopTransition = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    stopTransition();
  }, [stopTransition]);

  // Laufende Fahrt beim Unmount stoppen — sonst schreibt der RAF-Tick weiter
  // in den Store, obwohl das Panel schon weg ist.
  useEffect(() => () => {
    playingRef.current = false;
    cancelRef.current?.();
  }, []);

  const flash = useCallback((msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint((h) => (h === msg ? null : h)), 3500);
  }, []);

  /** Faehrt einen Shot an. `onDone` treibt die Playback-Kette. */
  const goToShot = useCallback(
    (shot: Shot, onDone?: () => void) => {
      stopTransition();

      // Shot kann zu einer anderen Kamera gehoeren — erst umschalten.
      if (shot.cameraId !== selectedCameraId) selectCamera(shot.cameraId);

      const from = useStore.getState().cameras.find((c) => c.id === shot.cameraId);
      setCurrentShotId(shot.id);

      if (!from) {
        // Kamera wurde geloescht, seit der Shot aufgenommen wurde.
        flash('Kamera dieses Shots existiert nicht mehr.');
        onDone?.();
        return;
      }

      const target = shotTargetFromState(shot.state);
      const secs = transitionSeconds(shot.transition, shot.transitionSeconds);
      // Bewegungsstil: explizit am Shot gesetzt, sonst der der Montage.
      const profile = profileForMount(shot.motionStyle ?? from.mountType);

      cancelRef.current = runCameraTransition({
        from,
        to: target,
        seconds: secs,
        profile,
        apply: (patch) => updateCamera(shot.cameraId, patch),
        onDone: () => {
          cancelRef.current = null;
          onDone?.();
        },
      });
    },
    [flash, selectCamera, selectedCameraId, setCurrentShotId, stopTransition, updateCamera],
  );

  /** Shot aus der aktuellen Preview-Ansicht aufnehmen. */
  const captureShot = useCallback(() => {
    const res = captureCurrentShot();
    if (!res.ok) {
      flash(res.reason ?? 'Aufnehmen fehlgeschlagen.');
      return;
    }
    if (!res.hadThumbnail) {
      // Sollte dank Offscreen-Render praktisch nie passieren — nur wenn gar
      // keine Preview gemountet ist (z. B. Panel allein im Grid-Preset).
      flash('Shot gespeichert — ohne Bild (Preview nicht verfügbar).');
    }
  }, [flash]);

  /** Vor/Zurueck in der Sequenz (Klick oder Q/E). */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (shots.length === 0) return;
      stopPlayback();
      const next = stepShotIndex(indexOfShot(shots, currentShotId), shots.length, dir);
      if (next >= 0) goToShot(shots[next]);
    },
    [currentShotId, goToShot, shots, stopPlayback],
  );

  /** Sequenz ab dem aktuellen (oder ersten) Shot abspielen. */
  const play = useCallback(() => {
    if (shots.length === 0) return;
    stopTransition();
    playingRef.current = true;
    setPlaying(true);

    const startAt = Math.max(0, indexOfShot(shots, currentShotId));
    const runFrom = (i: number) => {
      if (!playingRef.current) return;
      if (i >= shots.length) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      goToShot(shots[i], () => runFrom(i + 1));
    };
    // Beim Start auf dem letzten Shot von vorn beginnen, sonst ist sofort Ende.
    runFrom(startAt >= shots.length - 1 ? 0 : startAt);
  }, [currentShotId, goToShot, shots, stopTransition]);

  // Q/E-Navigation wie in Cine Tracer. Tippen in Feldern darf nicht springen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'q') { e.preventDefault(); step(-1); }
      else if (k === 'e') { e.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  /**
   * Stand-Angabe fuer das Storyboard (ADR-004). Der MultiCam-Planner kennt
   * keinen festgeschriebenen Stand — er zaehlt Aenderungen, statt sie
   * festzuschreiben. Also nennt der Stempel keine Revision und behauptet keine
   * Abweichung (Regel 2): kein Bezugspunkt, keine Aussage. Was er sagt, ist
   * genau die Frage von der Baustelle: Projekt, Zeitpunkt, acht Zeichen.
   */
  const stempel = useCallback(
    () =>
      list
        ? stampForStand({
            project: venue.name || list.name || 'Storyboard',
            current: storyboardFingerprint(list),
            now: new Date(),
          })
        : undefined,
    [list, venue.name],
  );

  const doExportPng = useCallback(async () => {
    if (!list || list.shots.length === 0) return;
    setBusy(true);
    try {
      await exportStoryboardPng(list, venue.name, stempel());
    } catch {
      flash('Export fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }, [flash, list, stempel, venue.name]);

  const btn =
    'px-2 py-1 rounded-bc-m text-[11px] border border-bc-border text-bc-text hover:text-bc-text-bright hover:border-bc-accent/60 disabled:opacity-40 disabled:hover:text-bc-text disabled:hover:border-bc-border transition-colors';

  return (
    <div data-shotlist-panel className="w-full h-full flex flex-col bg-bc-panel text-bc-text-bright overflow-hidden">
      {/* ── Kopfzeile: Liste waehlen / anlegen ── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-bc-border shrink-0">
        {/* `aria-label` (B-77): das Feld steht ohne Beschriftung daneben, und
            seine Optionen tragen Listennamen — ohne Namen weiss ein
            Screenreader nicht, WOFUER die Liste gewaehlt wird. Es war das
            einzige Feld dieser App ohne Namen; `bedienbar:check` in der Suite
            misst genau das. */}
        <select
          aria-label={t('shotlist.pick', 'Shotlist')}
          value={activeShotlistId ?? ''}
          onChange={(e) => setActiveShotlist(e.target.value || null)}
          className="border border-bc-border bg-bc-panel-raised px-1.5 py-1 text-xs text-bc-text-bright max-w-[45%] flex-1 min-w-0"
        >
          {shotlists.length === 0 && <option value="">{t('shotlist.none', '— no shotlist —')}</option>}
          {shotlists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.shots.length})
            </option>
          ))}
        </select>
        <button className={btn} onClick={() => addShotlist(`Shotlist ${shotlists.length + 1}`)} title={t('shotlist.new', 'New shotlist')}>
          <FiPlus size={13} />
        </button>
        <button
          className={btn}
          disabled={!list}
          title={t('shotlist.rename', 'Rename shotlist')}
          onClick={() => {
            if (!list) return;
            const name = window.prompt(t('shotlist.renamePrompt', 'Name of the shotlist:'), list.name);
            if (name && name.trim()) renameShotlist(list.id, name.trim());
          }}
        >
          {t('shotlist.renameShort', 'Rename')}
        </button>
        <button
          className={btn}
          disabled={!list}
          title={t('shotlist.delete', 'Delete shotlist')}
          onClick={() => {
            if (!list) return;
            if (window.confirm(format(
              t('shotlist.deleteConfirm', 'Delete shotlist "{name}" with {count} shots?'),
              { name: list.name, count: list.shots.length },
            ))) {
              stopPlayback();
              removeShotlist(list.id);
            }
          }}
        >
          <FiTrash2 size={13} />
        </button>
      </div>

      {/* ── Aktionsleiste ── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-bc-border shrink-0 flex-wrap">
        <button
          className="px-2 py-1 text-[11px] font-medium border border-bc-accent/60 text-bc-accent bg-bc-accent/10 hover:bg-bc-accent/20 disabled:opacity-40 transition-colors flex items-center gap-1"
          onClick={captureShot}
          disabled={!selectedCameraId}
          title={t('shotlist.capture', 'Save the current preview view as a shot')}
        >
          <FiCamera size={13} /> {t('shotlist.captureShot', 'Capture shot')}
        </button>

        <div className="w-px h-4 bg-bc-border" />

        <button className={btn} onClick={() => step(-1)} disabled={shots.length === 0} title={t('shotlist.prev', 'Previous shot (Q)')}>
          <FiChevronLeft size={13} />
        </button>
        <button className={btn} onClick={() => step(1)} disabled={shots.length === 0} title={t('shotlist.next', 'Next shot (E)')}>
          <FiChevronRight size={13} />
        </button>
        {playing ? (
          <button className={btn} onClick={stopPlayback} title={t('shotlist.stop', 'Stop the sequence')}>
            <FiSquare size={13} />
          </button>
        ) : (
          <button className={btn} onClick={play} disabled={shots.length === 0} title={t('shotlist.playSequence', 'Play the sequence')}>
            <FiPlay size={13} />
          </button>
        )}

        <div className="w-px h-4 bg-bc-border" />

        <button className={btn} onClick={doExportPng} disabled={!list || shots.length === 0 || busy} title={t('shotlist.exportPng', 'Storyboard as PNG')}>
          <FiDownload size={13} />
        </button>
        <button
          className={btn}
          onClick={() => list && printStoryboard(list, venue.name, stempel())}
          disabled={!list || shots.length === 0}
          title={t('shotlist.print', 'Print storyboard / save as PDF')}
        >
          <FiPrinter size={13} />
        </button>

        <span className="ml-auto text-[10px] text-bc-dim">Q / E</span>
      </div>

      {(hint || shotlistStorageFull) && (
        <div className="px-2 py-1 text-[10px] border-b border-bc-border shrink-0">
          {hint && <div className="text-bc-yellow">{hint}</div>}
          {shotlistStorageFull && (
            <div className="text-bc-red">
              {t('shotlist.storageFull', 'Storage full — the last change was not saved permanently. Delete older shots or export the storyboard.')}
            </div>
          )}
        </div>
      )}

      {/* ── Shot-Streifen ── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {shots.length === 0 && (
          <div className="text-center text-bc-dim text-xs py-8 leading-relaxed">
            {t('shotlist.empty', 'No shots yet.')}
            <br />
            {t('shotlist.empty.hint1', 'Set the camera up in the preview and click')}{' '}
            <span className="text-bc-accent">{t('shotlist.empty.action', 'Capture shot')}</span>.
          </div>
        )}

        {shots.map((shot, i) => {
          const isCurrent = shot.id === currentShotId;
          const shotCam = cameras.find((c) => c.id === shot.cameraId);
          const camGone = !shotCam;
          const secs = transitionSeconds(shot.transition, shot.transitionSeconds);
          // Bewegungsstil + physikalische Mindestdauer auf diesem Rig. Die
          // Fahrt geht vom aktuellen Kamerastand zum Shot — genau die Strecke,
          // die beim Abspielen zurueckgelegt wird.
          const effStyle: CameraMountType = shot.motionStyle ?? shotCam?.mountType ?? 'tripod';
          const profile = profileForMount(effStyle);
          const needS = shotCam ? feasibleDurationRounded(profile, shotCam, shot.state) : 0;
          const tooFast = secs > 0 && needS > secs;
          return (
            <div
              key={shot.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dropIndex !== i) setDropIndex(i);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (list && dragIndex !== null && dragIndex !== i) moveShot(list.id, dragIndex, i);
                setDragIndex(null);
                setDropIndex(null);
              }}
              className={` border overflow-hidden cursor-pointer transition-colors ${
                isCurrent ? 'border-bc-accent bg-bc-accent/10' : 'border-bc-border bg-bc-dark hover:border-bc-accent/50'
              } ${dropIndex === i && dragIndex !== null && dragIndex !== i ? 'ring-1 ring-bc-accent' : ''} ${
                dragIndex === i ? 'opacity-50' : ''
              }`}
              onClick={() => {
                stopPlayback();
                goToShot(shot);
              }}
            >
              <div className="flex gap-2 p-1.5">
                {/* Framegrab */}
                {/* SCHWARZ BLEIBT SCHWARZ, auch im Hell-Thema: das ist der
                    Letterbox-Grund hinter einem Framegrab und keine
                    Oberflaechenfarbe. Ein Bild im 16:9-Kasten, das auf Weiss
                    ausgeblendet wird, sieht aus, als fehlte ein Stueck. */}
                <div className="relative w-28 shrink-0 aspect-video bg-bc-media overflow-hidden flex items-center justify-center">
                  {shot.thumbnail ? (
                    <img src={shot.thumbnail} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[11px] text-bc-faint">{t('shotlist.noThumb', 'no image')}</span>
                  )}
                  <span className="absolute top-0.5 left-0.5 bg-bc-scrim text-bc-yellow font-bold text-[11px] px-1">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>

                {/* Daten */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <input
                    value={shot.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => list && updateShot(list.id, shot.id, { name: e.target.value })}
                    className="bg-transparent border border-transparent hover:border-bc-border focus:border-bc-accent px-1 py-0.5 text-xs font-medium text-bc-text-bright w-full outline-none"
                    title={t('shotlist.renameShot', 'Name the shot')}
                  />
                  <div className="text-[10px] text-bc-muted px-1 truncate">{shotOpticsLabel(shot)}</div>
                  <div className="flex items-center gap-1 px-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (list) updateShot(list.id, shot.id, { transition: nextTransitionMode(shot.transition) });
                      }}
                      className="text-[11px] px-1 py-0.5 border border-bc-border text-bc-muted hover:text-bc-text-bright hover:border-bc-accent/60"
                      title={t('shotlist.transitionToggle', 'Toggle the transition time (OFF / Fast / Slow / Manual)')}
                    >
                      {TRANSITION_LABEL[shot.transition]}
                      {secs > 0 ? ` ${secs}s` : ''}
                    </button>
                    {shot.transition === 'manual' && (
                      <input
                        type="number"
                        min={0}
                        max={120}
                        step={0.5}
                        value={shot.transitionSeconds ?? 6}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (list) {
                            updateShot(list.id, shot.id, {
                              transitionSeconds: Number.isFinite(v) ? Math.max(0, Math.min(120, v)) : 0,
                            });
                          }
                        }}
                        className="w-12 bg-bc-panel border border-bc-border px-1 py-0.5 text-[11px] text-bc-text-bright"
                        title={t('shotlist.transitionSeconds', 'Transition time in seconds')}
                      />
                    )}
                    {/* Bewegungsstil: leer = der der Montage. */}
                    <select
                      value={shot.motionStyle ?? ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (!list) return;
                        const v = e.target.value;
                        updateShot(list.id, shot.id, {
                          motionStyle: v ? (v as CameraMountType) : undefined,
                        });
                      }}
                      className="bg-bc-panel border border-bc-border px-0.5 py-0.5 text-[11px] text-bc-muted max-w-[86px]"
                      title={format(t('shotlist.motionStyle', 'Movement style - {hint}'), { hint: motionProfileHint(t, effStyle) })}
                    >
                      <option value="">
                        {format(t('shotlist.rigIs', 'Rig: {rig}'), { rig: mountTypeLabel(t, shotCam?.mountType ?? 'tripod') })}
                      </option>
                      {(Object.keys(MOTION_PROFILES) as CameraMountType[]).map((m) => (
                        <option key={m} value={m}>{motionProfileLabel(t, m)}</option>
                      ))}
                    </select>
                    {tooFast && (
                      <span
                        className="text-[11px] text-bc-yellow"
                        title={format(t('shotlist.tooFast', 'On a {rig} this move needs at least {need} s - the {set} s set here are physically out of reach.'), { rig: motionProfileLabel(t, effStyle), need: needS, set: secs })}
                      >
                        min {needS}s
                      </span>
                    )}
                    {camGone && (
                      <span className="text-[11px] text-bc-red" title={t('shotlist.cameraGone', 'The camera of this shot has been deleted')}>
                        {t('shotlist.cameraMissing', 'Camera missing')}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (list) removeShot(list.id, shot.id);
                      }}
                      className="ml-auto p-0.5 text-bc-dim hover:text-bc-red"
                      title={t('shotlist.deleteShot', 'Delete shot')}
                    >
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                  <input
                    value={shot.note ?? ''}
                    placeholder={t('shotlist.notePlaceholder', 'Note…')}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => list && updateShot(list.id, shot.id, { note: e.target.value })}
                    className="bg-transparent border border-transparent hover:border-bc-border focus:border-bc-accent px-1 py-0.5 text-[10px] text-bc-text w-full outline-none"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
