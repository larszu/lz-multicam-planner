// Die Halle ohne Planungs-Beiwerk: Licht, Raum, Buehnen, Publikum,
// LED-Waende und gezeichnete Waende. Die 3D-Ansicht legt ihre Werkzeuge
// (Raster, Abdeckung, Kameras) darueber; die gerenderten Kamerabilder in
// Vorschau und Multiview zeigen genau diese Kulisse (#167, #168).
import type { ReactNode } from 'react';
import type { Stage } from '../../types';
import type { StufenWerte } from '../../avplan/scene3d';
import { istSpielfeld } from '../../utils/showRig';
import { wandDicke, wandStuecke } from '../../utils/wallOpenings';
import { Arena, CrowdAndSeating, FieldMesh, LedWalls, ShowRig, StageBodyReal, WallSurfaceMaterial } from './ShowScene';
import type { KulissenDaten } from './kulissenDaten';

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
  const { venue, walls, diag, boardLook, draussen, ledWaende, audienceCams, audiencePersons } = daten;
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
          max={simple ? 4000 : werte.ao ? 40000 : 15000}
        />
      )}
      {ledWaende.length > 0 && <LedWalls walls={ledWaende} maxLichter={show && werte.ao ? 1 : 0} />}

      {walls.map((w) => {
        const dicke = wandDicke(w);
        return wandStuecke(w, w.height).map((st, i) => (
          <mesh key={`${w.id}-${i}`} position={[st.x, st.unten + st.hoehe / 2, st.y]} rotation={[0, -st.winkel, 0]}>
            <boxGeometry args={[st.laenge, st.hoehe, dicke]} />
            {venue.wallMaterial
              ? <WallSurfaceMaterial art={venue.wallMaterial} laengeM={st.laenge} hoeheM={st.hoehe} farbe={w.color} />
              : show
              ? <meshStandardMaterial color={w.color ?? '#3a3d42'} roughness={0.9} />
              : <meshStandardMaterial color={w.color ?? '#6b7280'} opacity={0.6} transparent />}
          </mesh>
        ));
      })}
    </>
  );
}
