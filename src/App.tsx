import { useStore } from './store/useStore';
import Header from './components/Layout/Header';
import { TABS } from './components/Layout/tabs';
import StartupAssistant from './components/Layout/StartupAssistant';
import StatusBar from './components/Layout/StatusBar';
import CommandPalette, { type Command } from './components/Layout/CommandPalette';
import Sidebar from './components/Sidebar/Sidebar';
import Venue2D from './components/Venue2D/Venue2D';
import Venue3D from './components/Venue3D/Venue3D';
import CameraPreview from './components/Preview/CameraPreview';
import Calculator from './components/Sidebar/Calculator';
import ShotlistPanel from './components/Shotlist/ShotlistPanel';
import RigControlPanel from './components/RigControl/RigControlPanel';
import TemplateSelector from './components/Templates/TemplateSelector';
import ExportPanel from './components/Export/ExportPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { getExportRegistry } from './store/exportRegistry';
import { loadJSON, saveJSON } from './utils/storage';
import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiMinimize2, FiMinus, FiX } from 'react-icons/fi';
import { InventoryDialog } from './inventory/InventoryDialog';
import { Layout, Model, TabNode, Actions } from 'flexlayout-react';
import type { IJsonModel, ITabSetRenderValues, TabSetNode, BorderNode, ILayoutApi } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import { useTranslation, format } from './i18n';

type TFn = (key: string, en: string) => string;

const LAYOUT_STORAGE_KEY = 'multicam-layout';
const LAYOUT_VERSION_KEY = 'multicam-layout-version';
const LAYOUT_PRESETS_KEY = 'multicam-layout-presets';
const CURRENT_LAYOUT_VERSION = 4;

type LayoutMode = 'focus' | 'grid' | 'custom';

type LayoutPresetOption = { id: string; label: string };

function getSelectedIndexForTab(tabId: string) {
  switch (tabId) {
    case 'tab-3d':
      return 1;
    case 'tab-preview':
      return 2;
    case 'tab-calc':
      return 3;
    case 'tab-shotlist':
      return 4;
    case 'tab-rig':
      return 5;
    case 'tab-2d':
    default:
      return 0;
  }
}

function createFocusLayoutJson(t: TFn, selectedTabId = 'tab-2d'): IJsonModel {
  return {
    global: {
      tabEnableClose: false,
      tabEnableRenderOnDemand: false,
      tabSetEnableMaximize: false,
    },
    layout: {
      type: 'row',
      weight: 100,
      children: [
        {
          type: 'tabset',
          id: 'ts-main',
          selected: getSelectedIndexForTab(selectedTabId),
          weight: 100,
          children: [
            { type: 'tab', name: t('header.tab.2dPlan', '2D Plan'), component: 'venue2d', id: 'tab-2d' },
            { type: 'tab', name: t('header.tab.3dView', '3D View'), component: 'venue3d', id: 'tab-3d' },
            { type: 'tab', name: t('header.tab.preview', 'Preview'), component: 'preview', id: 'tab-preview' },
            { type: 'tab', name: t('header.tab.calculator', 'Calculator'), component: 'calculator', id: 'tab-calc' },
            { type: 'tab', name: 'Shotlist', component: 'shotlist', id: 'tab-shotlist' },
            // Kein eigener Reiter mehr fuer die Rig-Steuerung (Nutzer-Meldung
            // 2026-09-09). Sie sitzt jetzt UNTER dem Preview, im selben
            // Bereich: das Pult faehrt die Kamera, das Preview zeigt, was
            // dabei herauskommt — nebeneinander zu sehen ist der ganze Sinn.
            // Als Reiter war beides nie gleichzeitig sichtbar.
          ],
        },
      ],
    },
  };
}

function createGridLayoutJson(t: TFn): IJsonModel {
  return {
    global: {
      tabEnableClose: false,
      tabEnableRenderOnDemand: false,
      tabSetEnableMaximize: false,
    },
    layout: {
      type: 'row',
      weight: 100,
      children: [
        {
          type: 'row',
          weight: 60,
          children: [
            {
              type: 'tabset',
              weight: 62,
              id: 'ts-left-2d',
              selected: 0,
              children: [
                { type: 'tab', name: t('header.tab.2dPlan', '2D Plan'), component: 'venue2d', id: 'tab-2d' },
              ],
            },
            {
              type: 'tabset',
              weight: 38,
              id: 'ts-left-3d',
              selected: 0,
              children: [
                { type: 'tab', name: t('header.tab.3dView', '3D View'), component: 'venue3d', id: 'tab-3d' },
              ],
            },
          ],
        },
        {
          type: 'row',
          weight: 40,
          children: [
            {
              type: 'tabset',
              weight: 60,
              id: 'ts-right-top',
              selected: 0,
              children: [
                { type: 'tab', name: t('header.tab.preview', 'Preview'), component: 'preview', id: 'tab-preview' },
              ],
            },
            {
              type: 'tabset',
              weight: 40,
              id: 'ts-right-bottom',
              selected: 0,
              children: [
                { type: 'tab', name: t('header.tab.calculator', 'Calculator'), component: 'calculator', id: 'tab-calc' },
              ],
            },
          ],
        },
      ],
    },
  };
}

function loadUserLayoutPresets(): Record<string, IJsonModel> {
  return loadJSON<Record<string, IJsonModel>>(LAYOUT_PRESETS_KEY, {});
}

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-full text-bc-dim">
      <div className="animate-pulse">{t('header.panel.loading3d', 'Loading 3D View...')}</div>
    </div>
  );
}

/** Persist layout model across re-renders but not component remounts */
function useLayoutModel(t: TFn) {
  return useState(() => {
    try {
      const savedVersion = Number(localStorage.getItem(LAYOUT_VERSION_KEY) ?? '0');
      if (savedVersion === CURRENT_LAYOUT_VERSION) {
        const saved = loadJSON<IJsonModel | null>(LAYOUT_STORAGE_KEY, null);
        if (saved) return Model.fromJson(saved);
      }
    } catch { /* ignore corrupt data */ }
    return Model.fromJson(createFocusLayoutJson(t));
  });
}

export default function App() {
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed } = useStore();
  const idRepairCount = useStore((state) => state.lastIdRepair);
  const dismissIdRepair = useStore((state) => state.dismissIdRepair);
  const libraryMerge = useStore((state) => state.lastLibraryMerge);
  const dismissLibraryMerge = useStore((state) => state.dismissLibraryMerge);
  const [sidebarTab, setSidebarTab] = useState<'cameras' | 'templates'>('cameras');
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [model, setModel] = useLayoutModel(t);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('focus');
  const [focusTabId, setFocusTabId] = useState('tab-2d');
  const [userLayoutPresets, setUserLayoutPresets] = useState<Record<string, IJsonModel>>(() => loadUserLayoutPresets());
  const layoutRef = useRef<ILayoutApi>(null);

  const persistLayout = useCallback((nextModel: Model) => {
    saveJSON(LAYOUT_STORAGE_KEY, nextModel.toJson());
    saveJSON(LAYOUT_VERSION_KEY, CURRENT_LAYOUT_VERSION);
  }, []);

  const applyLayoutJson = useCallback((json: IJsonModel) => {
    const nextModel = Model.fromJson(json);
    setModel(nextModel);
    persistLayout(nextModel);
    setLayoutEpoch((current) => current + 1);
  }, [persistLayout]);

  // Save layout to localStorage on change
  const handleModelChange = useCallback(() => {
    persistLayout(model);
  }, [model, persistLayout]);

  const handleSelectTab = useCallback((tabId: string) => {
    setFocusTabId(tabId);
    setLayoutMode('focus');
    applyLayoutJson(createFocusLayoutJson(t, tabId));
  }, [applyLayoutJson, t]);

  const handleSetLayoutMode = useCallback((nextMode: 'focus' | 'grid') => {
    if (nextMode === 'focus') {
      setLayoutMode('focus');
      applyLayoutJson(createFocusLayoutJson(t, focusTabId));
      return;
    }

    setLayoutMode('grid');
    applyLayoutJson(createGridLayoutJson(t));
  }, [applyLayoutJson, focusTabId, t]);

  // ADR-007 Abschnitt 6: die Kommandopalette (Strg/Cmd + K). Sie erfindet
  // nichts — jeder Eintrag ruft denselben Handler wie der Knopf in der
  // Kopfzeile. Deshalb steht die Liste HIER und nicht in der Palette: die
  // Handler liegen ohnehin an dieser Stelle, und eine zweite Liste woanders
  // waere die zweite Bedienoberflaeche, die still auseinanderlaeuft.
  const commands = useMemo<Command[]>(() => [
    ...TABS.map((tab) => ({
      id: `view:${tab.id}`,
      group: 'View',
      label: tab.label,
      run: () => handleSelectTab(tab.id),
    })),
    { id: 'layout:focus', group: 'Layout', label: 'Focus layout', run: () => handleSetLayoutMode('focus') },
    { id: 'layout:grid', group: 'Layout', label: 'Grid layout', run: () => handleSetLayoutMode('grid') },
    { id: 'tools:inventory', group: 'Tools', label: 'Inventory', run: () => setInventoryOpen(true) },
  ], [handleSelectTab, handleSetLayoutMode]);

  const handleApplyPreset = useCallback((presetId: string) => {
    if (presetId === 'focus') {
      setLayoutMode('focus');
      applyLayoutJson(createFocusLayoutJson(t, focusTabId));
      return;
    }
    if (presetId === 'grid') {
      setLayoutMode('grid');
      applyLayoutJson(createGridLayoutJson(t));
      return;
    }
    const userPreset = userLayoutPresets[presetId];
    if (userPreset) {
      setLayoutMode('custom');
      applyLayoutJson(userPreset);
    }
  }, [applyLayoutJson, focusTabId, userLayoutPresets, t]);

  const handleSaveLayoutPreset = useCallback((name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const nextPresets = {
      ...userLayoutPresets,
      [trimmedName]: model.toJson(),
    };

    setUserLayoutPresets(nextPresets);
    saveJSON(LAYOUT_PRESETS_KEY, nextPresets);
  }, [model, userLayoutPresets]);

  const handleDeleteLayoutPreset = useCallback((presetId: string) => {
    const nextPresets = { ...userLayoutPresets };
    delete nextPresets[presetId];
    setUserLayoutPresets(nextPresets);
    saveJSON(LAYOUT_PRESETS_KEY, nextPresets);
  }, [userLayoutPresets]);


  const handleMinimizeToFocus = useCallback((tabId: string) => {
    setFocusTabId(tabId);
    setLayoutMode('focus');
    applyLayoutJson(createFocusLayoutJson(t, tabId));
  }, [applyLayoutJson, t]);

  const TAB_CONFIGS: Record<string, { component: string; name: string }> = {
    'tab-2d': { component: 'venue2d', name: t('header.tab.2dPlan', '2D Plan') },
    'tab-3d': { component: 'venue3d', name: t('header.tab.3dView', '3D View') },
    'tab-preview': { component: 'preview', name: t('header.tab.preview', 'Preview') },
    'tab-calc': { component: 'calculator', name: t('header.tab.calculator', 'Calculator') },
    'tab-shotlist': { component: 'shotlist', name: 'Shotlist' },
    // BLEIBT STEHEN, obwohl kein neues Layout den Reiter mehr anlegt: wer die
    // App schon benutzt hat, hat `tab-rig` in seinem gespeicherten Layout
    // liegen. Ohne die Zuordnung kaeme dort „Unknown panel" statt eines
    // Bedienfelds. Ein alter Reiter, der noch funktioniert, ist harmlos; ein
    // alter Reiter, der ins Leere zeigt, ist ein Fehlerbericht.
    'tab-rig': { component: 'rigcontrol', name: 'Rig-Steuerung' },
  };

  const handleDragNewPanel = useCallback((tabId: string, event: DragEvent) => {
    const config = TAB_CONFIGS[tabId];
    if (!config || !layoutRef.current) return;
    // Check if tab already exists in the model – if so, just select it
    try {
      const existing = model.getNodeById(tabId);
      if (existing) {
        model.doAction(Actions.selectTab(tabId));
        return;
      }
    } catch { /* node not found, proceed with drag */ }
    layoutRef.current.addTabWithDragAndDrop(event, {
      component: config.component,
      name: config.name,
      id: tabId,
    });
  }, [model]);

  const handleRenderTabSet = useCallback((node: TabSetNode | BorderNode, renderValues: ITabSetRenderValues) => {
    if (node.getType() !== 'tabset') return;
    if (layoutMode !== 'grid') return;

    const tabSetNode = node as TabSetNode;
    const selectedNode = tabSetNode.getSelectedNode();
    const isMaximized = tabSetNode.isMaximized();

    const selectedTab = selectedNode && selectedNode.getType() === 'tab' ? selectedNode as TabNode : null;

    renderValues.leading = selectedTab
      ? <div className="panel-title-label">{selectedTab.getName()}</div>
      : null;

    if (selectedTab) {
      renderValues.stickyButtons.push(
        <button
          key={`${tabSetNode.getId()}-minimize`}
          type="button"
          className="panel-toolbar-button"
          title={t('header.panel.minimize', 'Minimize this panel into focus view')}
          onClick={(event) => {
            event.stopPropagation();
            handleMinimizeToFocus(selectedTab.getId());
          }}
        >
          <FiMinus size={13} />
        </button>,
      );
    }

    renderValues.stickyButtons.push(
      <button
        key={`${tabSetNode.getId()}-maximize`}
        type="button"
        className="panel-toolbar-button"
        title={isMaximized ? t('header.panel.restore', 'Restore panel') : t('header.panel.fullscreen', 'Fullscreen panel')}
        onClick={(event) => {
          event.stopPropagation();
          model.doAction(Actions.maximizeToggle(tabSetNode.getId()));
        }}
      >
        {isMaximized ? <FiMinimize2 size={13} /> : <FiMaximize2 size={13} />}
      </button>,
    );

    if (selectedNode && selectedNode.getType() === 'tab') {
      renderValues.stickyButtons.push(
        <button
          key={`${tabSetNode.getId()}-close`}
          type="button"
          className="panel-toolbar-button panel-toolbar-button-danger"
          title={t('header.panel.close', 'Close current panel')}
          onClick={(event) => {
            event.stopPropagation();
            model.doAction(Actions.deleteTab(selectedNode.getId()));
          }}
        >
          <FiX size={13} />
        </button>,
      );
    }
  }, [handleMinimizeToFocus, layoutMode, model, t]);

  const layoutPresetOptions: LayoutPresetOption[] = Object.keys(userLayoutPresets)
    .sort((left, right) => left.localeCompare(right))
    .map((presetName) => ({
      id: presetName,
      label: presetName,
    }));

  // ── Factory: renders panel content for each tab ──
  const factory = useCallback((node: TabNode) => {
    const component = node.getComponent();
    switch (component) {
      case 'venue2d':
        return <Venue2D />;
      case 'venue3d':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <div data-venue3d className="w-full h-full">
              <Venue3D />
            </div>
          </Suspense>
        );
      case 'preview':
        return <CameraPreview undocked={false} onUndock={() => {}} />;
      case 'calculator':
        return <Calculator />;
      case 'shotlist':
        return <ShotlistPanel />;
      case 'rigcontrol':
        return <RigControlPanel />;
      default:
        return <div className="p-4 text-bc-dim">{format(t('header.panel.unknown', 'Unknown panel: {component}'), { component: component ?? '' })}</div>;
    }
  }, [t]);

  // ── Responsive: auto-collapse sidebar on small screens ──
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => { if (e.matches) setSidebarCollapsed(true); };
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setSidebarCollapsed]);

  useEffect(() => {
    const registry = getExportRegistry();
    registry.prepareForExport = async () => {
      const previousMode = layoutMode;
      const previousFocusTab = focusTabId;
      const previousModelJson = model.toJson();
      if (previousMode !== 'grid') {
        applyLayoutJson(createGridLayoutJson(t));
        setLayoutMode('grid');
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setTimeout(resolve, 700);
          }));
        });
      }
      return {
        restore: () => {
          if (previousMode === 'focus') {
            setLayoutMode('focus');
            setFocusTabId(previousFocusTab);
            applyLayoutJson(createFocusLayoutJson(t, previousFocusTab));
          } else if (previousMode === 'custom') {
            setLayoutMode('custom');
            applyLayoutJson(previousModelJson);
          }
        },
      };
    };
    return () => { registry.prepareForExport = null; };
  }, [applyLayoutJson, focusTabId, layoutMode, model, t]);

  return (
    <ErrorBoundary>
    <div className="h-screen flex flex-col bg-bc-dark text-bc-text">
      {/* ADR-005, Regel 3 — beim Laden reparierte doppelte Ids werden gesagt.
          `dedupeIds` zaehlte sie schon, nur las es niemand: Shots, Takes und
          Presets haengen an der Kamera-Id, der Fokus-Lock an der Personen-Id.
          Wer eine neue Id bekommt, verliert diese Verweise an das erste Objekt
          mit der alten. */}
      {idRepairCount !== null && (
        <div
          role="status"
          className="flex items-start gap-3 border-b border-amber-600/60 bg-amber-950/60 px-4 py-2 text-sm text-amber-100"
        >
          <div className="flex-1">
            <strong className="font-semibold">
              {/* Englisch ist hier die QUELLSPRACHE (siehe i18n/index.ts) — der
                  deutsche Text gehoert ins de-Teildict, nicht hierhin. Stand er
                  an dieser Stelle, bekam ein englischer Nutzer Deutsch. */}
              {t('load.idRepair.title', '{count} duplicate id(s) in the project file repaired.').replace(
                '{count}',
                String(idRepairCount),
              )}
            </strong>{' '}
            {t(
              'load.idRepair.hint',
              'The affected objects were given a new id. References to them — shots, takes, presets and focus locks — now point at the first object carrying the old id and need checking.',
            )}
          </div>
          <button
            type="button"
            onClick={dismissIdRepair}
            className="bg-amber-800/60 px-2 py-0.5 text-xs hover:bg-amber-700/60"
          >
            {t('common.ok', 'OK')}
          </button>
        </div>
      )}
      {/* cable-planner#917 — was die Projektdatei an eigenen Kameras/Optiken
          mitbrachte und NICHT uebernommen wurde. Bei gleicher Id mit anderem
          Inhalt gilt der eigene Eintrag; das Projekt rechnet dann mit ihm,
          und das muss man wissen, statt es an abweichenden Bildwinkeln zu
          bemerken. */}
      {libraryMerge !== null && (
        <div
          role="status"
          className="flex items-start gap-3 border-b border-bc-yellow bg-bc-panel px-4 py-2 text-sm text-bc-text"
        >
          <div className="flex-1 space-y-0.5">
            {libraryMerge.conflicts.length > 0 && (
              <div>
                <strong className="font-semibold">
                  {format(
                    t('load.libraryConflict.title', '{count} custom camera(s)/lens(es) from the project were not taken over.'),
                    { count: libraryMerge.conflicts.length },
                  )}
                </strong>{' '}
                {format(
                  t('load.libraryConflict.hint', 'This library already holds an entry with the same id and different data. The local one was kept, and the project now calculates with it: {names}'),
                  { names: libraryMerge.conflicts.join(', ') },
                )}
              </div>
            )}
            {libraryMerge.invalid > 0 && (
              <div>
                {format(
                  t('load.libraryInvalid', '{count} custom camera(s)/lens(es) in the project file could not be read and were skipped.'),
                  { count: libraryMerge.invalid },
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={dismissLibraryMerge}
            className="border border-bc-border px-2 py-0.5 text-xs hover:bg-bc-hover"
          >
            {t('common.ok', 'OK')}
          </button>
        </div>
      )}
      <Header
        onSelectTab={handleSelectTab}
        onSetLayoutMode={handleSetLayoutMode}
        onApplyPreset={handleApplyPreset}
        onSaveLayoutPreset={handleSaveLayoutPreset}
        onDeleteLayoutPreset={handleDeleteLayoutPreset}
        onDragNewPanel={handleDragNewPanel}
        layoutPresetOptions={layoutPresetOptions}
        layoutMode={layoutMode}
        onOpenInventory={() => setInventoryOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Linke Seitenleiste ──
            Breite skaliert mit dem Fenster statt fest 320 px: auf grossen
            Schirmen darf die Spalte mitwachsen (die Kamera-Karte nutzt das per
            Container-Query fuer zweispaltige Zeilen), auf kleinen schrumpft sie
            bis 264 px, bevor der Auto-Collapse aus dem Media-Query greift.
            `min-w` an den Kindern muss dafuer weg — sonst kann sie nicht kleiner
            werden und die Spalte ueberlaeuft.

            EINGEKLAPPT BLEIBT EINE 32-PX-LEISTE STEHEN, mit dem Namen der
            Spalte senkrecht darin. Sie war vorher `w-0` mit einem eigenen
            20-px-Streifen DANEBEN, der den Schalter trug — drei Unterschiede
            zum `cable-planner` auf einmal: der Griff stand ausserhalb der
            Leiste statt darin, die eingeklappte Breite war eine andere, und
            im eingeklappten Zustand sagte nichts mehr, WAS dort zugeklappt
            ist. Wer zwischen den Apps wechselt, muss den Griff neu suchen.
            ADR-007 Abschnitt 6 legt den Rahmen fest; der Griff gehoert dazu. */}
        {sidebarCollapsed ? (
          <aside className="flex h-full w-8 shrink-0 flex-col items-center border-r border-bc-border bg-bc-panel transition-colors hover:bg-bc-panel-raised">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              title={t('header.sidebar.open', 'Open column')}
              aria-label={t('header.sidebar.open.aria', 'Open the side column')}
              className="mt-2 flex h-7 w-7 items-center justify-center border border-bc-border bg-bc-panel-raised text-bc-text transition-colors hover:border-bc-accent hover:text-bc-text-bright"
            >
              <FiChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label={t('header.sidebar.open.aria', 'Open the side column')}
              className="mt-3 flex-1 self-stretch text-[10px] font-semibold uppercase tracking-[0.18em] text-bc-muted transition-colors hover:text-bc-text"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {sidebarTab === 'cameras'
                ? t('header.sidebar.settings', 'Settings')
                : t('header.sidebar.templates', 'Templates')}
            </button>
          </aside>
        ) : (
          <div
            style={{ width: 'clamp(264px, 22vw, 420px)' }}
            className="border-r border-bc-border flex flex-col bg-bc-panel shrink-0"
          >
            {/* DIE KOPFZEILE DER SPALTE (2026-09-11).
                ADR-007 Abschnitt 6 verlangt fuer jede Spalte eine Kopfzeile
                mit ihrem Namen und dem Griff darin, und Abschnitt 3 gibt ihr
                die Kopflinie im Akzent. Diese Spalte hatte beides nicht: der
                Name stand nur senkrecht im eingeklappten Streifen, offen
                begann sie unvermittelt mit zwei Registern. Wer die App
                oeffnet, sieht jetzt, WAS links steht, bevor er waehlt,
                welche Sicht darauf. */}
            <div className="spaltenkopf flex items-center gap-2 border-b border-bc-accent px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bc-text">
                {t('header.sidebar.title', 'Camera setup')}
              </span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title={t('header.sidebar.collapse', 'Collapse column')}
                aria-label={t('header.sidebar.collapse.aria', 'Collapse the side column')}
                className="flex h-7 w-7 shrink-0 items-center justify-center text-bc-dim transition-colors hover:bg-bc-hover hover:text-bc-text-bright"
              >
                <FiChevronLeft size={14} />
              </button>
            </div>
            <div className="flex items-stretch border-b border-bc-border">
              <button
                className={`flex-1 py-2 text-xs font-medium ${sidebarTab === 'cameras' ? 'text-bc-accent border-b-2 border-bc-accent' : 'text-bc-dim hover:text-bc-text'}`}
                onClick={() => setSidebarTab('cameras')}
              >
                {t('header.sidebar.settings', 'Settings')}
              </button>
              <button
                className={`flex-1 py-2 text-xs font-medium ${sidebarTab === 'templates' ? 'text-bc-accent border-b-2 border-bc-accent' : 'text-bc-dim hover:text-bc-text'}`}
                onClick={() => setSidebarTab('templates')}
              >
                {t('header.sidebar.templates', 'Templates')}
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {sidebarTab === 'cameras' ? <Sidebar /> : <TemplateSelector />}
            </div>
          </div>
        )}

        {/* ── Main docking area (FlexLayout) ── */}
        <div className={`flex-1 overflow-hidden relative flexlayout-custom-theme layout-mode-${layoutMode}`}>
          <Layout
            key={layoutEpoch}
            ref={layoutRef}
            model={model}
            factory={factory}
            onModelChange={handleModelChange}
            onRenderTabSet={handleRenderTabSet}
            realtimeResize
          />
        </div>
      </div>

      <StatusBar />

      <ExportPanel />
      <StartupAssistant />
      <CommandPalette commands={commands} />

      {/* Lager / Bestand — projektübergreifend, App-kompatibel via avplan-inventory.
          Geoeffnet ueber den Button in der Kopfzeile (statt frueher schwebend). */}
      <InventoryDialog open={inventoryOpen} onClose={() => setInventoryOpen(false)} />
    </div>
    </ErrorBoundary>
  );
}
