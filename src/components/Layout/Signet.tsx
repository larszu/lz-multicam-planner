// Das Signet „lz." inline statt als Bild: Form aus dem Kit, Farbe aus
// `--color-bc-logo` (Navy hell, Off-White dunkel), der Punkt im Signal-Rot.
// Nie an den Akzent gekoppelt — das Logo traegt nur Kit-Farben.
export default function Signet({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="478.129 455.570 234.046 139.875"
      role="img"
      aria-label="lz."
      className={`lz-signet ${className}`}
    >
      <path
        className="fill-bc-logo"
        d="M478.129 595.445 505.285 455.570H540.207L513.047 595.445ZM638.277 595.445H555.828L561.062 568.285 610.922 521.727H570.183L575.422 494.566H657.871L652.633 521.727 602.773 568.285H643.515Z"
      />
      <path className="fill-bc-signal" d="M677.011 595.445 681.538 565.865H712.175L707.647 595.445Z" />
    </svg>
  );
}
