import { useStore, APP_VERSION, buildProjectFile, defaultProjectFileName } from '../../store/useStore';
import { FiCamera, FiBox, FiSliders, FiSave, FiUpload, FiDownload, FiX, FiCheck, FiMapPin, FiPlus, FiSettings } from 'react-icons/fi';
import { toVenueExchange, parseVenueExchange } from '../../utils/venueExchange';
import { cameraListOf, buildAvPlanExport } from '../../store/avplanExport';
import { parseAvPlan } from '../../utils/avplan';
import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { ExportMode } from '../Export/ExportPanel';
import type { EditMode } from '../../types';
import { useTranslation, format } from '../../i18n';
import ZoomControl from './ZoomControl';
import { Menu, MenuItem, MenuSeparator, MenuHeading } from './Menu';
import SettingsDialog from '../Settings/SettingsDialog';
import { OPEN_SETTINGS_EVENT, type SettingsSection } from '../Settings/openSettings';
import { TABS, type TabDef } from './tabs';

// Die Uebersetzungsfunktion, wie sie `useTranslation` liefert.
type TFn = (key: string, en: string) => string;
import { buildShiftReport, printShiftReport } from '../../utils/shiftReport';
import { shiftReportFingerprint } from '../../utils/documentContent';
import { buildStamp } from '../../utils/documentStamp';


// Edit-mode slider options (issue #43). Each mode locks everything except its
// own category in the 2D plan; "All" honours each object's manual lock flag.
const getEditModes = (t: TFn): { id: EditMode; label: string; title: string }[] => [
  { id: 'all', label: t('header.editMode.all', 'All'), title: t('header.editMode.all.title', 'Edit everything (respects per-object locks)') },
  { id: 'floorplan', label: t('header.editMode.floorplan', 'Floor Plan'), title: t('header.editMode.floorplan.title', 'Edit only the floor plan & walls') },
  { id: 'stage', label: t('header.editMode.stage', 'Stage'), title: t('header.editMode.stage.title', 'Edit only stages') },
  { id: 'objects', label: t('header.editMode.objects', 'Objects'), title: t('header.editMode.objects.title', 'Edit only objects & persons') },
  { id: 'cameras', label: t('header.editMode.cameras', 'Cameras'), title: t('header.editMode.cameras.title', 'Edit only cameras') },
];

type HeaderProps = {
  onSelectTab: (tabId: string) => void;
  onSetLayoutMode: (mode: 'focus' | 'grid') => void;
  onApplyPreset: (presetId: string) => void;
  onSaveLayoutPreset: (name: string) => void;
  onDeleteLayoutPreset: (presetId: string) => void;
  onDragNewPanel: (tabId: string, event: DragEvent) => void;
  layoutPresetOptions: { id: string; label: string }[];
  layoutMode: 'focus' | 'grid' | 'custom';
  /** Oeffnet den Lager-/Bestand-Dialog (projektuebergreifend). */
  onOpenInventory: () => void;
};

export default function Header({
  onSelectTab,
  onSetLayoutMode,
  onApplyPreset,
  onSaveLayoutPreset,
  onDeleteLayoutPreset,
  onDragNewPanel,
  layoutPresetOptions,
  layoutMode,
  onOpenInventory,
}: HeaderProps) {
  const { t } = useTranslation();
  // Die Reiter tragen ihren i18n-Schluessel in `tabs.ts`; hier wird er
  // eingeloest. Wer keinen hat, steht mit seinem Label fuer sich.
  const beschriftung = (tab: TabDef) => (tab.key ? t(tab.key, tab.label) : tab.label);
  const editModes = useMemo(() => getEditModes(t), [t]);
  const { venue, projectVersion, lastSavedVersion, saveProject, loadProject, newProject, editMode, setEditMode, avForeign, showForeign, toggleShowForeign } = useStore();
  const hasForeignLighting = !!(avForeign.lighting && Array.isArray((avForeign.lighting as { fixtures?: unknown }).fixtures) && (avForeign.lighting as { fixtures: unknown[] }).fixtures.length > 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const venueInputRef = useRef<HTMLInputElement>(null);
  const avplanInputRef = useRef<HTMLInputElement>(null);
  const unsaved = projectVersion !== lastSavedVersion;
  const [savePresetName, setSavePresetName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<SettingsSection | null>(null);
  useEffect(() => {
    const oeffnen = (e: Event) => setSettingsOpen((e as CustomEvent<SettingsSection>).detail ?? 'general');
    window.addEventListener(OPEN_SETTINGS_EVENT, oeffnen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, oeffnen);
  }, []);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // DIE VIER AUSSENKLICK-EFFEKTE SIND WEG. Preset-, Export-, Austausch- und
  // Edit-Modus-Klappe hatten jede ihren eigenen `useEffect` mit derselben
  // zwoelf Zeilen langen Mechanik - vier Abschriften einer Sache, und die
  // Escape-Taste schloss keine davon. Das kann jetzt `Menu` einmal.
  // Auto-focus the save input when shown
  useEffect(() => {
    if (showSaveInput) saveInputRef.current?.focus();
  }, [showSaveInput]);

  const handleSavePresetSubmit = useCallback(() => {
    if (!savePresetName.trim()) return;
    onSaveLayoutPreset(savePresetName.trim());
    setSavePresetName('');
    setShowSaveInput(false);
  }, [onSaveLayoutPreset, savePresetName]);

  const handleLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Speichern unter: der Vorschlag kommt aus DERSELBEN Funktion, die der
  // Store ohne Argument benutzt. Eine zweite Formel an dieser Stelle waere
  // die zweite Rechnung - der Vorschlag im Feld hiesse anders als die Datei,
  // die ein blosses Speichern ablegt.
  const handleSaveAs = useCallback(() => {
    const vorschlag = defaultProjectFileName(buildProjectFile(useStore.getState()));
    const name = window.prompt(t('header.saveAs.prompt', 'File name'), vorschlag);
    if (!name) return;
    saveProject(name);
  }, [saveProject, t]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await loadProject(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [loadProject]);

  // Bedarf 50 — das Uebergabe-Blatt. Der Stempel kommt aus DERSELBEN
  // Ableitung wie der Bericht (`shiftReportFingerprint`), sonst stempelt er
  // etwas anderes, als gedruckt wird — die Regel von ADR-004.
  const handlePrintShift = useCallback(() => {
    const s = useStore.getState();
    const bericht = buildShiftReport(s.cameras);
    const stamp = buildStamp({
      project: s.venue.name,
      current: shiftReportFingerprint(bericht),
      now: new Date(),
    });
    printShiftReport(bericht, s.venue.name, stamp);
  }, []);

  const handleExport = useCallback((mode: ExportMode = 'current') => {
    window.dispatchEvent(new CustomEvent('multicam-export', { detail: { mode } }));
  }, []);

  // ── Venue-Austausch: exportiert den geteilten Raum (Floor-Plan, Waende,
  // Stage, Personen) als neutrale .venue.json, die auch Light-Planner liest.
  const handleExportVenue = useCallback(() => {
    const s = useStore.getState();
    const ex = toVenueExchange({
      venue: s.venue, persons: s.persons, walls: s.walls, backgroundPlan: s.backgroundPlan,
      appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
      // ADR-005 — was MultiCam am eingelesenen Raum nicht modelliert, geht
      // unveraendert wieder mit hinaus.
      stageForeign: s.stageForeign,
      floorPlanForeign: s.floorPlanForeign,
      wallForeign: s.wallForeign,
      personForeign: s.personForeign,
    });
    const blob = new Blob([JSON.stringify(ex, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.venue.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.venue.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Exportiert die platzierten Kameras als camera-list fuer den Cable-Planner
  // (dort werden sie zu verkabelbaren Equipment-Nodes).
  const handleExportCameras = useCallback(() => {
    const s = useStore.getState();
    const ex = cameraListOf(s, new Date().toISOString());
    const blob = new Blob([JSON.stringify(ex, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.venue.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.cameras.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Gesamtprojekt (.avplan): verlustfrei. MultiCam bearbeitet den cameras-
  // Slot nativ und reicht lighting/cabling 1:1 durch.
  const handleExportAvplan = useCallback(() => {
    const s = useStore.getState();
    const avplan = buildAvPlanExport(s, new Date().toISOString());
    const blob = new Blob([JSON.stringify(avplan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.venue.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.avplan`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportAvplan = useCallback(() => {
    avplanInputRef.current?.click();
  }, []);

  const handleAvplanFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        useStore.getState().importAvPlan(parseAvPlan(await file.text()));
      } catch (err) {
        alert(format(t('header.import.avplanFailed', '.avplan import failed: {msg}'), { msg: err instanceof Error ? err.message : String(err) }));
      }
    }
    if (avplanInputRef.current) avplanInputRef.current.value = '';
  }, [t]);

  const handleImportVenue = useCallback(() => {
    venueInputRef.current?.click();
  }, []);

  const handleVenueFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const ex = parseVenueExchange(await file.text());
        useStore.getState().importVenueExchange(ex);
      } catch (err) {
        alert(format(t('header.import.venueFailed', 'Venue import failed: {msg}'), { msg: err instanceof Error ? err.message : String(err) }));
      }
    }
    if (venueInputRef.current) venueInputRef.current.value = '';
  }, [t]);

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────────
          Die Kopfzeile im Schnitt der Suite (ADR-007 Abschnitt 6):
          40 px hoch · Menues links · Einstellungen rechts aussen.

          NUTZER-AUFTRAG 2026-09-11: „Stelle sicher das in allen repos
          uebergreifend das Einstellungen Menue an der gleichen Stelle ist wie
          im Cable planner und das die obere Menueleiste gleich aufgebaut
          ist" — und, auf Rueckfrage: auch die Menue-INHALTE angleichen.

          WAS SICH GEAENDERT HAT. Vorher standen in dieser einen Zeile: der
          App-Name, vier Modul-Reiter, ein Layout-Umschalter, ein
          Edit-Modus-Menue, ein Preset-Menue, sechs lose Knoepfe (Speichern,
          Oeffnen, Lager, Austausch, Export) und der Zoom. Fuenf verschiedene
          Sorten Bedienung nebeneinander — der Nutzer musste raten, welches
          davon was tut, und auf schmalen Fenstern schob die linke Gruppe die
          rechte aus dem Bild.

          Jetzt: Menues (File · Edit · Tools · View · Help) links, die
          Modul-Reiter in einer EIGENEN Zeile darunter, die Einstellungen als
          letzter Bedienpunkt rechts. Die Reiter sind kein Menue — sie sind
          Modul-Navigation, in der Suite ist das die Rail links, hier eine
          Zeile fuer sich.

          DIE REIHENFOLGE IST DIE DES CABLE PLANNERS und keine Geschmacksfrage:
          `scripts/chrome-parity.mjs` in der Suite misst sie in allen Apps,
          `src/__tests__/kopfzeile.test.ts` in diesem Repo misst dieselbe
          Zusage schon vor dem Vendorieren.
          ───────────────────────────────────────────────────────────────── */}
      <header className="bc-topbar">
        <div className="flex min-w-0 shrink-0 items-center gap-2 text-bc-text-bright">
          <FiCamera size={20} className="shrink-0 text-bc-accent" />
          <span className="hidden text-sm font-bold sm:inline">MultiCam Planner</span>
          <span className="ml-2 hidden text-xs text-bc-muted lg:inline">— {venue.name}</span>
          {/* Minimal unsaved-changes indicator (no project-version counter). */}
          {unsaved && (
            <span
              className="ml-2 shrink-0 bg-bc-yellow/20 px-1.5 py-0.5 text-xs text-bc-yellow"
              title={t('header.unsaved.title', 'There are unsaved changes — use Save to write a .mcplan file')}
            >
              {t('header.unsaved', '● unsaved')}
            </span>
          )}
        </div>

        {/* Die fuenf Menues in EINER Gruppe (B-77) — sie ist es, die auf
            schmalen Fenstern rollt, und nicht die ganze Kopfzeile. Gemessen
            bei 390 px: das Help-Menue endete bei 419 px, die Einstellungen
            bei 463 px. Beides lag ausserhalb des Fensters und war auf einem
            Telefon nicht erreichbar. Die Gruppe darf rollen, weil die
            Klappen seit B-77 am Fenster haengen und nicht mehr in ihr. */}
        <div className="bc-menubar">
        {/* ── File ── */}
        <Menu label={t('app.menu.file', 'File')}>
          {(close) => (
            <>
              <MenuItem
                icon={<FiPlus size={13} />}
                onClick={() => {
                  close();
                  // DIE VERNEINUNG IST DER PUNKT: OK fuehrt aus, Abbrechen
                  // laesst alles stehen. Ein Bestaetigungsdialog, dessen
                  // Abbruch die Tat ausfuehrt, ist schlimmer als gar keiner.
                  if (!window.confirm(t('header.new.confirm', 'New project — the current one is replaced. Continue?'))) return;
                  newProject();
                }}
                note={t('header.new.note', 'Empty venue, no cameras')}
              >
                {t('header.new', 'New project')}
              </MenuItem>
              <MenuItem icon={<FiUpload size={13} />} onClick={() => { close(); handleLoad(); }}>
                {t('header.open', 'Open…')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<FiSave size={13} />} onClick={() => { close(); saveProject(); }}>
                {t('header.save', 'Save')}
              </MenuItem>
              <MenuItem
                icon={<FiSave size={13} />}
                onClick={() => { close(); handleSaveAs(); }}
                note={t('header.saveAs.note', 'Asks for the file name')}
              >
                {t('header.saveAs', 'Save as…')}
              </MenuItem>

              <MenuSeparator />
              <MenuHeading>{t('header.exchange.avplanSection', 'Full project (.avplan)')}</MenuHeading>
              <MenuItem icon={<FiBox size={13} />} onClick={() => { close(); handleImportAvplan(); }}>
                {t('header.avplanImport', 'Import combined project…')}
              </MenuItem>
              <MenuItem icon={<FiBox size={13} />} onClick={() => { close(); handleExportAvplan(); }}>
                {t('header.avplanExport', 'Export full project')}
              </MenuItem>

              <MenuHeading>{t('header.exchange.venueSection', 'Venue (.venue.json)')}</MenuHeading>
              <MenuItem icon={<FiMapPin size={13} />} onClick={() => { close(); handleImportVenue(); }}>
                {t('header.venueImport', 'Import venue…')}
              </MenuItem>
              <MenuItem icon={<FiMapPin size={13} />} onClick={() => { close(); handleExportVenue(); }}>
                {t('header.venueExport', 'Export venue')}
              </MenuItem>

              <MenuHeading>{t('header.exchange.cableSection', 'Cable Planner')}</MenuHeading>
              <MenuItem icon={<FiCamera size={13} />} onClick={() => { close(); handleExportCameras(); }}>
                {t('header.camerasExport', 'Export cameras → Cable Planner')}
              </MenuItem>
              {hasForeignLighting && (
                <MenuItem
                  icon={<FiSliders size={13} />}
                  checked={showForeign}
                  onClick={() => { close(); toggleShowForeign(); }}
                >
                  {showForeign ? t('header.foreignLamps.hide', 'Hide foreign lamps') : t('header.foreignLamps.show', 'Show foreign lamps')}
                </MenuItem>
              )}

              <MenuSeparator />
              <MenuHeading>{t('header.export', 'Export')}</MenuHeading>
              <MenuItem
                icon={<FiDownload size={13} />}
                onClick={() => { close(); handleExport('current'); }}
                note={t('header.export.current.desc', 'Selected camera at current focal length')}
              >
                {t('header.export.current', 'Current camera')}
              </MenuItem>
              <MenuItem
                icon={<FiDownload size={13} />}
                onClick={() => { close(); handleExport('all'); }}
                note={t('header.export.all.desc', 'One PNG per camera at its current focal length')}
              >
                {t('header.export.all', 'All cameras')}
              </MenuItem>
              <MenuItem
                icon={<FiDownload size={13} />}
                onClick={() => { close(); handleExport('widetele'); }}
                note={t('header.export.widetele.desc', 'Selected camera at lens min and max focal length')}
              >
                {t('header.export.widetele', 'Current — wide + tele')}
              </MenuItem>
              <MenuItem
                icon={<FiDownload size={13} />}
                onClick={() => { close(); handleExport('all-widetele'); }}
                note={t('header.export.allWidetele.desc', 'Two PNGs per camera (lens min and max)')}
              >
                {t('header.export.allWidetele', 'All — wide + tele')}
              </MenuItem>
              {/* Bedarf 50 — die Schicht-Uebergabe. Sie steht hier und nicht
                  bei den Kamerakarten, weil sie kein Bild ist: ein Blatt ueber
                  ALLE Positionen, das jemand ausdruckt und weiterreicht. */}
              <MenuItem
                icon={<FiDownload size={13} />}
                onClick={() => { close(); handlePrintShift(); }}
                note={t('header.export.shift.desc', 'Paint, panel, faults and findings per position')}
              >
                {t('header.export.shift', 'Print shift handover')}
              </MenuItem>
            </>
          )}
        </Menu>

        {/* ── Edit ──
            Kein Rueckgaengig: diese App fuehrt keine Historie. Was „Edit"
            hier hat, ist der Bearbeitungs-Modus (#43) — er sperrt alles ausser
            der gewaehlten Kategorie. Ein ausgegrautes „Undo" waere ein
            PLACEHOLDER; wer die Historie baut, traegt es hier ein. */}
        <Menu label={t('app.menu.edit', 'Edit')}>
          {(close) => (
            <>
              <MenuHeading>{t('header.editMode', 'Edit mode')}</MenuHeading>
              {editModes.map((m) => (
                <MenuItem
                  key={m.id}
                  checked={editMode === m.id}
                  onClick={() => { close(); setEditMode(m.id); }}
                  note={m.title}
                >
                  {m.label}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        {/* ── Tools ── */}
        <Menu label={t('app.menu.tools', 'Tools')}>
          {(close) => (
            <MenuItem
              icon={<FiBox size={13} />}
              onClick={() => { close(); onOpenInventory(); }}
              note={t('header.inventory.note', 'Cross-project stock: QR/barcode, cases, shared across apps')}
            >
              {t('header.inventory', 'Inventory / stock…')}
            </MenuItem>
          )}
        </Menu>

        {/* ── View ── */}
        <Menu label={t('app.menu.view', 'View')}>
          {(close) => (
            <>
              <MenuHeading>{t('header.layout', 'Layout')}</MenuHeading>
              <MenuItem
                checked={layoutMode === 'focus'}
                onClick={() => { close(); onSetLayoutMode('focus'); }}
                note={t('header.layout.focus.title', 'Show a single focused panel')}
              >
                {t('header.layout.focus', 'Focus')}
              </MenuItem>
              <MenuItem
                checked={layoutMode === 'grid'}
                onClick={() => { close(); onSetLayoutMode('grid'); }}
                note={t('header.layout.grid.title', 'Show the grid workspace')}
              >
                {t('header.layout.grid', 'Grid')}
              </MenuItem>

              <MenuSeparator />
              <MenuHeading>{t('header.presets.builtIn', 'Built-in')}</MenuHeading>
              <MenuItem onClick={() => { close(); onApplyPreset('focus'); }}>
                {t('header.presets.focus', 'Focus')}
              </MenuItem>
              <MenuItem onClick={() => { close(); onApplyPreset('grid'); }}>
                {t('header.presets.defaultGrid', 'Default Grid')}
              </MenuItem>

              {layoutPresetOptions.length > 0 && (
                <>
                  <MenuHeading>{t('header.presets.saved', 'Saved')}</MenuHeading>
                  {layoutPresetOptions.map((preset) => (
                    <div key={preset.id} className="group flex items-center">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { close(); onApplyPreset(preset.id); }}
                        style={{ padding: '6px 12px' }}
                        className="min-w-0 flex-1 truncate text-left text-xs text-bc-text transition-colors hover:bg-bc-panel-raised hover:text-bc-text-bright"
                      >
                        {preset.label}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDeleteLayoutPreset(preset.id); }}
                        style={{ padding: '6px 10px' }}
                        className="text-xs text-bc-muted opacity-0 transition-opacity hover:text-bc-red group-hover:opacity-100"
                        title={format(t('header.presets.deleteTitle', 'Delete preset "{label}"'), { label: preset.label })}
                      >
                        <FiX size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {layoutMode === 'grid' && (
                <>
                  <MenuSeparator />
                  {!showSaveInput ? (
                    <MenuItem icon={<FiSave size={13} />} onClick={() => setShowSaveInput(true)}>
                      {t('header.presets.saveCurrent', 'Save current grid as preset…')}
                    </MenuItem>
                  ) : (
                    <form
                      className="flex items-center gap-1"
                      style={{ padding: '6px 12px' }}
                      onSubmit={(e) => { e.preventDefault(); handleSavePresetSubmit(); close(); }}
                    >
                      <input
                        ref={saveInputRef}
                        type="text"
                        value={savePresetName}
                        onChange={(e) => setSavePresetName(e.target.value)}
                        placeholder={t('header.presets.namePlaceholder', 'Preset name…')}
                        style={{ padding: '4px 8px' }}
                        className="min-w-0 flex-1 border border-bc-border bg-bc-sunken text-xs text-bc-text outline-none placeholder:text-bc-muted focus:border-bc-accent"
                      />
                      <button
                        type="submit"
                        disabled={!savePresetName.trim()}
                        className="text-bc-muted transition-colors hover:text-bc-accent disabled:cursor-not-allowed disabled:opacity-30"
                        title={t('header.presets.save', 'Save preset')}
                      >
                        <FiCheck size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowSaveInput(false); setSavePresetName(''); }}
                        className="text-bc-muted transition-colors hover:text-bc-red"
                        title={t('header.presets.cancel', 'Cancel')}
                      >
                        <FiX size={14} />
                      </button>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </Menu>

        {/* ── Help ── */}
        <Menu label={t('app.menu.help', 'Help')}>
          {(close) => (
            <MenuItem onClick={() => { close(); setSettingsOpen('general'); }}>
              {t('header.about', 'About MultiCam Planner…')}
            </MenuItem>
          )}
        </Menu>
        </div>

        {/* Rechts aussen, als LETZTER Bedienpunkt der Zeile — dieselbe Stelle
            wie im Cable Planner. Das Wort erst ab breiten Fenstern, darunter
            nur das Zeichen, damit die Zeile auf schmalen nicht bricht. */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <ZoomControl />
          <button
            type="button"
            onClick={() => setSettingsOpen('general')}
            style={{ padding: '4px 8px' }}
            className="flex items-center gap-1 text-xs text-bc-text transition-colors hover:bg-bc-panel-raised hover:text-bc-text-bright"
            title={t('settings.title', 'Settings')}
          >
            <FiSettings size={14} />
            <span className="hidden lg:inline">{t('settings.title', 'Settings')}</span>
          </button>
        </div>

        <input ref={fileInputRef} type="file" accept=".mcplan,.json" className="hidden" onChange={handleFileChange} />
        <input ref={venueInputRef} type="file" accept=".venue.json,.json" className="hidden" onChange={handleVenueFileChange} />
        <input ref={avplanInputRef} type="file" accept=".avplan,.json" className="hidden" onChange={handleAvplanFileChange} />
      </header>

      {/* Die Modul-Reiter — eine EIGENE Zeile, nicht die Menueleiste. Sie
          bleiben ziehbar: im Grid-Modus zieht man einen Reiter in die
          Flaeche und bekommt dort ein Panel. */}
      <nav className="bc-tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            draggable={layoutMode === 'grid'}
            onDragStart={(e) => {
              onDragNewPanel(tab.id, e.nativeEvent);
            }}
            className={`flex items-center gap-1.5 border border-transparent px-2 py-1 text-xs font-medium text-bc-text transition-colors hover:border-bc-border hover:bg-bc-panel-raised hover:text-bc-text-bright sm:px-3 ${
              layoutMode === 'grid' ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            title={layoutMode === 'grid' ? format(t('header.tab.dragTitle', 'Drag {label} into the grid'), { label: beschriftung(tab) }) : format(t('header.tab.focusTitle', '{label} in focus view'), { label: beschriftung(tab) })}
          >
            <tab.Icon size={16} />
            <span>{beschriftung(tab)}</span>
          </button>
        ))}
        <span className="ml-auto shrink-0 text-xs text-bc-muted">v{APP_VERSION}</span>
      </nav>

      {settingsOpen && <SettingsDialog initialSection={settingsOpen} onClose={() => setSettingsOpen(null)} />}
    </>
  );
}
