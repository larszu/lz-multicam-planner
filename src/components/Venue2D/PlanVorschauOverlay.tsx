import { Fragment } from 'react';
import { Line, Rect, Text } from 'react-konva';
import type { PlanVorschau } from '../../lib/planVorschau';
import { imRahmen } from '../../lib/planVorschau';

/**
 * Was „Übernehmen" anlegen würde, über dem Plan (#205). Nichts davon ist
 * anklickbar: es ist eine Ansage, keine Geometrie. Teile außerhalb des
 * gewählten Ausschnitts bleiben blass stehen, damit man sieht, was der
 * Ausschnitt gerade abschneidet.
 */
export default function PlanVorschauOverlay({ vorschau, ppm, farben }: {
  vorschau: PlanVorschau;
  ppm: number;
  farben: { wand: string; stuetze: string; buehne: string; raum: string; rahmen: string };
}) {
  const blass = (drin: boolean) => (drin ? 1 : 0.18);
  return (
    <>
      {vorschau.raeume.map((r, i) => (
        <Line
          key={`pv-room-${i}`}
          points={r.umriss.flatMap((p) => [p.x * ppm, p.y * ppm])}
          closed
          fill={farben.raum}
          opacity={0.14}
          listening={false}
        />
      ))}
      {vorschau.buehnen.map((b, i) => (
        <Fragment key={`pv-stage-${i}`}>
          <Rect
            x={b.x * ppm}
            y={b.y * ppm}
            width={b.breite * ppm}
            height={b.tiefe * ppm}
            fill={farben.buehne}
            opacity={0.3 * blass(imRahmen(vorschau.bereich, b.x + b.breite / 2, b.y + b.tiefe / 2))}
            stroke={farben.buehne}
            strokeWidth={2}
            listening={false}
          />
          <Text
            x={b.x * ppm + 3}
            y={b.y * ppm + 3}
            text={b.label}
            fontSize={10}
            fill={farben.buehne}
            listening={false}
          />
        </Fragment>
      ))}
      {vorschau.waende.map((w, i) => (
        <Line
          key={`pv-wall-${i}`}
          points={[w.x1 * ppm, w.y1 * ppm, w.x2 * ppm, w.y2 * ppm]}
          stroke={w.art === 'column' ? farben.stuetze : farben.wand}
          strokeWidth={Math.max(2, w.dicke * ppm)}
          opacity={0.75 * blass(imRahmen(vorschau.bereich, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2))}
          lineCap="butt"
          listening={false}
        />
      ))}
      {vorschau.bereich && (
        <Rect
          x={vorschau.bereich.minX * ppm}
          y={vorschau.bereich.minY * ppm}
          width={(vorschau.bereich.maxX - vorschau.bereich.minX) * ppm}
          height={(vorschau.bereich.maxY - vorschau.bereich.minY) * ppm}
          stroke={farben.rahmen}
          dash={[8, 6]}
          strokeWidth={1.5}
          listening={false}
        />
      )}
    </>
  );
}
