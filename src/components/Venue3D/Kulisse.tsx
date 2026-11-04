// Die Halle ohne Planungs-Beiwerk: Licht, Raum, Buehnen, Publikum,
// LED-Waende und gezeichnete Waende. Die 3D-Ansicht legt ihre Werkzeuge
// (Raster, Abdeckung, Kameras) darueber; die gerenderten Kamerabilder in
// Vorschau und Multiview zeigen genau diese Kulisse (#167, #168).
import type { ReactNode } from 'react';
import type { Stage } from '../../types';
import type { StufenWerte } from '../../avplan/scene3d';
import { istSpielfeld } from '../../utils/showRig';
import { fensterScheiben, wandDicke, wandStuecke, type WandStueck } from '../../utils/wallOpenings';
import { Arena, CrowdAndSeating, FieldMesh, LedWalls, ShowRig, StageBodyReal, WallSurfaceMaterial } from './ShowScene';
import type { KulissenDaten } from './kulissenDaten';

const GLAS_DICKE_M = 0.03;
const GLAS_FARBE = '#9fd3e6';

/** Glas: Glasfront oder Fensterscheibe, durchsichtig und ohne Tiefenschreiben. */
function Scheibe({ st, farbe }: { st: WandStueck; farbe?: string }) {
  return (
    <mesh position={[st.x, st.unten + st.hoehe / 2, st.y]} rotation={[0, -st.winkel, 0]} renderOrder={1}>
      <boxGeometry args={[st.laenge, st.hoehe, GLAS_DICKE_M]} />
      <meshStandardMaterial color={farbe ?? GLAS_FARBE} roughness={0.05} metalness={0.1} opacity={0.22} transparent depthWrite={false} />
    </mesh>
  );
}

export function Kulisse({ daten, show, tageslicht = false, simple, werte, audience, planungsBoden, einfacheBuehne }: {
  daten: KulissenDaten;
  /** Showlicht an. */
  show: boolean;
  /** Unter freiem Himmel: Himmel und Sonne bringen ihr Licht selbst mit. */
  tageslicht?: boolean;
  /** Einfache Darstellung: weniger Publikum. */
  simple: boolean;
  werte: StufenWerte;
  audience: boolean;
  /** Boden ohne Showlicht, je Thema (planungsLook). */
  planungsBoden?: string;
  /** Buehne ohne Showlicht; fehlt sie, steht auch dann der echte Koerper da. */
  einfacheBuehne?: (stage: Stage) => ReactNode;
}) {
  const { venue, walls, freiFuellen, diag, boardLook, draussen, ledWaende, audienceCams, audiencePersons } = daten;
  return (
    <>
      {show ? (
        <>
          {!tageslicht && (
            <>
              <hemisphereLight args={['#8ea2d8', '#0d0a08', draussen ? 0.18 : 0.08]} />
              {/* Streulicht von der Buehne ins Publikum: ohne es waere die Menge ein schwarzes Loch. */}
              <directionalLight position={[boardLook.x, 18, boardLook.y - diag]} intensity={0.22} color="#7f93ff" />
            </>
          )}
          <ShowRig venue={venue} look={boardLook} werte={werte} draussen={draussen || tageslicht} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.7} color="#e8eaf0" />
          <directionalLight position={[10, 20, 10]} intensity={1.0} color="#ffffff" />
          <directionalLight position={[-10, 15, -5]} intensity={0.3} color="#94a3b8" />
          <hemisphereLight args={['#b0c4de', '#1e293b', 0.4]} />
        </>
      )}

      <Arena venue={venue} show={show} offen={tageslicht} planungsBoden={planungsBoden} />

      {venue.stages.map((s) => (
        !show && einfacheBuehne
          ? <group key={s.id}>{einfacheBuehne(s)}</group>
          : (istSpielfeld(s) ? <FieldMesh key={s.id} stage={s} /> : <StageBodyReal key={s.id} stage={s} />)
      ))}

      {audience && (
        <CrowdAndSeating
          venue={venue}
          cameras={audienceCams}
          persons={audiencePersons}
          walls={walls}
          freiFuellen={freiFuellen}
          max={simple ? 4000 : werte.ao ? 40000 : 15000}
        />
      )}
      {ledWaende.length > 0 && <LedWalls walls={ledWaende} maxLichter={show && werte.ao ? 1 : 0} />}

      {walls.map((w) => {
        const dicke = wandDicke(w);
        const glas = w.kind === 'glass';
        return [
          ...wandStuecke(w, w.height).map((st, i) => (
            glas
              ? <Scheibe key={`${w.id}-${i}`} st={st} farbe={w.color} />
              : (
                <mesh key={`${w.id}-${i}`} position={[st.x, st.unten + st.hoehe / 2, st.y]} rotation={[0, -st.winkel, 0]}>
                  <boxGeometry args={[st.laenge, st.hoehe, dicke]} />
                  {venue.wallMaterial
                    ? <WallSurfaceMaterial art={venue.wallMaterial} laengeM={st.laenge} hoeheM={st.hoehe} farbe={w.color} />
                    : <meshStandardMaterial color={w.color ?? (show ? '#3a3d42' : '#6b7280')} roughness={0.9} />}
                </mesh>
              )
          )),
          ...fensterScheiben(w, w.height).map((st, i) => <Scheibe key={`${w.id}-f${i}`} st={st} />),
        ];
      })}
    </>
  );
}
