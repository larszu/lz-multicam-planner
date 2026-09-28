// ───────────────────────────────────────────────────────────────────────────
// Bedarf 48 (P2) — eine Schattierungs-Flaeche fuer eine gemischte Flotte,
// und zwar zur PLANUNGSZEIT statt in der Probe.
//
// ─── DER BEFUND ────────────────────────────────────────────────────────────
//
//   > A single show carries Sony VISCA heads, Blackmagic bodies, Panasonic
//   > PTZ and Sony FX6 cinema cameras; each needs its own app or panel, and
//   > THE EXPOSED PAINT SET DIFFERS PER PROTOCOL (Panasonic AW PTZ exposes
//   > only iris/bars/focus, Blackmagic exposes the full colour-correction
//   > set).
//
// Der Beleg ist eine dreimal gestellte Bitte: `companion-module-requests`
// #739 (2022), #1792 (Feb 2025), #1947 (30. Sep 2025) — „Connect to Companion
// and be used to control any cameras (Sony Visca, Blackmagic cameras,
// Panasonic PTZ, Sony FX6, etc...). It is needed to do shading as a CCU."
// Vier Hersteller, vier Protokolle, vier Bedien-Apps, in einer Show.
//
// Die Bedarfs-Datenbank nennt die Massnahme woertlich, und sie ist
// ausdruecklich KEIN Steuerungs-Feature:
//
//   > Keep the normalised command bus, but EXPOSE THE CAPABILITY DIFFERENCES
//   > IN PLANNING: flag at plan time which positions cannot do remote colour
//   > temperature / black balance, INSTEAD OF DISCOVERING IT IN REHEARSAL.
//
// ─── DER BUS STEHT WOANDERS, UND ER BLEIBT DORT ────────────────────────────
//
// Den „normalised command bus" gibt es bereits: `sony-camera-bridge`,
// `packages/web-rcp/src/capabilities.ts`. Dort steht `MODE_CAPS` — je
// Verbindungsweg, welche Befehle das jeweilige Backend WIRKLICH implementiert;
// der Kopf jener Datei sagt es selbst: „Mirrors exactly what each backend's
// handleRcpCommand actually implements."
//
// Diese Datei bildet den PAINT-Teil davon ab, weil ein Planer, der die Kamera
// nicht anfasst, die Frage trotzdem beantworten koennen muss. Das ist eine
// Kopie, und Kopien laufen auseinander — deshalb ist sie hier nicht
// „abgeschrieben und gut", sondern mit Herkunft versehen (`BRIDGE_SOURCE`)
// und im Suite-Repo maschinell gegen die Quelle gehalten: dort werden die
// Nachbar-Repos ohnehin ausgecheckt (siehe `planner-drift.mjs`), hier nicht.
// Ein Guard, der in der CI dieses Repos immer uebersprungen wuerde, waere
// schlimmer als keiner — er saehe aus wie eine Pruefung.
//
// ─── WAS EIN „JA" HIER HEISST UND WAS NICHT ────────────────────────────────
//
// Die Tabelle ist eine Aussage ueber den WEG, nicht ueber das MODELL. Das ist
// kein Vorbehalt aus Vorsicht, sondern der belegte Normalfall: das
// Panasonic-Companion-Modul warnt in seiner eigenen Hilfe „Not all models
// support all actions", und die Ausfaelle sind konkret — an einer AW-UE150A
// funktioniert „image-color temperature increase/decrease" nicht
// (`companion-module-panasonic-cameras#83`, geschlossen 10. Aug 2026), an
// einer AW-UE160 antworten Rot- und Blau-Gain weder auf den Regler noch
// zurueck (#56, geoeffnet 10. Feb 2026, geschlossen als „not planned"
// 14. Jul 2026). Zwei benachbarte Modelle EINER Herstellerlinie, zwei
// verschiedene Paint-Luecken.
//
// Deshalb ist `im-bus` nie eine Zusicherung, dass dieser Body gehorcht —
// `BUS_SCOPE_NOTE` sagt das auf jedem Blatt, auf dem die Tabelle steht.
// Umgekehrt ist `nicht-im-bus` die harte Aussage: was das Backend nicht
// kennt, kommt an keinem Modell an. Genau die Richtung braucht die Planung.
//
// ─── UND WAS DIE FLOTTE ANGEHT ─────────────────────────────────────────────
//
// Der teuerste Teil des Bedarfs ist nicht die einzelne Luecke, sondern die
// UNGLEICHE: matchen laesst sich nur, was JEDE Position kann. `fleetMatch`
// rechnet diesen Schnitt — und benennt, wer aus ihm herausfaellt.
//
// REIN: keine Uhr, kein Store, kein IO.
// ───────────────────────────────────────────────────────────────────────────
import type { ControlPath, VenueCamera } from '../types';
import { PAINT_UNSTATED } from './paintState';

/**
 * Woher die Tabelle stammt.
 *
 * Steht als Wert und nicht nur im Kommentar, damit der Paritaets-Guard der
 * Suite die Stelle nennen kann, gegen die er prueft — und damit auf einem
 * gedruckten Blatt steht, worauf die Aussage beruht.
 */
export const BRIDGE_SOURCE = {
  repo: 'sony-camera-bridge',
  file: 'packages/web-rcp/src/capabilities.ts',
  symbol: 'MODE_CAPS',
  /** Stand der Quelle, aus der diese Kopie genommen wurde. */
  commit: 'e74a3bc311e9dcf43b739fccc10e5a9d0946a1d7',
} as const;

/**
 * Was ein „ja" in dieser Tabelle wert ist — und was nicht.
 *
 * Derselbe Bau wie `PAINT_SOURCE_NOTE` in `shiftReport.ts`: eine Tatsache
 * ueber die AUSKUNFT, einmal am Kopf, nicht als Feld je Position. Ein Feld je
 * Position liesse sich auf „geprueft" stellen, ohne dass je etwas geprueft
 * wurde.
 */
/**
 * Dieselbe Einschraenkung in Kartenlaenge.
 *
 * Steht hinter der Kann-Liste auf der Kamerakarte. Ein eigener Text und kein
 * Ausschnitt der langen Fassung: die Karte hat eine Zeile, die Leiste einen
 * Absatz — beide sagen dasselbe, und `shadingCapability.test.ts` haelt fest,
 * dass beide ueberhaupt irgendwo stehen. Ohne diesen Zusatz stuende auf einem
 * weitergereichten Blatt eine Zusicherung, die niemand gegeben hat.
 */
export const BUS_SCOPE_SHORT = 'Weg, nicht Modell';

export const BUS_SCOPE_NOTE =
  'Gilt für den Fernsteuerweg, nicht für das einzelne Modell: was hier steht, ' +
  'ist der Befehlsvorrat des Backends. Dass ein Body ihn beantwortet, ist damit ' +
  'nicht zugesichert — innerhalb einer Herstellerlinie unterscheiden sich die ' +
  'Paint-Lücken von Modell zu Modell.';

/**
 * Die Paint-Funktionen, um die es bei der Schattierung geht.
 *
 * Ein Ausschnitt aus `CameraCapabilities` der Bridge: Tally, Aufzeichnung,
 * Fokus und Ruf sind dort ebenfalls verzeichnet, sind aber keine
 * Schattierung. Die Reihenfolge ist die des Pults — Belichtung, Schwarz,
 * Farbe, Hilfsmittel.
 */
export const PAINT_FUNCTIONS = [
  'iris',
  'ndFilter',
  'shutter',
  'iso',
  'masterGain',
  'autoIris',
  'masterBlack',
  'blackBalance',
  'abb',
  'masterGamma',
  'contrast',
  'saturation',
  'whiteBalance',
  'colorTemp',
  'awb',
  'cc',
  'resetCc',
  'bars',
] as const;

export type PaintFunction = (typeof PAINT_FUNCTIONS)[number];

export const PAINT_FUNCTION_LABEL: Readonly<Record<PaintFunction, string>> = {
  iris: 'Blende',
  ndFilter: 'ND-Filter',
  shutter: 'Shutter',
  iso: 'ISO',
  masterGain: 'Master-Gain',
  autoIris: 'Auto-Blende',
  masterBlack: 'Master-Black',
  blackBalance: 'Schwarzabgleich',
  abb: 'Auto-Schwarzabgleich',
  masterGamma: 'Gamma',
  contrast: 'Kontrast',
  saturation: 'Sättigung',
  whiteBalance: 'Weißabgleich (R/B-Gain)',
  colorTemp: 'Farbtemperatur',
  awb: 'Auto-Weißabgleich',
  cc: 'CC-Filter',
  resetCc: 'CC zurücksetzen',
  bars: 'Farbbalken',
};

/**
 * Wie eine Position ferngesteuert wird — im Klartext des Bedienenden.
 *
 * Die Kennungen sind 1:1 die `ConnectionMode` der Bridge. Sie hier
 * umzubenennen oder zusammenzufassen (etwa `tcp` und `serial`, deren Zeilen
 * heute gleich lauten) waere bequem und genau der Anfang einer zweiten
 * Wahrheit: aendert die Bridge eine der beiden, fiele es niemandem auf.
 */
export const CONTROL_PATH_LABEL: Readonly<Record<ControlPath, string>> = {
  tcp: 'Sony CCU 700PTP (TCP)',
  serial: 'Sony CCU 700PTP (RS-422)',
  'sony-usb': 'Sony Alpha/Cinema (USB-PTP)',
  'sony-mnc': 'Sony Monitor & Control (WLAN)',
  'lumix-http': 'Panasonic Lumix (HTTP-CGI)',
  'canon-ccapi': 'Canon CCAPI',
  blackmagic: 'Blackmagic (REST)',
  zcam: 'Z CAM (HTTP)',
  'panasonic-ptz': 'Panasonic AW PTZ (CGI)',
  visca: 'VISCA over IP',
  'visca-serial': 'VISCA (RS-232/422)',
  jvc: 'JVC (Web-API)',
  birddog: 'BirdDog (VISCA + REST)',
  'http-cgi': 'HTTP-CGI PTZ (Vissonic/Sony)',
  'dji-osmo': 'DJI Osmo Pocket (Gimbal)',
  'dji-ronin': 'DJI Ronin RS 2 / RS 3 Pro (Gimbal)',
  'b4-lens': 'B4-Objektiv (ESP32 am 12-Pin-Hirose)',
  none: 'kein Fernsteuerweg — von Hand am Body',
};

/**
 * Der Paint-Vorrat je Weg, abgebildet aus `MODE_CAPS`.
 *
 * Aufgezaehlt wird nur, was auf `true` steht — alles Uebrige ist „nicht im
 * Bus". `none` ist bewusst leer und kein Sonderfall im Code: „von Hand am
 * Body" heisst fernsteuerbar gar nichts, und das ist eine Entscheidung, kein
 * fehlender Eintrag.
 *
 * `abb` und `autoIris` stehen in KEINER Zeile. Das ist kein Vergessen: die
 * Bridge begruendet es fuer die Sony-CCU-Wege ausdruecklich — Sonys
 * 700-Protokoll ist NDA-only, keine oeffentliche Quelle dokumentiert die
 * Auto-Setup-Befehlscodes. Eine Spalte, die ueberall „nein" sagt, bleibt hier
 * trotzdem stehen: sie beantwortet die Frage, die der Bildtechniker sonst in
 * der Probe stellt.
 */
export const MODE_PAINT: Readonly<Record<ControlPath, readonly PaintFunction[]>> = {
  tcp: [
    'iris', 'ndFilter', 'shutter', 'masterGain', 'masterBlack', 'blackBalance',
    'masterGamma', 'saturation', 'whiteBalance', 'bars',
  ],
  serial: [
    'iris', 'ndFilter', 'shutter', 'masterGain', 'masterBlack', 'blackBalance',
    'masterGamma', 'saturation', 'whiteBalance', 'bars',
  ],
  'sony-usb': ['iris', 'shutter', 'iso', 'masterGain', 'colorTemp', 'awb'],
  'sony-mnc': ['iris', 'ndFilter', 'iso', 'masterGain', 'colorTemp', 'awb'],
  'lumix-http': [
    'iris', 'ndFilter', 'shutter', 'iso', 'masterGain', 'masterBlack',
    'saturation', 'whiteBalance', 'bars',
  ],
  'canon-ccapi': ['iris', 'shutter', 'iso', 'masterGain', 'colorTemp', 'awb'],
  blackmagic: [
    'iris', 'ndFilter', 'shutter', 'masterGain', 'masterBlack', 'blackBalance',
    'masterGamma', 'contrast', 'saturation', 'whiteBalance', 'colorTemp', 'awb',
    'cc', 'resetCc',
  ],
  zcam: ['iris', 'shutter', 'iso', 'masterGain', 'colorTemp', 'awb'],
  'panasonic-ptz': ['iris', 'bars'],
  visca: ['iris', 'masterGain', 'awb'],
  // Derselbe Befehlssatz wie ueber IP -- der Draht aendert die Huelle, nicht
  // die Kommandos. Weniger einzutragen hiesse, auf dem gedruckten Blatt
  // etwas zu verbieten, was die Kamera kann.
  'visca-serial': ['iris', 'masterGain', 'awb'],
  jvc: ['iris', 'masterGain', 'colorTemp', 'awb'],
  birddog: ['iris', 'masterGain', 'colorTemp', 'awb'],
  // Gimbals stellen NICHTS am Bild. Leer ist hier die richtige Aussage und
  // nicht eine fehlende: sie bewegen den Kopf, das Bild macht die Kamera
  // darauf, und die hat ihren eigenen Fernsteuerweg.
  'dji-osmo': [],
  'dji-ronin': [],
  // Ein Objektiv am 12-poligen Hirose. Der Steckverbinder kennt GENAU
  // EINEN fernstellbaren Wert -- fuer Zoom und Fokus gibt es dort gar
  // keinen analogen Antriebseingang, die laufen ueber die eigenen
  // Demand-Buchsen der Optik. Eine kurze Zeile ist hier die richtige
  // Auskunft und keine unfertige.
  //
  // `autoIris` steht hier als EINZIGE Zeile der Tabelle auf ja, und der
  // Kopf dieser Datei sagt warum es sonst nirgends steht: Sonys
  // 700-Protokoll haelt die Auto-Setup-Codes unter NDA. Hier ist es
  // kein Befehlscode, sondern Pin 8 -- ein Draht, der die Optik
  // zwischen ihrer eigenen Automatik und Fernsteuerung umschaltet.
  'b4-lens': ['iris', 'autoIris'],
  // HTTP-CGI PTZ bewegt pan/tilt/zoom/fokus und ruft Presets, stellt aber
  // NICHTS am Bild: kein Paint ueber diesen Weg. Wie birddog wird `focus`
  // in dieser Paint-Tabelle nicht gefuehrt -- also leer.
  'http-cgi': [],
  none: [],
};

export type ShadingVerdict =
  /** Das Backend dieses Weges kennt den Befehl. Keine Zusicherung fuers Modell. */
  | 'im-bus'
  /** Es kennt ihn nicht — das ist die Planungs-Aussage, und sie ist hart. */
  | 'nicht-im-bus'
  /** Fuer diese Position ist ausdruecklich kein Fernweg vorgesehen. */
  | 'von-hand'
  /** Es steht gar kein Weg im Plan. NICHT dasselbe wie „kann alles". */
  | 'kein-weg';

/**
 * Was diese Position mit dieser Funktion fernsteuern kann.
 *
 * DIE EINZIGE STELLE, DIE IN `MODE_PAINT` NACHSIEHT. Jede Zeile, jeder Befund
 * und jedes Blatt geht hier durch — eine zweite Leserin der Tabelle waere eine
 * zweite Gelegenheit, `none` oder den fehlenden Eintrag anders zu behandeln,
 * und dann stuende auf der Karte etwas anderes als in der Leiste.
 */
export const shadingVerdict = (cam: VenueCamera, fn: PaintFunction): ShadingVerdict => {
  if (!cam.controlPath) return 'kein-weg';
  if (cam.controlPath === 'none') return 'von-hand';
  return MODE_PAINT[cam.controlPath].includes(fn) ? 'im-bus' : 'nicht-im-bus';
};

/** Was diese Position fernsteuern kann — in Pult-Reihenfolge. */
export const remoteFunctions = (cam: VenueCamera): PaintFunction[] =>
  PAINT_FUNCTIONS.filter((fn) => shadingVerdict(cam, fn) === 'im-bus');

/**
 * Die Zeilen der Kamerakarte.
 *
 * Beide Zeilen stehen IMMER da — dieselbe Regel wie bei Rigging und Comms:
 * eine weggelassene liest sich als „dazu gibt es nichts zu sagen", und genau
 * dieser Eindruck laesst die Luecke bis in die Probe stehen.
 *
 * Aufgezaehlt wird das KANN, nicht das Kann-nicht: an einer Panasonic-PTZ
 * waeren das sechzehn Verneinungen, die niemand liest — und die dann auch die
 * eine Zeile mitnehmen, an der etwas steht.
 */
export const shadingLines = (cam: VenueCamera): string[] => {
  const weg = cam.controlPath ? CONTROL_PATH_LABEL[cam.controlPath] : PAINT_UNSTATED;
  const kann = !cam.controlPath
    ? PAINT_UNSTATED
    : cam.controlPath === 'none'
      ? 'von Hand am Body'
      : `${remoteFunctions(cam)
          .map((f) => PAINT_FUNCTION_LABEL[f])
          .join(', ')} (${BUS_SCOPE_SHORT})`;
  return [`Fernsteuerweg: ${weg}`, `Fernsteuerbar: ${kann}`];
};

/**
 * Was sich ueber die Flotte hinweg ueberhaupt gleich einstellen laesst.
 *
 * Der Kern des Bedarfs. Gematcht werden kann nur der SCHNITT: eine Funktion,
 * die eine Position nicht hat, ist fuer den Abgleich der ganzen Show verloren,
 * egal wie viele andere sie haetten.
 */
export interface FleetMatch {
  /** Positionen mit geplantem Weg — nur die sind vergleichbar. */
  considered: string[];
  /** Was JEDE davon fernsteuern kann. Darauf laesst sich abgleichen. */
  shared: PaintFunction[];
  /** Was mindestens eine kann und mindestens eine nicht. Der teure Teil. */
  split: PaintFunction[];
  /** Positionen ohne Weg im Plan — nicht vergleichbar, nicht „kann alles". */
  unstated: string[];
}

export const fleetMatch = (cameras: readonly VenueCamera[]): FleetMatch => {
  const mitWeg = cameras.filter((c) => !!c.controlPath);
  const shared: PaintFunction[] = [];
  const split: PaintFunction[] = [];
  for (const fn of PAINT_FUNCTIONS) {
    const koennen = mitWeg.filter((c) => shadingVerdict(c, fn) === 'im-bus').length;
    if (mitWeg.length > 0 && koennen === mitWeg.length) shared.push(fn);
    else if (koennen > 0) split.push(fn);
  }
  return {
    considered: mitWeg.map((c) => c.id),
    shared,
    split,
    unstated: cameras.filter((c) => !c.controlPath).map((c) => c.id),
  };
};

export type ShadingFindingKind =
  /** Kein Fernsteuerweg im Plan — die Frage ist nicht gestellt. */
  | 'path-unstated'
  /** Farbtemperatur nicht fernsteuerbar. Vom Bedarf woertlich benannt. */
  | 'no-colortemp'
  /** Schwarzabgleich nicht fernsteuerbar. Vom Bedarf woertlich benannt. */
  | 'no-blackbalance'
  /** Diese Position kann nicht, was andere in derselben Show koennen. */
  | 'fleet-split';

export const SHADING_FINDING_LABEL: Readonly<Record<ShadingFindingKind, string>> = {
  'path-unstated': 'Kein Fernsteuerweg angegeben',
  'no-colortemp': 'Farbtemperatur nicht fernsteuerbar',
  'no-blackbalance': 'Schwarzabgleich nicht fernsteuerbar',
  'fleet-split': 'Kann weniger als andere Positionen der Show',
};

export interface ShadingFinding {
  kind: ShadingFindingKind;
  cameraId: string;
  /** Klartext-Satz. Kanonisches Deutsch — er landet auch auf Blaettern. */
  text: string;
}

/**
 * Was an dieser Position zur Planungszeit ueber die Schattierung feststeht.
 *
 * `alle` wird gebraucht, weil die teuerste der Fragen nur im Vergleich
 * beantwortbar ist: eine Panasonic-PTZ neben lauter Blackmagic-Bodies ist
 * FUER SICH vollstaendig geplant — und trotzdem der Grund, warum die Show
 * nicht auf einen gemeinsamen Weisspunkt zu bringen ist.
 */
export function shadingFindings(
  cam: VenueCamera,
  alle: readonly VenueCamera[],
): ShadingFinding[] {
  const out: ShadingFinding[] = [];
  const wo = `„${cam.label}"`;

  if (!cam.controlPath) {
    out.push({
      kind: 'path-unstated',
      cameraId: cam.id,
      text: `Für ${wo} steht kein Fernsteuerweg im Plan. Ob diese Position vom Pult aus schattiert werden kann, entscheidet sich dann in der Probe.`,
    });
    return out;
  }

  const weg = CONTROL_PATH_LABEL[cam.controlPath];
  // Wer „von Hand am Body" eingetragen hat, weiss, dass vom Pult nichts geht.
  // Ihm zu melden, dass die Farbtemperatur nicht fernstellbar ist, waere die
  // Wiederholung seiner eigenen Eingabe — und die Sorte Warnung, die man
  // wegklickt, mitsamt der naechsten, die einen Grund hatte.
  const amBus = cam.controlPath !== 'none';

  // Die beiden, die der Bedarf woertlich nennt. Sie stehen einzeln und nicht
  // in einer Sammelzeile: es sind die, an denen die Probe scheitert.
  if (amBus && shadingVerdict(cam, 'colorTemp') !== 'im-bus') {
    out.push({
      kind: 'no-colortemp',
      cameraId: cam.id,
      text: `${wo} hängt an „${weg}" — darüber ist die Farbtemperatur nicht fernstellbar. Der Weißpunkt dieser Position wird am Body oder über Filter gesetzt, nicht vom Pult.`,
    });
  }
  if (amBus && shadingVerdict(cam, 'blackBalance') !== 'im-bus') {
    out.push({
      kind: 'no-blackbalance',
      cameraId: cam.id,
      text: `${wo} hängt an „${weg}" — darüber ist kein Schwarzabgleich auszulösen. Er muss vor der Show am Body gemacht werden, und danach fasst ihn niemand mehr an.`,
    });
  }

  // Der Flotten-Teil: gemeldet wird an der Position, die HERAUSFAELLT, nicht
  // an jeder. Derselbe Satz an acht Kameras waere nach der zweiten Zeile
  // Tapete.
  const m = fleetMatch(alle);
  const fehlt = m.split.filter((fn) => shadingVerdict(cam, fn) !== 'im-bus');
  if (fehlt.length > 0) {
    const namen = fehlt.map((f) => PAINT_FUNCTION_LABEL[f]).join(', ');
    // „über „kein Fernsteuerweg — von Hand am Body" nicht" waere ein Satz, den
    // niemand zu Ende liest.
    const woran = amBus ? `über „${weg}"` : 'ohne Fernsteuerweg';
    out.push({
      kind: 'fleet-split',
      cameraId: cam.id,
      text: `${wo} kann ${woran} nicht, was andere Positionen dieser Show können: ${namen}. Abgleichen lässt sich die Show nur über das, was alle können.`,
    });
  }

  return out;
}

/** Normalisiert den Weg beim Laden. */
export function normaliseControlPath(raw: unknown): Pick<VenueCamera, 'controlPath'> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const v = o.controlPath;
  // Gegen die Label-Tabelle und nicht gegen eine zweite Liste: eine
  // Projektdatei aus einer spaeteren Version bringt sonst einen Weg mit, den
  // `MODE_PAINT` nicht kennt — und `shadingVerdict` liefe auf `undefined`.
  return typeof v === 'string' && v in CONTROL_PATH_LABEL
    ? { controlPath: v as ControlPath }
    : {};
}
