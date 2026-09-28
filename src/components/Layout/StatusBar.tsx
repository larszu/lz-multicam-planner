import { useStore } from '../../store/useStore';
import { getCameraById } from '../../data/cameras';
import { useTranslation, format } from '../../i18n';

/**
 * Die Statusleiste — 24 px, ganz unten, in jeder Sicht.
 *
 * ─── WARUM ES SIE ERST SEIT DEM 2026-09-12 GIBT ──────────────────────────
 *
 * ADR-007 Abschnitt 6 nennt sie seit Langem im Rahmen: „Statusleiste 24 px:
 * Meldungen links · Zaehler rechts". Der `cable-planner` und der
 * `light-planner` fuehren sie, diese App nicht — und im Stilblatt stand
 * dazu ein Satz, der richtig war, solange er stimmte: „wo keine ist, wird
 * auch keine erfunden, nur um eine Regel abzuhaken".
 *
 * Was dabei offen blieb, war nicht das OB, sondern das WAS. Genau das
 * beantwortet der ADR aber: Zaehler. Und Zaehler sind ABLEITBAR — die drei
 * Zahlen unten stehen ohnehin im Zustand, keine davon ist erfunden. Was
 * hier bewusst NICHT steht, sind Werte, die eine Produktentscheidung
 * waeren: keine „Komplexitaet", keine Ampel, keine Bewertung des Plans.
 *
 * ─── UND WARUM SIE NICHT NUR ZAEHLT ──────────────────────────────────────
 *
 * Rechts steht der Bearbeitungsmodus, sobald er nicht „alles" ist. Das ist
 * kein Zaehler, sondern eine MELDUNG im Sinne des ADR: in diesem Zustand
 * laesst sich ein Teil des Plans nicht anfassen, und wer das nicht weiss,
 * haelt die App fuer kaputt. Bisher stand die Auskunft nur in der
 * Kopfzeile, wo sie beim Arbeiten am Grundriss ausser Blick liegt.
 */
export default function StatusBar() {
  const { t } = useTranslation();
  const venue = useStore((s) => s.venue);
  const projectVersion = useStore((s) => s.projectVersion);
  const cameras = useStore((s) => s.cameras);
  const persons = useStore((s) => s.persons);
  const walls = useStore((s) => s.walls);
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const editMode = useStore((s) => s.editMode);
  // MIT den eigenen Kameras: ohne sie faellt der Name einer selbst
  // angelegten Kamera aus der Leiste, und die Auswahl saehe namenlos aus.
  const customCameras = useStore((s) => s.customCameras);
  const autosaveStorageFull = useStore((s) => s.autosaveStorageFull);

  const gewaehlt = cameras.find((c) => c.id === selectedCameraId);
  const kamera = gewaehlt ? getCameraById(gewaehlt.cameraId, customCameras) : undefined;

  // Ein Schalter und keine Tabelle mit Schluesseln: `t()` mit einer Variablen
  // als Schluessel ist fuer `i18n:check` nicht aufloesbar, und die vier
  // Eintraege gaelten dort ab sofort als unerreichbar.
  const modusText = (m: typeof editMode) =>
    m === 'floorplan'
      ? t('status.mode.floorplan', 'Editing: floor plan')
      : m === 'stage'
        ? t('status.mode.stage', 'Editing: stage')
        : m === 'objects'
          ? t('status.mode.objects', 'Editing: objects')
          : t('status.mode.cameras', 'Editing: cameras');

  return (
    <footer className="bc-statusbar">
      <span className="truncate font-medium text-bc-text">{venue.name}</span>
      <span className="text-bc-dim" aria-hidden="true">|</span>
      <span className="whitespace-nowrap">v{projectVersion}</span>
      <span className="whitespace-nowrap">
        {format(t('status.cameras', '{count} cameras'), { count: cameras.length })}
      </span>
      <span className="whitespace-nowrap">
        {format(t('status.people', '{count} people & objects'), { count: persons.length })}
      </span>
      <span className="hidden whitespace-nowrap lg:inline">
        {format(t('status.walls', '{count} walls'), { count: walls.length })}
      </span>
      <span className="flex-1" />
      {/* Eine Meldung im Sinne des ADR: die automatische Sicherung haelt den
          Stand gerade NICHT — wer jetzt schliesst, verliert, was seit dem
          letzten Speichern als Datei geaendert wurde. */}
      {autosaveStorageFull && (
        <span className="truncate text-bc-red" role="status">
          {t('status.autosaveFull', 'Autosave failed — storage is full. Save the project to a file.')}
        </span>
      )}
      {gewaehlt && (
        <span className="truncate">
          {gewaehlt.label}
          {kamera ? ` · ${kamera.manufacturer} ${kamera.model}` : ''}
          {` · ${Math.round(gewaehlt.focalLength)} mm`}
        </span>
      )}
      {editMode !== 'all' && (
        <span className="whitespace-nowrap text-bc-accent">{modusText(editMode)}</span>
      )}
    </footer>
  );
}
