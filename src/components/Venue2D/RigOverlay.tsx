// Draufsicht des Kamera-Rigs im 2D-Plan.
//
// Zeichnet Standflaeche, Schiene mit Sektionsstoeßen, Ausleger/Saeule und den
// Fahrweg aus dem prozeduralen Skelett (`utils/rigGeometry`). Alles liegt in
// einer Gruppe, die auf der PARKPOSITION sitzt und um `cam.pan` gedreht ist —
// damit ist die lokale x-Achse die Blickrichtung, genau wie im Rig-Frame.
// Die Kamera-Marke selbst zeichnet Venue2D auf der effektiven (verfahrenen)
// Position darueber.
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { VenueCamera } from '../../types';
import { rigYaw } from '../../utils/camera';
import { rigLimits } from '../../utils/rigLimits';
import { rigSkeleton, type RigRole, type RigSegment } from '../../utils/rigGeometry';
import { pathLengthM, pathPolyline, pathSweepDeg, rigToPlan } from '../../utils/travelPath';

/** Farbe/Strich je Bauteil. */
function roleStyle(role: RigRole, camColor: string): { stroke: string; opacity: number; dash?: number[] } {
  switch (role) {
    case 'arm':
      return { stroke: camColor, opacity: 0.9 };
    case 'telescope':
      // Gestrichelt, damit man den ausgefahrenen Teil vom festen Arm
      // unterscheidet — beide liegen in der Draufsicht uebereinander.
      return { stroke: '#e2e8f0', opacity: 0.8, dash: [7, 4] };
    case 'rail':
      return { stroke: '#cbd5e1', opacity: 0.85 };
    case 'sleeper':
      return { stroke: '#a8a29e', opacity: 0.7 };
    case 'leg':
      return { stroke: '#a8b3c4', opacity: 0.9 };
    case 'wheel':
      return { stroke: '#cbd5e1', opacity: 0.8 };
    case 'body':
      return { stroke: '#94a3b8', opacity: 0.7 };
    case 'weight':
      return { stroke: '#64748b', opacity: 0.9 };
    case 'mast':
      return { stroke: '#a8b3c4', opacity: 0.85 };
    case 'wire':
      return { stroke: camColor, opacity: 0.35, dash: [5, 5] };
    case 'plumb':
      return { stroke: '#e2e8f0', opacity: 0.3, dash: [2, 3] };
  }
}

/**
 * Ein Bauteil in der Draufsicht:
 *   senkrechte Rohre (Rad, Saeule, Lot) werden zum Kreis ihres Durchmessers,
 *   Chassis/Wagen/Plattform zur gefuellten Flaeche,
 *   alles andere zur Linie in Bauteilbreite.
 */
function SegmentShape({ s, ppm, camColor }: { s: RigSegment; ppm: number; camColor: string }) {
  const { stroke, opacity, dash } = roleStyle(s.role, camColor);
  const width = Math.max(1.5, s.thicknessM * ppm);
  const isVertical = s.a.f === s.b.f && s.a.l === s.b.l;
  if (isVertical) {
    return (
      <Circle
        x={s.a.f * ppm}
        y={s.a.l * ppm}
        radius={width / 2}
        fill={stroke}
        opacity={opacity * 0.7}
        stroke={stroke}
        strokeWidth={1}
      />
    );
  }
  if (s.role === 'body' && s.a.l === s.b.l) {
    // Chassis laeuft immer laengs der Blickrichtung — als Flaeche lesbar.
    const f0 = Math.min(s.a.f, s.b.f);
    const lenF = Math.abs(s.b.f - s.a.f);
    return (
      <Rect
        x={f0 * ppm}
        y={(s.a.l - s.thicknessM / 2) * ppm}
        width={lenF * ppm}
        height={s.thicknessM * ppm}
        fill={stroke}
        opacity={opacity * 0.45}
        stroke={stroke}
        strokeWidth={1}
        cornerRadius={Math.min(6, (s.thicknessM * ppm) / 3)}
      />
    );
  }
  return (
    <Line
      points={[s.a.f * ppm, s.a.l * ppm, s.b.f * ppm, s.b.l * ppm]}
      stroke={stroke}
      strokeWidth={width}
      opacity={opacity}
      dash={dash}
      lineCap="round"
    />
  );
}

/** Abstand des Ausricht-Griffs vom Rig-Mittelpunkt (Pixel). */
export const RIG_HANDLE_RADIUS = 48;

export default function RigOverlay({
  cam,
  ppm,
  isSelected,
  onRotate,
}: {
  cam: VenueCamera;
  ppm: number;
  isSelected: boolean;
  /** Gesetzt, wenn das Rig ausgerichtet werden darf — zeigt den Dreh-Griff. */
  onRotate?: (cam: VenueCamera, e: Konva.KonvaEventObject<DragEvent>) => void;
}) {
  const limits = rigLimits(cam);
  const skel = rigSkeleton(limits, { heightM: cam.z, offsetM: cam.trackOffset ?? 0 });
  const yaw = rigYaw(cam);
  const yawRad = (yaw * Math.PI) / 180;
  const weg = pathPolyline(limits);
  const enden = weg.length > 1 ? [weg[0], weg[weg.length - 1]].map((p) => rigToPlan(cam, p)) : [];
  const mitte = weg.length > 1 ? rigToPlan(cam, weg[Math.floor(weg.length / 2)]) : null;
  const sweep = pathSweepDeg(limits);
  const wegText = [
    `${pathLengthM(limits).toFixed(1)} m`,
    limits.pathShape === 'swing' ? `↻ ${Math.round(sweep)}°` : limits.pathShape === 'arc' ? `R ${Math.abs(limits.pathRadiusM ?? 0).toFixed(1)} m` : '',
    limits.pathShape === 'swing' ? `↕ ${limits.minHeightM.toFixed(1)}–${limits.maxHeightM.toFixed(1)} m` : '',
  ].filter(Boolean).join(' · ');

  return (
    <>
    <Group
      x={cam.x * ppm}
      y={cam.y * ppm}
      rotation={yaw}
      listening={false}
      opacity={isSelected ? 1 : 0.55}
    >
      {/* Standflaeche — der Platz, den das Rig am Boden braucht. */}
      {skel.footprint && (
        <Rect
          x={(skel.footprint.centerF - skel.footprint.f / 2) * ppm}
          y={(skel.footprint.centerL - skel.footprint.l / 2) * ppm}
          width={skel.footprint.f * ppm}
          height={skel.footprint.l * ppm}
          stroke={cam.color}
          strokeWidth={1}
          dash={[3, 4]}
          opacity={0.35}
        />
      )}

      {/* Fahrweg: die Strecke, die der Kopf tatsaechlich zurueklegen kann. */}
      {weg.length > 1 && (
        <Line
          points={weg.flatMap((p) => [p.f * ppm, p.l * ppm])}
          stroke={cam.color}
          strokeWidth={1.5}
          dash={[4, 4]}
          opacity={0.6}
        />
      )}

      {skel.segments.map((s, i) => (
        <SegmentShape key={i} s={s} ppm={ppm} camColor={cam.color} />
      ))}

    </Group>

      {/* Ausricht-Griff: zieht die Rig-Achse (Schiene, Kran-Chassis,
          Beinstellung) unabhaengig vom Pan der Kamera. Sitzt auf der
          Parkposition, weil sich das Rig beim Fahren nicht mitdreht. */}
      {onRotate && (
        <Group x={cam.x * ppm} y={cam.y * ppm}>
          <Line
            points={[0, 0, Math.cos(yawRad) * RIG_HANDLE_RADIUS, Math.sin(yawRad) * RIG_HANDLE_RADIUS]}
            stroke="#94a3b8" strokeWidth={1} dash={[3, 3]} opacity={0.5} listening={false}
          />
          <Rect
            x={Math.cos(yawRad) * RIG_HANDLE_RADIUS}
            y={Math.sin(yawRad) * RIG_HANDLE_RADIUS}
            width={11}
            height={11}
            offsetX={5.5}
            offsetY={5.5}
            rotation={yaw}
            fill="#132040"
            stroke="#94a3b8"
            strokeWidth={2}
            draggable
            onDragStart={(e) => { e.cancelBubble = true; }}
            onDragMove={(e) => { e.cancelBubble = true; onRotate(cam, e); }}
            onDragEnd={(e) => { e.cancelBubble = true; }}
            onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'crosshair'; }}
            onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'grab'; }}
          />
        </Group>
      )}

      {/* Endpunkte und Laenge der Strecke (#235) — waagerecht, ausserhalb
          der gedrehten Gruppe. */}
      {isSelected && enden.map((p, i) => (
        <Group key={`end-${i}`} x={p.x * ppm} y={p.y * ppm} listening={false}>
          <Circle radius={7} fill={cam.color} opacity={0.9} />
          <Text x={-7} y={-5} width={14} align="center" text={String(i + 1)} fontSize={9} fontStyle="bold" fill="#ffffff" />
        </Group>
      ))}
      {isSelected && mitte && (
        <Text
          x={mitte.x * ppm - 80}
          y={mitte.y * ppm - 18}
          width={160}
          align="center"
          text={wegText}
          fontSize={9}
          fill={cam.color}
          listening={false}
        />
      )}

      {/* Rig-Name waagerecht unter der Kamera — ausserhalb der gedrehten
          Gruppe, damit die Schrift nicht mitkippt. */}
      {isSelected && (
        <Text
          x={cam.x * ppm - 60}
          y={cam.y * ppm + 36}
          width={120}
          align="center"
          text={skel.label}
          fontSize={9}
          fill="#94a3b8"
          listening={false}
        />
      )}
    </>
  );
}
