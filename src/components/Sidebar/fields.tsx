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
import Regler from '../ui/Regler';

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

/**
 * Der Standard-Regler der Karte — der gemeinsame `Regler` mit den
 * Voreinstellungen der Karte (Standardwert fuer Doppelklick, Min/Max/Null als
 * Anker).
 */
export function ValueSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  decimals = 2,
  standard,
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
  /** Doppelklick/Doppeltipp setzt diesen Wert. */
  standard?: number;
  onChange: (v: number) => void;
  hint?: string;
  disabled?: boolean;
  title?: string;
  /** Zusatz rechts neben dem Wertfeld, z. B. ein Reset-Knopf. */
  right?: React.ReactNode;
}) {
  return (
    <Regler
      label={label}
      value={Math.max(min, Math.min(max, value))}
      min={min}
      max={max}
      schritt={step}
      dezimalen={decimals}
      einheit={unit}
      standard={standard}
      formatMarke={(v) => fmt(v, decimals)}
      onChange={onChange}
      hinweis={hint}
      disabled={disabled}
      title={title}
      rechts={right}
    />
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
      ? 'border-bc-red/60 bg-bc-red/10 text-bc-red-text'
      : 'border-bc-border bg-bc-dark text-bc-muted';
  return (
    <p style={{ padding: '3px 6px' }} className={` border text-[10px] leading-snug ${style}`}>
      {children}
    </p>
  );
}
