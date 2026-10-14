// ───────────────────────────────────────────────────────────────────────────
// Ein Menue in der Kopfzeile — dieselbe Form wie im Cable Planner.
//
// NUTZER-AUFTRAG 2026-09-11: „Stelle sicher das in allen repos uebergreifend
// das Einstellungen Menue an der gleichen Stelle ist wie im Cable planner und
// das die obere Menueleiste gleich aufgebaut ist."
//
// WARUM HIER EINE EIGENE FASSUNG UND KEIN GEMEINSAMES PAKET: dieses Repo
// laeuft auch ALLEIN (eigene Web-Seite, eigene Electron-Fassung) und haengt
// an keinem Paket der Suite. Genau dieselbe Lage wie beim Cable Planner,
// dessen `index.css` es in eigenen Worten sagt: „der MultiCam-Planner laeuft
// auch allein und kann das Paket nicht laden, deshalb stehen die Klassen hier
// mit denselben Zahlen."
//
// Zusammengehalten wird die Form deshalb nicht vom Compiler, sondern von
// `scripts/chrome-parity.mjs` in der Suite: er misst in allen Apps dieselbe
// Kopfzeile — Klasse, 40 px, Menue-Reihenfolge, Einstellungen rechts aussen.
// Eine Abschrift ohne Waechter waere die Defektform `zwei-rechnungen`; mit
// Waechter ist sie eine gemessene Zusage. `src/__tests__/kopfzeile.test.ts`
// ist die Haelfte davon, die in diesem Repo MITWANDERT.
//
// DER SCHLIESSER WIRD HEREINGEREICHT und nicht aus dem Klick-Bubbling
// abgeleitet. Der Cable Planner schliesst per `onClick` an der Klappe — das
// funktioniert, verschluckt aber jeden Punkt, der ein Untermenue aufklappen
// oder ein Eingabefeld zeigen will (die Preset-Zeile hier tut genau das).
// ───────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FiCheck, FiChevronDown } from 'react-icons/fi';

interface MenuProps {
  /** Beschriftung. Englisch — dieses Repo ist englisch-quellig (E-28). */
  label: string;
  children: (close: () => void) => ReactNode;
}

export function Menu({ label, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  /** Das Rechteck des angeklickten Titels — Ausgangspunkt der Klappe. */
  const [anker, setAnker] = useState<{ links: number; oben: number } | null>(null);
  const klappe = useRef<HTMLDivElement>(null);

  // Klick daneben schliesst, Escape auch. Ohne beides bliebe ein Menue
  // stehen, sobald jemand woanders hinklickt — und zwei offene Klappen
  // uebereinander sind unbedienbar.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!shell.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // ROLLEN FUEHRT NACH, GROESSE SCHLIESST.
    //
    // Beides muss etwas tun, weil die Klappe seit B-77 am Fenster haengt: sie
    // weiss von sich aus nicht, dass ihr Titel sich bewegt hat. Die
    // Menue-Gruppe rollt auf schmalen Fenstern waagerecht, also bewegt er
    // sich.
    //
    // Der erste Anlauf SCHLOSS bei beidem, und das war falsch — gemessen mit
    // `bedienbar:check`: bei 390 px liegt „Help" ausserhalb der Leiste, ein
    // Klick darauf rollt sie erst um 21 px, und das Rollereignis kam NACH dem
    // Klick. Die Klappe ging auf und sofort wieder zu. Wer den Titel
    // antippt, den er sehen kann, merkt davon nichts; wer ihn ueber die
    // Tastatur oder einen Rollbefehl erreicht, oeffnet ins Leere.
    //
    // Nachfuehren ist ausserdem das bessere Verhalten: die Klappe bleibt an
    // ihrem Titel, statt bei jeder Rollbewegung zu verschwinden.
    const nachfuehren = () => {
      const knopf = shell.current?.querySelector('button');
      if (!knopf) return;
      const r = knopf.getBoundingClientRect();
      setAnker({ links: r.left, oben: r.bottom + 4 });
    };
    const weg = () => setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', weg);
    window.addEventListener('scroll', nachfuehren, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', weg);
      window.removeEventListener('scroll', nachfuehren, true);
    };
  }, [open]);

  // B-77 — DIE KLAPPE HAENGT AM FENSTER, NICHT AN DER LEISTE.
  //
  // Sie war ein `absolute`-Kind der Kopfzeile. Solange die Kopfzeile nichts
  // abschneidet, faellt das nicht auf; sobald ein Vorfahr rollt oder klemmt,
  // ist die Klappe weg. Im `light-planner` ist genau das passiert: ein
  // `overflow: hidden`, das die Kopfzeile einzeilig halten sollte, machte
  // aus einer 505 px hohen Datei-Klappe eine mit 0 px sichtbarer Hoehe —
  // vier Menues, kein einziges ging mehr auf.
  //
  // Hier wird die Menue-Gruppe seit B-77 rollend, also waere es nur eine
  // Frage der Zeit. Eine Klappe am VIEWPORT kennt den Beschnitt ihrer
  // Vorfahren nicht. Gemessen wird NACH dem Einhaengen: die Breite haengt am
  // laengsten Eintrag und ist auf Deutsch eine andere als auf Englisch.
  useLayoutEffect(() => {
    const el = klappe.current;
    if (!el || !anker) return;
    const r = el.getBoundingClientRect();
    const rand = 8;
    const links = Math.max(rand, Math.min(anker.links, window.innerWidth - rand - r.width));
    const oben = Math.max(rand, Math.min(anker.oben, window.innerHeight - rand - r.height));
    el.style.left = `${links}px`;
    el.style.top = `${oben}px`;
  }, [anker, open]);

  return (
    <div className="relative shrink-0" ref={shell}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnker({ links: r.left, oben: r.bottom + 4 });
          setOpen((o) => !o);
        }}
        style={{ padding: '4px 10px' }}
        className={`flex items-center gap-1 rounded-bc-full text-xs font-medium text-bc-text-bright transition-colors hover:bg-bc-hover ${open ? 'bg-bc-accent-soft' : ''}`}
      >
        {label}
        <FiChevronDown size={11} className="text-bc-muted" />
      </button>
      {open && (
        <div
          role="menu"
          /* GEDECKELT wie im Cable Planner: die Klappe darf nicht laenger
             werden als das Fenster hoch ist, sonst stehen ihre letzten Punkte
             unter dem Fensterrand und existieren fuer den Nutzer nicht. */
          ref={klappe}
          className="fixed left-0 top-0 z-[100] max-h-[calc(100vh-3.5rem)] min-w-[16rem] overflow-y-auto bc-popover p-1.5"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onClick?: () => void;
  icon?: ReactNode;
  /** Zweite Zeile: WAS passiert. Nur wo der Name es nicht sagt. */
  note?: string;
  /** Angehakt — fuer Punkte, die einen Zustand setzen (Edit-Modus, Layout). */
  checked?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function MenuItem({ onClick, icon, note, checked, disabled, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{ padding: '6px 10px' }}
      className={`flex w-full items-center gap-2.5 rounded-bc-s text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:text-bc-muted disabled:opacity-50 ${
        checked ? 'bg-bc-accent-soft font-medium text-bc-text-bright' : 'text-bc-text hover:bg-bc-hover hover:text-bc-text-bright'
      }`}
    >
      <span className={`inline-flex w-[13px] shrink-0 items-center justify-center ${checked ? 'text-bc-accent' : 'text-bc-muted'}`}>
        {checked ? <FiCheck size={13} /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {note && <span className="block truncate text-[11px] text-bc-muted">{note}</span>}
      </span>
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-2 my-1.5 border-t border-bc-border" />;
}

/** Ueberschrift innerhalb einer Klappe — gruppiert, ohne anklickbar zu sein. */
export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ padding: '8px 10px 4px' }}
      className="text-[11px] font-semibold text-bc-muted"
    >
      {children}
    </div>
  );
}
