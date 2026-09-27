import { useStore, OBJECT_PRESETS } from '../../store/useStore';
import { CAMERAS, getCameraById, getAdapterInfo, getEffectiveSensor, getCoverageStatus, getSpeedBooster, speedBoosterExists } from '../../data/cameras';
import { LENSES, getLensById, getCompatibleLenses, pickInitialMountAndLens } from '../../data/lenses';
import { computeFov, computeDof } from '../../utils/fov';
import { checkPresets, presetRows, type PresetFinding } from '../../utils/ptzPresets';
import { conflictsForCamera, conflictText } from '../../utils/sightline';
import { FRAMING_LABEL, FRAMINGS, reachReport, verdictShort } from '../../utils/lensReach';
import { PAINT_FINDING_LABEL, checkPaint } from '../../utils/paintState';
import {
  BUS_SCOPE_NOTE,
  CONTROL_PATH_LABEL,
  SHADING_FINDING_LABEL,
  shadingFindings,
  shadingLines,
} from '../../utils/shadingCapability';
import type { ControlPath } from '../../types';
import { REGISTRY_FINDING_LABEL, registryFindings } from '../../utils/paintRegistry';
import {
  FACET_LABEL, VERDICT_LABEL, parseSourceList, reconcile, sourceLabel,
} from '../../utils/sourceIdentity';
import {
  ACCESS_LABEL,
  CARD_FINDING_LABEL,
  cardFindings,
} from '../../utils/cameraCardExtras';
import { FiPlus, FiTrash2, FiCopy, FiChevronDown, FiChevronUp, FiEye, FiEyeOff, FiUpload, FiUser, FiMap, FiMaximize2, FiLock, FiUnlock, FiStar, FiEdit2, FiRotateCcw, FiHome, FiImage, FiColumns, FiUsers, FiVideo, FiTarget } from 'react-icons/fi';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { BackgroundPlan, StageObjectType, Camera, CameraMountType, VenueCamera, WallFit, WallPattern } from '../../types';

import { rigsForType, trackSectionPlan } from '../../data/rigs';
import { clampHeight, clampTrack, rigLimits } from '../../utils/rigLimits';
import { rigYaw } from '../../utils/camera';
import { DEFAULT_PATTERN_ROWS, PATTERN_ROWS_MAX, PATTERN_ROWS_MIN } from '../../utils/wallSurface';
import { FieldRow, Group, Note, Readout, ValueSlider } from './fields';
// Derselbe Objektiv-Regler wie im Preview-Tab: logarithmische Bahn, Rastung,
// direkte Zahleneingabe. Zwei Implementierungen waeren zwei Bedienungen.
import LensSlider from '../Preview/LensSlider';
import LibraryBadge from '../Library/LibraryBadge';
import UploadDialog from '../Library/UploadDialog';
import UploadStatus from '../Library/UploadStatus';
import { libraryCameras, libraryLenses } from '../../library/registry';
import { useDeviceLibrary } from '../../library/store';
import { isLibraryId, type LibraryItem } from '../../library/facet';
import {
  formatAperture,
  formatDistance,
  formatFocal,
  niceTicks,
  stepAlong,
  stepStop,
  stopsInRange,
  valueToPos,
} from '../../utils/lensScale';
import { CustomCameraForm } from './CustomCameraForm';
import { CalculationBreakdown } from './CalculationBreakdown';
import AiPlanAnalysis from './AiPlanAnalysis';
import * as pdfjsLib from 'pdfjs-dist';
import { useTranslation, format } from '../../i18n';
import { mountTypeLabel } from '../../i18n/mount';
import { MOUNT_TYPE_LABELS } from '../../types';

/**
 * Einheitlicher Akkordeon-Kopf fuer die linke Sidebar. Icon im getoenten
 * Quadrat (Akzent, wenn offen), Titel mit Hover-/Offen-Zustaenden, optionaler
 * Zaehler als Pill, ein rotierendes Chevron. Ersetzt die frueher uneinheitlichen
 * Header (fehlende/gemischte Icons, das rohe "▇"-Zeichen, nackte "(n)"-Zaehler).
 */
function AccordionHeader({
  icon, title, count, open, onToggle, right,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  /** Optionale Aktions-Buttons rechts (z. B. bei Cameras). */
  right?: React.ReactNode;
}) {
  // Hinweis: die App hat ein globales `* { padding: 0 }` (unlayered), das saemtliche
  // Tailwind `p-*`-Utilities aussticht. Deshalb werden Padding/Mindesthoehe hier per
  // Inline-Style gesetzt (Inline gewinnt gegen alles) — sonst waere die Klickflaeche
  // nur ~24px hoch und ohne linken Einzug. gap wird von der Regel nicht beruehrt.
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ minHeight: '44px', padding: '10px 14px' }}
        className="group flex flex-1 items-center gap-2.5 text-left transition-colors hover:bg-bc-hover"
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center transition-colors ${
            open ? 'bg-bc-accent/20 text-bc-accent' : 'bg-bc-dark text-bc-muted group-hover:text-bc-text'
          }`}
        >
          {icon}
        </span>
        <span
          className={`text-[13.5px] font-semibold transition-colors ${
            open ? 'text-bc-text-bright' : 'text-bc-text group-hover:text-bc-text-bright'
          }`}
        >
          {title}
        </span>
        {count !== undefined && (
          <span
            style={{ padding: '2px 7px' }}
            className="bg-bc-dark text-[10.5px] font-semibold tabular-nums text-bc-text"
          >
            {count}
          </span>
        )}
        <FiChevronDown
          size={17}
          className={`ml-auto shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-bc-text' : 'text-bc-muted'}`}
        />
      </button>
      {right && <div className="flex items-center gap-1 pr-2">{right}</div>}
    </div>
  );
}

/** Kuerzeste bzw. weiteste Fokusdistanz des Reglers (m). */
const FOCUS_MIN_M = 0.5;
const FOCUS_MAX_M = 200;

/**
 * Marken ausduennen. `niceTicks` haelt nur einen kleinen Mindestabstand ein —
 * das reicht im breiten Preview-Panel, aber in einer 260-px-Spalte klebten
 * dadurch Beschriftungen aneinander ("500mm900mm"). Der Abstand zaehlt in
 * Bahn-Anteilen (0..1), damit er auf der logarithmischen Skala stimmt.
 */
function sparseTicks(ticks: number[], min: number, max: number, minGap = 0.16): number[] {
  if (ticks.length === 0) return ticks;
  const out: number[] = [];
  for (const t of ticks) {
    const p = valueToPos(t, min, max);
    if (out.length === 0 || p - valueToPos(out[out.length - 1], min, max) >= minGap) out.push(t);
  }
  // Das Bahnende muss beschriftet bleiben — notfalls faellt die Marke davor weg.
  const last = ticks[ticks.length - 1];
  if (out[out.length - 1] !== last) {
    if (out.length > 1 && valueToPos(last, min, max) - valueToPos(out[out.length - 1], min, max) < minGap) out.pop();
    out.push(last);
  }
  return out;
}

/** Group lenses by mount for the dropdown */
function groupByMount(lenses: typeof LENSES) {
  const groups: Record<string, typeof LENSES> = {};
  for (const l of lenses) {
    const m = l.mount;
    if (!groups[m]) groups[m] = [];
    groups[m].push(l);
  }
  return groups;
}

function sortFavoritesFirst<T extends { id: string; manufacturer?: string; model?: string }>(items: T[], favoriteIds: string[]) {
  const favorites = new Set(favoriteIds);
  return [...items].sort((left, right) => {
    const leftFavorite = favorites.has(left.id) ? 1 : 0;
    const rightFavorite = favorites.has(right.id) ? 1 : 0;
    if (leftFavorite !== rightFavorite) return rightFavorite - leftFavorite;

    const leftLabel = `${left.manufacturer ?? ''} ${left.model ?? ''}`.trim();
    const rightLabel = `${right.manufacturer ?? ''} ${right.model ?? ''}`.trim();
    return leftLabel.localeCompare(rightLabel);
  });
}

/**
 * Bedarf 14 — Befundtext. Ausgeschriebener `switch` und keine Schluessel-
 * Zusammensetzung: dieser Planer hat kein i18n-Dict, aber die Regel „ein
 * Text je Fall, im Quelltext lesbar" gilt hier genauso — eine aus dem
 * `kind` gebaute Zeichenkette waere beim Suchen unauffindbar.
 */
const presetFindingText = (f: PresetFinding): string => {
  switch (f.kind) {
    case 'duplicate-number':
      return `Preset ${f.number}: ${f.values?.[0] ?? ''}× vergeben — das Gerät hält nur eines`;
    case 'unnamed':
      return `Preset ${f.number} hat keinen Namen — dann ist es wieder nur eine Nummer`;
    case 'focal-out-of-lens-range':
      return `Preset ${f.number}: ${f.values?.[0] ?? ''} mm liegt außerhalb des Objektivs (${f.values?.[1] ?? ''}–${f.values?.[2] ?? ''} mm)`;
    case 'camera-moved-since-save':
      return `Preset ${f.number}: Kamera seit dem Speichern ${f.values?.[0] ?? ''} m versetzt — Pan/Tilt zeigen woanders hin`;
    case 'not-a-ptz':
      return 'Diese Kamera ist keine PTZ — sie speichert keine Presets';
  }
};

function CameraCard({
  camId,
  expanded,
  toggleOpen,
}: {
  camId: string;
  /** Genau eine Karte ist offen — die der ausgewaehlten Kamera (Akkordeon). */
  expanded: boolean;
  toggleOpen: (camId: string) => void;
}) {
  const { t } = useTranslation();
  const {
    cameras,
    selectedCameraId,
    updateCamera,
    sourceListText,
    setSourceListText,
    removeCamera,
    duplicateCamera,
    customLenses,
    addCustomLens,
    removeCustomLens,
    favoriteCameraIds,
    favoriteLensIds,
    toggleFavoriteCameraId,
    toggleFavoriteLensId,
    savePresetFromCamera,
    updatePreset,
    removePreset,
    walls,
    persons,
    venue,
  } = useStore();
  const cam = cameras.find((c) => c.id === camId)!;
  const isSelected = cam.id === selectedCameraId;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNewLens, setShowNewLens] = useState(false);
  const [newLens, setNewLens] = useState({ manufacturer: '', model: '', focalMin: '10', focalMax: '100', aperture: '2.8', mount: 'B4', type: 'zoom' as 'zoom' | 'prime' });
  const [showNewCustomCam, setShowNewCustomCam] = useState(false);
  const [editingCustomCam, setEditingCustomCam] = useState<string | null>(null);
  const [showCalc, setShowCalc] = useState(false);

  // Bedarf 14 — Presets. `istPtz` kommt aus dem Katalog-Datensatz und nicht
  // aus dem Modellnamen: „PTZ" im Namen ist keine Eigenschaft des Geraets.
  const [presetName, setPresetName] = useState('');
  const [presetSegment, setPresetSegment] = useState('');

  const { customCameras, addCustomCamera, libraryStorageFull } = useStore();
  // Geraetebibliothek: schreibgeschuetzte dritte Quelle neben eingebaut und eigen.
  // Abonniert fuer das Neuzeichnen; gelesen aus dem Register, das auch die
  // Eintraege traegt, die das offene Projekt in seiner Datei mitbringt.
  useDeviceLibrary((s) => s.cache.entries);
  const bibCameras = [...libraryCameras()];
  const bibLenses = [...libraryLenses()];
  const [proposal, setProposal] = useState<LibraryItem | null>(null);
  const camDef = getCameraById(cam.cameraId, customCameras);
  const lensDef = getLensById(cam.lensId) ?? customLenses.find((l) => l.id === cam.lensId);
  const istPtz = camDef?.type === 'ptz';
  // Ohne `useMemo`: die Pruefung ist eine Schleife ueber eine Handvoll
  // Presets, und der React-Compiler weist ein Memo auf `cam` zurueck
  // (`preserve-manual-memoization`) -- `cam` entsteht hier aus `cameras.find`
  // und ist bei jedem Render ein anderes Objekt.
  const presetBefunde = checkPresets(cam, { lens: lensDef, isPtz: istPtz });

  // Bedarf 12 -- Sichtlinien-Konflikte dieser Kamera. Sie stehen hier und
  // nicht in einem eigenen Dialog: der Konflikt entsteht beim SETZEN der
  // Kamera, und eine Warnung, die man erst suchen muss, wird in der Probe
  // gefunden statt in der Planung -- genau das, was der Bedarf beklagt.
  const sichtKonflikte = conflictsForCamera(
    { cameras: [cam], walls, persons, stages: venue.stages },
    cam.id,
  );

  // Bedarfe 59/60/61 -- was auf der Kamerakarte fehlt und was mit einer
  // anderen Position kollidiert. Aus demselben Grund hier und nicht in einem
  // eigenen Dialog wie die Sichtlinien: die Luecke entsteht beim EINRICHTEN
  // der Position, und dort steht auch das Feld, das sie schliesst.
  const kartenBefunde = cardFindings(cam, cameras);

  // Bedarf 63 -- der Bildzustand. Aus demselben Grund hier wie die uebrigen
  // Karten-Befunde: die Luecke entsteht beim Einrichten der Position, und
  // dort steht auch das Feld, das sie schliesst.
  const bildBefunde = checkPaint(cam, cameras);
  // Bedarf 48 -- die Schattierungs-Befunde stehen in derselben Leiste wie der
  // Bildzustand: es ist die Arbeit derselben Person, und zwei zugeklappte
  // Gruppen fuer eine Frage findet niemand. Zusammengefuehrt und nicht
  // zweimal gezaehlt -- der Zaehler oben ist die Summe.
  const schattierBefunde = shadingFindings(cam, cameras);
  // Bedarf 47 -- Wiederauffindbarkeit und Abgleich-Absicht. Dieselbe Leiste
  // wie Bildzustand und Schattierung: es ist dieselbe Frage in drei Teilen,
  // und drei zugeklappte Gruppen dafuer findet niemand.
  const registerBefunde = registryFindings(cam, cameras);
  const bildUndSchattierung = [
    ...bildBefunde.map((f) => ({ label: PAINT_FINDING_LABEL[f.kind], text: f.text })),
    ...schattierBefunde.map((f) => ({ label: SHADING_FINDING_LABEL[f.kind], text: f.text })),
    ...registerBefunde.map((f) => ({ label: REGISTRY_FINDING_LABEL[f.kind], text: f.text })),
  ];

  // BEDARF 130 — der Abgleich Plan gegen das, was im Netz wirklich da ist.
  //
  // Er steht hier und nicht in einem eigenen Dialog, aus demselben Grund wie
  // die Sichtlinien-Konflikte: die Kennung wird HIER eingetragen, und eine
  // Warnung, die man erst suchen muss, wird waehrend der Sendung gefunden
  // statt davor — genau das, was der Beleg beklagt.
  const quellenListe = parseSourceList(sourceListText);
  const quellenAbgleich = reconcile(
    cameras.map((c) => ({
      cameraId: c.id,
      label: c.label,
      identity: c.source,
      lastIndex: c.lastSourceIndex,
    })),
    quellenListe.sources,
  );
  const meineZeile = quellenAbgleich.rows.find((r) => r.cameraId === cam.id);
  const feldCls =
    'block w-full rounded border border-bc-border bg-bc-dark px-1.5 py-1 text-xs text-bc-text-bright';
  /** Leeres Feld heisst „nicht angegeben", nicht null. */
  const zahlOderNichts = (v: string): number | undefined => {
    const n = Number(v.replace(',', '.'));
    return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
  };
  const allLenses = [...LENSES, ...customLenses];
  // The active mount controls lens compatibility — when the user has swapped
  // the body's mount plate (e.g. URSA Broadcast B4 → EF), only lenses for
  // that plate are physically attachable.
  const activeMount = cam.activeMount ?? camDef?.mount;
  // Strict: only lenses that physically attach to the active mount.
  const compatLenses = camDef ? getCompatibleLenses(camDef.mount, camDef.adaptedMounts, cam.activeMount) : allLenses;
  const allCompat = [
    ...compatLenses,
    ...[...customLenses, ...bibLenses].filter((l) => !activeMount || l.mount === activeMount || l.mount === 'universal' || l.mount === 'integrated'),
  ];
  // Deduplicate by id
  const compatDeduped = [...new Map(allCompat.map((l) => [l.id, l])).values()];
  // If the currently-selected lens is incompatible with the active mount (e.g.
  // a B4 lens left over from an older project where FZ mode silently auto-
  // applied the LA-FZB1), keep it visible in the dropdown so the user can see
  // and fix it, but mark it as a mismatch.
  const lensMismatch = !!(
    lensDef && activeMount &&
    lensDef.mount !== 'integrated' &&
    lensDef.mount !== 'universal' &&
    lensDef.mount !== activeMount
  );
  const dropdownLenses = lensMismatch && lensDef
    ? [...compatDeduped, lensDef]
    : compatDeduped;
  const grouped = groupByMount(sortFavoritesFirst(dropdownLenses, favoriteLensIds));
  // Dedupe: when a built-in is shadowed (custom entry with the same id), only the
  // custom version appears in the dropdown — the built-in is hidden behind it.
  const customCameraIds = new Set(customCameras.map((c) => c.id));
  // Bibliothekseintraege zaehlen wie eingebaute: bearbeiten legt eine eigene
  // Kopie an („modified"), der Bibliothekseintrag selbst bleibt unberuehrt.
  const builtInCameraIds = new Set([...CAMERAS, ...bibCameras].map((c) => c.id));
  const visibleBibCameras = sortFavoritesFirst(bibCameras.filter((c) => !customCameraIds.has(c.id)), favoriteCameraIds);
  const visibleCameras = [...CAMERAS.filter((c) => !customCameraIds.has(c.id)), ...customCameras];
  const sortedCameras = sortFavoritesFirst(visibleCameras, favoriteCameraIds);
  const isCustomEntry = (id: string) => customCameraIds.has(id);
  const isBuiltIn = (id: string) => builtInCameraIds.has(id);
  const isBuiltInShadow = (id: string) => isCustomEntry(id) && isBuiltIn(id);
  const isPureCustom = (id: string) => isCustomEntry(id) && !isBuiltIn(id);

  // Adapter & effective sensor
  const speedBooster = camDef ? getSpeedBooster(camDef, cam.activeMount ?? lensDef?.mount) : null;
  const adapterInfo = camDef && lensDef ? getAdapterInfo(camDef, lensDef, cam.useSpeedbooster, cam.activeMount) : null;
  const effectiveSensor = camDef && lensDef ? getEffectiveSensor(camDef, lensDef, cam.useSpeedbooster, cam.sensorModeIndex, cam.activeMount) : camDef?.sensor;
  const coverage = camDef && lensDef ? getCoverageStatus(camDef, lensDef, cam.useSpeedbooster, cam.activeMount, cam.sensorModeIndex) : null;
  // Grenzen und Marken der drei Objektiv-Regler.
  const focalMin = lensDef?.focalLengthMin ?? 4;
  const focalMax = Math.max(focalMin + 1, lensDef?.focalLengthMax ?? 300);
  // Angezeigte Marken sind duenner als im Preview-Tab (sonst kleben die
  // Beschriftungen in der schmalen Spalte aneinander); die Schrittweite von
  // − / + bleibt aber die feine Reihe — Anzeige-Dichte ist nicht Bedien-Dichte.
  const focalStepTicks = niceTicks(focalMin, focalMax);
  const focalTicks = sparseTicks(focalStepTicks, focalMin, focalMax);
  const apertureMin = lensDef?.maxApertureWide ?? 1.4;
  const apertureMax = 22;
  // Blendenzahlen sind kurz, brauchen also weniger Abstand als "500mm".
  const apertureTicks = sparseTicks(stopsInRange(apertureMin, apertureMax), apertureMin, apertureMax, 0.1);
  const focusStepTicks = niceTicks(FOCUS_MIN_M, FOCUS_MAX_M);
  const focusTicks = sparseTicks(focusStepTicks, FOCUS_MIN_M, FOCUS_MAX_M);

  const fov = effectiveSensor && lensDef ? computeFov(effectiveSensor, cam.focalLength, cam.focusDistance, cam.extenderActive, lensDef.squeeze ?? 1) : null;
  const dof = effectiveSensor && lensDef ? computeDof(effectiveSensor, cam.focalLength, cam.aperture, cam.focusDistance, cam.extenderActive) : null;

  // Bedarf 58 -- kommt die Optik an den beauftragten Ausschnitt heran?
  //
  // Ueber `reachReport` und nicht mit einer eigenen Rechnung: die Engstelle
  // ist der einzige Ort, der das entscheidet, sonst stuende auf der
  // Kamerakarte etwas anderes als hier. `optics` liefert genau das, was die
  // Leiste ohnehin schon aufgeloest hat -- effektiver Sensor (Crop-Modus,
  // Adapter, Speedbooster) und die eingesetzte Optik.
  const deckungsZeile = reachReport({
    cameras: [cam],
    persons,
    optics: () => (effectiveSensor && lensDef ? { sensor: effectiveSensor, lens: lensDef } : null),
  }).rows[0] ?? null;

  return (
    <div
      style={{ padding: '8px' }}
      className={`@container border mb-2 transition-colors ${
        isSelected ? 'border-bc-accent bg-bc-accent/10' : 'border-bc-border bg-bc-panel hover:border-bc-accent/50'
      }`}
    >
      {/* Kopfzeile. Bleibt beim Scrollen stehen, damit man bei einer langen
          Karte nicht raten muss, welche Kamera man gerade verstellt. */}
      {/* Der Hintergrund muss deckend sein (sonst scrollt der Inhalt sichtbar
          darunter durch); bei ausgewaehlter Karte ist es die Panel-Farbe mit
          dem Akzent-Schleier, den `bg-bc-accent/10` sonst transparent legt. */}
      <div className={`sticky top-0 z-10 -mx-2 -mt-2 ${isSelected ? 'bg-[#182234]' : 'bg-bc-panel'}`} style={{ padding: '6px 8px' }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleOpen(cam.id)}
            aria-expanded={expanded}
            style={{ padding: '4px', minWidth: '28px', minHeight: '28px' }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-bc-hover"
            title={expanded ? t('sidebar.cam.collapse', 'Collapse details') : t('sidebar.cam.expand', 'Expand details')}
          >
            <span className="h-3 w-3 shrink-0" style={{ backgroundColor: cam.color }} />
            <span className="truncate text-sm font-bold text-bc-text-bright">{cam.label}</span>
            <FiChevronDown size={14} className={`ml-auto shrink-0 text-bc-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => duplicateCamera(cam.id)}
              style={{ padding: '6px' }}
              className="text-bc-muted hover:bg-bc-hover hover:text-bc-accent"
              title={t('sidebar.cam.duplicate', 'Duplicate camera')}
              aria-label={format(t('sidebar.cam.duplicate.aria', 'Duplicate {name}'), { name: cam.label })}
            >
              <FiCopy size={14} />
            </button>
            {/* Zweistufig: Loeschen liegt direkt neben Duplizieren und war
                bisher ohne Rueckfrage sofort weg. */}
            <button
              onClick={() => (confirmDelete ? removeCamera(cam.id) : setConfirmDelete(true))}
              onBlur={() => setConfirmDelete(false)}
              style={{ padding: '6px' }}
              className={` hover:bg-bc-hover ${confirmDelete ? 'text-bc-red' : 'text-bc-muted hover:text-bc-red'}`}
              title={confirmDelete ? t('sidebar.cam.removeAgain', 'Really delete? Click again.') : t('sidebar.cam.remove', 'Delete camera')}
              aria-label={confirmDelete
                ? format(t('sidebar.cam.removeAgain.aria', 'Really delete {name}'), { name: cam.label })
                : format(t('sidebar.cam.remove.aria', 'Delete {name}'), { name: cam.label })}
            >
              {confirmDelete ? <span className="text-[10px] font-semibold">{t('sidebar.cam.removeQ', 'Delete?')}</span> : <FiTrash2 size={14} />}
            </button>
          </div>
        </div>

        {/* Kernwerte — im zugeklappten Zustand die Vergleichszeile ueber alle
            Kameras, im aufgeklappten waeren sie doppelt und entfallen. */}
        {!expanded && (
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[10.5px] text-bc-dim" style={{ paddingLeft: '4px' }}>
            <span className="text-bc-muted">{camDef?.model ?? '—'}</span>
            <span>{mountTypeLabel(t, cam.mountType ?? 'tripod')}</span>
            <span className="tabular-nums">{cam.z.toFixed(2)} m</span>
            <span className="tabular-nums">{cam.focalLength.toFixed(0)} mm</span>
            {fov && <span className="tabular-nums">{fov.horizontalDeg.toFixed(0)}°</span>}
          </div>
        )}
      </div>

      {/* Ausgeklappte Eigenschaften */}
      {expanded && (
        <div className="mt-2 space-y-2 text-xs">
          <FieldRow label={t('sidebar.cam.nameLabel', 'Name')} htmlFor={`name-${cam.id}`}>
            <input
              id={`name-${cam.id}`}
              className="w-full border border-bc-border bg-bc-dark text-bc-text-bright"
              style={{ padding: '3px 6px' }}
              value={cam.label}
              onChange={(e) => updateCamera(cam.id, { label: e.target.value })}
            />
          </FieldRow>

          {/* Mount-Mismatch ist ein echtes Problem (die Werte stimmen dann
              nicht), der Adapter dagegen nur ein Zustand — deshalb getrennte
              Dringlichkeit statt zweimal Gelb. */}
          {lensMismatch && lensDef && (
            <Note tone="warn">
              {format(t('sidebar.cam.mismatch', 'Lens mount {lens} does not fit the active mount {active}. Until that is right, the app computes with the bare sensor — values differ from reality.'), { lens: lensDef.mount, active: String(activeMount) })}
            </Note>
          )}
          {adapterInfo && (
            <Note tone="info">
              {format(t('sidebar.cam.adapter', 'Adapter: {name}'), { name: adapterInfo.name })}
              {adapterInfo.lightLossStops > 0 ? format(t('sidebar.cam.adapterLoss', ' (−{x} T)'), { x: adapterInfo.lightLossStops }) : ''}
              {adapterInfo.lightLossStops < 0 ? format(t('sidebar.cam.adapterGain', ' (+{x} T gain)'), { x: Math.abs(adapterInfo.lightLossStops) }) : ''}
              {adapterInfo.cropSensor ? ` → ${adapterInfo.cropSensor.name}` : ''}
            </Note>
          )}
          {speedBooster && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-bc-text">
              <input
                type="checkbox"
                checked={cam.useSpeedbooster}
                onChange={(e) => updateCamera(cam.id, { useSpeedbooster: e.target.checked })}
                className="accent-bc-accent"
              />
              {speedBooster.name} {t('sidebar.cam.focalReducer', '(Speed Booster)')}
            </label>
          )}

          <Group id="optics" title={t('sidebar.cam.optics', 'Camera & Lens')} summary={`${camDef?.model ?? ''} · ${cam.focalLength.toFixed(0)} mm`}>
          {/* Camera selector grouped by type */}
          <label className="block">
            <span className="flex items-center justify-between gap-2 text-bc-muted">
              <span>{format(t('sidebar.cam.cameraLabel', 'Camera · {mount} mount · {sensor}'), { mount: String(camDef?.mount), sensor: String(camDef?.sensor.name) })}</span>
              {camDef && (
                <span className="flex items-center gap-0.5">
                  {/* Edit applies to every camera. For built-ins it creates a
                      "modified built-in" shadow on save; for shadows or pure
                      customs it updates the existing entry. */}
                  <button
                    type="button"
                    onClick={() => setEditingCustomCam(camDef.id)}
                    style={{ padding: '5px' }}
                    className="text-bc-dim hover:text-bc-accent"
                    aria-label={t('sidebar.cam.editAria', 'Edit camera data')}
                    title={isPureCustom(camDef.id)
                      ? t('sidebar.cam.editCustom', 'Edit this custom camera')
                      : isBuiltInShadow(camDef.id)
                        ? t('sidebar.cam.editModified', 'Continue editing this modified built-in')
                        : t('sidebar.cam.editBuiltIn', 'Edit (creates a modified copy you can tweak — original stays untouched)')}
                  >
                    <FiEdit2 size={12} />
                  </button>
                  {isBuiltInShadow(camDef.id) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm(format(t('sidebar.cam.resetConfirm', 'Reset "{name}" to its built-in data? Your changes will be lost.'), { name: `${camDef.manufacturer} ${camDef.model}` }))) return;
                        useStore.getState().removeCustomCamera(camDef.id);
                      }}
                      style={{ padding: '5px' }}
                      className="text-bc-dim hover:text-bc-yellow"
                      aria-label={t('sidebar.cam.resetAria', 'Reset to built-in data')}
                      title={t('sidebar.cam.resetTitle', 'Reset to the original built-in spec (discards your edits)')}
                    >
                      <FiRotateCcw size={12} />
                    </button>
                  )}
                  {isPureCustom(camDef.id) && (
                    <button
                      type="button"
                      onClick={() => {
                        const used = useStore.getState().cameras.filter((c) => c.cameraId === camDef.id).length;
                        if (used > 1) {
                          alert(format(t('sidebar.cam.deleteInUse', 'Cannot delete "{name}" — {count} placed cameras still use it.'), { name: `${camDef.manufacturer} ${camDef.model}`, count: used }));
                          return;
                        }
                        if (!confirm(format(t('sidebar.cam.deleteConfirm', 'Delete custom camera "{name}"?'), { name: `${camDef.manufacturer} ${camDef.model}` }))) return;
                        // Swap this placement to the first built-in so the card stays valid
                        const fallback = CAMERAS[0];
                        updateCamera(cam.id, {
                          cameraId: fallback.id,
                          activeMount: fallback.mount,
                          sensorModeIndex: fallback.sensorModes && fallback.sensorModes.length > 0 ? 0 : undefined,
                        });
                        useStore.getState().removeCustomCamera(camDef.id);
                      }}
                      style={{ padding: '5px' }}
                      className="text-bc-dim hover:text-bc-red"
                      aria-label={t('sidebar.cam.deleteAria', 'Delete custom camera')}
                      title={t('sidebar.cam.deleteTitle', 'Delete this custom camera')}
                    >
                      <FiTrash2 size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleFavoriteCameraId(camDef.id)}
                    style={{ padding: '5px' }}
                    className={` ${favoriteCameraIds.includes(camDef.id) ? 'text-bc-yellow' : 'text-bc-dim hover:text-bc-yellow'}`}
                    aria-label={favoriteCameraIds.includes(camDef.id) ? t('sidebar.cam.unfavCamera', 'Remove camera favorite') : t('sidebar.cam.favCamera', 'Favorite camera')}
                    title={favoriteCameraIds.includes(camDef.id) ? t('sidebar.cam.unfavCamera', 'Remove camera favorite') : t('sidebar.cam.favCamera', 'Favorite camera')}
                  >
                    <FiStar size={12} fill={favoriteCameraIds.includes(camDef.id) ? 'currentColor' : 'none'} />
                  </button>
                </span>
              )}
            </span>
            <select
              className="block w-full mt-0.5 bg-bc-dark border border-bc-border px-2 py-1 text-bc-text-bright"
              value={cam.cameraId}
              onChange={(e) => {
                if (e.target.value === '__new_custom__') { setShowNewCustomCam(true); return; }
                const newCam = getCameraById(e.target.value, customCameras);
                if (!newCam) return;
                // Pick a mount + first compatible lens. Falls back through the
                // adaptedMounts list if the native mount has no compatible
                // lenses (e.g. PMW-F5's FZ).
                const pick = pickInitialMountAndLens(newCam.mount, newCam.adaptedMounts, customLenses);
                const lens = pick.lens;
                const supportsExtender = cam.extenderActive === 1 || !!lens?.extenderFactors?.includes(cam.extenderActive);
                updateCamera(cam.id, {
                  cameraId: e.target.value,
                  lensId: lens?.id ?? cam.lensId,
                  focalLength: lens?.focalLengthMin ?? cam.focalLength,
                  aperture: lens?.maxApertureWide ?? cam.aperture,
                  extenderActive: supportsExtender ? cam.extenderActive : 1,
                  // Keep Speed Booster only if one exists for the new lens→body combo
                  useSpeedbooster: speedBoosterExists(pick.mount, newCam.mount) ? cam.useSpeedbooster : false,
                  // Reset hardware sensor mode — each body has a different mode list
                  sensorModeIndex: newCam.sensorModes && newCam.sensorModes.length > 0 ? 0 : undefined,
                  activeMount: pick.mount,
                });
              }}
            >
              {sortedCameras.map((c) => {
                const tag = isBuiltInShadow(c.id) ? t('sidebar.cam.tagModified', ' (modified)') : isPureCustom(c.id) ? t('sidebar.cam.tagCustom', ' +custom') : '';
                return (
                  <option key={c.id} value={c.id}>{favoriteCameraIds.includes(c.id) ? '* ' : ''}{c.manufacturer} {c.model} [{c.mount}]{tag}</option>
                );
              })}
              {visibleBibCameras.length > 0 && (
                <optgroup label={t('sidebar.cam.libraryGroup', '── Device library ──')}>
                  {visibleBibCameras.map((c) => (
                    <option key={c.id} value={c.id}>{favoriteCameraIds.includes(c.id) ? '* ' : ''}{c.manufacturer} {c.model} [{c.mount}]</option>
                  ))}
                </optgroup>
              )}
              <option value="__new_custom__">{t('sidebar.cam.addCustomCamera', '＋ Add custom camera…')}</option>
            </select>
          </label>
          <LibraryBadge id={camDef?.id} />
          {camDef && isCustomEntry(camDef.id) && (
            <UploadStatus item={{ kind: 'camera', camera: camDef }} onUpload={() => setProposal({ kind: 'camera', camera: camDef })} />
          )}
          {proposal && <UploadDialog item={proposal} onClose={() => setProposal(null)} />}

          {/* Der Speicher ist voll — die eigene Kamera/Optik steht in der Liste,
              aber nicht auf der Platte. Dieselbe Meldung wie bei den
              Shotlisten, aus demselben Grund: ein stiller Verlust von
              handgetippten Sensormassen ist der teuerste, den diese App hat. */}
          {libraryStorageFull && (
            <div className="text-[10px] text-bc-red mt-1">
              {t('sidebar.libraryStorageFull', 'Storage full — the last change to the library was not saved permanently. Delete custom cameras/lenses you no longer need, or export the project.')}
            </div>
          )}

          {/* Inline custom camera creation form (Custom+ entry in the dropdown) */}
          {showNewCustomCam && (
            <CustomCameraForm
              title={t('sidebar.cam.newCustomCamera', 'New Custom Camera')}
              submitLabel={t('sidebar.cam.createSelect', 'Create & Select')}
              onCancel={() => setShowNewCustomCam(false)}
              onSubmit={(spec) => {
                const newId = addCustomCamera(spec);
                const firstLens = getCompatibleLenses(spec.mount, spec.adaptedMounts)[0];
                updateCamera(cam.id, {
                  cameraId: newId,
                  activeMount: spec.mount,
                  lensId: firstLens?.id ?? cam.lensId,
                  focalLength: firstLens?.focalLengthMin ?? cam.focalLength,
                  aperture: firstLens?.maxApertureWide ?? cam.aperture,
                  extenderActive: 1,
                  useSpeedbooster: false,
                  sensorModeIndex: spec.sensorModes && spec.sensorModes.length > 0 ? 0 : undefined,
                });
                setShowNewCustomCam(false);
              }}
            />
          )}

          {/* Inline edit form for the currently-selected custom camera */}
          {editingCustomCam && editingCustomCam === camDef?.id && camDef && (
            <CustomCameraForm
              title={format(t('sidebar.cam.editTitle', 'Edit {name}'), { name: `${camDef.manufacturer} ${camDef.model}` })}
              submitLabel={t('sidebar.cam.saveChanges', 'Save changes')}
              initial={camDef}
              onCancel={() => setEditingCustomCam(null)}
              onSubmit={(spec) => {
                useStore.getState().updateCustomCamera(camDef.id, spec);
                // If the mount changed and the current lens no longer fits, swap to a compatible one
                const stillCompatible = lensDef && (lensDef.mount === spec.mount || lensDef.mount === 'integrated');
                if (!stillCompatible) {
                  const next = getCompatibleLenses(spec.mount, spec.adaptedMounts)[0];
                  if (next) {
                    updateCamera(cam.id, {
                      lensId: next.id,
                      focalLength: next.focalLengthMin,
                      aperture: next.maxApertureWide,
                    });
                  }
                }
                updateCamera(cam.id, {
                  activeMount: spec.mount,
                  sensorModeIndex: spec.sensorModes && spec.sensorModes.length > 0 ? 0 : undefined,
                });
                setEditingCustomCam(null);
              }}
            />
          )}

          {/* Mount selector — only visible when the body offers swappable mount plates */}
          {camDef && camDef.adaptedMounts && camDef.adaptedMounts.length > 0 && (
            <FieldRow label={t('sidebar.cam.mount', 'Mount')} htmlFor={`mountplate-${cam.id}`}>
              <select
                id={`mountplate-${cam.id}`}
                className="block w-full bg-bc-dark border border-bc-border text-bc-text-bright"
                style={{ padding: '3px 6px' }}
                value={activeMount}
                onChange={(e) => {
                  const newMount = e.target.value;
                  // If the current lens doesn't fit the new mount, pick the first
                  // compatible one so the camera card stays in a coherent state.
                  const stillCompatible = lensDef && (lensDef.mount === newMount || lensDef.mount === 'integrated');
                  let nextLensId = cam.lensId;
                  let nextFocal = cam.focalLength;
                  let nextAperture = cam.aperture;
                  if (!stillCompatible) {
                    const next = getCompatibleLenses(camDef.mount, camDef.adaptedMounts, newMount)[0];
                    if (next) {
                      nextLensId = next.id;
                      nextFocal = next.focalLengthMin;
                      nextAperture = next.maxApertureWide;
                    }
                  }
                  updateCamera(cam.id, {
                    activeMount: newMount,
                    lensId: nextLensId,
                    focalLength: nextFocal,
                    aperture: nextAperture,
                    extenderActive: 1,
                    useSpeedbooster: speedBoosterExists(newMount, camDef?.mount) ? cam.useSpeedbooster : false,
                  });
                }}
              >
                <option value={camDef.mount}>{camDef.mount} {t('sidebar.cam.native', '(native)')}</option>
                {camDef.adaptedMounts.map((m) => (
                  <option key={m} value={m}>{m} {t('sidebar.cam.mountPlate', '(mount plate / adapter)')}</option>
                ))}
              </select>
              {/* Detail card for the active mount adapter, if the body defines one.
                  Shows the adapter's name, optical effects, and a notes blurb so
                  the user knows exactly which piece of glass / plate is modelled. */}
              {(() => {
                const ma = activeMount ? camDef.mountAdapters?.[activeMount] : undefined;
                if (!ma) return null;
                return (
                  <div className="mt-1 p-2 bg-bc-dark border border-bc-yellow/40 text-[10px] leading-snug">
                    <div className="flex items-center gap-1 text-bc-yellow font-semibold">
                      ⚡ {ma.name}
                    </div>
                    <div className="text-bc-muted mt-0.5">
                      {ma.lightLossStops > 0 && <span>{format(t('sidebar.cam.lightLoss', 'Light loss: −{x} T · '), { x: ma.lightLossStops })}</span>}
                      {ma.lightLossStops < 0 && <span>{format(t('sidebar.cam.lightGain', 'Light gain: +{x} T · '), { x: Math.abs(ma.lightLossStops) })}</span>}
                      {ma.lightLossStops === 0 && <span>{t('sidebar.cam.noLightLoss', 'No light loss · ')}</span>}
                      {ma.cropSensor ? <span>{format(t('sidebar.cam.forces', 'forces {name}'), { name: ma.cropSensor.name })}</span> : <span>{t('sidebar.cam.noSensorCrop', 'No sensor crop')}</span>}
                    </div>
                    {ma.notes && (
                      <div className="text-bc-dim mt-1 italic">{ma.notes}</div>
                    )}
                  </div>
                );
              })()}
            </FieldRow>
          )}

          {/* Bildkreis-Deckung. `marginal` ist ein Dauerzustand dieser
              Kombination und kein Fehler — nur echtes Vignettieren ist eine
              Warnung. Vorher hatte beides dieselbe Alarmfarbe. */}
          {coverage && coverage.status !== 'ok' && (
            <Note tone={coverage.status === 'vignette' ? 'warn' : 'info'}>
              {coverage.message}
            </Note>
          )}

          {/* Hardware sensor mode (URSA B4 crop, VENICE windows, FX9 S35 etc.) */}
          {camDef?.sensorModes && camDef.sensorModes.length > 1 && (
            <FieldRow
              label={t('sidebar.cam.sensorMode', 'Sensor Mode')}
              htmlFor={`sensormode-${cam.id}`}
              hint={adapterInfo?.cropSensor ? format(t('sidebar.cam.adapterForces', 'Adapter forces {name}'), { name: adapterInfo.cropSensor.name }) : undefined}
            >
              <select
                id={`sensormode-${cam.id}`}
                className="block w-full bg-bc-dark border border-bc-border text-bc-text-bright disabled:text-bc-dim"
                style={{ padding: '3px 6px' }}
                value={cam.sensorModeIndex ?? 0}
                onChange={(e) => updateCamera(cam.id, { sensorModeIndex: parseInt(e.target.value) })}
                disabled={!!adapterInfo?.cropSensor}
                title={adapterInfo?.cropSensor ? t('sidebar.cam.sensorModeLocked', 'Adapter crop overrides the sensor mode') : t('sidebar.cam.sensorModePick', 'Pick the camera body crop mode')}
              >
                {camDef.sensorModes.map((mode, idx) => (
                  <option key={idx} value={idx}>{mode.name}</option>
                ))}
              </select>
            </FieldRow>
          )}

          {/* Lens selector grouped by mount */}
          <label className="block">
            <span className="flex items-center justify-between gap-2 text-bc-muted">
              <span>{t('sidebar.cam.lens', 'Lens')}</span>
              {lensDef && (
                <button
                  type="button"
                  onClick={() => toggleFavoriteLensId(lensDef.id)}
                  className={`p-1 ${favoriteLensIds.includes(lensDef.id) ? 'text-bc-yellow' : 'text-bc-dim hover:text-bc-yellow'}`}
                  title={favoriteLensIds.includes(lensDef.id) ? t('sidebar.cam.unfavLens', 'Remove lens favorite') : t('sidebar.cam.favLens', 'Favorite lens')}
                >
                  <FiStar size={12} fill={favoriteLensIds.includes(lensDef.id) ? 'currentColor' : 'none'} />
                </button>
              )}
            </span>
            <select
              className="block w-full mt-0.5 bg-bc-dark border border-bc-border px-2 py-1 text-bc-text-bright"
              value={cam.lensId}
              onChange={(e) => {
                if (e.target.value === '__new__') { setShowNewLens(true); return; }
                const lens = getLensById(e.target.value) ?? customLenses.find((l) => l.id === e.target.value);
                const supportsExtender = cam.extenderActive === 1 || !!lens?.extenderFactors?.includes(cam.extenderActive);
                updateCamera(cam.id, {
                  lensId: e.target.value,
                  focalLength: lens?.focalLengthMin ?? cam.focalLength,
                  aperture: lens?.maxApertureWide ?? cam.aperture,
                  // Reset extender when switching to a lens that doesn't support the current value
                  extenderActive: supportsExtender ? cam.extenderActive : 1,
                  // Keep Speed Booster only if one exists for the new lens→body combo
                  useSpeedbooster: speedBoosterExists(lens?.mount, camDef?.mount) ? cam.useSpeedbooster : false,
                });
              }}
            >
              {Object.entries(grouped).map(([mount, lenses]) => (
                <optgroup key={mount} label={format(t('sidebar.cam.mountGroup', '── {mount} mount ──'), { mount })}>
                  {lenses.map((l) => (
                    <option key={l.id} value={l.id}>{favoriteLensIds.includes(l.id) ? '* ' : ''}{l.manufacturer} {l.model}{l.isCustom ? t('sidebar.cam.tagCustom', ' +custom') : isLibraryId(l.id) ? t('sidebar.cam.tagLibrary', ' · library') : ''}</option>
                  ))}
                </optgroup>
              ))}
              <option value="__new__">{t('sidebar.cam.addCustomLens', '＋ Add custom lens…')}</option>
            </select>
          </label>
          <LibraryBadge id={lensDef?.id} />
          {lensDef?.isCustom && (
            <UploadStatus item={{ kind: 'lens', lens: lensDef }} onUpload={() => setProposal({ kind: 'lens', lens: lensDef })} />
          )}
          {/* Custom lens: delete button for active custom lens */}
          {lensDef?.isCustom && (
            <button
              onClick={() => {
                // Pick a replacement BEFORE removing — prefer a built-in compatible lens,
                // then fall back to any non-removed custom lens, and finally any LENSES entry.
                const replacement =
                  compatDeduped.find((l) => !l.isCustom && l.id !== cam.lensId) ??
                  compatDeduped.find((l) => l.id !== cam.lensId) ??
                  LENSES[0];
                removeCustomLens(cam.lensId);
                if (replacement) {
                  const supportsExtender = cam.extenderActive === 1 || !!replacement.extenderFactors?.includes(cam.extenderActive);
                  updateCamera(cam.id, {
                    lensId: replacement.id,
                    focalLength: replacement.focalLengthMin,
                    aperture: replacement.maxApertureWide,
                    extenderActive: supportsExtender ? cam.extenderActive : 1,
                  });
                }
              }}
              className="text-[10px] text-bc-red hover:text-red-400 mt-0.5"
            >{format(t('sidebar.cam.removeCustomLens', 'Delete custom lens "{name}"'), { name: `${lensDef.manufacturer} ${lensDef.model}` })}</button>
          )}
          {/* Inline custom lens creation form */}
          {showNewLens && (
            <div className="bg-bc-dark p-2 border border-bc-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-bc-text font-medium text-[11px]">{t('sidebar.cam.newCustomLens', 'New Custom Lens')}</span>
                <button onClick={() => setShowNewLens(false)} className="text-bc-dim hover:text-bc-text-bright text-xs">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <input placeholder={t('sidebar.form.manufacturer', 'Manufacturer')} className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
                  value={newLens.manufacturer} onChange={(e) => setNewLens({ ...newLens, manufacturer: e.target.value })} />
                <input placeholder={t('sidebar.form.model', 'Model')} className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
                  value={newLens.model} onChange={(e) => setNewLens({ ...newLens, model: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <label><span className="text-bc-dim text-[10px]">{t('sidebar.cam.minMm', 'Min mm')}</span>
                  <input type="number" className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
                    value={newLens.focalMin} onChange={(e) => setNewLens({ ...newLens, focalMin: e.target.value })} /></label>
                <label><span className="text-bc-dim text-[10px]">{t('sidebar.cam.maxMm', 'Max mm')}</span>
                  <input type="number" className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
                    value={newLens.focalMax} onChange={(e) => setNewLens({ ...newLens, focalMax: e.target.value })} /></label>
                <label><span className="text-bc-dim text-[10px]">f/</span>
                  <input type="number" className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
                    value={newLens.aperture} onChange={(e) => setNewLens({ ...newLens, aperture: e.target.value })} /></label>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <select className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
                  value={newLens.mount} onChange={(e) => setNewLens({ ...newLens, mount: e.target.value })}>
                  {['B4', 'EF', 'PL', 'E', 'MFT', 'RF', 'L', 'FZ', 'universal'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select className="bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs"
                  value={newLens.type} onChange={(e) => setNewLens({ ...newLens, type: e.target.value as 'zoom' | 'prime' })}>
                  <option value="zoom">{t('sidebar.cam.zoom', 'Zoom')}</option>
                  <option value="prime">{t('sidebar.cam.prime', 'Prime')}</option>
                </select>
              </div>
              <button
                onClick={() => {
                  if (!newLens.manufacturer || !newLens.model) return;
                  const newId = addCustomLens({
                    manufacturer: newLens.manufacturer,
                    model: newLens.model,
                    focalLengthMin: parseFloat(newLens.focalMin) || 10,
                    focalLengthMax: parseFloat(newLens.focalMax) || 100,
                    maxApertureWide: parseFloat(newLens.aperture) || 2.8,
                    mount: newLens.mount,
                    type: newLens.type,
                  });
                  updateCamera(cam.id, {
                    lensId: newId,
                    focalLength: parseFloat(newLens.focalMin) || 10,
                    aperture: parseFloat(newLens.aperture) || 2.8,
                  });
                  setNewLens({ manufacturer: '', model: '', focalMin: '10', focalMax: '100', aperture: '2.8', mount: 'B4', type: 'zoom' });
                  setShowNewLens(false);
                }}
                className="flex items-center gap-1 px-2 py-1 bg-bc-green/20 text-bc-green text-xs hover:bg-bc-green/30 w-full justify-center"
              >
                <FiPlus size={12} /> {t('sidebar.cam.createSelect', 'Create & Select')}
              </button>
            </div>
          )}

          {/* Optische Werte — dieselben Regler wie im Preview-Tab: logarithmische
              Bahn mit Rastung, Zahl direkt eingebbar. Vorher hatte die Sidebar
              lineare Regler ohne Anker, also zwei Bedienungen fuer dieselbe Groesse. */}
          <LensSlider
            label={t('sidebar.cam.focalLength.label', 'Focal Length')}
            value={cam.focalLength}
            min={focalMin}
            max={focalMax}
            ticks={focalTicks}
            format={formatFocal}
            unit="mm"
            note={cam.extenderActive > 1 ? format(t('sidebar.cam.focalEff', 'eff. {e} mm'), { e: (cam.focalLength * cam.extenderActive).toFixed(0) }) : undefined}
            onChange={(v) => updateCamera(cam.id, { focalLength: v })}
            onStep={(dir) => updateCamera(cam.id, { focalLength: stepAlong(cam.focalLength, dir, focalMin, focalMax, focalStepTicks) })}
            title={t('sidebar.cam.focalLength.title', 'Focal length — logarithmic, snaps to the marks. Shift = free.')}
          />

          <LensSlider
            label={t('sidebar.cam.aperture.label', 'Aperture')}
            value={cam.aperture}
            min={apertureMin}
            max={apertureMax}
            ticks={apertureTicks}
            format={formatAperture}
            prefix="f/"
            formatTick={(v) => (v < 10 ? v.toFixed(1) : v.toFixed(0))}
            note={adapterInfo && adapterInfo.lightLossStops !== 0
              ? format(t('sidebar.cam.apertureEff', 'eff. T{e}'), { e: (cam.aperture * Math.pow(2, adapterInfo.lightLossStops / 2)).toFixed(1) })
              : undefined}
            onChange={(v) => updateCamera(cam.id, { aperture: v })}
            onStep={(dir) => updateCamera(cam.id, { aperture: stepStop(cam.aperture, dir, apertureMin, apertureMax) })}
            title={t('sidebar.cam.aperture.title', 'Aperture — standard series in full stops. Shift = stepless.')}
          />

          <LensSlider
            label={t('sidebar.cam.distance.label', 'Focus Distance')}
            value={Math.min(Math.max(cam.focusDistance, FOCUS_MIN_M), FOCUS_MAX_M)}
            min={FOCUS_MIN_M}
            max={FOCUS_MAX_M}
            ticks={focusTicks}
            format={formatDistance}
            unit="m"
            onChange={(v) => updateCamera(cam.id, { focusDistance: v })}
            onStep={(dir) => updateCamera(cam.id, { focusDistance: stepAlong(cam.focusDistance, dir, FOCUS_MIN_M, FOCUS_MAX_M, focusStepTicks) })}
            title={t('sidebar.cam.distance.title', 'The distance focus is set to — not the distance to the stage.')}
          />

          {lensDef?.extenderFactors && lensDef.extenderFactors.length > 0 && (
            <FieldRow label={t('sidebar.cam.extender', 'Extender')} htmlFor={`ext-${cam.id}`}>
              <select
                id={`ext-${cam.id}`}
                className="block w-full bg-bc-dark border border-bc-border text-bc-text-bright"
                style={{ padding: '3px 6px' }}
                value={cam.extenderActive}
                onChange={(e) => updateCamera(cam.id, { extenderActive: parseFloat(e.target.value) })}
              >
                <option value={1}>{t('sidebar.cam.extenderOff', 'Off (1×)')}</option>
                {lensDef.extenderFactors.map((f) => (
                  <option key={f} value={f}>{format(t('sidebar.cam.extenderFactor', '{f}× Extender'), { f })}</option>
                ))}
              </select>
            </FieldRow>
          )}
          </Group>

          <Group id="aim" title={t('sidebar.cam.aim', 'Aim')} summary={`${cam.pan.toFixed(0)}° / ${cam.tilt.toFixed(0)}°`}>
            <ValueSlider
              label={t('sidebar.cam.pan.label', 'Pan')}
              value={cam.pan}
              min={-180}
              max={180}
              step={1}
              decimals={0}
              unit="°"
              onChange={(v) => updateCamera(cam.id, { pan: v })}
              title={t('sidebar.cam.pan.title', '0° points right, positive values turn clockwise.')}
            />
            <ValueSlider
              label={t('sidebar.cam.tilt.label', 'Tilt')}
              value={cam.tilt}
              min={-90}
              max={45}
              step={1}
              decimals={0}
              unit="°"
              onChange={(v) => updateCamera(cam.id, { tilt: v })}
              title={t('sidebar.cam.tilt.title', 'Negative values tilt downwards.')}
            />
          </Group>

          <Group id="place" title={t('sidebar.cam.placement', 'Position & Rig')} summary={`${mountTypeLabel(t, cam.mountType ?? 'tripod')} · ${cam.z.toFixed(2)} m`}>
          <FieldRow label={t('sidebar.cam.position', 'Position (m)')}>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                className="w-full bg-bc-dark border border-bc-border text-bc-text-bright tabular-nums"
                style={{ padding: '3px 6px' }}
                value={cam.x}
                step={0.5}
                aria-label={t('sidebar.cam.posX.aria', 'Position X in metres')}
                title={t('sidebar.cam.posX.title', 'Distance from the left edge (m)')}
                onChange={(e) => updateCamera(cam.id, { x: parseFloat(e.target.value) || 0 })}
              />
              <input
                type="number"
                className="w-full bg-bc-dark border border-bc-border text-bc-text-bright tabular-nums"
                style={{ padding: '3px 6px' }}
                value={cam.y}
                step={0.5}
                aria-label={t('sidebar.cam.posY.aria', 'Position Y in metres')}
                title={t('sidebar.cam.posY.title', 'Distance from the top edge (m)')}
                onChange={(e) => updateCamera(cam.id, { y: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </FieldRow>

          {/* Montage + konkretes Rig. Die Kategorie bestimmt den Bewegungsstil,
              das Rig die echten Maße (Hoehe, Ausleger, Fahrweg). */}
          {(() => {
            const limits = rigLimits(cam);
            const catRigs = rigsForType(limits.type);
            return (
              <>
                <FieldRow label={t('sidebar.cam.mount.label', 'Mounting')} htmlFor={`mount-${cam.id}`}>
                  <select
                    id={`mount-${cam.id}`}
                    className="block w-full bg-bc-dark border border-bc-border text-bc-text-bright"
                    style={{ padding: '3px 6px' }}
                    value={cam.mountType ?? 'tripod'}
                    onChange={(e) => {
                      const newMount = e.target.value as CameraMountType;
                      // Rig und Sonderlaenge fallen weg — sie gehoerten zur alten
                      // Kategorie und wuerden sonst falsche Grenzen liefern.
                      const next = rigLimits({ mountType: newMount });
                      updateCamera(cam.id, {
                        mountType: newMount,
                        rigId: undefined,
                        trackLengthM: undefined,
                        z: clampHeight(next, cam.z),
                        trackOffset: next.trackM > 0 ? 0 : undefined,
                      });
                    }}
                  >
                    {(Object.keys(MOUNT_TYPE_LABELS) as CameraMountType[]).map((m) => (
                      <option key={m} value={m}>{mountTypeLabel(t, m)}</option>
                    ))}
                  </select>
                </FieldRow>

                {catRigs.length > 0 && (
                  <FieldRow label={t('sidebar.cam.rigModel', 'Rig model')} htmlFor={`rig-${cam.id}`}>
                    <select
                      id={`rig-${cam.id}`}
                      className="block w-full bg-bc-dark border border-bc-border text-bc-text-bright"
                      style={{ padding: '3px 6px' }}
                      value={cam.rigId ?? ''}
                      onChange={(e) => {
                        const rigId = e.target.value || undefined;
                        const next = rigLimits({ mountType: limits.type, rigId });
                        updateCamera(cam.id, {
                          rigId,
                          trackLengthM: undefined,
                          z: clampHeight(next, cam.z),
                          trackOffset: next.trackM > 0 ? clampTrack(next, cam.trackOffset ?? 0) : undefined,
                        });
                      }}
                    >
                      <option value="">{format(t('sidebar.rig.generic', '- generic ({type}) -'), { type: mountTypeLabel(t, limits.type) })}</option>
                      {catRigs.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    {limits.rig && (
                      <span className="block mt-0.5 text-[10px] text-bc-dim leading-snug">
                        {limits.minHeightM.toFixed(2)}–{limits.maxHeightM.toFixed(2)} m
                        {limits.armLengthM ? ` · Ausleger ${limits.armLengthM.toFixed(1)} m` : ''}
                        {limits.telescopeM ? ` · Teleskop ${limits.telescopeM.toFixed(1)} m` : ''}
                        {limits.payloadKg ? ` · max ${limits.payloadKg} kg` : ''}
                        {limits.footprintM ? ` · Stellfläche ${limits.footprintM.w.toFixed(1)}×${limits.footprintM.d.toFixed(1)} m` : ''}
                        {limits.rig.notes ? ` — ${limits.rig.notes}` : ''}
                      </span>
                    )}
                  </FieldRow>
                )}

                {/* Ausrichtung des Rigs im Raum. Eine gelegte Schiene oder ein
                    Kran-Chassis steht fest, waehrend die Kamera darauf
                    schwenkt — darum ein eigener Winkel neben `pan`. Ohne
                    eigenen Wert folgt das Rig der Kamera. */}
                <ValueSlider
                  label={t('sidebar.cam.orientation', 'Orientation')}
                  value={rigYaw(cam)}
                  min={-180}
                  max={180}
                  step={1}
                  decimals={0}
                  unit="°"
                  hint={cam.rigRotation === undefined ? t('sidebar.cam.followsCamera', 'follows the camera') : t('sidebar.cam.fixedAim', 'fixed heading')}
                  title={t('sidebar.cam.orientation.title', 'Direction of rail, chassis or leg stance — independent of pan.')}
                  onChange={(v) => updateCamera(cam.id, { rigRotation: v })}
                  right={
                    cam.rigRotation !== undefined ? (
                      <button
                        onClick={() => updateCamera(cam.id, { rigRotation: undefined })}
                        style={{ padding: '2px 5px' }}
                        className="shrink-0 border border-bc-border text-[10px] text-bc-dim hover:text-bc-text-bright"
                        title={t('sidebar.cam.recouple.title', 'Re-couple the rig to the aim')}
                      >{t('sidebar.cam.recouple', 'couple')}</button>
                    ) : undefined
                  }
                />

                {/* Hoehe — durch die echten Grenzen des Rigs begrenzt */}
                <ValueSlider
                  label={t('sidebar.cam.height.label', 'Lens Height')}
                  value={clampHeight(limits, cam.z)}
                  min={limits.minHeightM}
                  max={limits.maxHeightM}
                  step={limits.pumpM}
                  unit="m"
                  title={t('sidebar.cam.height.title', 'Height of the lens above the floor — bounded by the chosen rig.')}
                  onChange={(v) => updateCamera(cam.id, { z: clampHeight(limits, v) })}
                />

                {/* Gelegte Schienenlaenge — nur wo es eine Schiene gibt */}
                {(limits.type === 'dolly' || limits.type === 'slider') && (
                  <ValueSlider
                    label={t('sidebar.cam.railLength.label', 'Rail Length')}
                    value={limits.trackM}
                    min={0.5}
                    max={60}
                    step={0.5}
                    unit="m"
                    hint={(() => {
                      const plan = trackSectionPlan(limits.trackM);
                      const parts = plan.sections.map((sec) => `${sec.count}x${(sec.lengthM / 0.3048).toFixed(0)}'`).join(' + ');
                      return `${limits.trackIsCustom ? t('sidebar.cam.ownLength', 'custom length') : t('sidebar.cam.suggestion', 'default')} · aus ${parts} = ${plan.total.toFixed(2)} m`;
                    })()}
                    title={t('sidebar.cam.railLength.title', 'Rail actually laid. The dolly runs half of it either way from the centre.')}
                    onChange={(v) => {
                      const len = Math.max(0.5, Math.min(60, v));
                      const half = len / 2;
                      updateCamera(cam.id, {
                        trackLengthM: len,
                        trackOffset: Math.max(-half, Math.min(half, cam.trackOffset ?? 0)),
                      });
                    }}
                    right={
                      limits.trackIsCustom ? (
                        <button
                          onClick={() => updateCamera(cam.id, { trackLengthM: undefined })}
                          style={{ padding: '2px 5px' }}
                          className="shrink-0 border border-bc-border text-[10px] text-bc-dim hover:text-bc-text-bright"
                          title={t('sidebar.cam.railReset.title', 'Back to the rig default')}
                        >{t('sidebar.cam.railReset', 'reset')}</button>
                      ) : undefined
                    }
                  />
                )}

                {/* Live-Fahrweg — Jib-Schwenk, Dolly-Fahrt, Teleskop, Flug */}
                {limits.travelM > 0 && (
                  <ValueSlider
                    label={t('sidebar.cam.track.label', 'Track')}
                    value={clampTrack(limits, cam.trackOffset ?? 0)}
                    min={-limits.travelM}
                    max={limits.travelM}
                    step={0.05}
                    unit="m"
                    title={t('sidebar.cam.track.title', 'Current position on rail or jib. Live moves happen in the Rig tab.')}
                    onChange={(v) => updateCamera(cam.id, { trackOffset: v })}
                    right={
                      <button
                        onClick={() => updateCamera(cam.id, { trackOffset: 0 })}
                        style={{ padding: '2px 5px' }}
                        className="shrink-0 border border-bc-border text-[10px] text-bc-dim hover:text-bc-text-bright"
                        title={t('sidebar.cam.parkTitle', 'Park rig at zero')}
                      >{t('sidebar.cam.park', 'park')}</button>
                    }
                  />
                )}
              </>
            );
          })()}


          </Group>

          {/* Ergebnis der Optik — Anzeige, keine Bedienung. Standardmaessig zu,
              weil es beim Einrichten selten gebraucht wird. */}
          <Group
            id="result"
            title={t('sidebar.cam.result', 'Result')}
            defaultOpen={false}
            summary={fov ? `${fov.horizontalDeg.toFixed(0)}° · ${fov.imageWidthAtDistance.toFixed(1)} m breit` : undefined}
          >
            {fov && (
              <>
                <Readout label={t('sidebar.cam.fovH', 'FOV horizontal')} value={`${fov.horizontalDeg.toFixed(1)}°`} />
                <Readout label={`Bildbreite bei ${cam.focusDistance.toFixed(1)} m`} value={`${fov.imageWidthAtDistance.toFixed(2)} m`} />
                {fov.squeeze > 1 && (
                  <Readout
                    label={t('sidebar.cam.anamorphic', 'Anamorphot')}
                    value={`${fov.squeeze}× entzerrt`}
                    tone="muted"
                  />
                )}
              </>
            )}
            {dof && (
              <>
                <Readout label={t('sidebar.cam.dofNear', 'Near')} value={dof.nearLimit < 0.01 ? '0 m' : `${dof.nearLimit.toFixed(2)} m`} />
                <Readout label={t('sidebar.cam.dofFar', 'Far')} value={dof.farLimit === Infinity ? '∞' : `${dof.farLimit.toFixed(2)} m`} />
                <Readout label={t('sidebar.cam.dofTotal.label', 'Total Depth of Field')} value={dof.totalDof === Infinity ? '∞' : `${dof.totalDof.toFixed(2)} m`} tone="muted" />
              </>
            )}
            {effectiveSensor && effectiveSensor !== camDef?.sensor && (
              <Note tone="info">
                {format(t('sidebar.cam.effectiveSensor', 'Effective sensor: {name} (crop ×{crop})'), {
                  name: effectiveSensor.name,
                  crop: effectiveSensor.cropFactor.toFixed(1),
                })}
              </Note>
            )}
            {camDef && lensDef && effectiveSensor && fov && dof && (
              <div>
                <button
                  onClick={() => setShowCalc(!showCalc)}
                  style={{ padding: '3px 0' }}
                  className="flex w-full items-center gap-1 text-[10px] text-bc-muted hover:text-bc-accent"
                  aria-expanded={showCalc}
                >
                  {showCalc ? <FiChevronUp size={11} /> : <FiChevronDown size={11} />}
                  Rechenweg {showCalc ? t('sidebar.cam.calcHide', 'Hide calculation breakdown') : t('sidebar.cam.calcShow', 'Show calculation breakdown')}
                </button>
                {showCalc && (
                  <div className="mt-1">
                    <CalculationBreakdown
                      camDef={camDef}
                      lensDef={lensDef}
                      sensor={effectiveSensor}
                      fov={fov}
                      dof={dof}
                      focalLength={cam.focalLength}
                      extender={cam.extenderActive}
                      aperture={cam.aperture}
                      focusDistance={cam.focusDistance}
                    />
                  </div>
                )}
              </div>
            )}
          </Group>

          {/* Bedarf 12 — was zwischen Kamera und Motiv steht.
              Ohne eigene Gruppe und ohne Aufklappen: eine Sichtlinien-Sperre
              ist kein Detail, das man sucht. Sie steht offen da, sobald es
              eine gibt, und verschwindet, sobald sie weg ist. */}
          {sichtKonflikte.length > 0 && (
            <Note tone="warn">
              <div className="font-medium">{t('sidebar.cam.sightlineBlocked', 'Sightline blocked')}</div>
              <ul className="mt-0.5 space-y-0.5">
                {sichtKonflikte.map((k) => (
                  <li key={`${k.kind}-${k.obstacleId}`}>{conflictText(k)}</li>
                ))}
              </ul>
            </Note>
          )}

          {/* Bedarf 58 — welchen Ausschnitt diese Position liefern muss, und
              ob die Optik daran herankommt.

              Der Auftrag steht HIER und nicht in einem eigenen Dialog, aus
              demselben Grund wie die Sichtlinien: er wird beim Setzen der
              Position gefasst, und die Optik wird zwei Felder darueber
              gewaehlt. Wer die Antwort erst suchen muss, bekommt sie auf dem
              Wagen — genau das beklagt der Bedarf.

              Zugeklappt, solange kein Auftrag steht: eine Position ohne
              geforderten Ausschnitt hat keine Anforderung, und ein offenes
              Feld dafuer waere eine Frage, die niemand gestellt hat. */}
          <Group
            id="coverage"
            title={t('sidebar.coverage.title', 'Coverage brief')}
            defaultOpen={false}
            summary={
              deckungsZeile
                ? deckungsZeile.verdict.kind === 'reachable'
                  ? FRAMING_LABEL[deckungsZeile.framing]
                  : t('sidebar.coverage.short', 'not enough')
                : undefined
            }
          >
            <div className="flex flex-col gap-1.5 text-xs">
              <p className="text-bc-muted">
                {t('sidebar.coverage.intro', 'What this position has to deliver. The focal length needed is computed from position, subject, sensor and lens range — and it says so when the lens in use cannot reach it.')}
              </p>

              <select
                className={feldCls}
                aria-label={t('sidebar.coverage.subject.aria', 'Subject of the coverage brief')}
                value={cam.coverage?.subjectId ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    coverage: e.target.value
                      ? { subjectId: e.target.value, framing: cam.coverage?.framing ?? 'full' }
                      : undefined,
                  })
                }
              >
                <option value="">{t('sidebar.coverage.none', 'No brief')}</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              {cam.coverage && (
                <>
                  <select
                    className={feldCls}
                    aria-label={t('sidebar.coverage.framing.aria', 'Shot size')}
                    value={cam.coverage.framing}
                    onChange={(e) =>
                      updateCamera(cam.id, {
                        coverage: {
                          ...cam.coverage!,
                          framing: e.target.value as NonNullable<VenueCamera['coverage']>['framing'],
                        },
                      })
                    }
                  >
                    {(Object.keys(FRAMING_LABEL) as (keyof typeof FRAMING_LABEL)[]).map((k) => (
                      <option key={k} value={k}>
                        {FRAMING_LABEL[k]}
                        {k !== 'custom' ? ` (${FRAMINGS[k].axis === 'width' ? t('sidebar.coverage.width', 'width') : t('sidebar.coverage.height', 'height')})` : ''}
                      </option>
                    ))}
                  </select>

                  {/* Eigenes Mass: die Stufen oben sind eine Konvention, keine
                      Messung. Wer sie nicht teilt, traegt hier Meter ein. */}
                  {cam.coverage.framing === 'custom' && (
                    <div className="flex gap-1.5">
                      <input
                        className={feldCls}
                        type="number"
                        min={0}
                        step={0.05}
                        placeholder={t('sidebar.coverage.extentPh', 'Extent (m)')}
                        aria-label={t('sidebar.coverage.extent.aria', 'Required extent in metres')}
                        value={cam.coverage.extentM ?? ''}
                        onChange={(e) =>
                          updateCamera(cam.id, {
                            coverage: { ...cam.coverage!, extentM: zahlOderNichts(e.target.value) },
                          })
                        }
                      />
                      <select
                        className={feldCls}
                        aria-label={t('sidebar.coverage.axis.aria', 'Axis of the required extent')}
                        value={cam.coverage.axis ?? 'height'}
                        onChange={(e) =>
                          updateCamera(cam.id, {
                            coverage: {
                              ...cam.coverage!,
                              axis: e.target.value as NonNullable<VenueCamera['coverage']>['axis'],
                            },
                          })
                        }
                      >
                        <option value="height">{t('sidebar.coverage.axisHeight', 'Height')}</option>
                        <option value="width">{t('sidebar.coverage.axisWidth', 'Width')}</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {deckungsZeile && (
                <Note tone={deckungsZeile.verdict.kind === 'reachable' ? 'info' : 'warn'}>
                  <div className="font-medium">{verdictShort(deckungsZeile.verdict)}</div>
                  {/* Die Bemessungsgrundlage steht IMMER dabei: wer die Zahl
                      anzweifelt, soll sehen, woraus sie kommt. */}
                  {deckungsZeile.verdict.kind !== 'not-computable' && (
                    <div className="mt-0.5 text-bc-muted">
                      {deckungsZeile.extentM.toFixed(2).replace('.', ',')} m{' '}
                      {deckungsZeile.axis === 'width' ? t('sidebar.coverage.width', 'width') : t('sidebar.coverage.height', 'height')} {t('sidebar.coverage.from', 'from')}{' '}
                      {deckungsZeile.distanceM.toFixed(2).replace('.', ',')} m
                    </div>
                  )}
                </Note>
              )}
            </div>
          </Group>

          {/* Bedarf 63 — der Bildzustand dieser Position.

              Zugeklappt: es sind Angaben, die einmal eingetragen werden und
              dann stehen. Der Zaehler zeigt die Befunde, damit man nicht
              aufklappen muss, um zu sehen, dass etwas fehlt. */}
          <Group
            id="paint"
            title={t('sidebar.paint.title', 'Picture state')}
            defaultOpen={false}
            summary={
              bildUndSchattierung.length > 0
                ? `${bildUndSchattierung.length} offen`
                : cam.paint?.sceneFile
            }
          >
            <div className="flex flex-col gap-1.5 text-xs">
              {/* Bedarf 48 — der Fernsteuerweg. Steht VOR der Szenendatei:
                  wovon abhängt, ob diese Position überhaupt vom Pult aus zu
                  schattieren ist, ist die erste Frage, nicht die letzte. */}
              <p className="text-bc-muted">
                {t('sidebar.paint.controlPathIntro', 'How is this position controlled remotely? The command set differs per path — a Panasonic PTZ can do iris and colour bars, a Blackmagic the whole colour set.')}
              </p>
              <select
                className={feldCls}
                aria-label={t('sidebar.paint.controlPath.aria', 'Remote-control path of this position')}
                value={cam.controlPath ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    controlPath: (e.target.value || undefined) as ControlPath | undefined,
                  })
                }
              >
                <option value="">{t('sidebar.paint.unstated', 'not stated')}</option>
                {(Object.keys(CONTROL_PATH_LABEL) as ControlPath[]).map((p) => (
                  <option key={p} value={p}>
                    {CONTROL_PATH_LABEL[p]}
                  </option>
                ))}
              </select>
              {cam.controlPath && (
                <>
                  <p className="text-bc-text">{shadingLines(cam)[1]}</p>
                  <p className="text-bc-dim">{BUS_SCOPE_NOTE}</p>
                </>
              )}

              <p className="text-bc-muted">
                {t('sidebar.paint.sceneFileIntro', 'The scene file belongs to the position and to the show, not on a card in the camera slot. Otherwise the second show day starts from memory.')}
              </p>

              <input
                className={feldCls}
                placeholder={t('sidebar.paint.sceneFilePh', 'Scene file (file name on card / panel)')}
                aria-label={t('sidebar.paint.sceneFile.aria', 'Scene file')}
                value={cam.paint?.sceneFile ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    paint: { ...cam.paint, sceneFile: e.target.value || undefined },
                  })
                }
              />
              <div className="flex gap-1.5">
                <input
                  className={feldCls}
                  placeholder={t('sidebar.paint.setOnPh', 'Set on')}
                  aria-label={t('sidebar.paint.setOn.aria', 'Date the picture state was set')}
                  value={cam.paint?.setAt ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      paint: { ...cam.paint, setAt: e.target.value || undefined },
                    })
                  }
                />
                <input
                  className={feldCls}
                  placeholder={t('sidebar.paint.setByPh', 'Set by')}
                  aria-label={t('sidebar.paint.setBy.aria', 'Who set the picture state')}
                  value={cam.paint?.setBy ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      paint: { ...cam.paint, setBy: e.target.value || undefined },
                    })
                  }
                />
              </div>
              {/* Ohne Referenzbedingungen ist der Zustand wiederherstellbar,
                  aber nicht nachstellbar — und genau das trennt die Datei von
                  einer Notiz. */}
              <input
                className={feldCls}
                placeholder={t('sidebar.paint.referencePh', 'Reference (grey card, colour temperature, light)')}
                aria-label={t('sidebar.paint.reference.aria', 'Reference conditions')}
                value={cam.paint?.reference ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    paint: { ...cam.paint, reference: e.target.value || undefined },
                  })
                }
              />
              {/* Bedarf 50 — welches Bedienfeld diese Position schattiert.
                  Klartext, keine Kennung: dieser Planer fuehrt keine
                  Pult-Belegung, und eine erfundene Nummerierung waere eine
                  zweite Wahrheit neben der auf dem Pult. */}
              <input
                className={feldCls}
                placeholder={t('sidebar.paint.panelPh', 'Control panel (RCP 3, page 2)')}
                aria-label={t('sidebar.paint.panel.aria', 'Control panel shading this position')}
                value={cam.paint?.panel ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    paint: { ...cam.paint, panel: e.target.value || undefined },
                  })
                }
              />

              {/* Bedarf 47 — WO der Zustand liegt und auf welchem Body.
                  Der Beleg nennt „five unnamed slots on an SD card": ohne
                  Dateinamen ist ein Zustand nicht zwangsläufig verloren, er
                  liegt auf Platz 3. Ohne beides sehr wohl. */}
              <div className="flex gap-1.5">
                <input
                  className={feldCls}
                  placeholder={t('sidebar.paint.slotPh', 'Slot on the device (SD 3, Scene File 05)')}
                  aria-label={t('sidebar.paint.slot.aria', 'Slot where the picture state lives on the device')}
                  value={cam.paint?.slot ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      paint: { ...cam.paint, slot: e.target.value || undefined },
                    })
                  }
                />
                <input
                  className={feldCls}
                  placeholder={t('sidebar.paint.bodyPh', 'Body no.')}
                  aria-label={t('sidebar.paint.body.aria', 'Number of the body the picture state was set on')}
                  value={cam.paint?.bodySerial ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      paint: { ...cam.paint, bodySerial: e.target.value || undefined },
                    })
                  }
                />
              </div>

              {/* Bedarf 47 — welche Positionen gleich aussehen müssen. Freier
                  Name: eine Gruppe ist eine Absicht des Bildtechnikers und
                  keine Eigenschaft der Anlage. */}
              <input
                className={feldCls}
                placeholder={t('sidebar.paint.groupPh', 'Match group (stage, audience)')}
                aria-label={t('sidebar.paint.group.aria', 'Match group of this position')}
                value={cam.matchGroup ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, { matchGroup: e.target.value || undefined })
                }
              />

              {/* Der Abgleich-Zustand wird NICHT von Hand getippt: er wird beim
                  Eintragen aus der Position genommen. Ein von Hand gesetzter
                  Body sagte, es sei geprüft worden, wo nichts geprüft wurde. */}
              <button
                type="button"
                className="border border-bc-border px-2 py-1 text-left hover:border-bc-accent"
                onClick={() =>
                  updateCamera(cam.id, {
                    paint: {
                      ...cam.paint,
                      savedWith: {
                        cameraId: cam.cameraId,
                        lensId: cam.lensId,
                        ...(cam.sensorModeIndex !== undefined
                          ? { sensorModeIndex: cam.sensorModeIndex }
                          : {}),
                      },
                    },
                  })
                }
                disabled={!cam.paint?.sceneFile}
              >
                {t('sidebar.paint.pinMatch', 'Pin the match to the current body / lens')}
              </button>

              {/* Bedarf 50 — was waehrend der Show kaputtgegangen ist. Eigene
                  Liste und nicht `notes`: eine Liste, in der Notiz und Fehler
                  stehen, wird von niemandem mehr als Fehlerliste gelesen. */}
              <textarea
                className={feldCls}
                rows={2}
                placeholder={t('sidebar.paint.faultsPh', 'Faults of this shift (one line per fault)')}
                aria-label={t('sidebar.paint.faults.aria', 'Faults at this position')}
                value={(cam.faults ?? []).join('\n')}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    faults: e.target.value
                      .split('\n')
                      .map((f) => f.trim())
                      .filter(Boolean),
                  })
                }
              />

              {bildUndSchattierung.length > 0 && (
                <Note tone="warn">
                  <ul className="space-y-0.5">
                    {bildUndSchattierung.map((f, i) => (
                      <li key={`${f.label}-${i}`}>
                        <span className="font-medium">{f.label}</span>
                        {': '}
                        {f.text}
                      </li>
                    ))}
                  </ul>
                </Note>
              )}
            </div>
          </Group>

          {/* Bedarf 14 — die Presets als Dokumentation. Nur bei PTZ-Kameras:
              eine Handkamera speichert keine, und ein leeres Feld dafuer
              waere eine Frage, die niemand hat. */}
          {istPtz && (
            <Group
              id="presets"
              title={t('sidebar.cam.presets', 'PTZ presets')}
              defaultOpen={false}
              summary={(cam.presets?.length ?? 0) > 0 ? `${cam.presets!.length}` : undefined}
            >
              <div className="space-y-1.5 text-xs">
                <p className="text-bc-muted">
                  {t('sidebar.cam.presetsIntro', 'A number becomes an answer. What is stored is the attitude of NOW — if the camera is moved later, the list says so.')}
                </p>

                <div className="flex gap-1">
                  <input
                    className="min-w-0 flex-1 border border-bc-border bg-bc-dark px-1.5 py-1 text-bc-text-bright"
                    placeholder={t('sidebar.cam.presetNamePlaceholder', 'Name the shot (e.g. Wide stage)')}
                    aria-label={t('sidebar.cam.presetName', 'Preset name')}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <input
                    className="w-24 border border-bc-border bg-bc-dark px-1.5 py-1 text-bc-text-bright"
                    placeholder={t('sidebar.cam.presetSegment', 'Segment')}
                    aria-label={t('sidebar.cam.presetSegment.aria', 'Segment of the preset')}
                    value={presetSegment}
                    onChange={(e) => setPresetSegment(e.target.value)}
                  />
                  <button
                    type="button"
                    className="border border-bc-border px-2 py-1 text-bc-text hover:text-bc-text-bright disabled:opacity-40"
                    disabled={!presetName.trim()}
                    onClick={() => {
                      savePresetFromCamera(cam.id, presetName.trim(), presetSegment.trim() || undefined);
                      setPresetName('');
                      setPresetSegment('');
                    }}
                  >
                    {t('sidebar.cam.presetSave', 'Save')}
                  </button>
                </div>

                {presetRows(cam).length === 0 ? (
                  <div className="text-bc-dim">{t('sidebar.cam.presetsEmpty', 'No preset documented yet.')}</div>
                ) : (
                  <table className="w-full text-left">
                    <tbody>
                      {presetRows(cam).map((r) => (
                        <tr key={r.nummer} className="border-t border-bc-border align-top">
                          <td className="py-1 pr-1 font-mono text-blue-400">{r.nummer}</td>
                          <td className="py-1 pr-1">
                            <input
                              className="w-full border border-transparent bg-transparent px-0.5 text-bc-text-bright hover:border-bc-border"
                              aria-label={format(t('sidebar.cam.presetNameOf', 'Name of preset {n}'), { n: r.nummer })}
                              value={cam.presets?.find((p) => String(p.number) === r.nummer)?.name ?? ''}
                              onChange={(e) => updatePreset(cam.id, Number(r.nummer), { name: e.target.value })}
                            />
                            <div className="text-bc-dim">{r.optik}</div>
                          </td>
                          <td className="py-1 pr-1 text-bc-muted">{r.segment || '—'}</td>
                          <td className="py-1 pr-1 text-bc-dim">{r.stand}</td>
                          <td className="py-1 text-right">
                            <button
                              type="button"
                              aria-label={format(t('sidebar.cam.presetRemove', 'Remove preset {n}'), { n: r.nummer })}
                              className="text-bc-dim hover:text-red-400"
                              onClick={() => removePreset(cam.id, Number(r.nummer))}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {presetBefunde.length > 0 && (
                  <ul className="space-y-0.5 text-amber-400">
                    {presetBefunde.map((f: PresetFinding, i: number) => (
                      <li key={`${f.kind}-${f.number ?? i}`}>{presetFindingText(f)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Group>
          )}

          {/* BEDARFE 59/60/61 — was der Operator vor Ort braucht und heute
              muendlich bekommt. Zugeklappt: es sind Angaben, die einmal
              eingetragen werden und dann stehen, nicht Regler, an denen man
              waehrend der Planung dreht. Die Befunde stehen darin, damit sie
              dort sichtbar sind, wo man sie beheben kann. */}
          <Group
            id="rigging"
            title={t('sidebar.rigging.title', 'Rigging & comms')}
            defaultOpen={false}
            summary={
              kartenBefunde.length > 0 ? `${kartenBefunde.length} offen` : cam.comms?.channel
            }
          >
            <div className="flex flex-col gap-1.5 text-xs">
              <input
                className={feldCls}
                placeholder={t('sidebar.rigging.riserPh', 'Riser / platform (4×4 ft Intellistage …)')}
                aria-label={t('sidebar.rigging.riser', 'Riser')}
                value={cam.rigging?.riser ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    rigging: { ...cam.rigging, riser: e.target.value || undefined },
                  })
                }
              />
              <div className="flex gap-1.5">
                <input
                  className={feldCls}
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder={t('sidebar.rigging.heightPh', 'Height (m)')}
                  aria-label={t('sidebar.rigging.height', 'Riser height in metres')}
                  value={cam.rigging?.riserHeightM ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      rigging: { ...cam.rigging, riserHeightM: zahlOderNichts(e.target.value) },
                    })
                  }
                />
                {/* Die Traglast wird NICHT gerechnet und nicht vorbelegt: die
                    Zahl steht auf einem Blatt, nach dem sich jemand darauf
                    stellt. Sie kommt vom Datenblatt des Podests. */}
                <input
                  className={feldCls}
                  type="number"
                  min={0}
                  step={1}
                  placeholder={t('sidebar.rigging.loadPh', 'Load limit (kg, from the data sheet)')}
                  aria-label={t('sidebar.rigging.load', 'Load limit in kilograms')}
                  value={cam.rigging?.loadLimitKg ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      rigging: { ...cam.rigging, loadLimitKg: zahlOderNichts(e.target.value) },
                    })
                  }
                />
              </div>
              <div className="flex gap-1.5">
                <select
                  className={feldCls}
                  aria-label={t('sidebar.rigging.access', 'Access to the position')}
                  value={cam.rigging?.access ?? 'unstated'}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      rigging: {
                        ...cam.rigging,
                        access:
                          e.target.value === 'unstated'
                            ? undefined
                            : (e.target.value as NonNullable<VenueCamera['rigging']>['access']),
                      },
                    })
                  }
                >
                  {(Object.keys(ACCESS_LABEL) as (keyof typeof ACCESS_LABEL)[]).map((k) => (
                    <option key={k} value={k}>
                      {ACCESS_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input
                  className={feldCls}
                  placeholder={t('sidebar.rigging.powerPh', 'Power (circuit / outlet)')}
                  aria-label={t('sidebar.rigging.power', 'Power drop')}
                  value={cam.rigging?.powerDrop ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      rigging: { ...cam.rigging, powerDrop: e.target.value || undefined },
                    })
                  }
                />
              </div>
              <div className="flex gap-1.5">
                <input
                  className={feldCls}
                  placeholder={t('sidebar.rigging.channelPh', 'Comms channel')}
                  aria-label={t('sidebar.rigging.channel', 'Comms channel')}
                  value={cam.comms?.channel ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      comms: { ...cam.comms, channel: e.target.value || undefined },
                    })
                  }
                />
                <input
                  className={feldCls}
                  placeholder={t('sidebar.rigging.beltpackPh', 'Beltpack no.')}
                  aria-label={t('sidebar.rigging.beltpack', 'Beltpack')}
                  value={cam.comms?.beltpackId ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      comms: { ...cam.comms, beltpackId: e.target.value || undefined },
                    })
                  }
                />
              </div>
              <div className="flex gap-1.5">
                <input
                  className={feldCls}
                  placeholder={t('sidebar.rigging.zonePh', 'Antenna zone')}
                  aria-label={t('sidebar.rigging.zone', 'Antenna zone')}
                  value={cam.comms?.antennaZone ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      comms: { ...cam.comms, antennaZone: e.target.value || undefined },
                    })
                  }
                />
                <input
                  className={feldCls}
                  placeholder={t('sidebar.rigging.batteryPh', 'Battery plan')}
                  aria-label={t('sidebar.rigging.battery', 'Battery plan')}
                  value={cam.comms?.batteryPlan ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      comms: { ...cam.comms, batteryPlan: e.target.value || undefined },
                    })
                  }
                />
              </div>
              <textarea
                className={feldCls}
                rows={2}
                placeholder={t('sidebar.rigging.kitPh', 'Kit at this position — one line per item')}
                aria-label={t('sidebar.rigging.kit', 'Kit at this position')}
                value={(cam.kit ?? []).join('\n')}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    kit: e.target.value
                      .split('\n')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
              {kartenBefunde.length > 0 && (
                <ul className="flex flex-col gap-1 text-[11px] text-amber-300/90">
                  {kartenBefunde.map((f, i) => (
                    <li key={`${f.kind}-${i}`}>
                      <span className="font-medium">{CARD_FINDING_LABEL[f.kind]}</span> — {f.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Group>

          {/* ── BEDARF 130 — wem gehoert dieses Bild? ────────────────────
              „After a NIC outage and an OBS restart, NDI ports were reshuffled
              and receivers displayed incorrect scene labels — the label says
              one camera, the picture is another, so a shading correction lands
              on the WRONG camera." (zbynekdrlik/camera-box#1180, P0)

              Der PLAN ist die Autoritaet: hier steht, wie die Quelle heisst.
              Danebengelegt wird die Liste, wie sie JETZT im Empfaenger steht —
              und ein Treffer auf der blossen Position macht nichts gruen. */}
          <Group
            id="source"
            title={t('sidebar.cam.source', 'Network source')}
            defaultOpen={false}
            summary={meineZeile ? VERDICT_LABEL[meineZeile.verdict] : cam.source?.sourceName}
          >
            <div className="flex flex-col gap-1.5 text-xs">
              <input
                className={feldCls}
                placeholder={t('sidebar.cam.source.deviceId', 'Device ID (serial / UUID) — survives everything')}
                aria-label={t('sidebar.cam.source.deviceId.aria', 'Device ID of the source')}
                value={cam.source?.deviceId ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    source: { ...cam.source, deviceId: e.target.value || undefined },
                  })
                }
              />
              <div className="flex gap-1.5">
                <input
                  className={feldCls}
                  placeholder={t('sidebar.cam.source.host', 'Machine (NDI: before the bracket)')}
                  aria-label={t('sidebar.cam.source.host.aria', 'Machine hosting the source')}
                  value={cam.source?.host ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      source: { ...cam.source, host: e.target.value || undefined },
                    })
                  }
                />
                <input
                  className={feldCls}
                  placeholder={t('sidebar.cam.source.name', 'Source name (inside the bracket)')}
                  aria-label={t('sidebar.cam.source.name.aria', 'Source name')}
                  value={cam.source?.sourceName ?? ''}
                  onChange={(e) =>
                    updateCamera(cam.id, {
                      source: { ...cam.source, sourceName: e.target.value || undefined },
                    })
                  }
                />
              </div>
              <input
                className={feldCls}
                placeholder={t('sidebar.cam.source.address', 'IP address — reliable only with a fixed reservation')}
                aria-label={t('sidebar.cam.source.address.aria', 'IP address of the source')}
                value={cam.source?.address ?? ''}
                onChange={(e) =>
                  updateCamera(cam.id, {
                    source: { ...cam.source, address: e.target.value || undefined },
                  })
                }
              />

              {/* Die Liste, wie sie JETZT im Empfaenger steht. Sie wird
                  HEREINGEHOLT und nicht gesucht: dieser Planer laeuft auf dem
                  Rechner des Planers und nicht auf dem der Regie. */}
              <label className="mt-1 text-[10px] uppercase tracking-wider text-bc-dim">
                {t('sidebar.cam.source.list', 'Source list from the receiver (one per line)')}
              </label>
              <textarea
                className="block min-h-[3.5rem] w-full resize-y border border-bc-border bg-bc-dark text-xs text-bc-text-bright"
                style={{ padding: '4px 6px' }}
                rows={3}
                placeholder={t('sidebar.cam.source.listPh', 'REGIE-PC (CAM 1)\nREGIE-PC (CAM 2)  10.0.0.42')}
                aria-label={t('sidebar.cam.source.list.aria', 'Source list from the receiver')}
                value={sourceListText}
                onChange={(e) => setSourceListText(e.target.value)}
              />
              {quellenListe.warnings.length > 0 && (
                <div className="text-[11px] text-amber-400">
                  {quellenListe.warnings.length} Zeile(n) nicht lesbar — Zeile{' '}
                  {quellenListe.warnings.map((w) => w.line).join(', ')}. Nichts davon
                  wurde stillschweigend verworfen.
                </div>
              )}

              {meineZeile && (
                <div
                  className={
                    meineZeile.verdict === 'confirmed'
                      ? 'text-[11px] text-emerald-400'
                      : 'text-[11px] text-amber-400'
                  }
                >
                  {meineZeile.message}
                  {meineZeile.facet && (
                    <> {' · '}{FACET_LABEL[meineZeile.facet]}</>
                  )}
                  {meineZeile.matched && (
                    <> {' · '}{sourceLabel(meineZeile.matched)}</>
                  )}
                </div>
              )}
              {/* Was im Netz da ist und keine Kamera fuer sich beansprucht.
                  Eine unerwartete Quelle ist der Zwilling einer fehlenden:
                  zusammen sind sie meist genau die Vertauschung. */}
              {quellenAbgleich.unexpected.length > 0 && (
                <div className="text-[11px] text-bc-muted">
                  {t('sidebar.sources.unmatched', 'Not matched on the network:')}{' '}
                  {quellenAbgleich.unexpected.map(sourceLabel).join(' · ')}
                </div>
              )}
              {quellenAbgleich.needsLook > 0 && quellenListe.sources.length > 0 && (
                <div className="text-[11px] text-amber-400">
                  {format(
                    t(
                      'sidebar.sources.needsLook',
                      '{n} of {total} cameras are not recognised beyond doubt - check before the show.',
                    ),
                    { n: quellenAbgleich.needsLook, total: quellenAbgleich.rows.length },
                  )}
                </div>
              )}
            </div>
          </Group>

          <Group id="note" title={t('sidebar.cam.notes', 'Notes')} defaultOpen={false} summary={cam.notes ? cam.notes.slice(0, 24) : undefined}>
            <textarea
              className="block min-h-[2.5rem] w-full resize-y border border-bc-border bg-bc-dark text-xs text-bc-text-bright"
              style={{ padding: '4px 6px' }}
              rows={2}
              placeholder={t('sidebar.cam.notesPlaceholder', 'Mount, operator, shot notes…')}
              aria-label={t('sidebar.cam.notes.aria', 'Camera note')}
              value={cam.notes ?? ''}
              onChange={(e) => updateCamera(cam.id, { notes: e.target.value })}
            />
          </Group>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const {
    cameras, addCamera, venue, setVenue, showAllFov, toggleShowAllFov, showDof, toggleShowDof, clearAll,
    pixelsPerMeter, setPixelsPerMeter,
    addStage, removeStage, updateStage,
    persons, addPerson, addStageObject, removePerson, updatePerson,
    backgroundPlan, setBackgroundPlan,
    walls, addWall, removeWall, updateWall, wallSnap, setWallSnap,
  } = useStore();
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const selectCamera = useStore((s) => s.selectCamera);
  // Akkordeon: offen ist die Karte der ausgewaehlten Kamera. Klappt der Nutzer
  // sie trotzdem zu, merkt sich das genau diese eine Id — dadurch braucht es
  // keinen Effekt, der bei jeder Auswahl State nachzieht.
  const [collapsedCameraId, setCollapsedCameraId] = useState<string | null>(null);
  const toggleCameraCard = useCallback(
    (camId: string) => {
      if (camId !== selectedCameraId) {
        selectCamera(camId);
        setCollapsedCameraId(null);
        return;
      }
      setCollapsedCameraId((prev) => (prev === camId ? null : camId));
    },
    [selectCamera, selectedCameraId],
  );
  const [venueOpen, setVenueOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [personsOpen, setPersonsOpen] = useState(false);
  const [wallsOpen, setWallsOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [wallDrawMode, setWallDrawMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [calibAxis, setCalibAxis] = useState<'x' | 'y' | null>(null);
  const [calibDistX, setCalibDistX] = useState('10');
  const [calibDistY, setCalibDistY] = useState('10');
  const [autoResize, setAutoResize] = useState(true);
  const [scaleLocked, setScaleLocked] = useState(true);

  const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
  const MAX_PDF_PAGES = 100;

  /** Convert a PDF first page to a data URL at 2× DPI */
  const pdfToDataUrl = useCallback(async (file: File): Promise<{ dataUrl: string; width: number; height: number }> => {
    if (file.size > MAX_PDF_SIZE_BYTES) {
      throw new Error(format(t('sidebar.pdfTooLarge', 'PDF too large ({size} MB). Maximum is 50 MB.'), { size: (file.size / 1024 / 1024).toFixed(1) }));
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const arrayBuf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuf, isEvalSupported: false } as Parameters<typeof pdfjsLib.getDocument>[0]).promise;
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(format(t('sidebar.pdfTooManyPages', 'PDF has {pages} pages (max {max}). Use a single-page floor plan.'), { pages: pdf.numPages, max: MAX_PDF_PAGES }));
    }
    const page = await pdf.getPage(1);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    return { dataUrl: canvas.toDataURL('image/png'), width: viewport.width, height: viewport.height };
    // `t` gehoert in die Liste: die beiden Fehlermeldungen darin sind jetzt
    // uebersetzt, und ein Callback, der die alte Sprache festhaelt, meldet den
    // Fehler nach einem Sprachwechsel in der vorigen.
  }, [t, MAX_PDF_SIZE_BYTES]);

  const handleBgUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) return;

    if (isPdf) {
      try {
        const { dataUrl, width, height } = await pdfToDataUrl(file);
        const s = venue.widthM / width;
        const plan: BackgroundPlan = {
          dataUrl,
          scaleX: s,
          scaleY: s,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.3,
          widthPx: width,
          heightPx: height,
        };
        setBackgroundPlan(plan);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('sidebar.unknownError', 'Unknown error');
        alert(format(t('sidebar.pdfRenderFailed', 'Failed to render PDF: {msg}'), { msg }));
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const s = venue.widthM / img.width;
          const plan: BackgroundPlan = {
            dataUrl,
            scaleX: s,
            scaleY: s,
            offsetX: 0,
            offsetY: 0,
            opacity: 0.3,
            widthPx: img.width,
            heightPx: img.height,
          };
          setBackgroundPlan(plan);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  }, [venue.widthM, setBackgroundPlan, pdfToDataUrl]);

  /** Start/stop calibration mode — dispatches custom event to Venue2D */
  const startCalibration = useCallback((axis: 'x' | 'y') => {
    if (calibAxis === axis) {
      // Cancel
      setCalibAxis(null);
      window.dispatchEvent(new CustomEvent('multicam-calibrate', { detail: { active: false, distanceM: 0, axis } }));
    } else {
      const dist = axis === 'x' ? parseFloat(calibDistX) || 10 : parseFloat(calibDistY) || 10;
      setCalibAxis(axis);
      window.dispatchEvent(new CustomEvent('multicam-calibrate', { detail: { active: true, distanceM: dist, axis, autoResize, scaleLocked } }));
    }
  }, [calibAxis, calibDistX, calibDistY, autoResize, scaleLocked]);

  // Listen for calibration-done event from Venue2D to reset button state
  useEffect(() => {
    const handler = () => setCalibAxis(null);
    window.addEventListener('multicam-calibrate-done', handler);
    return () => window.removeEventListener('multicam-calibrate-done', handler);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('multicam-wall-draw', { detail: { active: wallDrawMode } }));
  }, [wallDrawMode]);

  return (
    // Breite kommt vom Container in App.tsx (fluid); hier nur noch fuellen —
    // ein zweites `w-80` haette die Spalte bei 320 px festgenagelt.
    <div className="w-full bg-bc-panel border-r border-bc-border h-full flex flex-col overflow-y-auto">
      {/* Venue settings */}
      <div className={`border-b border-bc-border/60 ${venueOpen ? 'bg-bc-hover-soft' : ''}`}>
        <AccordionHeader
          icon={<FiHome size={14} />}
          title={t('sidebar.venueSettings', 'Venue Settings')}
          open={venueOpen}
          onToggle={() => setVenueOpen(!venueOpen)}
        />
        {venueOpen && (
          <div className="space-y-2 text-xs" style={{ padding: '0 14px 12px' }}>
            <label className="block">
              <span className="text-bc-muted">{t('sidebar.name', 'Name')}</span>
              <input
                className="w-full bg-bc-dark border border-bc-border px-2 py-1 text-bc-text-bright"
                value={venue.name}
                onChange={(e) => setVenue({ ...venue, name: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-bc-muted">{t('sidebar.widthM', 'Width (m)')}</span>
                <input
                  type="number"
                  className="w-full bg-bc-dark border border-bc-border px-2 py-1 text-bc-text-bright"
                  value={venue.widthM}
                  onChange={(e) => setVenue({ ...venue, widthM: parseFloat(e.target.value) || 10 })}
                />
              </label>
              <label>
                <span className="text-bc-muted">{t('sidebar.depthM', 'Depth (m)')}</span>
                <input
                  type="number"
                  className="w-full bg-bc-dark border border-bc-border px-2 py-1 text-bc-text-bright"
                  value={venue.heightM}
                  onChange={(e) => setVenue({ ...venue, heightM: parseFloat(e.target.value) || 10 })}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-bc-muted">{format(t('sidebar.zoom', 'Zoom: {v}px/m'), { v: pixelsPerMeter })}</span>
              <input
                type="range"
                className="w-full accent-bc-accent"
                min={10}
                max={80}
                value={pixelsPerMeter}
                onChange={(e) => setPixelsPerMeter(parseInt(e.target.value))}
              />
            </label>
          </div>
        )}
      </div>

      {/* Background plan */}
      <div className={`border-b border-bc-border/60 ${bgOpen ? 'bg-bc-hover-soft' : ''}`}>
        <AccordionHeader
          icon={<FiImage size={14} />}
          title={t('sidebar.floorPlan', 'Floor Plan')}
          open={bgOpen}
          onToggle={() => setBgOpen(!bgOpen)}
        />
        {bgOpen && (
          <div className="space-y-2 text-xs" style={{ padding: '0 14px 12px' }}>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={handleBgUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 bg-bc-accent/20 text-bc-accent text-xs hover:bg-bc-accent/30 w-full justify-center"
            >
              <FiUpload size={12} /> {backgroundPlan ? t('sidebar.replaceImage', 'Replace Image/PDF') : t('sidebar.uploadImage', 'Upload Image or PDF')}
            </button>
            {backgroundPlan && (
              <>
                <label className="block">
                  <span className="text-bc-muted">{format(t('sidebar.opacity', 'Opacity: {v}%'), { v: (backgroundPlan.opacity * 100).toFixed(0) })}</span>
                  <input type="range" className="w-full accent-bc-accent" min={0.05} max={1} step={0.05}
                    value={backgroundPlan.opacity}
                    onChange={(e) => setBackgroundPlan({ ...backgroundPlan, opacity: parseFloat(e.target.value) })} />
                </label>
                <label className="block">
                  <span className="text-bc-muted">{format(t('sidebar.scaleX', 'Scale X: {v} mm/px ({w}m wide)'), { v: (backgroundPlan.scaleX * 1000).toFixed(1), w: (backgroundPlan.widthPx * backgroundPlan.scaleX).toFixed(1) })}</span>
                  <input type="range" className="w-full accent-bc-accent"
                    min={0.001} max={0.5} step={0.001}
                    value={backgroundPlan.scaleX}
                    onChange={(e) => { const v = parseFloat(e.target.value); setBackgroundPlan({ ...backgroundPlan, scaleX: v, ...(scaleLocked ? { scaleY: v } : {}) }); }} />
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setScaleLocked(!scaleLocked)}
                    className={`p-1 border ${scaleLocked ? 'border-bc-accent text-bc-accent' : 'border-bc-border text-bc-dim hover:text-bc-text'}`}
                    title={scaleLocked ? t('sidebar.unlockY', 'Unlock Y scale for independent adjustment') : t('sidebar.lockY', 'Lock Y scale to X')}
                  >
                    {scaleLocked ? <FiLock size={11} /> : <FiUnlock size={11} />}
                  </button>
                  <span className="text-[10px] text-bc-dim">{scaleLocked ? t('sidebar.xyLinked', 'X/Y linked') : t('sidebar.xyIndependent', 'X/Y independent')}</span>
                </div>
                <label className={`block ${scaleLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                  <span className="text-bc-muted">{format(t('sidebar.scaleY', 'Scale Y: {v} mm/px ({h}m tall)'), { v: (backgroundPlan.scaleY * 1000).toFixed(1), h: (backgroundPlan.heightPx * backgroundPlan.scaleY).toFixed(1) })}</span>
                  <input type="range" className="w-full accent-bc-accent"
                    min={0.001} max={0.5} step={0.001}
                    value={backgroundPlan.scaleY}
                    onChange={(e) => setBackgroundPlan({ ...backgroundPlan, scaleY: parseFloat(e.target.value) })} />
                </label>
                {/* Quick fit buttons */}
                <div className="flex gap-1">
                  <button
                    onClick={() => { const s = venue.widthM / backgroundPlan.widthPx; setBackgroundPlan({ ...backgroundPlan, scaleX: s, ...(scaleLocked ? { scaleY: s } : {}) }); }}
                    className="flex-1 px-1 py-0.5 bg-bc-dark border border-bc-border text-bc-muted hover:text-bc-text-bright text-[10px]"
                  >
                    {t('sidebar.fitWidth', 'Fit Width')}
                  </button>
                  <button
                    onClick={() => { const s = venue.heightM / backgroundPlan.heightPx; setBackgroundPlan({ ...backgroundPlan, scaleY: s, ...(scaleLocked ? { scaleX: s } : {}) }); }}
                    className={`flex-1 px-1 py-0.5 bg-bc-dark border border-bc-border text-bc-muted hover:text-bc-text-bright text-[10px] ${scaleLocked ? 'opacity-40 pointer-events-none' : ''}`}
                  >
                    {t('sidebar.fitHeight', 'Fit Height')}
                  </button>
                  <button
                    onClick={() => { const s = venue.widthM / backgroundPlan.widthPx; setBackgroundPlan({ ...backgroundPlan, scaleX: s, scaleY: s }); }}
                    className="flex-1 px-1 py-0.5 bg-bc-dark border border-bc-border text-bc-muted hover:text-bc-text-bright text-[10px]"
                  >
                    {t('sidebar.fitBoth', 'Fit Both')}
                  </button>
                </div>
                {/* Calibration */}
                <div className="p-2 bg-bc-dark border border-bc-border space-y-1.5">
                  <div className="flex items-center gap-1 text-bc-text font-medium">
                    <FiMaximize2 size={11} /> {t('sidebar.calibrateScale', 'Calibrate Scale')}{scaleLocked ? '' : t('sidebar.calibrateXY', ' (X / Y)')}
                  </div>
                  <p className="text-bc-dim text-[10px] leading-tight">
                    {scaleLocked
                      ? t('sidebar.calibHelpLocked', 'Click two points on the 2D plan to measure a known distance. Both X and Y scale will be set equally.')
                      : t('sidebar.calibHelpUnlocked', 'Measure a known horizontal (X) and vertical (Y) distance separately. Click two points on the 2D plan for each axis.')}
                  </p>
                  <div className="flex gap-1 items-end">
                    <label className="flex-1">
                      <span className="text-bc-dim">{scaleLocked ? t('sidebar.knownDistance', 'Known distance (m)') : t('sidebar.knownXDistance', 'Known X distance (m)')}</span>
                      <input type="number" min={0.1} step={0.1}
                        className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright"
                        value={calibDistX}
                        onChange={(e) => setCalibDistX(e.target.value)} />
                    </label>
                    <button
                      onClick={() => startCalibration('x')}
                      className={`px-2 py-1 text-xs font-medium whitespace-nowrap ${calibAxis === 'x' ? 'bg-bc-red text-bc-text-bright' : 'bg-bc-green/20 text-bc-green hover:bg-bc-green/30'}`}
                    >
                      {calibAxis === 'x' ? 'Cancel' : (scaleLocked ? t('sidebar.calibrate', 'Calibrate') : t('sidebar.calX', 'Cal X'))}
                    </button>
                  </div>
                  {!scaleLocked && (
                    <div className="flex gap-1 items-end">
                      <label className="flex-1">
                        <span className="text-bc-dim">{t('sidebar.knownYDistance', 'Known Y distance (m)')}</span>
                        <input type="number" min={0.1} step={0.1}
                          className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright"
                          value={calibDistY}
                          onChange={(e) => setCalibDistY(e.target.value)} />
                      </label>
                      <button
                        onClick={() => startCalibration('y')}
                        className={`px-2 py-1 text-xs font-medium whitespace-nowrap ${calibAxis === 'y' ? 'bg-bc-red text-bc-text-bright' : 'bg-bc-green/20 text-bc-green hover:bg-bc-green/30'}`}
                      >
                        {calibAxis === 'y' ? 'Cancel' : t('sidebar.calY', 'Cal Y')}
                      </button>
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 text-[10px] text-bc-muted cursor-pointer">
                    <input type="checkbox" checked={autoResize} onChange={(e) => setAutoResize(e.target.checked)} className="accent-bc-accent" />
                    {t('sidebar.autoResize', 'Auto-resize venue to match floor plan')}
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="text-bc-muted">{t('sidebar.offsetX', 'Offset X (m)')}</span>
                    <input type="number" className="w-full bg-bc-dark border border-bc-border px-1 py-0.5 text-bc-text-bright"
                      value={backgroundPlan.offsetX} step={0.5}
                      onChange={(e) => setBackgroundPlan({ ...backgroundPlan, offsetX: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label>
                    <span className="text-bc-muted">{t('sidebar.offsetY', 'Offset Y (m)')}</span>
                    <input type="number" className="w-full bg-bc-dark border border-bc-border px-1 py-0.5 text-bc-text-bright"
                      value={backgroundPlan.offsetY} step={0.5}
                      onChange={(e) => setBackgroundPlan({ ...backgroundPlan, offsetY: parseFloat(e.target.value) || 0 })} />
                  </label>
                </div>
                <button
                  onClick={() => setBackgroundPlan(null)}
                  className="w-full py-1 bg-bc-red/20 text-bc-red text-xs hover:bg-bc-red/30"
                >
                  {t('sidebar.removeBackground', 'Remove Background')}
                </button>
              </>
            )}
            {/* AI floor-plan analysis (issues #39 / #40) */}
            <AiPlanAnalysis />
          </div>
        )}
      </div>

      {/* Stages management */}
      <div className={`border-b border-bc-border/60 ${stagesOpen ? 'bg-bc-hover-soft' : ''}`}>
        <AccordionHeader
          icon={<FiMap size={14} />}
          title={t('sidebar.stages.title', 'Stages')}
          count={venue.stages.length}
          open={stagesOpen}
          onToggle={() => setStagesOpen(!stagesOpen)}
        />
        {stagesOpen && (
          <div className="space-y-2 text-xs" style={{ padding: '0 14px 12px' }}>
            {venue.stages.map((s) => (
              <div key={s.id} className="bg-bc-dark p-2 border border-bc-border">
                <div className="flex items-center justify-between mb-1">
                  <input
                    className="bg-transparent text-bc-text-bright text-xs font-semibold w-24 outline-none"
                    value={s.label}
                    onChange={(e) => updateStage(s.id, { label: e.target.value })}
                  />
                  <button onClick={() => removeStage(s.id)} style={{ padding: '4px' }} className="hover:text-bc-red" title={t('sidebar.removeStage', 'Remove stage')} aria-label={t('sidebar.removeStage.aria', 'Remove stage')}>
                    <FiTrash2 size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <label>
                    <span className="text-bc-dim">X</span>
                    <input type="number" className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs" value={s.x} step={0.5}
                      onChange={(e) => updateStage(s.id, { x: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label>
                    <span className="text-bc-dim">Y</span>
                    <input type="number" className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs" value={s.y} step={0.5}
                      onChange={(e) => updateStage(s.id, { y: parseFloat(e.target.value) || 0 })} />
                  </label>
                  <label>
                    <span className="text-bc-dim">W</span>
                    <input type="number" className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs" value={s.width} step={0.5}
                      onChange={(e) => updateStage(s.id, { width: parseFloat(e.target.value) || 1 })} />
                  </label>
                  <label>
                    <span className="text-bc-dim">T</span>
                    <input type="number" className="w-full bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs" value={s.height} step={0.5}
                      title={t('sidebar.stage.depth.title', 'Depth of the footprint in metres')}
                      onChange={(e) => updateStage(s.id, { height: parseFloat(e.target.value) || 1 })} />
                  </label>
                </div>

                {/* Podest statt Flaeche (#73): Hoehe, Farbe, Transparenz —
                    dieselben Stellschrauben wie bei den Wänden. */}
                <div className="mt-1 flex items-center gap-1">
                  <label className="flex items-center gap-1 text-bc-dim">
                    {t('sidebar.stage.height', 'Height')}
                    <input
                      type="number"
                      className="w-14 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-xs tabular-nums"
                      value={s.elevationM ?? 0}
                      step={0.1}
                      min={0}
                      max={10}
                      title={t('sidebar.stage.height.title', 'Riser height above the floor in metres — 0 stays flat')}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        updateStage(s.id, { elevationM: Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0 });
                      }}
                    />
                    <span className="text-[10px] text-bc-faint">m</span>
                  </label>
                  <input
                    type="color"
                    className="w-5 h-5 border border-bc-border cursor-pointer bg-transparent shrink-0"
                    value={s.color ?? '#3b82f6'}
                    onChange={(e) => updateStage(s.id, { color: e.target.value })}
                    title={t('sidebar.stage.colour.title', 'Colour of the riser')}
                    aria-label={t('sidebar.stage.colour.aria', 'Colour of the riser')}
                  />
                  <label className="flex flex-1 items-center gap-1 text-bc-dim" title={t('sidebar.stage.opacity.title', 'Opacity in per cent')}>
                    <input
                      type="range"
                      className="flex-1 accent-bc-accent"
                      min={10}
                      max={100}
                      step={5}
                      value={Math.round((s.opacity ?? 0.4) * 100)}
                      aria-label={t('sidebar.stage.opacity.aria', 'Opacity of the riser in per cent')}
                      onChange={(e) => updateStage(s.id, { opacity: parseInt(e.target.value, 10) / 100 })}
                    />
                    <span className="w-8 text-right text-[10px] tabular-nums text-bc-muted">
                      {Math.round((s.opacity ?? 0.4) * 100)}%
                    </span>
                  </label>
                </div>
              </div>
            ))}
            <button
              onClick={() => addStage()}
              className="flex items-center gap-1 px-2 py-1 bg-bc-accent/20 text-bc-accent text-xs hover:bg-bc-accent/30 w-full justify-center"
            >
              <FiPlus size={12} /> {t('sidebar.addStage', 'Add Stage')}
            </button>
          </div>
        )}
      </div>


      {/* Walls */}
      <div className={`border-b border-bc-border/60 ${wallsOpen ? 'bg-bc-hover-soft' : ''}`}>
        <AccordionHeader
          icon={<FiColumns size={14} />}
          title={t('sidebar.walls.title', 'Walls')}
          count={walls.length}
          open={wallsOpen}
          onToggle={() => setWallsOpen(!wallsOpen)}
        />
        {wallsOpen && (
          <div className="space-y-2 text-xs" style={{ padding: '0 14px 12px' }}>
            <button
              onClick={() => setWallDrawMode((active) => !active)}
              className={`flex items-center gap-1 px-2 py-1 text-xs w-full justify-center ${wallDrawMode ? 'bg-bc-yellow/20 text-bc-yellow hover:bg-bc-yellow/30' : 'bg-bc-dark text-bc-text hover:text-bc-text-bright border border-bc-border'}`}
            >
              {wallDrawMode ? t('sidebar.stopDrawing', 'Stop Drawing') : t('sidebar.drawWalls', 'Draw Walls')}
            </button>
            {wallDrawMode && (
              <div className="border border-bc-border bg-bc-dark px-2 py-1.5 text-[10px] text-bc-muted leading-relaxed">
                {t('sidebar.wallDrawHelp', 'Click once to place the start point, click again to finish the wall. Hold Shift to snap the angle. Right-click a wall to delete it.')}
              </div>
            )}
            {/* Endpoint snapping toggle (issue #40) */}
            <label className="flex items-center gap-2 text-[11px] text-bc-text cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-bc-accent"
                checked={wallSnap}
                onChange={(e) => setWallSnap(e.target.checked)}
              />
              {t('sidebar.snapEndpoints', 'Snap wall endpoints together')}
            </label>
            {walls.map((w) => (
              <div key={w.id} className="bg-bc-dark p-1.5 border border-bc-border space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    className="bg-transparent text-bc-text-bright text-xs w-16 outline-none"
                    value={w.label}
                    onChange={(e) => updateWall(w.id, { label: e.target.value })}
                  />
                  <span className="text-bc-dim text-[10px]">{w.height}m h</span>
                  <button onClick={() => removeWall(w.id)} className="ml-auto p-0.5 hover:text-bc-red"><FiTrash2 size={11} /></button>
                </div>
                {/* Surface pattern for blur-checking in the preview (issue #45) */}
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    className="w-5 h-5 border border-bc-border cursor-pointer bg-transparent shrink-0"
                    value={w.color ?? '#6b7280'}
                    onChange={(e) => updateWall(w.id, { color: e.target.value })}
                    title={t('sidebar.wallColour', 'Wall colour')}
                  />
                  <select
                    className="flex-1 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[10px]"
                    value={w.pattern ?? 'solid'}
                    onChange={(e) => updateWall(w.id, { pattern: e.target.value as WallPattern })}
                  >
                    <option value="solid">{t('sidebar.patternSolid', 'Solid')}</option>
                    <option value="grid">{t('sidebar.patternGrid', 'Grid')}</option>
                    <option value="flowers">{t('sidebar.patternFlowers', 'Flowers')}</option>
                    <option value="image">{t('sidebar.patternImage', 'Image…')}</option>
                  </select>
                  {w.pattern === 'image' && (
                    <label className="px-1.5 py-0.5 bg-bc-accent/20 text-bc-accent text-[10px] cursor-pointer hover:bg-bc-accent/30" title={t('sidebar.uploadTiledImage', 'Upload a tiled image')}>
                      <FiUpload size={10} className="inline" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => updateWall(w.id, { patternImage: String(reader.result), pattern: 'image' });
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  <button
                    onClick={() => walls.forEach((other) => other.id !== w.id && updateWall(other.id, {
                      color: w.color, pattern: w.pattern, patternImage: w.patternImage,
                      patternFit: w.patternFit, patternRows: w.patternRows,
                    }))}
                    className="px-1.5 py-0.5 border border-bc-border text-bc-muted hover:text-bc-accent hover:border-bc-accent text-[10px] shrink-0"
                    title={t('sidebar.applyToAllWalls', 'Apply this wall\'s colour & pattern to all walls')}
                  >
                    {t('sidebar.all', 'All')}
                  </button>
                </div>

                {/* Wie das Muster auf der Wand liegt (#74). Die Anzahl haengt
                    jetzt an der Wand statt am Zoom. */}
                {(w.pattern ?? 'solid') !== 'solid' && (
                  <div className="flex items-center gap-1">
                    <select
                      className="flex-1 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[10px]"
                      value={w.patternFit ?? 'tile'}
                      onChange={(e) => updateWall(w.id, { patternFit: e.target.value as WallFit })}
                      title={t('sidebar.patternFit.title', 'How the pattern is laid onto the wall surface')}
                    >
                      <option value="tile">{t('sidebar.patternFitTile', 'Tile')}</option>
                      <option value="scale-v">{t('sidebar.patternFitHeight', 'Scaled (height)')}</option>
                      <option value="scale-h">{t('sidebar.patternFitWidth', 'Scaled (width)')}</option>
                      <option value="stretch">{t('sidebar.patternFitStretch', 'Stretched')}</option>
                    </select>
                    {(w.patternFit ?? 'tile') === 'tile' && (
                      <label className="flex items-center gap-1 text-[10px] text-bc-muted">
                        {t('sidebar.patternRows', 'Rows')}
                        <input
                          type="number"
                          className="w-12 bg-bc-panel border border-bc-border px-1 py-0.5 text-bc-text-bright text-[10px] tabular-nums"
                          min={PATTERN_ROWS_MIN}
                          max={PATTERN_ROWS_MAX}
                          step={1}
                          value={w.patternRows ?? DEFAULT_PATTERN_ROWS}
                          title={t('sidebar.patternRows.title', 'Repeats across the wall height — the width follows from it so tiles do not distort')}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isFinite(v)) return;
                            updateWall(w.id, { patternRows: Math.max(PATTERN_ROWS_MIN, Math.min(PATTERN_ROWS_MAX, v)) });
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() => addWall()}
              className="flex items-center gap-1 px-2 py-1 bg-bc-accent/20 text-bc-accent text-xs hover:bg-bc-accent/30 w-full justify-center"
            >
              <FiPlus size={12} /> {t('sidebar.addWall', 'Add Wall')}
            </button>
          </div>
        )}
      </div>

      {/* Persons & Stage Objects */}
      <div className={`border-b border-bc-border/60 ${personsOpen ? 'bg-bc-hover-soft' : ''}`}>
        <AccordionHeader
          icon={<FiUsers size={14} />}
          title={t('sidebar.objectsPersons.title', 'Objects & Persons')}
          count={persons.length}
          open={personsOpen}
          onToggle={() => setPersonsOpen(!personsOpen)}
        />
        {personsOpen && (
          <div className="space-y-2 text-xs" style={{ padding: '0 14px 12px' }}>
            {persons.map((p) => {
              const icon =
                p.objectType === 'drums' ? '🥁' :
                p.objectType === 'keys' ? '🎹' :
                p.objectType === 'person-guitar' ? '🎸' :
                p.objectType === 'mic-stand' ? '🎤' :
                p.objectType === 'sitting-person' ? '🪑' :
                p.objectType === 'chair' ? '💺' :
                p.objectType === 'table' ? '🪑' :
                p.objectType === 'lectern' ? '🎙️' :
                p.objectType === 'schneetiger' ? '🐅' :
                p.objectType === 'custom' ? '◇' : '👤';
              return (
                <div key={p.id} className="flex items-center gap-2 bg-bc-dark p-1.5 border border-bc-border">
                  <span className="text-bc-dim text-[10px] w-6 text-center">{icon}</span>
                  <input className="bg-transparent text-bc-text-bright text-xs w-16 outline-none" value={p.label}
                    onChange={(e) => updatePerson(p.id, { label: e.target.value })} />
                  <span className="text-bc-dim">{p.height}m</span>
                  <input
                    type="color"
                    className="w-5 h-5 border border-bc-border cursor-pointer bg-transparent"
                    value={p.color ?? (OBJECT_PRESETS[p.objectType]?.color ?? '#f59e0b')}
                    onChange={(e) => updatePerson(p.id, { color: e.target.value })}
                    title={t('sidebar.customAccentColour', 'Custom accent colour')}
                  />
                  <span className="text-bc-dim">({p.x.toFixed(1)}, {p.y.toFixed(1)})</span>
                  <button onClick={() => removePerson(p.id)} className="ml-auto p-0.5 hover:text-bc-red"><FiTrash2 size={11} /></button>
                </div>
              );
            })}
            <div className="grid grid-cols-3 gap-1">
              <button onClick={() => addPerson()} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                <FiUser size={10} /> {t('sidebar.objPerson', 'Person')}
              </button>
              <button onClick={() => addStageObject('person-guitar')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                🎸 {t('sidebar.objGuitarist', 'Guitarist')}
              </button>
              <button onClick={() => addStageObject('sitting-person')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                🪑 {t('sidebar.objSeated', 'Seated')}
              </button>
              <button onClick={() => addStageObject('drums')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                🥁 {t('sidebar.objDrums', 'Drums')}
              </button>
              <button onClick={() => addStageObject('keys')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                🎹 {t('sidebar.objKeys', 'Keys')}
              </button>
              <button onClick={() => addStageObject('mic-stand')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                🎤 {t('sidebar.objMicStand', 'Mic Stand')}
              </button>
              <button onClick={() => addStageObject('chair')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                💺 {t('sidebar.objChair', 'Chair')}
              </button>
              <button onClick={() => addStageObject('table')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                🟫 {t('sidebar.objTable', 'Table')}
              </button>
              <button onClick={() => addStageObject('lectern')} className="flex items-center justify-center gap-1 px-1 py-1 bg-bc-accent/20 text-bc-accent text-[10px] hover:bg-bc-accent/30">
                🎙️ {t('sidebar.objLectern', 'Lectern')}
              </button>
              <button onClick={() => addStageObject('schneetiger')} className="col-span-3 flex items-center justify-center gap-1 px-1 py-1 bg-sky-500/20 text-sky-300 text-[10px] hover:bg-sky-500/30">
                🐅 {t('sidebar.objSnowTiger', 'Snow tiger')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Camera list — nicht klappbar, aber gleicher Header-Stil wie das Akkordeon */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="flex items-center gap-2.5" style={{ minHeight: '44px', padding: '10px 14px' }}>
          <span className="grid h-7 w-7 shrink-0 place-items-center bg-bc-accent/20 text-bc-accent">
            <FiVideo size={14} />
          </span>
          <span className="text-[13.5px] font-semibold text-bc-text-bright">{t('sidebar.cameras.title', 'Cameras')}</span>
          <span
            style={{ padding: '2px 7px' }}
            className="bg-bc-dark text-[10.5px] font-semibold tabular-nums text-bc-text"
          >
            {cameras.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleShowAllFov}
              style={{ padding: '6px' }}
              className="hover:bg-bc-border text-bc-muted hover:text-bc-text-bright"
              title={showAllFov ? t('sidebar.hideAllFov', 'Hide all FOV') : t('sidebar.showAllFov', 'Show all FOV')}
              aria-label={showAllFov ? t('sidebar.hideAllFov', 'Hide all FOV') : t('sidebar.showAllFov', 'Show all FOV')}
            >
              {showAllFov ? <FiEye size={15} /> : <FiEyeOff size={15} />}
            </button>
            {/* Das Schaerfeband (#141) — neben dem Sichtkegel, weil es dieselbe
                Flaeche im Grundriss betrifft. Getrennt schaltbar, weil es die
                andere Frage beantwortet: der Kegel sagt, was im Bild ist, das
                Band, was davon scharf ist. */}
            <button
              onClick={toggleShowDof}
              style={{ padding: '6px' }}
              className={showDof
                ? 'bg-bc-border text-bc-text-bright'
                : 'hover:bg-bc-border text-bc-muted hover:text-bc-text-bright'}
              title={showDof
                ? t('sidebar.hideDof', 'Hide depth of field')
                : t('sidebar.showDof', 'Show depth of field')}
              aria-label={showDof
                ? t('sidebar.hideDof', 'Hide depth of field')
                : t('sidebar.showDof', 'Show depth of field')}
            >
              <FiTarget size={15} />
            </button>
            <button
              onClick={() => addCamera()}
              style={{ padding: '5px 10px' }}
              className="flex items-center gap-1 bg-bc-accent text-bc-accent-text text-xs font-semibold hover:bg-bc-accent/80"
            >
              <FiPlus size={12} /> {t('sidebar.add', 'Add')}
            </button>
          </div>
        </div>

        <div style={{ padding: '0 14px 12px' }}>
          {cameras.map((cam) => (
            <CameraCard
              key={cam.id}
              camId={cam.id}
              expanded={cam.id === selectedCameraId && collapsedCameraId !== cam.id}
              toggleOpen={toggleCameraCard}
            />
          ))}

          {cameras.length === 0 && (
            <p className="text-bc-dim text-xs text-center mt-8">{t('sidebar.noCameras', 'No cameras yet. Add one with "Add" or load a template.')}</p>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t border-bc-border">
        <button
          onClick={() => {
            if (window.confirm(t('sidebar.clearConfirm', 'Are you sure you want to clear everything? This cannot be undone.'))) clearAll();
          }}
          className="w-full py-1.5 bg-bc-red/20 text-bc-red text-xs font-semibold hover:bg-bc-red/30"
        >
          {t('sidebar.clearAll', 'Clear All')}
        </button>
      </div>
    </div>
  );
}
