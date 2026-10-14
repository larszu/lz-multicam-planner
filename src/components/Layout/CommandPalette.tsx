// ───────────────────────────────────────────────────────────────────────────
// ADR-007 Abschnitt 6 — „Kommandopalette auf Strg/Cmd + K in jeder App,
// derselbe Griff ueberall."
//
// DERSELBE GRIFF IST DER GANZE PUNKT. Wer zwischen Kabel-, Licht- und
// Kamera-Plan wechselt, soll nicht nachdenken muessen, wo dieses Werkzeug
// seine Ansichten versteckt. Cable-Planner hat die Palette seit #ux; hier
// fehlte sie, und damit war die Zusage der Suite in einem von drei Planern
// nicht eingeloest.
//
// SIE ERFINDET KEINE BEFEHLE. Jeder Eintrag ruft genau die Funktion auf, die
// auch der Knopf in der Kopfzeile ruft — die Liste kommt von aussen, aus
// `App.tsx`, wo die Handler ohnehin liegen. Eine Palette mit eigener Logik
// waere eine zweite Bedienoberflaeche, die beim naechsten Umbau still
// auseinanderlaeuft.
// ───────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  /** Was in der Liste steht. */
  label: string;
  /** Woher der Befehl kommt — „Ansicht", „Layout", „Werkzeuge". */
  group: string;
  run: () => void;
}

interface Props {
  commands: Command[];
}

/** Einfache Teilstring-Suche, ohne Fuzzy: was man tippt, muss dastehen. */
const passt = (c: Command, suche: string): boolean => {
  const s = suche.trim().toLowerCase();
  if (!s) return true;
  return `${c.group} ${c.label}`.toLowerCase().includes(s);
};

export default function CommandPalette({ commands }: Props) {
  const [open, setOpen] = useState(false);
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const treffer = useMemo(() => commands.filter((c) => passt(c, suche)), [commands, suche]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
        setSuche('');
        setAktiv(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const ausfuehren = useCallback((c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center bg-bc-scrim pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="bc-dialog w-[560px] max-w-[92vw] text-bc-text"
      >
        <div className="bc-panel-head">
          <input
            ref={inputRef}
            value={suche}
            onChange={(e) => {
              setSuche(e.target.value);
              setAktiv(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAktiv((i) => Math.min(i + 1, treffer.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAktiv((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                ausfuehren(treffer[aktiv]);
              }
            }}
            placeholder="Type a command…"
            className="w-full bg-transparent text-sm text-bc-text-bright outline-none placeholder:text-bc-muted"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {treffer.length === 0 && (
            <li className="px-3 py-2 text-xs text-bc-muted">No matching command.</li>
          )}
          {treffer.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseEnter={() => setAktiv(i)}
                onClick={() => ausfuehren(c)}
                className={`flex w-full items-baseline gap-3 rounded-bc-m px-3 py-1.5 text-left text-sm ${
                  i === aktiv ? 'bg-bc-panel-raised text-bc-text-bright' : 'text-bc-text'
                }`}
              >
                <span className="w-20 shrink-0 text-[11px] font-semibold text-bc-muted">
                  {c.group}
                </span>
                <span className="truncate">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
