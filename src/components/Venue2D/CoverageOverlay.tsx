// Waermekarte der Publikumsabdeckung (#221): je Publikumsflaeche ein kleines
// Bild, ein Pixel je Rasterzelle, gedreht wie die Flaeche.
import { useMemo } from 'react';
import { Image as KImage } from 'react-konva';
import { sitzblockNormal, sitzblockTiefe, type VenueSeatingBlock } from '../../avplan/floorplan';
import { cellAlpha, type CoverageMode, type CoverageReport } from '../../utils/coverage';

/** Pixel je Rasterzelle — genug, damit der Rand beim Skalieren scharf bleibt. */
const ZELLE_PX = 8;
const FARBE = { erfasst: [59, 130, 246], luecke: [239, 68, 68] } as const;

export default function CoverageOverlay({ blocks, report, mode, ppm }: { blocks: readonly VenueSeatingBlock[]; report: CoverageReport; mode: CoverageMode; ppm: number }) {
  const bilder = useMemo(() => report.blocks.map((r) => {
    const c = document.createElement('canvas');
    c.width = r.cols * ZELLE_PX;
    c.height = r.rows * ZELLE_PX;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const [cr, cg, cb] = mode === 'gaps' ? FARBE.luecke : FARBE.erfasst;
    for (let k = 0; k < r.counts.length; k++) {
      const a = cellAlpha(mode, r.counts[k], r.selected[k] === 1);
      if (!a) continue;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
      ctx.fillRect((k % r.cols) * ZELLE_PX, Math.floor(k / r.cols) * ZELLE_PX, ZELLE_PX, ZELLE_PX);
    }
    return c;
  }), [report, mode]);

  return (
    <>
      {blocks.map((b, i) => {
        const bild = bilder[i];
        if (!bild) return null;
        const n = sitzblockNormal(b);
        const w = n.width * ppm;
        const h = sitzblockTiefe(b) * ppm;
        return (
          <KImage
            key={`cov-${n.id}`}
            image={bild}
            x={n.x * ppm}
            y={n.y * ppm}
            width={w}
            height={h}
            offsetX={w / 2}
            offsetY={h / 2}
            rotation={n.rotationDeg}
            listening={false}
          />
        );
      })}
    </>
  );
}
