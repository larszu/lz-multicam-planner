# Merge-Leitfaden: MultiCam-Planner → Cable-Planner

> **ÜBERHOLT seit 2026-09-07 durch [ADR-006 „Der Schnitt"](https://github.com/larszu/av-planner-suite/blob/main/docs/decisions/ADR-006-werkzeug-schnitt.md).
> Dieser Plan wird NICHT umgesetzt.** Er steht als Analyse hier, nicht als Vorhaben.

## Warum das Dokument stehenbleibt und trotzdem nicht gilt

Der Plan beschreibt, wie der MultiCam-Planner **in** den Cable-Planner wandert.
Die Suite ist den umgekehrten Weg gegangen: ADR-006 hält fest, dass verdeckende
Bereiche in **eigene Repos** ausgelagert und über die Shell integriert werden —
der Anlass war ein Satz des Eigentümers („Durch extrem viele Funktionen werden
die Basisfunktionen verdeckt"). MultiCam ist seither ein eigenständiges Repo,
das in `av-planner-suite` vendoriert wird, und kein Dialog im Cable-Planner.

Bis 2026-09-10 stand dieser Text mit **33 offenen Kästchen** hier. Ein Plan mit
offenen Kästchen liest sich wie eine Aufgabenliste, an der noch jemand arbeitet;
jede davon beschrieb Arbeit, die niemand mehr tun wird. Sie sind deshalb zu
Aufzählungspunkten geworden. Der Inhalt bleibt, weil zwei Teile davon weiterhin
stimmen und beim Vendorieren nützlich sind:

* **Abschnitt 2** listet die Module ohne Electron-, DOM- oder Store-Abhängigkeit.
  Genau die sind die Kandidaten für gemeinsame Pakete der Suite.
* **Abschnitt 7** nennt die Risiken (three.js-Versionen, PDF-Worker unter CSP,
  drei gleichzeitige Renderer), und die gelten auch für die Einbettung in die
  Shell.

Was **nicht** mehr stimmt: die Stufen A/B/C, der Phasenplan, die
Aufwandsschätzung — und die i18n-Zeile weiter unten, die „Quell-Sprache DE"
sagt. Seit E-28 (2026-09-09) ist Englisch die Quellsprache **aller** Repos der
Suite.

Die Fortschreibung dieses Texts steht in
[`venue-suite-architecture.md`](./venue-suite-architecture.md); auch sie ist an
ADR-006 zu lesen und nicht als Merge-Vorhaben.

---

> Was muss angepasst werden, damit der **MultiCam-Planner** (bzw. ein Teil davon)
> in [`larszu/cable-planner`](https://github.com/larszu/cable-planner) integriert
> werden kann.

**Stand:** MultiCam-Planner v0.4.0 (~23 Module, ~8.2k LOC) · Cable-Planner v8.1.0 (~235 Module, ~73.5k LOC)
**Interaktive Struktur-Übersicht:** [`multicam-appstructure.html`](./multicam-appstructure.html)

---

## 1. Ziel & Empfehlung

Der MultiCam-Planner ist eine **reine Client-App** (React + Vite + Electron, kein
Backend, kein Preload, keine IPC). Der Cable-Planner ist eine **vollständige
Electron-Multi-Prozess-App** (Main / Preload-Bridge / Renderer / Mobile) mit IPC,
atomaren File-Writes, Keychain, Rentman/ATEM-Integration, i18n, Undo/Redo und
ReactFlow-Canvas.

Beide planen AV-Produktionen — Kameras sind im Cable-Planner bereits *Equipment*,
und eine Multicam-Venue-Planung ist die logische Ergänzung („Wo stehen die Kameras,
welches Objektiv, welche Abdeckung?“ ↔ „Wie sind sie verkabelt?“).

**Empfohlene Strategie: Stufe B („Modul-Dialog mit optionaler Verknüpfung“).**

| Stufe | Beschreibung | Kopplung | Aufwand |
|-------|--------------|----------|---------|
| **A** | MultiCam als eigenständiger Vollbild-**Dialog/View** (analog `RackBuilderDialog`). Daten als Sub-Objekt im Projekt. | lose | niedrig–mittel |
| **B** ✅ | Wie A, **plus** Venue-Kameras ↔ Cable-Planner-Equipment verknüpfbar (gemeinsame Device-Identität). | mittel | mittel |
| **C** | Volle Datenmodell-Fusion: Kamera *ist* Equipment, Venue ist Canvas-Layer. | eng | hoch |

Stufe A→B ist der pragmatische Pfad: Erst als isolierter Dialog mergen (Logik 1:1
wiederverwendbar), dann schrittweise verknüpfen.

---

## 2. Was sofort & risikoarm wiederverwendbar ist

Diese Dateien sind **reine Logik/Daten ohne Electron-, DOM- oder Store-Abhängigkeit**
und können fast unverändert übernommen werden:

| MultiCam-Datei | Ziel im Cable-Planner | Anmerkung |
|----------------|----------------------|-----------|
| `src/utils/fov.ts` | `src/renderer/lib/multicam/fov.ts` | Reine Optik-Mathematik. **Tests mitnehmen.** |
| `src/utils/camera.ts` | `src/renderer/lib/multicam/cameraPos.ts` | `effectiveCameraPos`. |
| `src/data/cameras.ts` | `src/renderer/lib/multicam/cameraCatalog.ts` | Passt zum bestehenden `*Catalog.ts`-Muster. |
| `src/data/lenses.ts` | `src/renderer/lib/multicam/lensCatalog.ts` | dito. |
| `src/data/templates.ts` | `src/renderer/lib/multicam/venueTemplates.ts` | dito. |
| `src/types/index.ts` | `src/renderer/types/multicam.ts` | Typen umbenennen/prefixen (s. §4.10). |
| `src/__tests__/*` | `test/multicam/*` | 37 Vitest-Tests — Build-Gate beibehalten. |

> **Wichtig:** Die `*.test.ts` zeigen, dass die Kern-Mathematik bereits abgedeckt
> ist. Diese Tests sind das stärkste Argument, die Logik 1:1 zu übernehmen statt
> neu zu schreiben.

---

## 3. Architektur-Gap-Analyse

| Thema | MultiCam-Planner | Cable-Planner | Anpassung nötig |
|-------|------------------|---------------|-----------------|
| Verzeichnis-Layout | `src/components`, `src/store`, `src/utils`, `src/data` | `src/main`, `src/renderer/{components,store,lib,types}`, `src/mobile` | **Ja** – alles unter `src/renderer/` einsortieren |
| Electron | 1× `electron/main.cjs` (CJS, kein Preload) | `src/main/index.ts` + Preload-Bridge + IPC + Services | **Ja** – eigene Main entfällt |
| Privilegierte Ops | direkt im Renderer (`fetch`, Blob-Download) | über `bridge` → IPC → Main | **Ja** – über Bridge routen |
| State | 1× zustand `useStore` | `projectStore` (11 Slices) + `uiStore` + `settingsStore` + `projectHistory` | **Ja** – Slice oder eigener Store |
| Persistenz | `localStorage` + Blob-`.mcplan` | atomic-write `.json/.cpviewer` + zentrale Library | **Ja** |
| AI | Gemini direkt per `fetch`, Key in `localStorage` | `lib/aiSuggestions.ts` Multi-Provider, Key im Keychain | **Ja** |
| Layout | FlexLayout-Docking (4 Panels) | MenuBar + Canvas + Panels, Dialoge | **Ja** – als Dialog/View einbetten |
| 2D-Rendering | Konva / react-konva | ReactFlow | Konva als isolierte Dep behalten |
| 3D-Rendering | three.js / @react-three/fiber | three.js / @react-three/fiber (Rack3D) | Nur Versionen abgleichen |
| Floor-Plan | pdfjs-dist | (prüfen) | Dep ggf. ergänzen |
| Entkopplung | `window`-CustomEvents (`multicam-*`) | Store-Actions / Bridge | **Ja** – Events ersetzen |
| i18n | hardcoded EN | `useTranslation()` de/en (~2140 Keys) | **Ja** – Strings nach `t()` |
| Build | Vite + `tsc -b` | Multi-Target (electron-vite o.ä.) | **Ja** – Config zusammenführen |
| Branding | appId `com.larszu.multicamplanner` | Cable-Planner | entfällt |

---

## 4. Konkrete Anpassungen (Checkliste)

### 4.1 Verzeichnisstruktur
- Alle MultiCam-Quellen unter `src/renderer/` einsortieren:
  - `components/Venue2D`, `components/Venue3D`, `components/Preview`, `components/Export`
    → `src/renderer/components/MultiCam/...`
  - Sidebar-Teile (Kamera-/Venue-spezifisch) → `src/renderer/components/MultiCam/Sidebar/...`
  - `store/useStore.ts` → Slice oder `src/renderer/store/multicamStore.ts` (s. 4.3)
  - `utils`, `data`, `types` → s. §2
- Relative Imports anpassen.

### 4.2 Electron Main / Preload / Bridge
- `electron/main.cjs` **wird nicht übernommen** — der Cable-Planner-Main
      (`src/main/index.ts`) ist führend.
- Die gehärteten Sicherheits-Defaults aus `main.cjs` (CSP-Header-Injection,
      `openExternal`-Allowlist, `will-navigate`-Guard) prüfen und – falls im
      Cable-Planner noch nicht vorhanden – dort einpflegen.
- `connect-src` der CSP nur dann um `generativelanguage.googleapis.com`
      erweitern, wenn AI weiterhin **direkt aus dem Renderer** läuft. Empfehlung:
      AI über den Main-Prozess routen (s. 4.5) → CSP bleibt strikt.

### 4.3 State-Management
- MultiCam-State (venue, cameras, customLenses, customCameras, persons, walls,
      templates, favorites) als **neuen Slice** `store/slices/multicamSlice.ts` in
      `projectStore` einhängen — passt zum bestehenden 11-Slice-Muster.
  - Alternativ eigener `multicamStore.ts` (loser, aber kein gemeinsamer Undo-Scope).
- `projectVersion`-Logik des MultiCam-Stores durch Cable-Planner-`projectHistory`
      ersetzen → **Undo/Redo gratis**. Alle `set()`-Mutationen müssen
      history-kompatibel sein (Transactions/Coalesce beachten).
- `selectedCameraId`, Layout-/Panel-State → in `uiStore` verschieben.

### 4.4 Persistenz
- `saveProject()` (Blob-Download `.mcplan`) **entfernen**. MultiCam-Daten werden
      Teil des Cable-Planner-Projektfiles (neues Feld `multicam?: MultiCamPlan`) und
      über `bridge.project.saveProject` + `atomicWrite` (`.bak`-Rotation, In-Flight-Lock)
      gespeichert.
- `loadProject()`-Migrationslogik (scale → scaleX/scaleY, mountType-Default)
      in einen **Projekt-Migrationsschritt** des Cable-Planners überführen
      (formatVersion-Bump).
- Custom-Kameras/-Objektive von `localStorage` → **zentrale Library** (`.cpdevice`-
      analog, via `libraryIpc`/`librarySync`), damit sie projektübergreifend nutzbar sind.
- `utils/storage.ts` (loadJSON/saveJSON) nur noch für rein lokale UI-Prefs
      verwenden — oder ganz durch `uiStore`-Persist ersetzen.

### 4.5 AI-Integration
- Gemini-`fetch` aus `CustomCameraForm.tsx` entfernen und durch
      `lib/aiSuggestions.ts` (Multi-Provider) ersetzen — neuer Task-Typ
      „camera-spec-lookup“.
- API-Key **nicht** in `localStorage`, sondern via `credentialsIpc` im
      OS-Keychain (wie Rentman-Token).
- Den JSON-Prompt aus `buildPrompt()` als Provider-Prompt-Template übernehmen.

### 4.6 Layout / UI-Einbettung
- FlexLayout-Docking nicht 1:1 übernehmen. Stattdessen:
  - **MVP:** Ein `MultiCamPlannerDialog.tsx` (analog `RackBuilderDialog`), das die
    vier Views (2D/3D/Preview/Calculator) in einem eigenen Tab/Splitter zeigt.
  - **Später:** Eigener View-Mode neben dem Cable-Canvas.
- Einstieg über `MenuBar` (View → Camera Planner) + ggf. StatusBar-Eintrag.

### 4.7 Entkopplung: window-CustomEvents ersetzen
- `multicam-export`, `multicam-calibrate`, `multicam-wall-draw`, `multicam-3d-reset`
      (window-Events) durch **Store-Actions** oder lokale Callbacks ersetzen.
- `exportRegistry.ts` ist bereits ein sauberer Schritt weg von `window.*`-Globals
      und kann als Modul-internes Pattern bleiben.

### 4.8 i18n
- Alle sichtbaren Strings (Header, Sidebar, Buttons, Tooltips, Alerts) in
      `t(key, 'Deutsche Form')` wrappen.
- Neue Keys in de/en-Dicts ergänzen (Quell-Sprache DE, wie Issue #321).
- Gerätekategorien (broadcast/cinema/ptz/…) ggf. an bilinguale Kategorien (#309) anbinden.

### 4.9 Build / TypeScript
- `vite.config.ts`, `tsconfig.json`, `eslint.config` des MultiCam-Planners
      **verwerfen**; in die Multi-Target-Build-Pipeline des Cable-Planners integrieren.
- `__APP_VERSION__`-Define entfällt (Cable-Planner-Versionsquelle nutzen).
- Vitest-Setup übernehmen, sofern Cable-Planner noch keins hat — sonst Tests
      in dessen Test-Runner einhängen.

### 4.10 Typen & mögliche Verknüpfung (Stufe B)
- MultiCam-Typen nach `src/renderer/types/multicam.ts`; ggf. prefixen, um Kollisionen
      zu vermeiden (`Camera` → `CameraBody`/`MultiCamCamera`, da „Cable“-Welt eigene
      `EquipmentItem` hat).
- Optionales Feld `equipmentId?: string` auf `VenueCamera` einführen → Verknüpfung
      einer platzierten Venue-Kamera mit einem Equipment-Node auf dem Cable-Canvas.
- Mapping-Helper: Equipment-Kategorie „Camera“ ↔ MultiCam `Camera`-Katalogeintrag.

### 4.11 Dependencies abgleichen
- `konva` + `react-konva` — neu im Cable-Planner, als isolierte Dep für die 2D-Venue.
- `pdfjs-dist` — prüfen, ob schon vorhanden; sonst ergänzen (mit `isEvalSupported:false`).
- `three` / `@react-three/fiber` / `@react-three/drei` — **Versionen vereinheitlichen**
      (Cable-Planner Rack3D nutzt dieselbe Familie; Major-Mismatch vermeiden).
- `flexlayout-react` — entfällt, wenn als Dialog eingebettet.
- `zustand` — Version abgleichen.

---

## 5. Datei-Mapping (Übersicht)

| MultiCam (Quelle) | Cable-Planner (Ziel) | Aktion |
|---|---|---|
| `electron/main.cjs` | `src/main/index.ts` | **verwerfen**, Security-Defaults übernehmen |
| `src/App.tsx` | `components/MultiCam/MultiCamPlannerDialog.tsx` | umbauen zu Dialog/View |
| `src/components/Layout/Header.tsx` | (in Dialog-Toolbar aufgehen) | umbauen |
| `src/components/Sidebar/Sidebar.tsx` | `components/MultiCam/Sidebar/` | übernehmen, i18n + Persistenz anpassen |
| `src/components/Sidebar/CustomCameraForm.tsx` | `components/MultiCam/Sidebar/` | AI → `aiSuggestions`, Key → Keychain |
| `src/components/Sidebar/Calculator.tsx` | `components/MultiCam/Sidebar/` | übernehmen |
| `src/components/Sidebar/CalculationBreakdown.tsx` | `components/MultiCam/Sidebar/` | übernehmen |
| `src/components/Templates/TemplateSelector.tsx` | `components/MultiCam/` | Persistenz → Library |
| `src/components/Venue2D/Venue2D.tsx` | `components/MultiCam/Venue2D/` | Events → Actions |
| `src/components/Venue3D/Venue3D.tsx` | `components/MultiCam/Venue3D/` | three-Version abgleichen |
| `src/components/Preview/Kamerablick.tsx` | `components/MultiCam/Preview/` | übernehmen |
| `src/components/Export/ExportPanel.tsx` | `components/MultiCam/Export/` | in `lib/exportPdf`/Export-Pipeline integrieren |
| `src/components/ErrorBoundary.tsx` | (Cable-Planner hat evtl. eigene) | dedupliziieren |
| `src/store/useStore.ts` | `store/slices/multicamSlice.ts` | Slice + projectHistory |
| `src/store/exportRegistry.ts` | `components/MultiCam/exportRegistry.ts` | übernehmen |
| `src/data/*.ts` | `lib/multicam/*Catalog.ts` | übernehmen |
| `src/utils/{fov,camera}.ts` | `lib/multicam/` | **1:1 übernehmen** |
| `src/utils/storage.ts` | (durch uiStore-Persist ersetzen) | optional |
| `src/types/index.ts` | `types/multicam.ts` | prefixen |
| `src/__tests__/*` | `test/multicam/*` | übernehmen |

---

## 6. Phasenplan

1. **Phase 0 – Vorbereitung:** Dependency-Versionen (three/r3f/zustand) im
   Cable-Planner prüfen; Konva + pdfjs ergänzen.
2. **Phase 1 – Pure Logic:** `utils/`, `data/`, `types/` + Tests übernehmen, grün bekommen.
   *(Kein UI, kein Risiko – sofort mergebar.)*
3. **Phase 2 – Isolierter Dialog (Stufe A):** Views unter `MultiCamPlannerDialog`
   einbinden, eigener Slice, MultiCam-Daten als Projekt-Sub-Objekt über IPC speichern.
   window-Events → Actions, FlexLayout → Splitter.
4. **Phase 3 – Plattform-Anbindung:** AI → `aiSuggestions` + Keychain; Custom-Devices →
   zentrale Library; Undo/Redo via `projectHistory`; i18n.
5. **Phase 4 – Verknüpfung (Stufe B):** `equipmentId` auf Venue-Kamera; Sync zwischen
   Cable-Canvas-Equipment und Venue-Kamera.
6. **Phase 5 – Politur:** Export in Cable-Planner-Export-Pipeline, StatusBar/MenuBar,
   Doku.

---

## 7. Risiken & offene Fragen

- **Datenmodell-Dopplung:** „Kamera“ existiert in beiden Welten. Vor Stufe B klären,
  ob Venue-Kamera und Equipment dieselbe Entität referenzieren oder nur lose verlinken.
- **Undo/Redo-Scope:** Sollen MultiCam-Änderungen im selben Undo-Stack wie Kabel/Equipment
  liegen? (Bestimmt: ein Slice in `projectStore` vs. eigener Store.)
- **Performance:** Drei gleichzeitige Renderer (Konva-2D, WebGL-3D, Canvas-Preview)
  zusätzlich zum ReactFlow-Canvas — Lazy-Mount nur bei offenem Dialog.
- **three.js-Version:** Major-Mismatch zwischen Rack3D und Venue3D vermeiden (gemeinsame
  Peer-Dep).
- **PDF-Worker:** `pdf.worker.min.mjs` muss im Cable-Planner-Build (CSP `worker-src`)
  korrekt ausgeliefert werden.
- **Lizenz/Branding:** appId, Produktname, Icons des MultiCam-Planners entfallen.

---

## 8. Grobe Aufwandsschätzung

| Phase | Aufwand |
|-------|---------|
| 1 – Pure Logic + Tests | ~0.5–1 Tag |
| 2 – Isolierter Dialog (A) | ~3–5 Tage |
| 3 – Plattform-Anbindung | ~3–4 Tage |
| 4 – Verknüpfung (B) | ~2–4 Tage |
| 5 – Politur | ~1–2 Tage |
| **Summe (bis Stufe B)** | **~10–16 Tage** |

> Schätzung ohne Kenntnis interner Cable-Planner-Details (Build-Setup, projectStore-API).
> Phase 1 ist sofort und risikoarm umsetzbar und liefert bereits getestete Kern-Logik.
