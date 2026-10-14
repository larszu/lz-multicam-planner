import { useCallback, useEffect, useRef, useState } from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';
import { posToValue, snapToCandidates, valueToPos } from '../../utils/lensScale';
import { useTranslation } from '../../i18n';

/**
 * Objektiv-Regler fuer Zoom / Blende / Fokus.
 *
 * Bedienmuster, angelehnt an echte Objektiv- und PTZ-Steuerungen:
 *  • **Logarithmische Bahn** — gleiche Verhaeltnisse (eine Blendenstufe, eine
 *    Brennweiten-Verdopplung) belegen gleiche Wegstrecken. Linear laege sonst
 *    der meistgenutzte Bereich auf den ersten ~10 % des Reglers.
 *  • **Rastpunkte** wie der Blendenring einer Fotooptik: der Wert schnappt auf
 *    die Normstufen. **Shift** haelt ihn frei (wie eine „declicked" Cine-Optik).
 *  • **− / +** springt genau eine Stufe — das Pendant zu den Near/Far- bzw.
 *    Tele/Wide-Tasten einer PTZ-Fernbedienung.
 *  • **Mausrad** ueber der Bahn feint nach, ohne den Regler greifen zu muessen.
 *  • **Zahl anklicken** = direkte Eingabe (Fokus ziehen auf einen bekannten
 *    Abstand, ohne zu zielen).
 */
export interface LensSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Rastpunkte in Wert-Einheiten (Blendenstufen bzw. „schoene" Marken). */
  ticks: number[];
  /** Nur diese Punkte rasten; sonst rasten alle `ticks`. */
  snapPoints?: number[];
  format: (v: number) => string;
  /** Zeichen vor der Zahl im Eingabefeld, z. B. "f/". */
  prefix?: string;
  /** Einheit hinter dem Eingabefeld, z. B. "mm" / "m". */
  unit?: string;
  /** Kurzform fuer die Skalenbeschriftung (Default: `format`). */
  formatTick?: (v: number) => string;
  onChange: (v: number) => void;
  /** Eine Stufe weiter (dir +1) bzw. zurueck (−1). */
  onStep: (dir: 1 | -1) => void;
  /** Zusatz rechts in der Kopfzeile (z. B. der Manual-Umschalter). */
  headerRight?: React.ReactNode;
  /** Hinweis rechts neben dem Wert (z. B. „locked"). */
  note?: string;
  disabled?: boolean;
  title?: string;
}

const POS_STEPS = 1000;

export default function LensSlider({
  label,
  value,
  min,
  max,
  ticks,
  snapPoints,
  format,
  prefix,
  unit,
  formatTick,
  onChange,
  onStep,
  headerRight,
  note,
  disabled,
  title,
}: LensSliderProps) {
  const { t } = useTranslation();
  // `draft === null` heisst: Feld zeigt den echten Wert. Beim Tippen haelt es
  // die RohEingabe, damit Zwischenstaende wie "1." nicht sofort umgerechnet
  // (und dadurch zerstoert) werden. Beim Kamerawechsel greift wieder der Wert.
  const [draft, setDraft] = useState<string | null>(null);
  const shiftRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Shift = Rastung aus (frei durchfahren, wie eine declicked Cine-Optik).
  useEffect(() => {
    const set = (e: KeyboardEvent) => { shiftRef.current = e.shiftKey; };
    window.addEventListener('keydown', set);
    window.addEventListener('keyup', set);
    return () => {
      window.removeEventListener('keydown', set);
      window.removeEventListener('keyup', set);
    };
  }, []);



  const snapCandidates = snapPoints ?? ticks;

  const commit = useCallback(
    (raw: number) => {
      const clamped = Math.min(max, Math.max(min, raw));
      const next = shiftRef.current
        ? clamped
        : snapToCandidates(clamped, snapCandidates, min, max);
      onChange(next);
    },
    [max, min, onChange, snapCandidates],
  );

  const handleSlider = useCallback(
    (rawPos: number) => commit(posToValue(rawPos / POS_STEPS, min, max)),
    [commit, max, min],
  );

  // Mausrad: eine Rasterstufe pro Tick, ohne den Griff zu treffen.
  // Muss als NICHT-passiver Listener haengen — React registriert `onWheel`
  // passiv, dort schlaegt preventDefault fehl (Konsolenfehler) und das Panel
  // scrollt zusaetzlich weg, waehrend man den Wert verstellt.
  const wheelZoneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wheelZoneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      onStep(e.deltaY < 0 ? -1 : 1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [disabled, onStep]);

  /** Uebernimmt die Eingabe; ungueltiges verwirft sie stillschweigend. */
  const submitDraft = useCallback(() => {
    if (draft === null) return;
    const parsed = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
    setDraft(null);
  }, [draft, max, min, onChange]);

  /** Was im Feld steht: waehrend des Tippens der Rohtext, sonst der Wert. */
  const fieldText = draft ?? String(Number(value.toFixed(2)));

  const pos = Math.round(valueToPos(value, min, max) * POS_STEPS);
  const fmtTick = formatTick ?? format;
  const stepBtn =
    'px-1 py-0.5 rounded-bc-s border border-bc-border text-bc-dim hover:text-bc-text-bright hover:border-bc-accent/60 disabled:opacity-30 transition-colors';

  return (
    <div className="px-2" title={title}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-bc-dim flex items-center gap-1">
          {label}
          {/* Immer sichtbares Zahlenfeld statt Klick-zum-Bearbeiten: per Tab
              erreichbar, Werte lassen sich so ohne Maus von Kamera zu Kamera
              uebertragen. Slider = grob, Feld = exakt (belegtes Hybrid-Muster). */}
          <span className="inline-flex items-center">
            {prefix ? <span className="text-bc-dim font-mono">{prefix}</span> : null}
            <input
              ref={inputRef}
              value={fieldText}
              disabled={disabled}
              inputMode="decimal"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  submitDraft();
                  // Enter haengt die drei Felder zu einer Kette: Wert tippen,
                  // Enter, naechster Wert — ohne zur Maus zu greifen. Genau der
                  // Ablauf, wenn mehrere Kameras gleich eingestellt werden.
                  const fields = Array.from(
                    document.querySelectorAll<HTMLInputElement>('[data-lens-field]'),
                  );
                  const i = fields.indexOf(e.currentTarget);
                  const next = fields[i + (e.shiftKey ? -1 : 1)];
                  if (next) { next.focus(); next.select(); }
                  else e.currentTarget.select();
                } else if (e.key === 'Escape') {
                  setDraft(null);
                  e.currentTarget.blur();
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  // Im Feld steppt Pfeil hoch/runter eine ganze Stufe — sonst
                  // wuerde der Browser nur im Text navigieren.
                  e.preventDefault();
                  setDraft(null);
                  onStep(e.key === 'ArrowUp' ? -1 : 1);
                }
              }}
              className={`w-11 bg-bc-dark border px-1 text-[10px] font-mono text-right outline-none transition-colors ${
                draft !== null
                  ? 'border-bc-accent text-bc-text-bright'
                  : 'border-bc-border/60 text-bc-text hover:border-bc-accent/60 focus:border-bc-accent'
              }`}
              title={`${label} direkt eingeben — Enter übernimmt, Pfeil hoch/runter = eine Stufe`}
              aria-label={`${label} Wert`}
              data-lens-field
            />
            {unit ? <span className="text-bc-dim font-mono ml-0.5">{unit}</span> : null}
          </span>
          {note ? <span className="text-bc-faint">· {note}</span> : null}
        </span>
        <div className="flex items-center gap-1">
          <button className={stepBtn} tabIndex={-1} onClick={() => onStep(-1)} disabled={disabled} title={t('preview.step.back', 'One step back')}>
            <FiMinus size={10} />
          </button>
          <button className={stepBtn} tabIndex={-1} onClick={() => onStep(1)} disabled={disabled} title={t('preview.step.forward', 'One step forward')}>
            <FiPlus size={10} />
          </button>
          {headerRight}
        </div>
      </div>

      <div ref={wheelZoneRef}>
        <input
          type="range"
          min={0}
          max={POS_STEPS}
          step={1}
          value={pos}
          disabled={disabled}
          onChange={(e) => handleSlider(parseFloat(e.target.value))}
          className="w-full accent-bc-accent"
          aria-label={label}
          aria-valuetext={format(value)}
        />
        {/* Skala: Rastpunkte an ihrer echten (logarithmischen) Position. */}
        {/* Skala: Marken sind anklickbar. Fuer die Blende ist das faktisch die
            diskrete Stufenauswahl, die echte Objektive haben — ohne den
            stufenlosen Manual-Modus zu verlieren. */}
        <div className="relative h-3 select-none">
          {ticks.map((t, i) => {
            const p = valueToPos(t, min, max) * 100;
            const active = Math.abs(t - value) < 1e-6;
            // Randmarken buendig statt mittig ausrichten, sonst haengt die
            // Beschriftung halb ausserhalb der Bahn und wird abgeschnitten.
            const isFirst = i === 0;
            const isLast = i === ticks.length - 1;
            const shift = isFirst ? 'translate-x-0' : isLast ? '-translate-x-full' : '-translate-x-1/2';
            const tickAlign = isFirst ? 'ml-0' : isLast ? 'mr-0 ml-auto' : 'mx-auto';
            return (
              <button
                key={`${t}-${i}`}
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={() => onChange(t)}
                className={`absolute top-0 ${shift} text-[11px] font-mono leading-none hover:text-bc-accent ${
                  active ? 'text-bc-accent' : 'text-bc-faint'
                }`}
                style={{ left: `${p}%` }}
                title={`Auf ${fmtTick(t)} setzen`}
              >
                <span className={`block w-px h-1 ${tickAlign} bg-current opacity-60`} />
                {fmtTick(t)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
