// ───────────────────────────────────────────────────────────────────────────
// Read-only Ansicht fremder .avplan-Domaenen.
//
// MultiCam bearbeitet die Lampen nicht, soll sie aber EINSEHEN koennen: aus der
// verlustfrei mitgefuehrten "lighting"-Domaene (Light-Planner ProjectData)
// werden die platzierten Lampen defensiv extrahiert und im 2D-Venue als
// read-only Marker gezeigt. Die Domaene ist `unknown` → robust gegen Schema-
// Abweichungen, wirft nie.
// ───────────────────────────────────────────────────────────────────────────

export interface ForeignFixture {
  id: string;
  x: number;
  y: number;
  colorTemp?: number;
  name?: string;
  aimX?: number;
  aimY?: number;
  dimming?: number;
  /** Mounting height above the floor (m); missing = `STANDARD_HOEHE_M`. */
  z: number;
  /** Usable beam edge (10 % peak) in degrees; the zoom override wins over the catalogue value. */
  fieldDeg: number;
  hidden: boolean;
}

/** Light-planner places a new fixture at 6 m; a file without the height gets the same. */
export const STANDARD_HOEHE_M = 6;
const STANDARD_FELD_DEG = 30;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Extrahiert die platzierten Lampen aus einer fremden lighting-Domaene. */
export function foreignFixturesFrom(lighting: unknown): ForeignFixture[] {
  const list = (lighting as { fixtures?: unknown } | null | undefined)?.fixtures;
  if (!Array.isArray(list)) return [];
  const out: ForeignFixture[] = [];
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const x = num(o.x);
    const y = num(o.y);
    if (x === undefined || y === undefined) continue;
    const fixture = o.fixture as { name?: unknown; beamAngle?: unknown; fieldAngle?: unknown } | undefined;
    const beam = num(o.currentBeamAngle) ?? num(fixture?.beamAngle);
    const feldKatalog = num(fixture?.fieldAngle);
    const katalogBeam = num(fixture?.beamAngle);
    // Ein Zoom aendert Beam- und Feldwinkel im selben Verhaeltnis.
    const feld = feldKatalog !== undefined && katalogBeam && beam ? feldKatalog * (beam / katalogBeam) : feldKatalog ?? (beam !== undefined ? beam * 1.5 : undefined);
    out.push({
      id: String(o.id ?? ''),
      x, y,
      colorTemp: num(o.currentColorTemp),
      name: typeof fixture?.name === 'string' ? fixture.name : undefined,
      aimX: num(o.aimX),
      aimY: num(o.aimY),
      dimming: num(o.dimming),
      z: num(o.mountingHeight) ?? STANDARD_HOEHE_M,
      fieldDeg: Math.min(170, Math.max(1, feld ?? STANDARD_FELD_DEG)),
      hidden: o.hidden === true,
    });
  }
  return out;
}

/** Grobe Farbtemperatur → RGB-Kennfarbe fuer den Marker. */
export function cctToColor(cct?: number): string {
  if (cct === undefined) return '#fbbf24'; // amber default
  if (cct < 3200) return '#fb923c'; // warm orange
  if (cct < 4500) return '#fde68a'; // warm white
  if (cct < 5600) return '#fef9c3'; // neutral
  return '#bae6fd'; // cool blue
}

export type LichtplanFehler = 'json' | 'keine-leuchten';

/**
 * Lichtplan aus einer Datei von lz-light-planner: Projektdatei
 * (`.lightplan.json`, ProjectData) oder Gesamtprojekt (`.avplan`, dort die
 * Domaene `lighting`). Gibt die Domaene unveraendert zurueck, damit sie beim
 * Speichern und beim .avplan-Export verlustfrei weiterreist.
 */
export function lichtplanAusText(text: string): unknown {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error('json' satisfies LichtplanFehler);
  }
  const o = roh as { kind?: unknown; domains?: { lighting?: unknown } } | null;
  const lighting = o && o.kind === 'avplan' ? o.domains?.lighting : roh;
  if (!Array.isArray((lighting as { fixtures?: unknown } | null | undefined)?.fixtures)) {
    throw new Error('keine-leuchten' satisfies LichtplanFehler);
  }
  return lighting;
}
