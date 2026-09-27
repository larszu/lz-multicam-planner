# 🎥 MultiCam Planner

A fast, focused broadcast camera & lens planning tool for multicam setups. Calculate FOV/DoF, plan camera positions in 2D & 3D, and preview live camera views. Available as a web app and Windows desktop application.

[![Lizenz: proprietär](https://img.shields.io/badge/Lizenz-proprietär-critical.svg)](LICENSE)

![MultiCam Planner – 2D-Grundriss mit Bühne, Kamera- und Objektpanel](docs/screenshot.png)

---

## The web page

Every push to the default branch builds this repo's page from
`.github/workflows/pages.yml` and publishes it:

**https://larszu.github.io/multicam-planner/**

The workflow **asks the Pages API before it configures anything.** With no
Pages site it still builds — that is a real check — and skips only the
publishing step, with a warning and the one missing step in the run summary.
A run that must stay red for a click nobody made teaches people to ignore red.

Measured 2026-09-09: **published** — the `deploy` job ran and succeeded.

---
## ✨ Philosophy

MultiCam Planner is designed for quick, intuitive camera planning with essential features for real-world broadcast productions. Its streamlined workflow and simple interface make it perfect for fast setups and clear projects—without the complexity and feature overload of traditional CAD or architecture applications.

---

## 🚀 Features

### 📷 Camera & Lens Database
- 54+ broadcast cameras from 10 major brands (Sony, Canon, Panasonic, Blackmagic, ARRI, RED, Grass Valley, Hitachi, Marshall)
- 163+ lenses (Fujinon, Canon, Sony, Sigma, Tamron, Tokina, PTZ integrated)
- 11+ mounts: B4, EF, E, PL, MFT, RF, FZ, L, M12, integrated, universal
- Adapter system: automatic adapter detection with T-stop light loss, sensor crop info, Speed Booster support (e.g., EF→MFT)
- Custom lens support: create and save your own lenses
- **Custom cameras and lenses travel with the project:** the ones the placed
  cameras use are written into the `.mcplan` (and the `.avplan` cameras slot)
  and added to the local library when the project is opened on another
  machine. An entry that already exists there with the same id but different
  data is never overwritten — the local one is kept, and a notice names it.
- Favorites: star cameras and lenses for quick access
- **Connectors in the Cable Planner:** a camera whose manufacturer and model
  match an entry of the Cable Planner's camera catalog *exactly* (case, spaces
  and dashes aside) carries that entry's device-type GUID, and the Cable
  Planner resolves it to the real connector panel. Similar names do not count —
  a wrong GUID would be trusted blindly over there. Four Blackmagic bodies
  whose names differ only by wording (*Pocket Cinema 6K G2* / *Pocket Cinema
  Camera 6K G2* and the like) are assigned by hand, with the reason next to
  them in `cameras.ts`. Today 16 of 377 cameras (the catalog lists 20
  devices). A custom camera can pick a catalog device as its **port template**.
  The catalog identities are a frozen snapshot in
  `src/data/cableCameraCatalogIds.ts`; `npm run katalog:cable-ids` refreshes it
  from a `cable-planner` checkout next to this repo, and `npm test` then names
  every camera whose GUID has to be added or removed.

### 🗄 Device library (devices.zumpelars.de)
- **Settings → Device library**: server address (default
  `https://devices.zumpelars.de`, changeable, *Reset* returns to it), sign-in
  with email or username and password, a second step for the two-factor code,
  sign-out, and links to *Create account* / *Forgot password* on the library's
  website (registration happens there, not in the planner). Every build talks
  to the default server unless the address is changed.
- **Sync**: on start (while signed in) and on *Sync now* — first up (own
  entries, see below), then down. Down is incremental: only what changed
  since the last `latestSeq`. Library cameras appear in the camera
  list under *Device library*, library lenses in the lens list with
  *· library*; both are read-only (editing creates a local *modified* copy,
  like a built-in). A device marked `removed` leaves the catalog. Every entry
  goes through the same check as cameras/lenses carried in a project file; one
  that fails is skipped and counted in the sync line. The cache lives in local
  storage and survives sign-out, so placed library cameras keep working
  offline. Under the selector a library entry shows its status, its number of
  confirmations and a link to its page.
- **Library entries travel in the project file**: the ones placed cameras use
  are written into the `.mcplan` (and the `.avplan` cameras slot) as
  `libraryCameras` / `libraryLenses`. On a machine without them — no
  account, another server, empty cache — the project calculates with the
  file's copy; the sync cache is never written from a file, and where the
  cache has the same id, the cache wins. Such an entry is marked *carried in
  the project file* under the selector.
- **Upload of own devices**: every custom camera or lens — including a
  *modified* copy of a built-in or a library entry — goes to the library
  (`POST /api/upload`) in the facet format below. The library matches by
  manufacturer and model: an existing device gets this planner's data as its
  next version instead of a second device. *Upload own devices
  automatically* (Settings, on by default) uploads on start and a few seconds
  after a change; *Sync now* uploads everything. Unchanged entries (by hash of
  what was sent last) are not re-sent automatically — except those still
  waiting for moderation: the server reports `moderation: pending | approved`
  with every result (also `in-sync`), so the status turns *live* once a
  moderator approves. Under the selector every own entry shows its last
  result — waiting for moderation, live, blocked (with the reason, e.g.
  *datasheet link missing*) or failed — and
  *Upload…*, which asks for the datasheet link, stores it on the entry
  (`manufacturerUrl`) and uploads at once. Not signed in, it leads to the
  sign-in. Changed community guidelines (`guidelines-outdated`) have to be
  accepted again on the website — the message links to
  `<server>/guidelines`.
- **Built-in catalog**: `npm run library:publish` uploads `src/data/cameras.ts`
  and `src/data/lenses.ts` with an admin API key (`DEVICE_LIBRARY_KEY=dlk_…`,
  optional `DEVICE_LIBRARY_URL`); admin uploads go live at once. Entries
  without a datasheet link are listed and left out. `--dry-run` sends
  nothing. `.github/workflows/library-publish.yml` runs it after every push to
  `main` that touches the catalog (and by hand); without the repository
  secret `DEVICE_LIBRARY_KEY` it ends green with a notice. CI runs the dry run,
  so the script stays loadable (Node reads the `.ts` files directly — value
  imports in the modules it loads carry the `.ts` extension).
- **Facet format** (the `multicam` part of a library device, identical for
  upload and import):
  `{ kind: 'camera', version: 1, camera: <Camera without id> }` or
  `{ kind: 'lens', version: 1, lens: <Lens without id and isCustom> }` — the
  planner's native catalog entry, including `deviceTypeId` (the device-type
  GUID the Cable Planner resolves to ports), `manufacturerUrl` and
  `specSource` (datasheet evidence per field). Nested, because the server
  strips top-level private keys such as `id` and `notes` from every facet.
  Imported entries get the id `devlib-<slug>`; the core's `category` is
  `Camera` or `Lens`. Mapping: `src/library/facet.ts`.
- **Token storage**: the desktop app keeps the sign-in token in the system
  keychain (`safeStorage`, via `electron/preload.cjs`); without a keychain it
  is kept for the session only, never in plain text. The web build uses local
  storage — a browser offers a page nothing safer; signing out revokes the
  token on the server. The token is never written to a project file, the
  autosave or a log.
- **Another server**: the content security policy (`index.html`,
  `electron/main.cjs`) allows only `https://devices.zumpelars.de`. A different
  address must be added there, otherwise every request is blocked and the
  settings report the server as unreachable. Changing the address signs out
  at the old server, forgets the token (it must never reach another server)
  and starts an empty cache and upload record. Only `https://` is accepted (`http://` for
  localhost).
- Client: `src/utils/deviceLibraryClient.ts`, an unchanged copy of
  `larszu/av-device-library` `clients/deviceLibraryClient.ts` — changes go
  there first.

### 🗺 2D Venue Planner
- Top-down drag & drop camera placement with real-time FOV cones
- Zoom, pan, snap-to-grid, background floor plan import (image & PDF)
- Two-point calibration tool for scaling imported floor plans
- Draw walls with 45° shift-snapping
- Place stage objects (person, guitarist, drums, keys, mic stand, custom)

### ⚡ 3D Venue View
- Interactive 3D venue visualization with FOV pyramids
- FPS-style controls (WASD + mouse look, Space/Shift up/down, Ctrl sprint)
- **Touch: one finger looks around, two fingers pinch to move forward/back and drag to slide sideways and up/down** — no keyboard needed on a phone or tablet
- Drag cameras in space, visualize stage meshes & venue boundaries
- Background floor plan projection, floor grid with metric labels

### 👀 Camera Preview
- Live viewfinder simulation with accurate perspective
- Ground grid, sky/horizon, stage outlines, reference silhouettes
- Overlays: rule of thirds, safe areas, crosshair, data HUD
- Pan/tilt by dragging — with the mouse or one finger; pinch with two fingers to zoom the lens
- On a narrow window the data readout moves **below** the image instead of taking a fixed column beside it: the picture gets the full width

### 📐 FOV & DoF Calculator
- 9 sensor sizes (Full Frame, Super 35, APS-C, MFT, 1", 2/3", 1/2", 1/3", 1/2.3")
- Controls for focal length, aperture, distance, extenders
- Outputs: horizontal/vertical/diagonal FOV, image dimensions at distance, 35mm equivalent, DoF near/far/total, hyperfocal distance, person height in frame
- **Depth of field in the floor plan** — the sharp zone drawn as a band inside
  the FOV cone, so "is the band inside camera 3's focus range?" is a look
  instead of a calculation. Toggled next to the FOV eye in the camera list.
  The band deliberately reaches past the cone: the cone ends at the focus
  distance because it shows the frame width there — sharpness does not. A
  dashed outer edge means the band continues beyond the drawn area, which is
  the normal case once focus sits at or past the hyperfocal distance.

### 💾 Project & Layout
- Save/load projects as JSON with version tracking and unsaved changes detection
- **Autosave:** the open project is kept in the browser's local storage one
  second after the last change (and at once when the page is left) and comes
  back on the next start — including whether it has unsaved changes. The start
  screen then offers *Continue last project*; opening a file or starting a new
  project replaces it, and asks first if it has unsaved changes. If the storage is full, the
  status bar says so; the project stays open and can still be saved as a file.
- **Stable project id:** every project gets a UUID when it is created and keeps
  it through every save. An older file without one gets an id derived from the
  file (save time and venue name), so opening the same file twice gives the
  same id. The
  Cable Planner uses it to recognise a project it has seen before.
- **Camera list for the Cable Planner** (`*.cameras.json`, format `camera-list`
  v3): every placed camera with manufacturer, model, device-type GUID, position
  and height, pan and tilt, the active mount, the set focal length, an engaged
  extender, the lens (manufacturer, model, zoom range, mount) and its saved PTZ
  presets (number, shot, segment, pan, tilt, focal length, focus, saved at).
  A field MultiCam does not know stays out — no default that would read like a
  measurement over there. v1 and v2 files are still read; a reader that only
  knows v2 refuses a v3 file by name instead of silently dropping the presets. The `.avplan` export carries the same list inside
  MultiCam's own slot (`domains.cameras.cameraList`), so the Cable Planner
  does not need to know MultiCam's project format; it is rebuilt on every
  export and dropped on import.
- Dockable panel system (FlexLayout): drag, split, tab, resize
- Layout modes: Focus (single tab) and Grid (2×2)
- Customizable layout presets (save/load/delete)
- Venue templates: sport, concert, church, conference, custom (save your own)
- Export: Combined 1920px PNG containing 2D plan, 3D view, camera preview, and technical data sheet

### 🖥 Desktop App
- Windows installer (NSIS) and portable build with Electron
- Native window controls, external links open in system browser

---

## 🛠 Tech Stack

| Technology             | Version    |
|------------------------|-----------|
| React                  | 18.3      |
| TypeScript             | 5.7       |
| Vite                   | 6.0       |
| Zustand                | 5.0       |
| React-Konva            | 18.2      |
| Three.js / React Three Fiber | 0.170 / 8.17 |
| Tailwind CSS           | 3.4       |
| FlexLayout-React       | 0.8       |
| Electron               | 41.2      |
| electron-builder       | 25.1      |

**Source language:** `en`. When this planner gets its translation layer, the
English string in `t('ns.key', 'English source')` is the source text — the one
that appears when a key has no translation — and German lives in an override
dictionary. That is how the copy inside `av-planner-suite` is already built
(482 German override keys in 14 files); turning the direction around would mean
touching ~500 strings again for no visible gain.

This is a property of *this repository*, decided on 2026-09-08 (E-17/E-20):
`sony-camera-bridge` is English-source as well, while `cable-planner` and
`light-planner` are German-source. Upstream here still has no i18n at all and
a hard-coded German UI — that gap is tracked as B-25. `npm run lang:check`
holds the declaration today and starts measuring by itself as soon as the first
fallback string appears. The machine-readable copy sits in `package.json` under
`avplan.sourceLanguage`.

---

## 🚦 Getting Started

### Web App

```bash
npm install
npm run dev
# Open http://localhost:4182
```

### Desktop App

```bash
# Run in dev mode
npm run desktop

# Build Windows installer & portable
npm run dist:win

# Build macOS DMG + ZIP (x64 + arm64, must run on macOS)
npm run dist:mac
```

A GitHub Actions workflow (`.github/workflows/release-build.yml`) automatically
builds Windows and macOS artifacts whenever a release is published and attaches
the binaries (NSIS installer, portable .exe, DMG, ZIP) directly to the release
page. It can also be triggered manually via the Actions tab for testing.

---

## 📜 Useful Scripts

| Script             | Description                                       |
|--------------------|---------------------------------------------------|
| npm run dev        | Start local Vite dev server                       |
| npm run build      | TypeScript check + production build               |
| npm run desktop    | Launch Electron in dev mode                       |
| npm run dist:win   | Build Windows installer & portable                |
| npm run dist:mac   | Build macOS DMG + ZIP (x64 + arm64, host = macOS) |
| npm run preview    | Preview production build                          |
| npm run lint       | Run ESLint linter                                 |
| npm run ci:complete| Assert every `*:check` script is actually run by CI |
| npm run katalog:cable-ids | Refresh the snapshot of the Cable Planner camera catalog (GUIDs) |
| npm run library:publish | Upload the built-in catalog to the device library (`DEVICE_LIBRARY_KEY`, `--dry-run`) |

---

## 📚 Documentation

- [`docs/MERGE_INTO_CABLE_PLANNER.md`](docs/MERGE_INTO_CABLE_PLANNER.md) —
  **superseded, kept as analysis.** It describes folding MulticamPlanner into
  `cable-planner`; the suite went the other way (ADR-006: crowded areas move
  *out* into their own repos and the shell integrates them). Its list of
  dependency-free modules and its risk section still hold.
- [`docs/venue-suite-architecture.md`](docs/venue-suite-architecture.md) —
  extends that guide with `light-planner` and a shared venue data model. The
  shared-model part is built (`@avplan/*`); the merge part is superseded too.

`npm run docs:reachable` fails the build if a document under `docs/` is not
reachable by links from an entry page. Both were orphaned until 2026-09-04.

---

## ❤️ Support / Donate

If MulticamPlanner saves you time on your next show, consider buying me a coffee:

<p>
  <a href="https://paypal.me/larszumpe">
    <img src="https://img.shields.io/badge/PayPal-larszumpe-00457C?logo=paypal&logoColor=white" alt="Donate via PayPal" />
  </a>
</p>

Donations are completely optional — the app stays free to use. It is proprietary software, not open source. 🙌

---

## 📝 License

Proprietär — © 2026 Lars Zumpe, alle Rechte vorbehalten. Nutzung der veröffentlichten Builds ist kostenlos; Weiterverbreitung und abgeleitete Werke sind es nicht. Siehe [LICENSE](LICENSE).

---

> **Feedback, issues, feature requests, and contributions are welcome!**  
> Demo & contact: [larszu.github.io](https://larszu.github.io)
