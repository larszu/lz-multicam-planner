import { useMemo } from 'react';
import { Layer, Line, Circle, Text, Group } from 'react-konva';
import { planRichtung, sonnenBahn, sonneJetzt, type BahnPunkt, type HimmelPrefs } from '../../utils/tageslicht';

// Bedeutungsfarben (siehe PALETTE in Venue2D): Sonne gelb, goldene Stunde orange.
const SONNE = '#facc15';
const GOLD = '#f59e0b';

/**
 * Sonnenbahn als Himmelskarte ueber dem Plan (#226): Richtung = Azimut,
 * Abstand von der Mitte = 90° minus Hoehe. Dazu der Stand zur gewaehlten
 * Uhrzeit und die Richtung, in die die Schatten fallen.
 */
export default function SonnenOverlay({ sky, breitePx, hoehePx, schrift }: { sky: HimmelPrefs; breitePx: number; hoehePx: number; schrift: string }) {
  const bahn = useMemo(() => sonnenBahn(sky), [sky]);
  const jetzt = sonneJetzt(sky);
  const cx = breitePx / 2;
  const cy = hoehePx / 2;
  const r = Math.min(breitePx, hoehePx) * 0.45;
  const punkt = (az: number, el: number) => {
    const d = planRichtung(az, sky.nordDeg);
    const a = r * (1 - Math.max(0, el) / 90);
    return [cx + d.x * a, cy + d.y * a];
  };
  const stuecke = useMemo(() => {
    const out: { gold: boolean; punkte: BahnPunkt[] }[] = [];
    for (const p of bahn) {
      const gold = p.phase !== 'tag';
      const letztes = out[out.length - 1];
      if (letztes && letztes.gold === gold) letztes.punkte.push(p);
      else out.push({ gold, punkte: letztes ? [letztes.punkte[letztes.punkte.length - 1], p] : [p] });
    }
    return out;
  }, [bahn]);
  const nord = planRichtung(0, sky.nordDeg);
  const oben = jetzt.elevationDeg > 0;
  const [sx, sy] = punkt(jetzt.azimutDeg, jetzt.elevationDeg);
  const schatten = planRichtung(jetzt.azimutDeg + 180, sky.nordDeg);

  return (
    <Layer listening={false}>
      <Circle x={cx} y={cy} radius={r} stroke={SONNE} strokeWidth={1} dash={[2, 6]} opacity={0.5} />
      <Text x={cx + nord.x * (r + 10) - 6} y={cy + nord.y * (r + 10) - 6} width={12} align="center" text="N" fontSize={11} fontStyle="bold" fill={schrift} />
      {stuecke.map((s, i) => (
        <Line key={i} points={s.punkte.flatMap((p) => punkt(p.azimutDeg, p.elevationDeg))} stroke={s.gold ? GOLD : SONNE} strokeWidth={s.gold ? 3 : 2} opacity={0.8} lineCap="round" />
      ))}
      {oben && (
        <Group>
          <Line points={[cx, cy, sx, sy]} stroke={SONNE} strokeWidth={1.5} opacity={0.9} />
          <Line points={[cx, cy, cx + schatten.x * r * 0.35, cy + schatten.y * r * 0.35]} stroke={schrift} strokeWidth={1.5} dash={[5, 4]} opacity={0.6} />
          <Circle x={sx} y={sy} radius={8} fill={jetzt.phase === 'tag' ? SONNE : GOLD} stroke={schrift} strokeWidth={1} />
        </Group>
      )}
    </Layer>
  );
}
