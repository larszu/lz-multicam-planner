import Regler from '../ui/Regler';

/**
 * Objektiv-Regler (Zoom / Blende / Fokus) der Kamera-Karte: der gemeinsame
 * `Regler` mit log-Bahn, den Marken als Rasten und − / + fuer eine Stufe —
 * dieselbe Einstellung wie im Kamerablick.
 */
export interface LensSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Rastpunkte und Marken in Wert-Einheiten. */
  ticks: number[];
  format: (v: number) => string;
  prefix?: string;
  unit?: string;
  formatTick?: (v: number) => string;
  onChange: (v: number) => void;
  onStep: (dir: 1 | -1) => void;
  note?: string;
  disabled?: boolean;
  title?: string;
}

export default function LensSlider({ label, value, min, max, ticks, format, prefix, unit, formatTick, onChange, onStep, note, disabled, title }: LensSliderProps) {
  return (
    <Regler
      label={label}
      value={value}
      min={min}
      max={max}
      skala="log"
      raster={ticks}
      marken={ticks}
      format={format}
      formatMarke={formatTick ?? ((v) => (v < 10 ? String(Number(v.toFixed(1))) : String(Math.round(v))))}
      praefix={prefix}
      einheit={unit}
      dezimalen={1}
      notiz={note}
      onChange={onChange}
      onStep={onStep}
      disabled={disabled}
      title={title}
    />
  );
}
