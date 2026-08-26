# Harmonium Architecture

*Purpose: How the engine, integration, Studio and config fit together, and the doctrines that keep them simple. Audience: developers reading the code for the first time.*

How the pieces fit, and the doctrines that keep them simple. This is
the current-state companion to `PROJECT.md` (the decision log) and
`screen-schema.md` (the config contract's working design doc).

## The big picture

```
 the STUDIO (HA panel) ──validate──▶ config in HA storage ──┐
                                                           │  deploy
 src/** ─────────build-engine.mjs─────▶ dist/index.html    ▼
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

One source of truth per house: **the Studio** edits the integration's
stored config and deploys through the server-side validator; the
engine only ever sees the resulting runtime JSON. (The pre-Studio
`yaml/` compiler era is preserved at `archive/yaml/`.) Code is shared
across houses; config belongs to each house's HA — see
`houses/README.md`.

## The engine (`src/`, ships as one file)

Vanilla JS, zero dependencies, concatenated by `build-engine.mjs`
into `dist/index.html`. One concern per file:

- `core/header.js` — the architecture prologue + `TIMING` tunables.
- `core/config.js` — CONFIG globals, theme, the default keymap.
- `core/socket.js` — HA websocket: auth → **filtered subscribe**
  (`subscribe_entities` with the current screen's entity list) →
  diffs; call_service error surfacing; the pending-play stamp.
- `core/context.js` — activity scope (which room am I in, presumed
  activity) + `$context.<slot>` resolution.
- `core/generators.js` — `expandTile` (type-keyed dispatch) + the
  page generators: `activities` / `apps` / `keys` / `devices` /
  `presets_from`.
- `core/gen-bands.js` — the controller-band generators: `volumes` /
  `presets` / `speakers` / `groups`.
- `core/gen-cast.js` — the shared cast vocabulary (`castOf`,
  `castMembers`, `groupChildTile`, `presApply`, `srfOff`…).
- `core/gen-browse.js` — the browse generator (the library surface),
  with its two extracted views:
  `core/gen-browse-amalgam.js` (★ Favorites merge + ♫ de-mirrored
  library) and `core/gen-browse-search.js` (the search grid).
- `core/subscribe.js` — entitiesFor → subscribe_entities → applyDiff.
- `core/activities.js` — activity lifecycle: start/stop sequences via
  `harmonium.run`, confirm-to-switch, warm-start doctrine, the shared
  action grammar (incl. the two-press `confirm`).
- `core/routing.js` — **the cast player decides**: `brRoute`
  classifies every playable id native / bridged / fallback / none;
  provenance readers for the system + service badges. Pure functions.
- `core/browse.js` — browse state (`S.browse`), tree fetch/cache, the
  bar (roots row, query line, chips), view toggle.
- `core/sonos-index.js` — the engine-side library index: crawl via
  the browse contract, per-player localStorage cache with `built_at`,
  forgiving matching (fold / edit-distance-1).
- `core/search.js` — `brSearchRun`: local index + Music Assistant's
  deep service + the generic `search_media` contract, merged with
  index-copy-wins dedup.
- `core/queue.js` — per-platform queue adapters + the `queue:` screen.
- `core/keycap.js` — the key-capture virtual screen (`keys:`).
- `core/details.js` — generated `detail:<entity>` screens: per-device
  custom controller → stock domain controller → hardcoded fallback;
  `$device` substitution; the trailing-action (⚙) resolution.
- `widgets/*.js` — ONE widget per file, self-registered on `WIDGETS`.
  A widget is an adapter on the shared tile chassis: `sub` (status
  line), `isOn`, `meter`, `select` (tap), `hold` (550 ms touch hold),
  `body`/`wire` (custom DOM), `capture`/`keys` (D-pad capture).
- `ui/tiles.js` — the tile CHASSIS: icon slot, badge corners (kind /
  service / routing mark / system), trailing zone, spans, column
  fitting, touch long-press.
- `ui/render.js` — banner/hero, navigate, the sections grid (page
  `grid.columns`, per-section `columns` override), state re-render,
  the status bar (flashBar / confirm tones).
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

**STOCK IS LOCKED** (v0.84.5 — Suresh: "stock things like controllers,
skins and so on should be locked; if users want to edit it should be
on local copies"). Stock is *heal-volatile*: `healStockGen` /
`healStockSkins` refresh a behind-`gen` stock item on update, so an
in-place edit of stock would be silently reverted — the worst failure
mode there is. The lock makes that impossible by construction rather
than by inference: a stock surface renders read-only (`inert`) in
`ViewEditor.svelte`, and the only way forward is a fork that is
provably the user's — **⧉ Duplicate to edit** (stamps `variant_of`)
for a named stock, the per-device entity picker for a domain stock. A
domain stock's *Per-device options* (`entity_options`) are NOT
heal-volatile and stay live outside the lock. The same doctrine covers
skins in `SkinPreview.svelte`: a skin still pointing at our stock
image is read-only in the map, and forks via the **"use my photo…"**
upload (repointing `skin.image` makes it theirs, and the map unlocks
with the stock hotspots kept as a starting point).

**OWNERSHIP IS POSITIONAL** (v0.84.6 — the file-layer half). Skins used
to land flat in `www/harmonium/skins/`, so only a content fingerprint
told a stock skin from a user's photo — a guess. The tree is split now:

- `skins/stock/` — integration-owned. Only the deploy writes here; the
  upload endpoint **refuses** it outright (403, not a 409 with an
  "overwrite anyway", because the next deploy would restore the file).
- `skins/user/` — where every upload lands. Naming your photo
  `rs90.png` is harmless: the path, not the name, decides.

`isStockSkinImage()` in `stocklib.js` is the ONE ownership test —
`/skins/stock/` is ours, `/skins/user/` is theirs, and a bare flat name
is claimed only as the pre-split migration path. The healer, the
Studio's skin lock and the cache-bust all call it, so they cannot
disagree. `manifest.json` is keyed by path relative to `skins/`
(`stock/rs90.png`, `user/rs90.png`) for the same reason.

**The migration** rides heal, and keeps a compat window: the deploy
writes `skins/stock/` *and* keeps refreshing the legacy flat copies for
one release, because configs written before the split still point at
the flat path and only heal (Studio load/save) repoints them —
dropping the flat copies immediately would blank those skins in the
gap. A user's own flat photo is grandfathered where it is, never swept:
rewriting its reference is exactly the silent breakage the split
exists to end. Covered by `tests/test-asset-deploy.py` (fresh install,
stock update, user-photo-named-like-stock, pre-split migration) and
`tests/probe-skin-path-split.mjs` (the config-side heal + repoint).

Still on paper: the fork-outdated **"shout"** and an auto-migrator for
forks — see the project's `design-stock-ownership.md`.

## The integration (`custom_components/harmonium/`)

Split by concern (v0.83.11): `__init__.py` is setup/unload wiring
only; `store.py` holds the disk helpers + workspace store + engine
fingerprint; `api.py` the HTTP views + `validate_config`;
`services.py` the four `harmonium.*` services; `workspaces.py` the
pure config surgery; `pairing.py`/`pairbook.py` onboarding;
`packaging.py` the deploy stamps; `select.py`/`sensor.py` entities.

- **Store**: one validated config per WORKSPACE in HA storage; a
  fresh install seeds a bundled starter and deploys it.
- **API**: `/api/harmonium/config` GET/POST (POST validates every
  reference, stores, deploys), `/api/harmonium/workspaces` (CRUD),
  `/api/harmonium/upload` (Studio image upload → `www/images/`),
  pairing endpoints (`pair`/`poll`/`pair_admin`), `engine_version`.
- **Services**: `harmonium.run` (execute a named sequence),
  `harmonium.set_activity`. (`reseed`/`restore_backup` are RETIRED —
  the Studio owns config in the multi-house era.)
- **Select platform**: mints `select.harmonium_<room>_activity` per
  activity-owning hub — the routing cache the engine subscribes to.
- **Studio panel**: serves `studio/studio.html` in the HA sidebar;
  deploys the bundled engine + skins to `www/harmonium/` at setup.

## The Studio (`studio-src/`, Svelte 5)

Single-file build; the preview pane is the REAL engine loaded in
`#preview=1` mode — every valid edit pushes the draft config into the
iframe (`postMessage`), so what you see is what ships.

State layer: `src/lib/state.svelte.js` is the spine (app state,
slices, preview plumbing, save/boot) and re-exports its satellites,
so components import from ONE door: `worlds.svelte.js` (workspace
roster/switch + config export/import), `registry.svelte.js` (live-HA
entities/registry/services + the ⊞ device seeder),
`pairing.svelte.js` (pairing admin + version check),
`snippets.svelte.js`, and the pure `stocklib.js` (stock controller
shapes with their `gen` migration counters, the starter config, and
the normalize/heal chain: "one config door, one normalizer").
Satellite rule: they may touch state's bindings only inside function
bodies — never at module top level (the import cycle evaluates
satellites first; a top-level read is a TDZ crash).

The activity card (the Studio's biggest surface) is a spine + six
per-tab components (v0.83.11): `components/ActivityCard.svelte` owns
the identity strip, tab bar, completion dots, cast/wiring derivations
and preview impersonation, and hands each tab under
`components/activity/` one `card` context object (getters over the
shared `$derived`s plus the cross-tab verbs). Everything a single tab
needs lives in that tab. `activity/lib.js` is the shared role
vocabulary; SetupTab's ⚙ presentation panel and unified cast picker
are their own components (`PresPanel`, `CastPicker`).

The preview pane follows the same shape: `PreviewPane.svelte` is the
spine (toolbar, the wash + key-description brains, screenshot,
footer) and the two remote faces are children under `preview/` —
`SkinPreview.svelte` (photo skin + ✎ map keys + the skew tripwires)
and `SoftRemote.svelte` (plain frame + soft grid), sharing a `pv`
context. `HubEditor` hands its Layout/Keys/Advanced panel to
`editors/PageSettings.svelte`; `TileRow` hands the preset editor to
`components/PresetFields.svelte` (`tile-lib.js` holds the type/icon
vocabulary).

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

## Caches & how to refresh

Four caches, each with a stated owner, lifetime and refresh lever —
the **↻ button in the library's top row refreshes the first three at
once** (tree + index + favourites), which is the only lever most
users ever need:

| Cache | Lives | Lifetime | Refresh |
|---|---|---|---|
| **Browse tree** (`S.browse.nodes`) | page memory | the session — no TTL by design | ↻ button, or reload the page |
| **Sonos index** (`hakr_sidx_<player>`) | localStorage, per player | stale after 24 h; wiped by a browser cache-clear (self-heals on next library open) | ↻ button, or the "Sonos index · updated…" tail row on served searches |
| **MA favourites** (`sensor.harmonium_music_*`) | HA, integration coordinator | hourly (5-min cadence while empty — heals fast after an outage; never blanks good data on a failed read) | ↻ button (best-effort `update_entity` poke), or Developer Tools → `homeassistant.update_entity` |
| **The engine itself** | the webview's HTTP cache | until cleared (Fully caches `/local/` hard) | cache-clear + load start URL — only needed for a NEW ENGINE build, never for content |

Also session-scoped and self-managing: the entity-registry cache
(`S.browse.reg`), signed thumbnail paths (`S.browse.signed` — auth
artifacts, deliberately kept across refreshes), and the view/scope/
keyboard preferences (localStorage `hakr_views_*`, session stickies).

## Testing (`tests/`)

Nineteen Playwright suites run against the built artifact (see
`tests/README.md`). The engine suites stub the websocket (`S.ws`) and drive real
DOM; `smoke-studio` boots the actual Studio with a stubbed HA API and
asserts the full authoring loop — including that the preview iframe
(the real engine) re-renders live edits. Suites print JSON; `errs`
must stay empty and semantic fields are compared in review.

## Deploy & ops

See README "Deploy". Rules of thumb: config is authored in the
Studio (Save & Deploy); engine change → `push <house> engine` +
remote cache-clear/reload; integration `.py` change → push + HA
restart; Studio change → machine build + push + refresh the panel.
Never `reseed`. Never paste long-lived
tokens through chat or commit them — provisioning uses the URL-hash
trick and localStorage.

## OWNERSHIP HAS A REFEREE (v0.85.7)

Every part of an install belongs to one of three buckets — stock (repo
always wins), user (user always wins), or variant (the fight zone) —
and the fights are decided by CONTENT FINGERPRINT, not by trust:
`studio-src/src/lib/ownership.js` classifies a stock-id unit against
`stock-history.js` (fingerprints of every shape ever shipped, generated
from the tagged starters by `tools/gen-stock-history.mjs`). Pristine →
heals silently to current. Edited-in-place (pre-lock era) → PRESERVED:
legitimized as the user's fork (`variant_of` + `forked_by_update`),
unlocked, with "↺ Reset to built-in" in the Studio. The complete
inventory and rules: `docs/design-ownership-buckets.md`. The rule of
thumb when adding anything stock: put the shape in stocklib, regenerate
the starter AND the history, and let probe-stock-sync catch you if you
forget half.
