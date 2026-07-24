# Harmonium Architecture

How the pieces fit, and the doctrines that keep them simple. This is
the current-state companion to `PROJECT.md` (the decision log) and
`screen-schema.md` (the config contract's working design doc).

## The big picture

```
 yaml/views/*.yaml ──build_config.py──▶ dist/config.json ──┐
                                                           │  seed / deploy
 src/** ────────────build.mjs─────────▶ dist/index.html    ▼
                                              │      HA custom integration
                                              │      · Store (validated config)
                                              │      · /api/harmonium/config
                                              │      · harmonium.run/reseed/set_activity
                                              │      · select.harmonium_<room>_activity
                                              ▼               ▲
                                     the REMOTE (webview) ────┘ websocket
                                              ▲
 studio-src/** ──vite──▶ studio.html ─────────┘  (HA panel; its preview
                                                  iframe IS the engine)
```

Two sources of truth, one runtime shape:

- **YAML** (`yaml/views/`) is the hand-authoring path. The compiler
  validates and emits `config.json`.
- **The Studio** edits the integration's stored config live and
  deploys through the same validator.

Both converge on the same runtime JSON; the engine only ever sees that.

## The engine (`src/`, ships as one file)

Vanilla JS, zero dependencies, concatenated by `build.mjs` into
`dist/index.html`. One concern per file:

- `core/config.js` — CONFIG globals, theme, the default keymap.
- `core/socket.js` — HA websocket: auth → **filtered subscribe**
  (`subscribe_entities` with the current screen's entity list) → diffs.
- `core/context.js` — `$context.<slot>` resolution, generator
  expansion (activities / devices-cast / apps / presets), screen
  entity derivation, subscriptions.
- `core/activities.js` — activity lifecycle: start/stop sequences via
  `harmonium.run`, confirm-to-switch, warm-start doctrine.
- `core/details.js` — generated `detail:<entity>` screens: per-device
  custom controller → stock domain controller → hardcoded fallback;
  `$device` substitution; the trailing-action (⚙) resolution.
- `widgets/*.js` — ONE widget per file, self-registered on `WIDGETS`.
  A widget is an adapter on the shared tile chassis: `sub` (status
  line), `isOn`, `meter`, `select` (tap), `hold` (550 ms touch hold),
  `body`/`wire` (custom DOM), `capture`/`keys` (D-pad capture).
- `ui/render.js` — banner/hero, sections grid (page `grid.columns`,
  per-section `columns` override), tile DOM, state re-render.
- `ui/focus.js` — spatial focus for D-pad; trails (`::trail` zones).
- `ui/input.js` — the key ladder and physical-key policy (below).
- `ui/boot.js` — auth overlay, provisioning, `#preview=1` mode.

### The two tile archetypes

- **`device`** — ONE entity. Renderer, icon, tap verb (play/pause a
  playing media player, toggle a light), and the page it opens all
  infer from the entity. `tap:` overrides the verb; `target:`
  overrides the page; `attr:` shows one attribute instead of the
  smart summary; `trailing: false` removes the ⚙ block for a clean
  readout (tap + long-press only).
- **`nav`** — opens another page. `style: auto | plain | image |
  summary`; `auto` resolves: tile has an image → image; target is a
  room → image; target page has entities → summary; else plain. A
  summary card's counts derive LIVE from its target page's tiles —
  one source of truth, nothing baked.

Everything else is a **generator** (`activities`, `devices` = the
activity's cast, `apps`, `presets_from`) or a **raw widget**
(transport, dpad, volume, buttons, …) for the advanced hand.

### Key ladder & power doctrine

Every screen has a class (`room` / `group` / `activity` / `detail`)
that the physical-key policy consumes:

- **Home** climbs the `parent` ladder (view → room → rooms hub).
- **Back** unwinds UI history; during passthrough it goes to the
  device, hold-Back forces UI back.
- **Power** (2026-07-23 doctrine): on a view with nothing running —
  nothing; with an activity running — tap asks for confirmation, hold
  ends immediately. On a controller, Power passes to the device; on a
  detail page it toggles the device.
- **Passthrough**: an activity's controller with `dpad_passthrough`
  sends arrows/select/back to the device (Harmony-style) — the remote
  IS the device's remote while the activity runs.

## Activities & the controller library

An **activity** ("Watch Smart TV") owns: a device **cast** (first =
primary, its face), **role wiring** (`context.media_player/dpad/
power/volume/volume_level`), Start/Stop **actions** (sequences run
HA-side), and a **screen** — almost always a library controller
addressed as `controller:<id>`.

Controllers are shared stock surfaces (Media Players, plus the domain
stocks light/switch/climate/cover/fan whose tiles bind `$device`).
Customization is **lazy**: nothing is copied until the user diverges —
then a copy (`variant_of` marker) is minted, stamped with the
activity's cast, and relinked. "↺ use stock" reverts and reaps
orphans; "Reset to stock" re-copies preserving identity. Per-device
copies of domain stocks (`variant_of: cover, entity: …`) override that
one device's generated detail page.

## The compiler (`yaml/build_config.py`)

- One YAML file per view; activities and sequences are declared by the
  view that owns them and stamped with it.
- Taxonomy: `type: hub | controller | library` (+ `room: true`) — the
  compiler derives the engine's `class`/`view_kind`.
- `library: true` views move into `config.controllers`; references are
  rewritten to `controller:<id>`.
- Hard migrations live here (e.g. NAV_MIGRATE: legacy `group`/`room`
  tiles → `nav` + style).
- `validate()` walks every reference (navigation targets, sequence
  refs, tile ids, nav targets) and refuses to emit a broken config.

## The integration (`integration/custom_components/harmonium/`)

- **Store**: the deployed config, seeded from `dist/config.json` by
  `harmonium.reseed`.
- **API**: `/api/harmonium/config` GET/POST — POST validates (same
  reference walking, controller-aware), stores, and republishes the
  file the remotes fetch.
- **Services**: `harmonium.run` (execute a named sequence),
  `harmonium.set_activity`, `harmonium.reseed`.
- **Select platform**: mints `select.harmonium_<room>_activity` per
  activity-owning hub — the routing cache the engine subscribes to.
- **Studio panel**: serves `studio/studio.html` in the HA sidebar.

## The Studio (`studio-src/`, Svelte 5)

Single-file build; the preview pane is the REAL engine loaded in
`#preview=1` mode — every valid edit pushes the draft config into the
iframe (`postMessage`), so what you see is what ships.

State layer (`src/lib/state/`, one concern per module — see
`state/index.js` for the map): reactive app state · stock library +
config healing · preview plumbing · model/slices · screen ops ·
draft flows · controller lifecycle · workspaces · server I/O.

UX doctrines:

- **The universal ＋ contract**: any ＋ that creates something (a
  Start/Stop action, a control page, a nav card's page) jumps you
  into its editor in DRAFT mode with a banner — Confirm/Keep links
  and returns; Discard unwinds everything and returns. You always
  land back exactly where you left.
- **Ids auto-follow names** (slugged, room-prefixed for activities)
  until hand-pinned; renames walk every reference.
- **Workspaces**: `live` edits the deployed config; `scratch` is a
  browser-local sandbox. The stock controller library is SYSTEM and
  rides into every workspace.
- **Deletes refuse politely**: anything still referenced names its
  blockers instead of breaking the config.

## Testing (`tests/`)

Ten Playwright suites, run by `tests/run.sh` against the built
artifact. The engine suites stub the websocket (`S.ws`) and drive real
DOM; `smoke-studio` boots the actual Studio with a stubbed HA API and
asserts the full authoring loop — including that the preview iframe
(the real engine) re-renders live edits. Suites print JSON; `errs`
must stay empty and semantic fields are compared in review.

## Deploy & ops

See README "Deploy". Rules of thumb: config change → `reseed`; engine
change → Astrion cache-clear + reload; integration `.py` change → HA
restart; Studio change → refresh the panel. Never paste long-lived
tokens through chat or commit them — provisioning uses the URL-hash
trick and localStorage.
