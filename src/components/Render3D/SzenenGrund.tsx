// Licht, Himmel und Kulisse — derselbe Aufbau fuer die 3D-Ansicht und die
// gerenderten Kamerabilder in Vorschau und Multiview (#192). Planungs-Beiwerk
// (Raster, Abdeckung, Kameras) legt die 3D-Ansicht selbst darueber.
import { useEffect, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import type { Stage } from '../../types';
import type { StufenWerte } from '../../avplan/scene3d';
import { Atmosphere } from '../Venue3D/ShowScene';
import { Kulisse } from '../Venue3D/Kulisse';
import { Tageslicht } from '../Venue3D/Tageslicht';
import type { KulissenDaten } from '../Venue3D/kulissenDaten';
import type { HimmelPrefs } from '../../utils/tageslicht';
import { PLANUNG_JE_THEMA, PLANUNGS_BODEN } from '../Venue3D/planungsLook';
import { stelleEinfachEin, type RenderLook } from './renderLook';

export function SzenenGrund({ daten, show, tag, sky, simple, werte, audience, thema, far, look, onBelichtung, einfacheBuehne }: {
  daten: KulissenDaten;
  show: boolean;
  /** Tageslicht statt Halle (nur mit Showlicht). */
  tag: boolean;
  sky: HimmelPrefs;
  simple: boolean;
  werte: StufenWerte;
  audience: boolean;
  thema: 'hell' | 'dunkel';
  /** camera.far der Ansicht. */
  far: number;
  look: RenderLook;
  onBelichtung: (b: number) => void;
  einfacheBuehne?: (stage: Stage) => ReactNode;
}) {
  return (
    <>
      {simple && <EinfacheAusgabe look={look} />}
      {tag
        ? <Tageslicht sky={sky} diagM={daten.diag} mitte={{ x: daten.venue.widthM / 2, y: daten.venue.heightM / 2 }} farDist={far} onBelichtung={onBelichtung} />
        : <Atmosphere look={show ? (daten.draussen ? 'nacht' : 'arena') : 'planung'} hintergrund={show ? undefined : PLANUNG_JE_THEMA[thema]} diagM={daten.diag} domeRadius={daten.farDist * 0.8} />}
      <Kulisse
        daten={daten}
        show={show}
        tageslicht={tag}
        simple={simple}
        werte={werte}
        audience={audience}
        planungsBoden={PLANUNGS_BODEN[thema]}
        einfacheBuehne={einfacheBuehne}
      />
    </>
  );
}

/** Ohne Pipeline (einfache Ansicht) gilt derselbe Look direkt am Renderer. */
function EinfacheAusgabe({ look }: { look: RenderLook }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    stelleEinfachEin(gl, look);
    invalidate();
  }, [gl, look, invalidate]);
  return null;
}
