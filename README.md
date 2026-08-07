# Harmonium

A lightweight, **instant-on remote-control frontend for Home Assistant**,
built for low-power Android hardware remotes (Sanytron Astrion and
similar) while running equally well in any browser or tablet — plus the
**Harmonium Studio**, a live visual editor that runs as an HA panel.

Successor to the `harmonia`/`hastrion` dashboards; the prototype was
developed as `remote-proto`.

## Why it exists

The bottleneck on weak remote hardware is not the webview — it is the
stock HA frontend: a multi-megabyte bundle plus a websocket firehose of
every entity in the instance. Harmonium subscribes to **only the
entities on the current screen** (`subscribe_entities` + `entity_ids`,
compact diffs — ~20 messages instead of thousands) and renders them
with a dependency-free engine that ships as **one HTML file**.

## The pieces

| Piece | What it is | Ships as |
|---|---|---|
| **Engine** | The remote UI: screens, tiles, activities, D-pad focus, passthrough | `dist/index.html` (single file, zero deps) |
| **Config** | Pure data: screens, tiles, activities, keymaps, theme | `dist/config.json` |
| **Compiler** | Authoring pipeline: friendly YAML → runtime JSON, validated | `yaml/build_config.py` |
| **Integration** | HA custom component: config store + validate→store→deploy API, `harmonium.*` services, minted activity `select`s | `integration/custom_components/harmonium/` |
| **Studio** | Visual editor as an HA panel — live preview IS the real engine | `studio-src/` (Svelte 5) → single `studio.html` |

## Core doctrine

Full details in `docs/ARCHITECTURE.md`; the short version:

- **Engine is dumb, HA is the brain.** Activities run HA-side
  (`harmonium.run` sequences / scripts); activity state is a minted
  `select.harmonium_<room>_activity` the integration owns; anything
  smart is a template sensor or automation on the HA side.
- **Config is pure data.** Screens, sections, tiles, activities,
  context bindings, keymaps, theme tokens — all in `config.json`.
  `$context.<slot>` is the only substitution in the system.
- **Buttons are first-class.** Full D-pad/spatial-focus operation;
  Harmony-style passthrough (during an activity, the physical D-pad IS
  the device's D-pad); touch always drives the UI.
- **Registries generate UI.** Activities, an activity's device cast, its
  volumes and groups, apps/presets, and the controller library all
  render from generators — edit the model once, every surface follows.
- **Structure is declared, never inferred — at the layer that owns the
  decision.** A device declares what it *can do*; the activity's cast
  declares where those controls are *drawn* (a `group` tucks some of
  them behind one nav card, and `shows` picks what the children render
  as). The UI cannot show — and the user cannot set — a thing the config
  only implies; and a thing declared on the wrong layer cannot be
  reused.
- **A control the device can't perform is a lie — but a sleeping device
  is not an incapable one.** Widgets self-suppress on
  `supported_features` (no transport row on an AV receiver), and the
  engine remembers the union of everything an entity has ever reported,
  so a device that is merely off still shows its whole page.
- **Two tile archetypes.** A `device` tile is ONE entity — renderer,
  icon, tap verb and page all infer from it. A `nav` card opens another
  page (styles: `auto | plain | image | summary`). Everything else is a
  generator or a raw widget.
- **Controllers are a shared library.** Activities navigate to stock
  control surfaces (`controller:<id>`); customizing is LAZY — a copy is
  minted on first divergence and can always be reset or reverted.
  Domain detail pages (light/cover/climate/…) follow the same pattern.
- **Device detail pages are generated, not authored** — composed per
  domain from power/stepper/chips primitives, per-device overridable.

## Repository layout

```
harmonium/
├─ build.mjs              # zero-dependency build → dist/ (engine + compiled config)
├─ src/                   # ENGINE source (vanilla JS, one concern per file)
│  ├─ index.template.html #   HTML shell with style/script insertion points
│  ├─ styles/             #   CSS by concern (tokens, chrome, widgets, grid, controls)
│  ├─ core/               #   config · socket · context · activities · details
│  ├─ widgets/            #   ONE FILE PER WIDGET (self-registering adapters)
│  └─ ui/                 #   render · focus · input routing · boot
├─ yaml/                  # AUTHORING source of truth
│  ├─ build_config.py     #   compiler: views/*.yaml → config.v2.json (validated)
│  └─ views/              #   one file per view (porch, tv, music, …)
├─ integration/           # HA custom component (harmonium)
│  └─ custom_components/harmonium/   # store, API, services, select platform, Studio panel
├─ studio-src/            # STUDIO source (Svelte 5 + Vite → single studio.html)
│  └─ src/lib/            #   state/ (focused modules) · components/ · editors/
├─ dist/                  # built artifact (index.html + config.json) — the deployable
├─ tests/                 # Playwright smoke suites + runner (10 suites)
├─ docs/                  # architecture, config guide, cookbook, decision log
└─ ha/                    # legacy HA-side objects from the pre-integration era
```

The widget catalog is the extensibility surface: each file in
`src/widgets/` registers one adapter on the shared tile chassis
(`sub`/`isOn`/`meter`/`select`/`capture`/`keys`/`body`/`wire`/`hold`).
Adding a widget = adding a file + one line in `build.mjs`.

## Build

```sh
node build.mjs            # engine + config → dist/  (no npm install, no bundler)
cd studio-src && npm run build   # Studio → integration/.../studio/studio.html
```

The engine targets **ES2019 / Chromium 75** — cheap Android remotes ship
vendor-frozen webviews, so that floor is the normal case rather than the
exception (`styles/compat.css` carries the flexbox-gap fallback behind a
boot probe). The build is deliberately zero-dependency: the artifact must
stay a single auditable file. (`build.mjs` invokes `yaml/build_config.py`
— python3 + PyYAML — to compile the YAML views; without python it falls
back to the frozen `config/config.json`.)

## Test

```sh
sh tests/run.sh
```

Serves `dist/` and runs the 10 Playwright smoke suites (engine
navigation, keys, devices, sliders, details, preview protocol, and a
full Studio walkthrough where the preview iframe is the real engine).
Suites print JSON result objects; `errs` must stay empty.

## Deploy (current dev loop)

1. Push the repo to HA (`push-to-ha.bat` robocopies to the config
   share): `dist/` → `/config/www/harmonium/`, the integration →
   `/config/custom_components/harmonium/`.
2. Config changed? `harmonium.reseed` — a three-way merge, not an
   overwrite; snapshots first, `harmonium.restore_backup` undoes it.
3. Engine changed? **Just reload.** The entry stub asks the integration
   for a hash of the deployed engine and hands off to
   `index.html?v=<hash>`, so browsers refetch exactly when the bytes
   change. No cache clear, no per-device setup, no IPs to pin.
4. Integration `.py` changed? Restart HA.
5. `studio.html` changed? Hard-refresh the Studio tab (browser cache).

The Studio lives in the HA sidebar (Harmonium panel) and edits the
stored config live: **Save & Deploy** validates server-side, stores,
and republishes `config.json`.

Kiosk provisioning (dev only): open
`.../index.html#host=<ha:port>&token=<LLAT>&device=astrion` once —
credentials are trimmed, stored in localStorage, and stripped from the
URL. See `ha/README.md` for the HA-as-clipboard provisioning script
that avoids pasting tokens anywhere near the device.

## Documentation

- `docs/ARCHITECTURE.md` — how the pieces fit: data flow, doctrines,
  the tile chassis, the controller library, the draft-confirm UX.
- `docs/config-guide.md` — page-by-page: what config makes what screen.
- `docs/cookbook.md` — recipes for common edits.
- `docs/screen-schema.md` — the config contract (working design doc).
- `docs/authoring-ui.md` — Studio design notes (historical).
- `docs/PROJECT.md` — intent, thesis, full decision log, roadmap.
- `docs/GETTING-STARTED.md` — clean install, end to end.
- `docs/HANDOFF.md` — where the last session stopped and what is open.

## Status & roadmap

Daily-driving on a Sanytron Astrion (Fully Kiosk). Recent: nav-card
unification, domain controllers as editable stock, lazy instancing,
draft-confirm ＋ flows, grid density controls. Next (see
`docs/PROJECT.md`): preset library rework, action-card archetype,
minimal APK shell, OAuth onboarding, yaml round-trip.

License: not yet chosen — all rights reserved until one lands.
