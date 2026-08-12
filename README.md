# Harmonium

A lightweight, **instant-on remote-control frontend for Home Assistant**,
built for low-power Android hardware remotes (Sanytron Astrion, Haptique
RS90 and similar) while running equally well in any browser or tablet —
plus the **Harmonium Studio**, a live visual editor that runs as an HA
panel.

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
| **Engine** | The remote UI: screens, tiles, activities, D-pad focus, passthrough, library + search | `dist/index.html` (single file, zero deps) |
| **Config** | Pure data: screens, tiles, activities, keymaps, theme — **owned per house by its HA** | `www/harmonium/config.json` on each house |
| **Integration** | HA custom component: config store + validate→store→deploy API, `harmonium.*` services, minted activity `select`s, favourites sensors | `integration/custom_components/harmonium/` |
| **Studio** | Visual editor as an HA panel — the live preview IS the real engine | `studio-src/` (Svelte 5) → single `studio.html` |

> **`dist/config.json` is a test fixture, not a deployable.** Code is
> shared across houses; config belongs to each house's Home Assistant
> and is never pushed from the repo. `push.bat` enforces this with a
> house marker on the target share. See `houses/README.md` for the
> n-house model, the golden-master rule, and why `harmonium.reseed`
> is retired.

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
- **The cast player decides.** Every playable id is routed against the
  cast player — `native` / `bridged` / `fallback` / `none`. Fallbacks
  (which evict the speaker's queue) are marked and two-press
  confirmed; unplayables are never offered. Provenance is visible:
  each library tile wears a system badge (SO/MA/HA) and, when
  knowable, a service badge (spotify/deezer/…).
- **Silence is a bug.** A failed service call flashes HA's own error in
  the bar; an in-flight play says "Queuing …" on the hero; truncated
  lists say they truncated. Nothing fails, loads, or clips silently.
- **No capability sniffing, ever.** Measured on real hardware: Sonos
  and Music Assistant both advertise `SEARCH_MEDIA` while behaving
  completely differently, and Sonos browse nodes report
  `can_search: false` on a player that answers 521 results. Behaviour
  is keyed on declarations and provenance (entity registry), never on
  feature flags.
- **Registries generate UI.** Activities, an activity's device cast,
  its volumes and groups, apps/presets, and the controller library all
  render from generators — edit the model once, every surface follows.
- **Controllers are a shared library** with **generation-stamped
  stocks**: every stock shape carries `gen`, and the Studio heals any
  non-variant copy whose generation is behind — so a config authored
  three versions ago grows the tiles new generators emit. Custom
  copies (`variant_of`) are never touched.
- **Device detail pages are generated, not authored** — composed per
  domain from power/stepper/chips primitives, per-device overridable.

## Repository layout

```
harmonium/
├─ build.mjs                 # full build (legacy: also recompiles config from yaml/)
├─ build-engine.mjs          # ENGINE-ONLY build → dist/index.html — use this one
├─ push.bat                  # push CODE to a house (never config; checks house marker)
├─ push-catrock-*.bat        # double-click wrappers (engine / studio / all)
├─ src/                      # ENGINE source (vanilla JS, one concern per file)
│  ├─ index.template.html    #   HTML shell with style/script insertion points
│  ├─ styles/                #   CSS by concern (tokens, chrome, widgets, grid, …)
│  ├─ core/                  #   the engine's brain, one file per concern:
│  │   header.js             #     architecture prologue + TIMING tunables
│  │   config.js  socket.js  #     CONFIG/theme · websocket + pending-play stamp
│  │   context.js            #     activity scope + $context resolution
│  │   generators.js         #     expandTile: apps/keys/devices/volumes/presets/groups
│  │   gen-browse.js         #     the browse generator (library surface)
│  │   gen-browse-amalgam.js #     ★ Favorites merge + ♫ de-mirrored library
│  │   gen-browse-search.js  #     the search grid (results, chips, states)
│  │   subscribe.js          #     entitiesFor → subscribe_entities → applyDiff
│  │   activities.js         #     lifecycle, presets, the action grammar (+confirm)
│  │   routing.js            #     brRoute + provenance badges (pure functions)
│  │   browse.js             #     browse state, tree fetch, the bar (bands 1+2)
│  │   sonos-index.js        #     local index: crawl, cache, forgiving matching
│  │   search.js             #     query line, engines (index/MA/generic), keyboard
│  │   queue.js  keycap.js  details.js
│  ├─ widgets/               #   ONE FILE PER WIDGET (self-registering adapters)
│  └─ ui/                    #   tiles (chassis) · render · focus · input · boot
├─ integration/              # HA custom component (store, API, services, sensors, Studio host)
├─ studio-src/               # STUDIO source (Svelte 5 + Vite → single studio.html)
├─ houses/                   # per-house profiles + preserved configs (see its README)
├─ dist/                     # built engine + the CT config AS A TEST FIXTURE
├─ tests/                    # Playwright smoke battery (19 suites — see tests/README.md)
├─ docs/                     # architecture, guides, design docs, decision log
└─ yaml/                     # LEGACY authoring model (pre-Studio) — do not run build.mjs here
```

The widget catalog is the extensibility surface: each file in
`src/widgets/` registers one adapter on the shared tile chassis
(`sub`/`isOn`/`meter`/`select`/`capture`/`keys`/`body`/`wire`/`hold`).
Adding a widget = adding a file + one line in `build.mjs`'s list.

## Build

```sh
node build-engine.mjs            # engine → dist/index.html (no npm, no bundler)
cd studio-src && npm run build   # Studio → integration/.../studio/studio.html
```

Use **`build-engine.mjs`**, not `build.mjs`: this clone carries the
legacy `yaml/` authoring model, and `build.mjs` would recompile
`dist/config.json` from it — overwriting the test fixture. The
engine-only build parses its file lists out of `build.mjs`, so the two
can never drift.

The engine targets **ES2019 / Chromium 75** — cheap Android remotes
ship vendor-frozen webviews, so that floor is the normal case
(`styles/compat.css` carries the flexbox-gap fallback behind a boot
probe). The build is deliberately zero-dependency: the artifact must
stay a single auditable file. Build the Studio on a machine with its
own `node_modules` — never in a sandbox with a different tree.

## Test

```sh
cd dist && python3 -m http.server 8482 &
cd tests && for t in smoke-*.mjs; do node "$t"; done
```

Nineteen Playwright suites drive the **real engine** against stubbed
websockets and real DOM — navigation, keys, devices, sliders, details,
music, search, routing (`smoke-routing`), the library amalgam
(`smoke-amalgam`), the Sonos index (`smoke-index`), the library UI
(`smoke-libui`), the preview protocol, and a full Studio walkthrough
where the preview iframe is the engine itself. Every suite prints a
JSON object; **`errs` must stay empty**. See `tests/README.md`.

## Deploy

```sh
push catrock engine     # or double-click push-catrock-engine.bat
```

`push.bat <house> [engine|studio|integration|all]` copies **code only**
to that house's HA share and refuses if the share's house marker
disagrees — a stale drive mapping cannot push to the wrong house.
Config is authored in the Studio (Save & Deploy validates server-side,
stores, republishes). Rules of thumb: engine change → push + remote
cache-clear/reload; Studio change → machine build + push + hard
refresh; integration `.py` change → push + HA restart. **Never run
`harmonium.reseed`** — it predates the multi-house model and would
merge the test fixture into a live house.

Kiosk provisioning (dev only): open
`.../index.html#host=<ha:port>&token=<LLAT>&device=astrion` once —
credentials are trimmed, stored in localStorage, and stripped from the
URL. See `ha/README.md` for the HA-as-clipboard provisioning script
that avoids pasting tokens anywhere near the device.

## Documentation

- `docs/ARCHITECTURE.md` — how the pieces fit: data flow, doctrines,
  the tile chassis, the controller library.
- `docs/GETTING-STARTED.md` — clean install, end to end.
- `docs/config-guide.md` — page-by-page: what config makes what screen.
- `docs/cookbook.md` — recipes for common edits.
- `docs/screen-schema.md` — the config contract (working design doc).
- `docs/design-search-sources.md` — the search design (phases 1–3 built).
- `docs/design-library-ui.md` — the library surface + the routing model.
- `docs/PROJECT.md` — intent, thesis, full decision log, changelog.
- `docs/HANDOFF.md` — where the last session stopped and what is open.
- `houses/README.md` — the n-house model and the golden-master rule.
- `tests/README.md` — the smoke battery: how it works, how to add one.

## Status & roadmap

Daily-driving on a Sanytron Astrion and a Haptique RS90 (Fully Kiosk),
two houses (one frozen pending an in-person visit). Recent: the
routing model ("the cast player decides"), the library amalgam, the
engine-side Sonos index with forgiving search, generation-stamped
stock controllers, error surfacing and queuing feedback. Next (see
`docs/PROJECT.md` / `docs/HANDOFF.md`): voice input via the IME trick,
index drill-in, per-surface search switch in the Studio, minimal APK
shell.

License: not yet chosen — all rights reserved until one lands.
