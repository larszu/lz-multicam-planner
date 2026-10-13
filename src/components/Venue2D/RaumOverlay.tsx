// Publikumsflaechen und Videowaende im 2D-Plan: ziehen, drehen, Groesse
// aendern. Feinwerte stehen im Abschnitt „Raum" der Seitenleiste; hier nur,
// was man mit der Maus besser macht als mit Zahlen.
import { useEffect, useRef } from 'react';
import { Group, Line, Rect, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { sitzblockNormal, sitzblockPlaetze, videowandNormal, type VenueSeatingBlock, type VenueVideoWall } from '../../avplan/floorplan';
import { useTranslation, format } from '../../i18n';

// Bedeutungsfarben (siehe PALETTE in Venue2D): bleiben in beiden Themen gleich.
const SITZEN = '#7c8db0';
const STEHEN = '#b48a3c';
const WAND = '#8b6cff';

export type RaumAuswahl = { art: 'block' | 'wand'; id: string } | null;

export default function RaumOverlay({
  ppm, blocks, walls, locked, auswahl, onAuswahl, onBlock, onWand,
}: {
  ppm: number;
  blocks: VenueSeatingBlock[];
  walls: VenueVideoWall[];
  locked: boolean;
  auswahl: RaumAuswahl;
  onAuswahl: (a: RaumAuswahl) => void;
  onBlock: (id: string, patch: Partial<VenueSeatingBlock>) => void;
  onWand: (id: string, patch: Partial<VenueVideoWall>) => void;
}) {
  const { t } = useTranslation();
  const knoten = useRef<Record<string, Konva.Group>>({});
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = auswahl && !locked ? knoten.current[auswahl.id] : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [auswahl, locked, blocks, walls]);

  const waehle = (a: RaumAuswahl) => (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    onAuswahl(locked ? null : a);
  };

  const ref = (id: string) => (n: Konva.Group | null) => {
    if (n) knoten.current[id] = n;
    else delete knoten.current[id];
  };

  return (
    <>
      {blocks.map((roh) => {
        const b = sitzblockNormal(roh);
        const tiefe = b.rows * b.rowSpacingM;
        const farbe = b.standing ? STEHEN : SITZEN;
        const gewaehlt = auswahl?.id === b.id;
        const w = b.width * ppm;
        const h = tiefe * ppm;
        const reihen: number[] = [];
        if (!b.standing && b.rows <= 80) for (let j = 1; j < b.rows; j++) reihen.push(-h / 2 + j * b.rowSpacingM * ppm);
        const anzahl = Math.round(sitzblockPlaetze(b) * b.occupancy);
        return (
          <Group
            key={b.id}
            ref={ref(b.id)}
            x={b.x * ppm}
            y={b.y * ppm}
            rotation={b.rotationDeg}
            draggable={!locked}
            onClick={waehle({ art: 'block', id: b.id })}
            onTap={waehle({ art: 'block', id: b.id })}
            onDragEnd={(e) => onBlock(b.id, { x: Math.round((e.target.x() / ppm) * 10) / 10, y: Math.round((e.target.y() / ppm) * 10) / 10 })}
            onTransformEnd={(e) => {
              const n = e.target;
              const sx = n.scaleX();
              const sy = n.scaleY();
              n.scale({ x: 1, y: 1 });
              onBlock(b.id, {
                x: Math.round((n.x() / ppm) * 10) / 10,
                y: Math.round((n.y() / ppm) * 10) / 10,
                width: Math.max(1, Math.round(b.width * sx * 10) / 10),
                rows: Math.max(1, Math.round(b.rows * sy)),
                rotationDeg: Math.round(n.rotation()),
              });
            }}
          >
            <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={farbe + '26'} stroke={farbe} strokeWidth={gewaehlt ? 2.5 : 1.5} dash={b.standing ? [6, 4] : undefined} />
            {reihen.map((y, i) => <Line key={i} points={[-w / 2, y, w / 2, y]} stroke={farbe + '55'} strokeWidth={1} listening={false} />)}
            {/* Vorderkante: hier sitzt die erste Reihe, Blick nach aussen */}
            <Line points={[-w / 2, -h / 2, w / 2, -h / 2]} stroke={farbe} strokeWidth={4} listening={false} />
            <Text
              x={-w / 2 + 4}
              y={-h / 2 + 6}
              width={Math.max(40, w - 8)}
              text={`${b.label || (b.standing ? t('room.standing', 'Standing') : t('room.seated', 'Seated'))} · ${format(t('room.people', '{n} people'), { n: anzahl })}`}
              fontSize={11}
              fill={farbe}
              listening={false}
            />
          </Group>
        );
      })}
      {walls.map((roh) => {
        const v = videowandNormal(roh);
        const w = v.widthM * ppm;
        const gewaehlt = auswahl?.id === v.id;
        return (
          <Group
            key={v.id}
            ref={ref(v.id)}
            x={v.x * ppm}
            y={v.y * ppm}
            rotation={v.rotationDeg}
            draggable={!locked}
            onClick={waehle({ art: 'wand', id: v.id })}
            onTap={waehle({ art: 'wand', id: v.id })}
            onDragEnd={(e) => onWand(v.id, { x: Math.round((e.target.x() / ppm) * 10) / 10, y: Math.round((e.target.y() / ppm) * 10) / 10 })}
            onTransformEnd={(e) => {
              const n = e.target;
              const sx = n.scaleX();
              n.scale({ x: 1, y: 1 });
              const breite = Math.max(0.5, Math.round(v.widthM * sx * 10) / 10);
              onWand(v.id, {
                x: Math.round((n.x() / ppm) * 10) / 10,
                y: Math.round((n.y() / ppm) * 10) / 10,
                widthM: breite,
                // Seitenverhaeltnis bleibt, solange niemand die Hoehe selbst setzt.
                heightM: Math.round((v.heightM * breite) / v.widthM * 100) / 100,
                rotationDeg: Math.round(n.rotation()),
              });
            }}
          >
            {/* Grifffeld etwas groesser als der Balken, damit man ihn trifft */}
            <Rect x={-w / 2} y={-8} width={w} height={16} fill="transparent" />
            <Rect x={-w / 2} y={-3} width={w} height={6} fill={WAND} stroke={gewaehlt ? WAND : undefined} strokeWidth={gewaehlt ? 2 : 0} />
            {/* Pfeil: hierhin zeigt das Bild */}
            <Line points={[0, 3, 0, 14, -4, 10, 0, 14, 4, 10]} stroke={WAND} strokeWidth={1.5} listening={false} />
            <Text x={-w / 2} y={-18} width={w} align="center" text={`${v.label || t('room.videoWall', 'Video wall')} · ${v.widthM}×${v.heightM} m`} fontSize={10} fill={WAND} listening={false} />
          </Group>
        );
      })}
      <Transformer
        ref={trRef}
        rotateEnabled
        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
        keepRatio={false}
        ignoreStroke
        anchorSize={8}
        anchorStroke={auswahl?.art === 'wand' ? WAND : SITZEN}
        anchorFill="#132040"
        borderStroke={auswahl?.art === 'wand' ? WAND : SITZEN}
        enabledAnchors={auswahl?.art === 'wand' ? ['middle-left', 'middle-right'] : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
        boundBoxFunc={(alt, neu) => (neu.width < 8 || neu.height < 4 ? alt : neu)}
      />
    </>
  );
}
