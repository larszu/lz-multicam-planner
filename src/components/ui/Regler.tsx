// ───────────────────────────────────────────────────────────────────────────
// DER Regler der App — jeder Schieberegler laeuft hier durch (Objektiv,
// Pan/Tilt, Raum, Plan, Licht, Rechner).
//
// Nutzer-Meldung 2026-10-14: „Passe die Slider so an, dass sie moderner und
// intuitiver bedienbar sind, auch auf Touch."
//
// Warum kein nativer Range-Input mehr: der native Regler kennt weder eine
// logarithmische Bahn noch Rasten, Markierungen, Doppelklick auf Standard
// oder das Ziehen am Wert. Jede Stelle baute sich das daneben selbst — vier
// verschiedene Regler, vier Bedienungen. Jetzt eine.
//
// Bedienung (gleich an jeder Stelle):
//   • Bahn antippen/ziehen; am Griff gefasst springt er nicht.
//   • Rasten ziehen magnetisch an (Shift haelt frei).
//   • Am Namen ziehen verstellt ebenfalls — wie ein Drehknopf, ohne die Bahn
//     zu treffen. Kurz antippen springt ins Zahlenfeld.
//   • Zahlenfeld: tippen, Enter. Pfeil hoch/runter = ein Schritt.
//   • Pfeiltasten am Griff = fein, mit Shift = grob; Pos1/Ende = Grenzen.
//   • Doppelklick bzw. Doppeltipp auf Griff oder Namen = Standardwert.
//
// Touch: Bahn 44 px hoch, Griff 28 px (`pointer: coarse` im Stilblatt). Ein
// senkrechter Wisch auf der Bahn scrollt die Seite (`touch-action: pan-y`);
// erst ein waagrechter Zug verstellt — sonst verstellt man beim Scrollen
// durch die Vorschau jeden Regler, ueber den der Daumen faehrt.
// ───────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';
import { useTranslation } from '../../i18n';
import {
  platziereMarken,
  posZuWert,
  rasten,
  schrittWert,
  wertZuPos,
  aufSchritt,
  type ReglerMarke,
  type ReglerSkala,
} from '../../utils/reglerSkala';

export interface ReglerProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** Bahn: linear (Standard) oder logarithmisch (Brennweite, Blende, Fokus). */
  skala?: ReglerSkala;
  /** Raster der linearen Bahn und Schritt der Pfeiltasten. */
  schritt?: number;
  /** Rasten, an denen der Wert magnetisch einschnappt. */
  raster?: readonly number[];
  /** Markierungen unter der Bahn; ohne Angabe Min, Max und (falls drin) die Null. */
  marken?: readonly (number | ReglerMarke)[];
  formatMarke?: (v: number) => string;
  /** Lesbarer Wert fuer Screenreader und Tooltips. */
  format?: (v: number) => string;
  /** Nachkommastellen im Zahlenfeld. */
  dezimalen?: number;
  /** Eigene Darstellung im Feld (z. B. Uhrzeit) samt Rueckweg; `null` = ungueltig. */
  feldText?: (v: number) => string;
  feldLesen?: (s: string) => number | null;
  praefix?: string;
  einheit?: string;
  /** Doppelklick/Doppeltipp setzt diesen Wert. */
  standard?: number;
  /** Ab hier fuellt sich die Bahn (Standard: Null, sonst Minimum). */
  fuellungAb?: number;
  /** Eigener grober Schritt (z. B. eine Blendenstufe); zeigt − / +. */
  onStep?: (dir: 1 | -1) => void;
  /** Zusatz rechts in der Kopfzeile (Manuell-Umschalter, Reset …). */
  rechts?: ReactNode;
  /** Kurzer Zusatz hinter dem Wert („gesperrt"). */
  notiz?: string;
  /** Erklaerzeile unter der Bahn. */
  hinweis?: string;
  /** Hinterlegung der Bahn (z. B. goldene Stunde). Positionen per `posVon`. */
  hinterlegung?: (posVon: (v: number) => number) => ReactNode;
  /** Name nur fuer Screenreader (Regler steht in einer beschrifteten Zeile). */
  labelVersteckt?: boolean;
  disabled?: boolean;
  title?: string;
}

/** Rastweite in Bildschirmpixeln — Maus genau, Finger grob. */
const RAST_PX = { maus: 8, finger: 14 } as const;
/** So weit muss ein Finger waagrecht ziehen, bevor der Regler uebernimmt. */
const ZUG_SCHWELLE_PX = 6;
const DOPPEL_MS = 350;

export default function Regler({
  label,
  value,
  min,
  max,
  onChange,
  skala = 'linear',
  schritt,
  raster,
  marken,
  formatMarke,
  format,
  dezimalen,
  feldText: feldTextVon,
  feldLesen,
  praefix,
  einheit,
  standard,
  fuellungAb,
  onStep,
  rechts,
  notiz,
  hinweis,
  hinterlegung,
  labelVersteckt,
  disabled,
  title,
}: ReglerProps) {
  const { t } = useTranslation();
  const bahnRef = useRef<HTMLDivElement>(null);
  const feldRef = useRef<HTMLInputElement>(null);
  const [bahnPx, setBahnPx] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [zieht, setZieht] = useState(false);

  useLayoutEffect(() => {
    const el = bahnRef.current;
    if (!el) return;
    setBahnPx(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBahnPx(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmt = format ?? ((v: number) => `${praefix ?? ''}${zahl(v, dezimalen)}${einheit ? ` ${einheit}` : ''}`);
  const fmtMarke = formatMarke ?? ((v: number) => zahl(v, dezimalen));
  const pos = wertZuPos(value, min, max, skala);
  const posVon = useCallback((v: number) => wertZuPos(v, min, max, skala), [min, max, skala]);

  const setze = useCallback((roh: number, frei: boolean, finger: boolean) => {
    let v = Math.min(max, Math.max(min, roh));
    if (!frei && raster?.length && bahnPx > 0) {
      v = rasten(v, raster, min, max, skala, (finger ? RAST_PX.finger : RAST_PX.maus) / bahnPx);
    }
    if (skala === 'linear' && schritt) v = aufSchritt(v, schritt, min);
    else if (dezimalen !== undefined) v = Number(v.toFixed(dezimalen));
    if (v !== value) onChange(v);
  }, [bahnPx, dezimalen, max, min, onChange, raster, schritt, skala, value]);

  const zuStandard = useCallback(() => {
    if (standard !== undefined && !disabled) onChange(Math.min(max, Math.max(min, standard)));
  }, [disabled, max, min, onChange, standard]);

  // ── Ziehen auf der Bahn ──
  const zug = useRef<{ id: number; x0: number; y0: number; finger: boolean; aktiv: boolean; versatz: number } | null>(null);
  const letzterTipp = useRef(0);
  const posAusX = (clientX: number, versatz = 0) => {
    const r = bahnRef.current!.getBoundingClientRect();
    return r.width > 0 ? (clientX + versatz - r.left) / r.width : 0;
  };

  const onBahnDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !bahnRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = bahnRef.current.getBoundingClientRect();
    const griffX = r.left + pos * r.width;
    const finger = e.pointerType !== 'mouse';
    const amGriff = Math.abs(e.clientX - griffX) <= (finger ? 22 : 12);
    zug.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, finger, aktiv: !finger, versatz: amGriff ? griffX - e.clientX : 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!finger) {
      e.preventDefault();
      (e.currentTarget.querySelector('[role="slider"]') as HTMLElement | null)?.focus({ preventScroll: true });
      setZieht(true);
      setze(posZuWert(posAusX(e.clientX, zug.current.versatz), min, max, skala), e.shiftKey, false);
    }
  };
  const onBahnMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const z = zug.current;
    if (!z || z.id !== e.pointerId) return;
    if (!z.aktiv) {
      const dx = Math.abs(e.clientX - z.x0);
      const dy = Math.abs(e.clientY - z.y0);
      if (dx < ZUG_SCHWELLE_PX || dx < dy) return;
      z.aktiv = true;
      setZieht(true);
    }
    setze(posZuWert(posAusX(e.clientX, z.versatz), min, max, skala), e.shiftKey, z.finger);
  };
  const onBahnUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const z = zug.current;
    if (!z || z.id !== e.pointerId) return;
    zug.current = null;
    setZieht(false);
    if (e.type === 'pointercancel' || !z.finger || z.aktiv) return;
    // Finger hat getippt, nicht gezogen.
    const jetzt = performance.now();
    if (z.versatz !== 0 || Math.abs(posAusX(e.clientX) - pos) * bahnPx <= 22) {
      if (jetzt - letzterTipp.current < DOPPEL_MS) { zuStandard(); letzterTipp.current = 0; return; }
      letzterTipp.current = jetzt;
      return;
    }
    letzterTipp.current = jetzt;
    setze(posZuWert(posAusX(e.clientX), min, max, skala), false, true);
  };

  // ── Ziehen am Namen: wie ein Drehknopf ──
  const knopf = useRef<{ id: number; x0: number; p0: number; bewegt: boolean; finger: boolean } | null>(null);
  const onKnopfDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    knopf.current = { id: e.pointerId, x0: e.clientX, p0: pos, bewegt: false, finger: e.pointerType !== 'mouse' };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onKnopfMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const k = knopf.current;
    if (!k || k.id !== e.pointerId || !(bahnPx > 0)) return;
    const dx = e.clientX - k.x0;
    if (!k.bewegt && Math.abs(dx) < 3) return;
    k.bewegt = true;
    setZieht(true);
    const p = k.p0 + (dx / bahnPx) * (e.shiftKey ? 0.2 : 1);
    setze(posZuWert(Math.min(1, Math.max(0, p)), min, max, skala), e.shiftKey, k.finger);
  };
  const onKnopfUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const k = knopf.current;
    if (!k || k.id !== e.pointerId) return;
    knopf.current = null;
    setZieht(false);
    if (k.bewegt || e.type === 'pointercancel') return;
    const jetzt = performance.now();
    if (jetzt - letzterTipp.current < DOPPEL_MS) { zuStandard(); letzterTipp.current = 0; return; }
    letzterTipp.current = jetzt;
    feldRef.current?.focus();
  };

  const tasten = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let next: number | null = null;
    const vor = e.key === 'ArrowRight' || e.key === 'ArrowUp';
    const zurueck = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
    if (vor || zurueck) {
      const dir = vor ? 1 : -1;
      if (e.shiftKey && onStep) { e.preventDefault(); onStep(dir); return; }
      next = schrittWert(value, dir, e.shiftKey, min, max, skala, schritt);
      if (dezimalen !== undefined && !(skala === 'linear' && schritt)) {
        // Gerundet darf der feine Schritt nicht auf der Stelle treten.
        const r = Number(next.toFixed(dezimalen));
        next = Math.min(max, Math.max(min, r !== Number(value.toFixed(dezimalen)) ? r : Number((value + dir * 10 ** -dezimalen).toFixed(dezimalen))));
      }
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const dir = e.key === 'PageUp' ? 1 : -1;
      if (onStep) { e.preventDefault(); onStep(dir); return; }
      next = schrittWert(value, dir, true, min, max, skala, schritt);
    } else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    if (next !== value) onChange(next);
  };

  const uebernehmen = () => {
    if (draft === null) return;
    const v = feldLesen ? feldLesen(draft) : parseFloat(draft.replace(',', '.'));
    if (v !== null && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    setDraft(null);
  };

  // Aendert sich der Wert von aussen, zeigt das Feld ihn — ausser man tippt gerade.
  useEffect(() => {
    if (document.activeElement !== feldRef.current) setDraft(null);
  }, [value]);

  const ab = fuellungAb ?? (min < 0 && max > 0 ? 0 : min);
  const pAb = wertZuPos(Math.min(max, Math.max(min, ab)), min, max, skala);
  const fuellLinks = Math.min(pAb, pos);
  const fuellBreite = Math.abs(pos - pAb);

  const markenListe: ReglerMarke[] = (marken ?? [min, ...(min < 0 && max > 0 ? [0] : []), max])
    .map((m) => (typeof m === 'number' ? { value: m, label: fmtMarke(m) } : m));
  const platziert = platziereMarken(markenListe, min, max, skala, bahnPx);
  const feldText = draft ?? (feldTextVon ? feldTextVon(value) : zahl(value, dezimalen));

  return (
    <div className={`bc-regler-feld ${disabled ? 'opacity-45' : ''}`} title={title} data-ziehen={zieht || undefined}>
      <div className={labelVersteckt ? 'flex flex-wrap items-center justify-end gap-1.5' : 'flex min-h-8 flex-wrap items-center gap-x-1.5 gap-y-1'}>
        {!labelVersteckt && (
          <span
            className="bc-regler-knopf min-w-0 max-w-full truncate"
            onPointerDown={onKnopfDown}
            onPointerMove={onKnopfMove}
            onPointerUp={onKnopfUp}
            onPointerCancel={onKnopfUp}
            onDoubleClick={zuStandard}
            title={t('regler.knob.title', 'Drag sideways to adjust · double-click: default')}
          >
            {label}
          </span>
        )}
        <span className="inline-flex shrink-0 items-center gap-0.5">
          {praefix && <span className="text-[11px] text-bc-dim">{praefix}</span>}
          <input
            ref={feldRef}
            className="bc-regler-wert"
            value={feldText}
            inputMode="decimal"
            disabled={disabled}
            aria-label={`${label} — ${t('regler.value', 'value')}`}
            title={t('regler.field.title', 'Type a value · Enter applies · ↑/↓ one step')}
            data-regler-feld
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={uebernehmen}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                uebernehmen();
                // Enter haengt die Felder einer Gruppe zur Kette: Wert, Enter,
                // naechster Wert — der Ablauf beim Gleichstellen mehrerer Kameras.
                const kette = e.currentTarget.closest('[data-regler-kette]');
                const felder = kette ? Array.from(kette.querySelectorAll<HTMLInputElement>('[data-regler-feld]')) : [];
                const naechstes = felder[felder.indexOf(e.currentTarget) + (e.shiftKey ? -1 : 1)];
                if (naechstes) naechstes.focus();
                else e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setDraft(null);
                e.currentTarget.blur();
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                setDraft(null);
                const dir = e.key === 'ArrowUp' ? 1 : -1;
                if (onStep && !e.shiftKey) onStep(dir);
                else onChange(schrittWert(value, dir, e.shiftKey, min, max, skala, schritt));
              }
            }}
            style={{ width: `${Math.max(3, feldText.length) + 2.2}ch` }}
          />
          {einheit && <span className="text-[11px] text-bc-dim">{einheit}</span>}
        </span>
        {notiz && <span className="truncate text-[11px] text-bc-yellow-text">· {notiz}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {onStep && (
            <>
              <button type="button" className="bc-regler-stufe" onClick={() => onStep(-1)} disabled={disabled} aria-label={t('regler.stepBack', 'One step back')} title={t('regler.stepBack', 'One step back')}>
                <FiMinus size={14} />
              </button>
              <button type="button" className="bc-regler-stufe" onClick={() => onStep(1)} disabled={disabled} aria-label={t('regler.stepForward', 'One step forward')} title={t('regler.stepForward', 'One step forward')}>
                <FiPlus size={14} />
              </button>
            </>
          )}
          {rechts}
        </span>
      </div>

      <div
        ref={bahnRef}
        className="bc-regler"
        onPointerDown={onBahnDown}
        onPointerMove={onBahnMove}
        onPointerUp={onBahnUp}
        onPointerCancel={onBahnUp}
        onDoubleClick={(e) => { if (zug.current === null && Math.abs(posAusX(e.clientX) - pos) * bahnPx <= 14) zuStandard(); }}
      >
        <div className="bc-regler-bahn">
          {hinterlegung?.(posVon)}
          <div className="bc-regler-wertspur" style={{ left: `${fuellLinks * 100}%`, width: `${fuellBreite * 100}%` }} />
        </div>
        {platziert.map((m, i) => (
          <span key={`s${i}`} className="bc-regler-strich" style={{ left: `${m.pos * 100}%` }} aria-hidden />
        ))}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={fmt(value)}
          aria-disabled={disabled || undefined}
          className="bc-regler-griff"
          style={{ left: `${pos * 100}%` }}
          onKeyDown={tasten}
        />
      </div>
      <div className="bc-regler-marken" aria-hidden>
        {platziert.filter((m) => m.zeigen).map((m, i) => (
          <span
            key={`m${i}`}
            className={Math.abs(m.value - value) < 1e-6 ? 'text-bc-text-bright' : undefined}
            style={{
              left: `${m.pos * 100}%`,
              transform: m.ausrichtung === 'start' ? 'none' : m.ausrichtung === 'ende' ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {m.label}
          </span>
        ))}
      </div>
      {hinweis && <p className="text-[11px] leading-tight text-bc-dim">{hinweis}</p>}
    </div>
  );
}

function zahl(v: number, dezimalen?: number): string {
  if (dezimalen !== undefined) return String(Number(v.toFixed(dezimalen)));
  return String(Number(v.toFixed(Math.abs(v) < 10 ? 2 : 1)));
}
