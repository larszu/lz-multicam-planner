# LZ Multicam Planner — feature reference

The complete feature and technical reference. For the overview, screenshots and
downloads see the [README](../README.md).

## The web page

Every push to the default branch builds this repo's page from
`.github/workflows/pages.yml` and publishes it:

**https://larszu.github.io/lz-multicam-planner/** (always the latest release)

The workflow **asks the Pages API before it configures anything.** With no
Pages site it still builds — that is a real check — and skips only the
publishing step, with a warning and the one missing step in the run summary.
A run that must stay red for a click nobody made teaches people to ignore red.

Measured 2026-09-09: **published** — the `deploy` job ran and succeeded.

---

## Philosophy

LZ Multicam Planner is designed for quick, intuitive camera planning with essential features for real-world broadcast productions. Its streamlined workflow and simple interface make it perfect for fast setups and clear projects—without the complexity and feature overload of traditional CAD or architecture applications.

- **Start right away:** the app opens on your last project. A small *First steps* card (draw a camera, place a person, adjust the focal length, check the preview) ticks itself off as you work; hide it anytime, *Help → First steps* brings it back.
- **Modern, calm interface:** neutral surfaces, brand blue only as accent, soft rounded panels, light and dark (anthracite) theme — switch *Auto · Light · Dark* right in the header (also in Settings). Details under [Design / interface](#design--interface).

---

## Features

### Camera & Lens Database
- **377 cameras from 36 brands** (Sony, Canon, Panasonic, Blackmagic, ARRI, RED,
  Grass Valley, Hitachi, Ikegami, JVC, Nikon, Kinefinity, Z CAM, PTZOptics,
  Marshall, AIDA, Avonic, BirdDog, Lumens, Vaddio, DJI, GoPro, Insta360 …) —
  372 with a manufacturer datasheet link
- **835 lenses from 37 brands** (Fujinon, Angénieux, Cooke, ARRI, Zeiss, Leitz,
  Canon, Sony, Sigma, Tamron, Atlas, Hawk, Panavision, DZOFilm, Laowa …) — 798
  with a datasheet link
- **49 camera rigs** with real dimensions (Jimmy Jib, Technocrane, SuperTechno,
  Spidercam, Panther, J.L. Fisher, Sachtler, Vinten, Newton, Slidekamera)
- 24 mounts: B4, EF, E, PL, MFT, RF, FZ, L, LPL, XPL, M12, C/CS, Z, X, K, G,
  XCD, integrated …
- Adapter system: automatic adapter detection with T-stop light loss, sensor crop info, Speed Booster support (e.g., EF→MFT)
- Custom lens support: create and save your own lenses
- **Built-in lenses (PTZ, camcorders, action cams):** a camera with a built-in lens only ever gets its *own* lens — never another model's. Where the catalogue has no data for it yet, a marked placeholder (typical 20x) stands in so preview and field of view work right away; *Enter values from the data sheet* saves the real range for that camera
- **AI auto-fill** for custom cameras: fills sensor, mount and modes from manufacturer + model, with a source per value. Uses the provider from **Settings → AI**
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

### Device library (devices.zumpelars.de)
- **Settings → AI**: one place for every AI feature. Pick the provider —
  Google Gemini (free key), ChatGPT (OpenAI), Claude (Anthropic), Mistral or
  Grok (xAI) —, paste the API key (masked, kept only in this device's local
  storage, removable) and optionally change the model. Defaults:
  `gemini-3.5-flash-lite`, `gpt-5.6`, `claude-sonnet-5-5`,
  `mistral-medium-latest`, `grok-4`. **Test connection** sends a minimal
  request and shows success or the provider's exact error (rejected key,
  unknown model, rate limit, blocked network). Requests go straight from the
  app to the provider; keys saved by older versions are picked up
  automatically
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
  offline.
- **Offline contract** (shared by every planner, `syncFrom` in the client):
  the cache changes only on a successful response — offline, a timeout
  (15 s per request, 120 s per upload batch), a server error, an expired
  sign-in or signing out leave the last synced devices usable. Every server
  address has its own cache slot under the same storage key; a single cache
  from an older version is read as the slot of its server. When the server
  reports a lower `latestSeq` than remembered (set up anew, restored from a
  backup), the whole stand is fetched again and replaces the cache — unless it
  is empty: then the sync fails with *server was set up anew … devices were
  kept*, and nothing is deleted. Under the selector a library entry shows its status, its number of
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
  and switches to that server's cache slot and a fresh upload record; the
  previous server's cache stays stored and is back when you switch back. Only `https://` is accepted (`http://` for
  localhost).
- Client: `src/utils/deviceLibraryClient.ts`, an unchanged copy of
  `larszu/av-device-library` `clients/deviceLibraryClient.ts` — changes go
  there first.
- **Every catalogue entry also carries a DERIVED device-type GUID**
  (`src/data/geraetetypIds.ts`, generated). The bullet above describes the
  hand-set and exactly-name-matched ones: 16 of 377. The other 361 went across
  with no identity at all, so the cable planner fell back to comparing
  manufacturer and model as strings — the very thing the GUID was meant to
  abolish. The derived id closes that gap for all of them; a hand-set one still
  wins, because it is older and saved plans point at it. It is derived, not
  invented: UUIDv5 over `avplan:camera:<id>`, so the same catalogue entry yields
  the same id in every app, and it says *this catalogue entry*, never *these
  ports*. Regenerate from the cable planner with `npm run katalog:uebernahme`.

### 2D Venue Planner
- Top-down drag & drop camera placement with real-time FOV cones
- Zoom, pan, snap-to-grid, background floor plan import (image & PDF, first
  page) — via the upload button **or by dragging the file onto the 2D plan or
  the sidebar's Floor Plan section**. Images are capped at 3000 px on the long
  edge, PDFs are rendered to at most 2000 px, so a phone photo no longer bloats
  the project file
- Two-point calibration tool for scaling imported floor plans (per axis, X or Y)
- **AI floor-plan analysis** (sidebar, Floor plan): reads walls, stages and scale from the uploaded plan. Uses the provider from **Settings → AI**
- Draw walls with 45° shift-snapping
- **What can be edited** sits as a small switch bar in the top-left corner of the plan: Floor plan, Stage, Room, Objects, Cameras. Click a group to lock it (lock icon) and again to free it — e.g. lock everything but cameras while placing cameras. *Edit → Edit mode* offers the same as one-click presets
- Place stage objects (person, guitarist, drums, keys, mic stand, custom) — new people land on the main stage, side by side
- **Room (optional, collapsed in the sidebar):** ceiling height, floor (concrete, wood, carpet, grass, tiles, black stage floor), walls (plain colour, painted plaster, concrete, brick, wood panelling, black drape — used for the hall walls and every drawn wall in the 3D view; painted plaster takes each wall's own colour), **audience areas** and **video walls**. Add an area with *Seated area* or *Standing area*, then move, resize and rotate it in the 2D plan; rows, row gap, rise per row, first-row height and occupancy sit under *Fine-tune*. Seated areas are rows of seats on a rising stand, standing areas a loose, dense crowd on the floor; one click switches between the two. Video walls are dragged and rotated the same way (the arrow shows where the picture faces); their card also has X, Y (centre of the lower edge in plan metres), Z (lower edge above the floor), turn, width and height as numbers. Audience areas have X and Y under *Fine-tune*. Nothing here is required — without areas the 3D view fills the free floor with people by itself

### 3D Venue View
- **Views:** *Top* (plan from above, stage at the top like in the 2D plan) and *Perspective* glide there instead of jumping. *Camera view* shows the selected camera's picture with all its controls — the same view as the *Preview* tab (see *Camera view & Preview*); *Top* or *Perspective* bring the free 3D view back
- **Camera list** on the right: number, camera, lens range @ current focal length, rig and horizontal FOV. **Click a camera to look through its lens** — opens the camera view for it. On a narrow window the list steps aside in the camera view; ‹ › switch cameras there
- **Coverage** wedges on the floor from each camera to its focus point, with a sight line; the selected camera also shows its 3D FOV pyramid
- **Tally** from the Multiview: Program camera red, Preview green — on the camera in 3D and in the list
- **Photoreal by default:** dark arena with haze, trusses with fixtures whose beams stand in the haze, warm front light on the stage with real shadows, LED walls that glow and light the stage, floodlights over pitches, a night sky outdoors. Ambient occlusion, bloom, AgX tone mapping. One **Quality** switch: *Auto* (starts high, lowers once if the frame rate stays low), *High*, *Low*, and *Simple* — a light 3D view without lighting effects, shadows or post-processing for slow computers. A spinner covers the view until the scene has drawn its first frame
- **Audience** from the room's audience areas — seated on seats and stands, standing with some hands raised — or, without areas, filling the free floor (centre aisle, clearance around stages, cameras, people and walls). Thousands of people with varied clothing, size and posture, instanced so they stay smooth. Space is kept free around cameras and people. Scenery only: Preview and sight lines do not take it into account; place a person if a head in the shot matters
- **Cameras look like the real thing:** body, lens and mount are built from the catalogue and the rig — no extra input. PTZ → PTZ head (on a tripod, or with *Fixed mount* on the wall, under the ceiling from 2.5 m or close to it); broadcast camera with a box lens → studio camera with box lens, with a B4 handheld lens → shoulder-camera look; cinema → cinema body with cine prime or cine zoom (matte box on *High*); FX3 class and mirrorless → small body with cage. Tripod, pedestal, jib/Technocrane (arm length from the rig), dolly and slider (laid track, the cart follows the track offset) and shoulder rig are modelled; other rigs (cable cam, drone, scissor lift …) keep the drawn rig with the camera on top. The FOV pyramid starts at the front of the lens. With many cameras the planning view uses simpler models
- **Camera operators** (toggle, off by default) stand at tripods, pedestals and dollies and carry shoulder cameras
- **People on stage** appear as detailed people in every view, facing the cameras. Pose and clothing follow the object and its name: *Moderation*/*Host* speaks in a jacket or dress, *Vocal* sings into a mic, guitar and seated objects get their pose, others stand in varied poses — always the same look for the same person
- **Light: Hall · Daylight** (with show light): *Daylight* puts the venue under the open sky — sun, sky, moon and stars from date, time, place (German cities or coordinates), the floor plan's north direction and weather (clear, partly cloudy, overcast, haze). The time slider marks sunrise, sunset, golden hour and blue hour. Stage lights stay visible by day; at night the exposure matches the hall look. Applies to the rendered camera pictures too. Times are in the computer's time zone
- **One render pipeline for all four views:** free 3D, camera view, preview and multiview share scene, lights, materials, quality steps, AgX tone mapping, exposure and bloom (`src/components/Render3D/renderLook.ts`). Change it once and every picture follows
- **Show light adjustable** (right-hand bar, under *Light: Hall*): brightness, colour mood (white, warm, worship blue, concert colours or your own colour), haze density, fixtures (wash + beams, wash only, beams only), amount (few, normal, many) and *Point beams at the stage*. The fixtures themselves are still generated from your stages — the settings only steer them. Values live in the project (`.mcplan`), apply to preview and multiview too, and older files simply get the defaults
- **Show light** off = evenly lit planning view with grid, but floor and wall materials stay visible. **Video wall** draws one wall per stage when the room has none; **Camera operators**, **Labels** and **Floor plan** can be toggled; all toggles are remembered
- Rendering building blocks come from `@avplan/scene3d` (see *Shared suite packages*)
- Drag to look around — the picture follows the mouse like in 3D and map apps (drag right, the scene moves right); WASD to move, Space/Shift up/down, Ctrl sprint, scroll to dolly
- **Touch: one finger looks around (the picture follows the finger), two fingers pinch to move forward/back and drag to slide sideways and up/down** — no keyboard needed on a phone or tablet
- Drag cameras in space, visualize stage meshes & venue boundaries
- Background floor plan projection, floor grid with metric labels

### Camera view & Preview
One view answers *what does this camera see?* — in the **Preview** tab and as **Camera view** in the 3D view. Same picture, same controls, same settings (overlays, presets, transition time are shared between both).
- **Rendered by default:** the camera's picture through the same scene as the 3D view — stage, people, audience, show light, wall materials — with the lens's focal length, sensor, pan and tilt. Show light, audience and the *Simple* quality of the 3D view apply here as well
- **3D · Simple** switch under the picture: *Simple* is the classic drawing (ground grid, sky/horizon, stage outlines, reference silhouettes); it is also shown while the 3D scene loads
- **The angle of view comes from the lens, never from the window:** sensor, focal length, extender and anamorphic squeeze set it (`computeFov`); the picture is shown 16:9, letterboxed or pillarboxed, whatever the shape of the window. Drawing, camera view and rendered picture frame the same thing in every window size (`src/utils/bildwinkel.ts`, test `bildwinkelEinheit`)
- **Depth of field from the camera data** (quality *High*): focus distance, aperture, focal length with extender and the sensor's circle of confusion — the same numbers the panel shows. The sharp zone in the picture starts exactly at *DoF near* from `computeDof`; behind the focus plane it stays a little shorter than physics, because the renderer's blur grows linearly with distance (`src/utils/tiefenschaerfe.ts`, test `tiefenschaerfe`). On *Low* and *Simple* and in the multiview tiles it is off; while you drag the picture it pauses and comes back 200 ms after the last step
- **Overlays** behind one button: safe areas, rule of thirds, crosshair with focus distance, data panel, ground grid (*Simple*); invert the pan or tilt direction there too. The picture always carries the pan/tilt HUD, rulers and the in-frame / image-circle badges
- Pan/tilt by dragging — with the mouse or one finger; wheel or pinch with two fingers zooms the lens
- **Focus pick:** tap a person to set the focus distance; *Lock subject* keeps focus on the person nearest the crosshair while they or the camera move
- **Lens:** focal length, aperture and focus on logarithmic sliders that snap to the marks (full stops for the aperture); − / + step one mark. *Manual* opens focal length or aperture beyond the real lens, with editable limits
- **Presets** per camera store optics and position; they are approached with the **transition time** *Cut · Fast 3 s · Slow 10 s · Manual*, the same move as in the shotlist. **Capture shot** (main action) puts the current view into the shotlist
- **Camera control** folds open under the presets: pan/tilt pad, track, height, speed steps and takes (see *Shotlist & Rig*)
- **One scroll area:** picture, controls, presets and camera control scroll together, so everything is reachable in a small window and on a phone. From about 760 px width the data panel sits beside the picture, below that underneath it

### Multiview
- Every camera live as a tile, like the multiviewer of a vision mixer — camera, lens range, focal length and horizontal FOV on each tile
- Large **Preview** (green) and **Program** (red) windows; Preview is always the selected camera, so 2D, 3D and Preview follow along
- **CUT** (Space) and **AUTO** dissolve (Enter, duration adjustable); after a take the old program source moves to preview
- Click a tile for preview, double-click to take it straight to program; keys 1–9 = preview, Shift+1–9 = program
- Time-of-day timecode (25 fps) in the toolbar
- **3D · Simple** switch in the toolbar: rendered pictures through the 3D scene (default) or the classic drawing
- One shared renderer for all tiles; tiles render small (max. 480 px), Preview/Program larger. After a change the big windows come first and the tiles follow within a few frames instead of freezing the window. Quality lowers itself once if pictures take too long
- Draws every camera itself — Preview and Multiview work side by side, with or without the Preview panel open

### Shotlist & Rig
- **Shotlist:** *Capture shot* freezes the selected camera — position, pan, tilt, focal length, aperture, focus — as a numbered shot with a thumbnail. Several shotlists per project; name each shot, add a note, set the transition (*Off · Fast · Slow · Manual*) and the movement style of the rig. A transition that is physically too fast for the rig is flagged. Step through with Q / E, play the sequence, export the storyboard as PNG or print it / save it as PDF. Shotlists are part of the project: they are saved in the `.mcplan` (and the `.avplan` cameras slot), come back with the autosave and follow undo / redo. Opening a project saved before shotlists lived in the file takes over the shotlists this browser kept on its own whose shots point at that project's cameras; each list moves into the first such project, and a copy of the old lists stays in local storage
- **Rig control** folds open as *Camera control* in the camera view, so the move and its picture are visible together: pan / tilt with the arrow keys or by dragging, track (J / L) on rigs that travel, height, focal length; speed steps within the rig's real limits (m/s, °/s). *Record take* stores a movement per camera that can be replayed, also in a loop

### FOV & DoF Calculator
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

### Project & Layout
- Save/load projects as JSON with version tracking and unsaved changes detection
- **Undo / redo:** `Ctrl/⌘+Z` steps back, `Ctrl/⌘+Shift+Z` (or `Ctrl+Y`) steps
  forward; also under *Edit*, greyed out when there is nothing to undo. Every
  change to the plan counts — cameras, stage, room, walls, persons, floor plan,
  shotlists — and one drag, one slider move or one edited field is one step. Inside a
  text or number field the field's own undo applies. Opening a file or starting
  a new project starts the history afresh (up to 100 steps).
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
- Layout modes: Focus (single tab) and Grid (2D and 3D on the left; Preview, Multiview and Calculator stacked on the right). In Grid mode drag a module from the tab bar onto the layout to dock it somewhere else — also one that is already open
- Customizable layout presets (save/load/delete)
- Venue templates: football stadium, stadium event, small and large concert, church, conference, custom (save your own) — each with fitting audience areas and video walls
- Export: Combined 1920px PNG containing 2D plan, 3D view, camera preview, and technical data sheet

### Desktop App
- Windows installer (NSIS) and portable build, macOS DMG and ZIP (Apple silicon and Intel) with Electron — downloads on the [releases page](https://github.com/larszu/lz-multicam-planner/releases/latest)
- Native window controls, external links open in system browser
- App data stays in the `MultiCam Planner` folder (the product name before the
  rename to LZ Multicam Planner); `electron/main.cjs` pins it before first use
- Header shows the Lars Zumpe Medienproduktion signet (inline, `--color-bc-logo`:
  Navy on light, Off-White on dark, dot always Tally red), Settings → About the main logo
  (`src/assets/brand/`, original contour files, Navy/Off-White by theme)

---

## Design / interface

Follows the design contract 2026-10 (ADR-007 of the suite, changed 2026-10-13),
same values as the Cable Planner:

- **Light and dark, always.** Visible switch **Auto · Light · Dark** in the
  header (also in Settings → General). Auto follows the system; the choice is
  stored. Dark is anthracite, not navy.
- **Neutral surfaces, blue only as accent** (main button, selection, links).
  Tally red only for focus ring, live/tally and the logo dot.
- **Status colours as text** use their own variants (`text-bc-red-text`,
  `-yellow-text`, `-green-text`): lightened on dark, darkened where needed on
  light, so every message reaches 4.5:1 on every surface.
- **Soft shapes via tokens:** radius s/m/l/xl/full (6/10/20/24/999 px),
  shadows 1/2/3 — panels are cards, dialogs radius xl, primary buttons are
  pills, segment controls for exclusive choices. Glass header (blur 16 px).
- **2D plan and 3D planning view follow the theme**; camera, lens and coverage
  colours stay unchanged. The camera preview and the 3D show look are a
  simulated room and stay as they are.
- **One slider everywhere** (lens, pan/tilt, room, floor plan, daylight,
  calculator): round handle, track filled up to the value, marks underneath
  whose labels never overlap. Drag the track or the **name** (like a knob),
  type the value into its field (Enter applies, ↑/↓ one step), arrow keys
  fine, Shift+arrow coarse, Home/End for the limits; **double-click or
  double-tap** resets to the default where there is one (pan, tilt, track,
  time of day …). Marks snap magnetically; Shift keeps the value free. On
  touch the track is 44 px high and a vertical swipe still scrolls the page.
  Checked by `slider:check` (target size, and no second, native slider).
- All values live in `src/index.css` (`--color-bc-*`, `--radius-bc-*`,
  `--shadow-bc-*`). Checked by `brand:check` (values in both modes, signal
  once, logo colours, switch present), `form:check` (radius/shadow only via
  tokens), `kontrast:check` (WCAG AA in both modes, including status text) and `kopfzeile:check`
  (header structure).

---

## Tech Stack

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

This is a property of *this repository* (E-17/E-20, 2026-09-08). The UI is
English-source with German as the first translation (`src/i18n/de/`);
`npm run lang:check` measures it, and the machine-readable declaration sits in
`package.json` under `avplan.sourceLanguage`.

---

## Getting Started

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

App icons come from `build/icon.svg` and `build/favicon.svg`;
`node scripts/gen-icon.mjs` renders `build/icon.png`, `build/icon.ico` and the
web icons in `public/` (needs `npm install --no-save sharp png-to-ico`).

A GitHub Actions workflow (`.github/workflows/release-build.yml`) automatically
builds Windows and macOS artifacts whenever a release is published and attaches
the binaries (NSIS installer, portable .exe, DMG, ZIP) directly to the release
page. It can also be triggered manually via the Actions tab for testing.

---

## Useful Scripts

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

---

## Documentation

- [`docs/MERGE_INTO_CABLE_PLANNER.md`](MERGE_INTO_CABLE_PLANNER.md) —
  **superseded, kept as analysis.** It describes folding MulticamPlanner into
  `cable-planner`; the suite went the other way (ADR-006: crowded areas move
  *out* into their own repos and the shell integrates them). Its list of
  dependency-free modules and its risk section still hold.
- [`docs/venue-suite-architecture.md`](venue-suite-architecture.md) —
  extends that guide with `light-planner` and a shared venue data model. The
  shared-model part is built (`@avplan/*`); the merge part is superseded too.

### Shared suite packages (ADR-015)

`src/avplan/<name>/` holds **byte-identical copies** of packages from
`av-planner-suite/packages/<name>/src`, each with a `MANIFEST.json` (SHA-256
per file). Today that is `@avplan/floorplan`: the floor-plan loader (image/PDF,
drag & drop handlers), the `venue-exchange` schema (including the optional room
fields and the seat layout of audience areas), which
`src/utils/venueExchange.ts` re-exports next to MultiCam's own conversion; and
`@avplan/scene3d`: the render pipeline, haze beams, surfaces, people, crowd,
stands, LED walls, sky and sun position (needs `suncalc`) and the camera
bodies, lenses and mounts behind the 3D view.
**Never edit these folders here** — change the package in the suite and run
`npm run pakete:verteilen` there. `src/__tests__/avplanKopien.test.ts` hashes
every file against its manifest and fails on changed or unlisted files.

`npm run docs:reachable` fails the build if a document under `docs/` is not
reachable by links from an entry page. Both were orphaned until 2026-09-04.

