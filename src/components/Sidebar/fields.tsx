// Bausteine der Kamera-Eigenschaften.
//
// Die Karte hatte 27 Bedienelemente in einer flachen Spalte, in drei
// verschiedenen Label-Wert-Mustern und ohne Wertanker an den Reglern. Hier
// liegen die wenigen Muster, die es stattdessen gibt — jede Zeile in der Karte
// benutzt genau eines davon:
//
//   <Group>        aufklappbarer Abschnitt (Optik, Blickrichtung, Standort …)
//   <FieldRow>     Label links, Bedienelement rechts (Selects, Zahlenpaare)
//   <ValueSlider>  Label + Wertfeld an fester rechter Kante, darunter der
//                  Regler mit Min/Max/Null-Ankern
//   <Readout>      reine Anzeige ohne Bedienelement
//
// **Padding immer per Inline-Style**: die App hat ein globales `* { padding: 0 }`
// (ungelayert), das jede Tailwind-`p-*`-Utility aussticht. Ohne Inline-Style
// waeren Trefferflaechen ~20 px hoch.
//
// **Container-Queries statt Viewport-Breakpoints**: die Spalte ist schmal und
// frei skalierbar; entscheidend ist die Breite der KARTE, nicht die des
// Fensters. Ab 21rem INHALTSbreite ruecken Label und Bedienelement
// nebeneinander — `container-type: inline-size` misst die Content-Box, das
// Padding zaehlt also nicht mit (mit `@sm`/24rem griff die Regel deshalb erst
// bei einer viel breiteren Spalte als gedacht).
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { loadJSON, saveJSON } from '../../utils/storage';

const GROUP_STATE_KEY = 'multicam-camera-groups';

type GroupState = Record<string, boolean>;

function readGroupState(): GroupState {
  const parsed = loadJSON<GroupState>(GROUP_STATE_KEY, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Aufklappbarer Abschnitt innerhalb der Kamera-Karte. Der Zustand haengt am
 * `id` und gilt fuer ALLE Kameras — wer die Optik zuklappt, will sie bei jeder
 * Kamera zu haben, nicht nur bei dieser.
 */
export function Group({
  id,
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  /** Kurzfassung rechts im Kopf, sichtbar auch im zugeklappten Zustand. */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => readGroupState()[id] ?? defaultOpen);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      saveJSON(GROUP_STATE_KEY, { ...readGroupState(), [id]: next });
      return next;
    });
  }, [id]);

  return (
    <section className="border border-bc-border/70 bg-bc-dark/30">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{ padding: '7px 8px', minHeight: '32px' }}
        className="flex w-full items-center gap-2 text-left hover:bg-bc-hover"
      >
        <span className="text-[13px] font-semibold text-bc-text-bright">{title}</span>
        {summary && <span className="truncate text-[10px] text-bc-dim">{summary}</span>}
        <FiChevronDown
          size={14}
          className={`ml-auto shrink-0 text-bc-dim transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div style={{ padding: '2px 8px 8px' }} className="space-y-2">
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * Label + Bedienelement. Schmal untereinander, ab `@sm` nebeneinander mit
 * fester Label-Spalte — dadurch stehen alle Bedienelemente auf einer Kante.
 */
export function FieldRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="@min-[21rem]:grid @min-[21rem]:grid-cols-[7rem_minmax(0,1fr)] @min-[21rem]:items-center @min-[21rem]:gap-2">
      <label htmlFor={htmlFor} className="mb-0.5 block text-[11px] text-bc-muted @min-[21rem]:mb-0">
        {label}
        {hint && <span className="block text-[10px] text-bc-faint leading-tight">{hint}</span>}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Reine Anzeige — gleiche Zeilenform wie ein Feld, nur ohne Bedienelement. */
export function Readout({ label, value, tone = 'normal' }: { label: string; value: React.ReactNode; tone?: 'normal' | 'muted' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-bc-muted">{label}</span>
      <span className={`text-[11px] tabular-nums ${tone === 'muted' ? 'text-bc-dim' : 'text-bc-text-bright'}`}>{value}</span>
    </div>
  );
}

export interface SliderMark {
  value: number;
  label: string;
}

/**
 * Der Standard-Regler der Karte: Wert immer rechts oben an derselben Kante,
 * direkt editierbar; darunter die Bahn mit Ankern, damit Min, Max und die Null
 * ablesbar sind (vorher stand nirgends, wo bei Pan die 0 liegt).
 */
export function ValueSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  decimals = 2,
  marks,
  onChange,
  hint,
  disabled,
  title,
  right,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
  /** Anker unter der Bahn. Ohne Angabe: Min, Max und — falls im Bereich — die Null. */
  marks?: SliderMark[];
  onChange: (v: number) => void;
  hint?: string;
  disabled?: boolean;
  title?: string;
  /** Zusatz rechts neben dem Wertfeld, z. B. ein Reset-Knopf. */
  right?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Aendert sich der Wert von aussen (Plan-Drag, Rig-Pult), soll das Feld
  // mitgehen — solange der Nutzer nicht selbst darin tippt.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(null);
  }, [value]);

  const commit = useCallback(
    (raw: string) => {
      const v = parseFloat(raw.replace(',', '.'));
      if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
      setDraft(null);
    },
    [max, min, onChange],
  );

  const anchors: SliderMark[] =
    marks ??
    [
      { value: min, label: fmt(min, decimals) },
      ...(min < 0 && max > 0 ? [{ value: 0, label: '0' }] : []),
      { value: max, label: fmt(max, decimals) },
    ];

  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-bc-muted" title={title}>
          {label}
        </span>
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          className="w-[4.5rem] shrink-0 border border-bc-border bg-bc-panel-raised text-right text-[11px] tabular-nums text-bc-text-bright disabled:text-bc-dim"
          style={{ padding: '2px 5px' }}
          value={draft ?? Number(value.toFixed(decimals))}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          title={title ?? label}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') setDraft(null);
          }}
        />
        {unit && <span className="w-6 shrink-0 text-[10px] text-bc-dim">{unit}</span>}
        {right}
      </div>
      <input
        type="range"
        className="mt-0.5 w-full accent-bc-accent"
        min={min}
        max={max}
        step={step}
        value={Math.max(min, Math.min(max, value))}
        disabled={disabled}
        aria-label={`${label} (Regler)`}
        title={title ?? label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="relative h-3 select-none" aria-hidden>
        {anchors.map((m) => {
          const pct = max > min ? ((m.value - min) / (max - min)) * 100 : 0;
          return (
            <span
              key={`${m.value}-${m.label}`}
              className="absolute top-0 text-[11px] tabular-nums text-bc-faint"
              style={{
                left: `${pct}%`,
                transform: pct <= 0 ? 'none' : pct >= 100 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {m.label}
            </span>
          );
        })}
      </div>
      {hint && <p className="text-[10px] leading-tight text-bc-faint">{hint}</p>}
    </div>
  );
}

function fmt(v: number, decimals: number): string {
  const rounded = Number(v.toFixed(decimals));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(Math.min(decimals, 2));
}

/** Hinweis-Zeile. `info` ist ein Dauerzustand, `warn` ein echtes Problem. */
export function Note({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
  const style =
    tone === 'warn'
      ? 'border-bc-red/60 bg-bc-red/10 text-bc-red'
      : 'border-bc-border bg-bc-dark text-bc-muted';
  return (
    <p style={{ padding: '3px 6px' }} className={` border text-[10px] leading-snug ${style}`}>
      {children}
    </p>
  );
}
