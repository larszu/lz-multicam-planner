import { useState } from 'react';

/**
 * Height input in metres that may stay empty (#198). Empty means "use the
 * standard"; the placeholder shows which value that is. The text is kept
 * locally so a half-typed number ("2.") is not thrown away on every keystroke.
 */
export function WallHeightField({ value, placeholder, onChange, label, allowEmpty = true, className = '' }: {
  value: number | undefined;
  placeholder?: string;
  onChange: (v: number | undefined) => void;
  label: string;
  allowEmpty?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // Value changed from outside (undo, other wall, standard) — follow it
    // unless the text already says the same.
    setSeen(value);
    const n = parseFloat(text.trim().replace(',', '.'));
    if (value === undefined ? text.trim() !== '' : n !== value) setText(value === undefined ? '' : String(value));
  }
  const commit = (raw: string) => {
    const trimmed = raw.trim().replace(',', '.');
    if (trimmed === '') { if (allowEmpty) onChange(undefined); return; }
    const n = parseFloat(trimmed);
    if (Number.isFinite(n) && n > 0) onChange(Math.min(200, Math.max(0.1, n)));
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0.1}
      max={200}
      step={0.1}
      aria-label={label}
      title={label}
      placeholder={placeholder}
      className={`bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[11px] tabular-nums ${className}`}
      value={text}
      onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
      onBlur={() => { if (!allowEmpty && text.trim() === '' && value !== undefined) setText(String(value)); }}
    />
  );
}
