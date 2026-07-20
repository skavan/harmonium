# Harmonium

A lightweight, instant-on remote-control frontend for Home Assistant,
built for low-power Android hardware remotes (Sanytron Astrion and
similar) while running equally well in any browser or tablet.

Successor to the `harmonia`/`hastrion` dashboards; the prototype was
developed as `remote-proto`.

## Why it exists

The bottleneck on weak remote hardware is not the webview — it is the
stock HA frontend: a multi-megabyte bundle plus a websocket firehose of
every entity in the instance. Harmonium subscribes to **only the
entities on the current screen** (`subscribe_entities` + `entity_ids`,
compact diffs — ~20 messages instead of thousands) and renders them
with a dependency-free engine that ships as **one HTML file**.

Core doctrine (full details in `docs/screen-schema.md`):

- **Engine is dumb, HA is the brain.** Activities are HA scripts;
  activity state is an `input_select` HA owns; anything smart is a
  template sensor or automation on the HA side.
- **Config is pure data.** Screens, sections, tiles, activities,
  context bindings, keymaps, theme tokens — all in `config.json`.
  `$context.<slot>` is the only substitution in the system.
- **Buttons are first-class.** Full D-pad/spatial-focus operation;
  Harmony-style passthrough (during an activity, the physical D-pad IS
  the device's D-pad); touch always drives the UI.
- **Device detail pages are generated, not authored** — composed per
  domain from power/stepper/chips primitives, with options read from
  the entity's own attributes.

## Repository layout

```
harmonium/
├─ build.mjs              # zero-dependency build → dist/
├─ config/
│  └─ config.json         # the live Porch config (example + daily driver)
├─ src/
│  ├─ index.template.html # HTML shell with style/script insertion points
│  ├─ styles/             # CSS by concern (tokens, chrome, widgets, grid, controls, auth)
│  ├─ core/               # engine: config, socket, context, activities, details
│  ├─ widgets/            # ONE FILE PER WIDGET (self-registering adapters)
│  └─ ui/                 # rendering, focus, input routing, boot
├─ dist/                  # built artifact (index.html + config.json) — the deployable
├─ docs/
│  ├─ PROJECT.md          # intent, thesis, decision log, roadmap
│  ├─ screen-schema.md    # the config contract + design doctrine
│  └─ config-guide.md     # page-by-page map: what config makes what screen
├─ tests/                 # Playwright smoke suites + runner
└─ ha/                    # required HA-side objects (scripts, helpers, automation)
```

The widget catalog is the extensibility surface: each file in
`src/widgets/` registers one adapter on the shared tile chassis
(`sub`/`isOn`/`meter`/`select`/`capture`/`keys`/`body`/`wire`/`render`).
Adding a widget = adding a file + one line in `build.mjs`.

## Build

```
node build.mjs
```

Produces `dist/index.html` (+ a copy of the config). No npm install, no
bundler — deliberate: the artifact must stay a single auditable file.

## Test

```
cd tests && sh run.sh
```

Serves `dist/` and runs the Playwright smoke suites (requires
`playwright-core` and a Chromium binary; suites print JSON results).

## Deploy (current dev loop)

1. Copy `dist/index.html` and `dist/config.json` to HA:
   `/config/www/remote-proto/` (served at
   `http://<ha>:8123/local/remote-proto/`).
2. Reload the remote: press `button.astrion1_load_start_url`
   (Fully Kiosk).

Kiosk provisioning (dev only): open
`.../index.html#host=<ha:port>&token=<LLAT>&device=astrion` once —
credentials are trimmed, stored in localStorage, and stripped from the
URL. See `ha/README.md` for the HA-as-clipboard provisioning script
that avoids pasting tokens anywhere near the device.

## Status & roadmap

Working v1 prototype, field-testing on the Astrion as a daily driver.
Next phases (see `docs/PROJECT.md`): custom HA integration (config
storage + websocket delivery + pairing), Lovelace importer, drag-drop
editor, Svelte v1 frontend, minimal APK shell.
