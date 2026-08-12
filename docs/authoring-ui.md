# Harmonium Authoring UI — design (v0.13 draft)

> **Historical design notes.** This is the document the Studio was
> built FROM; the shipped Studio has since evolved (draft-confirm ＋
> flows, controller library, nav cards, workspaces). For current
> behaviour see `ARCHITECTURE.md`; for history, `PROJECT.md`.

What the user sees while building their app. Grounded in three things
that already exist: the v2 view-file authoring model (`yaml/`), the
harmonia-room-card editor (mined from `www/harmonia.js` — its UX
vocabulary is listed at the bottom), and the engine itself, which turns
out to be the perfect live-preview surface.

## Principles

1. **The view file is the truth.** The UI is an editor of `views/*.yaml`
   documents, not a separate database. Everything the user builds maps
   1:1 to a file a human could read. (This is the property that makes
   the v2 model right: one file = one editing surface = one page on the
   remote.)
2. **Progressive disclosure, YAML escape hatch.** Every panel has a
   simple mode and a "Custom YAML" mode — exactly the harmonia editor's
   `State Mode: Entity checkboxes (default) | Custom YAML rules`
   pattern, with inline example dialogs. Novices never see YAML;
   Suresh never fights a form.
3. **Live data everywhere.** Pickers are fed by HA: entity pickers by
   domain/area, source lists pulled from the actual device (harmonia's
   "Select source from device… Pick a target first to load source
   suggestions"), activity state previews evaluated against live
   states.
4. **The preview IS the product.** The engine is a single file that
   renders a config over a websocket. An iframe at remote aspect
   (320×533) receives the DRAFT config via postMessage and connects to
   the real HA — the user watches their actual home light up inside
   the preview as they edit. No mock renderer to build or maintain.

## The builder's mental model

Three layers, matching the v2 files:

**Layer 1 — Home (the room list).** Tiles for each room + "New Room".
The wizard asks only: name, photo, which HA area(s) it covers. It then
auto-creates the room's `activity_state` input_select, suggests devices
from the area registry, and drops the user into the room workspace.
This replaces hand-writing `porch.yaml`'s skeleton.

**Layer 2 — the Room workspace (95% of time spent).** Split screen:
editor left, live engine preview right (device frame, real states).
Three sections, straight from the harmonia room card: **Activities**,
**Devices**, **Presets** — plus a **Pages** tab for layout.

- *Activity editor* — lift harmonia's four panels nearly verbatim:
  - **Setup**: name, icon source (default / MDI / entity picture /
    URL), accent color, entities, primary entity, navigate-to view,
    "confirm before turning off when already live".
  - **State**: mode toggle — entity checkboxes (any listed entity
    active = on) or custom rules; the rules editor is a condition-row
    builder (entity / attribute / in / not_in) that serializes to the
    v2 `state.on` block the engine now evaluates. Live "would be ON
    right now" indicator.
  - **Actions**: On Start / On Stop rows with the preset dropdown
    (Media player: turn on / select source, Light, Switch, Script,
    Delay, Custom action…). Compiles to an HA script the integration
    owns — the user never opens the script editor. Warm-start safety
    is applied BY THE GENERATOR (wake steps auto-wrapped in "only if
    off", shared devices flagged "never disturb" — the Fire TV lesson
    encoded as a rule, not tribal knowledge).
  - **Subtitle**: auto summary or template, with token help.
- *Devices*: entity picker rows with tile type auto-inferred from
  domain (light→light tile, cover→cover, media_player→media), density
  and grouping controls, tap/hold interaction overrides.
- *Presets*: label + icon + action (same preset dropdown). An
  activity-linked preset gets the ensure-activity behavior for free.
- *Pages*: section list (label, heading, columns) with drag-ordered
  tiles; a "drawer" toggle per sub-view (Apps, Library) that carries
  the pick-and-return behavior and the drawer key rule automatically.

**Layer 3 — System (hidden until asked).** Theme, remotes & keymaps,
physical-button policy (`short_press` / hold roles / hold_ms), debug.
Matches `system.yaml`; the README's instinct that "a future GUI would
hide this" is correct — it appears under a gear, not a tab.

## Physical-key try-out

The preview frame gets a soft remote below it — Back/Home/Power/Menu/
VOL/CH buttons that inject the same logical keys the Astrion sends,
tap and hold. The user *feels* the key policy (short=target vs
hold=app) before ever touching the device. The engine's debug card
(#debug=1) renders inside the preview for the curious.

## Storage & round-trip

- The custom integration owns a config store; the panel edits it and
  serves compiled JSON at `/local/remote-proto/config.json` (or an
  authenticated `/api/harmonium/config`).
- Import: point it at `yaml/` once — views load as editable documents.
- Export: every save can write canonical YAML back to `yaml/views/` so
  git stays the audit trail. UI-written YAML is comment-free; a file
  with hand comments is flagged "managed outside the UI" and opens
  read-only with an "edit the file, I'll reload" note (the HA
  automations-UI convention, so it will feel native).
- The `build_config.py` compiler becomes the integration's validation
  core (same lowering, same cross-ref checks, same error strings).

## Sequencing

1. **DONE (2026-07-20):** engine understands v2 fields
   (`control_target`, `input.physical_buttons`, activity `state:`),
   compiler gated in the build, apps drawer authoring fixed.
2. **DONE (2026-07-20):** live config IS the compiled v2 output
   (policy decided: short=app, hold=device, toggleable). Generating
   activity scripts from the Actions model is still open.
3. **STARTED (2026-07-21) — Studio v1 shipped:** the integration
   (`integration/custom_components/harmonium/`) with HA-storage
   store, authenticated `/api/harmonium/config` (POST = validate →
   store → deploy), and the Harmonium Studio sidebar panel. The
   preview IS the engine (`#preview=1` postMessage handshake, live
   entity states, soft remote with real Astrion keycodes). v1 edits
   the compiled runtime config through per-slice JSON textareas;
   the harmonia-style FORM editors are Studio v2 (see below), and
   yaml/ round-trip (import/export per this doc's Storage section)
   is not wired yet — the repo yaml/ remains source of record.
   **v2 form editors SHIPPED (2026-07-21):** Studio rebuilt on
   Svelte 5 + shadcn-style vendored components (`studio-src/`, Vite →
   single-file studio.html). Visual | Code toggle per slice; visual
   editors for Room, Views & tiles, and Activities (Setup / State
   rules / navigation+confirm — the harmonia Activity card shape).
   Still open from the harmonia model: Actions on-start/on-stop
   builders with Test buttons (→ generated activity scripts), preset
   editors, per-device Interactions.
4. **Later:** Studio v2 form editors; yaml/ round-trip; New Room
   wizard with area-registry suggestions; template store for sharing
   activity shapes between rooms (harmonia already has the "store"
   concept for nav templates).

## Open questions for Suresh

1. RESOLVED (2026-07-20): short press = app, long press = device —
   and it's a config toggle (`system.yaml` `input.physical_buttons.
   short_press: app | control_target`). Both modes engine-supported
   and smoke-tested; hold-Power stays All Off in the live policy.
2. Comment preservation: is "UI-managed views are comment-free YAML"
   acceptable, or do we need round-trip comments (heavier tooling)?

## Appendix — harmonia editor vocabulary (mined from www/harmonia.js)

Elements: harmonia-room-card(-editor), harmonia-section-card(-editor),
harmonia-nav-card(-editor), harmonia-button-card, harmonia-card-primitive.
Patterns worth stealing wholesale: State Mode toggle with On/Off Block
YAML + example dialogs ("Watch Fire TV — On Block Example", "Supported
Keys"); action preset dropdown (Media player/Light/Switch/Script/HA
turn on/off/toggle, Delay, Custom action…) with per-row Target entity,
"Select source from device" live suggestions, and YAML data validation
("Invalid YAML object. Fix syntax to apply changes."); Live Subtitle
auto/custom with Template Tokens help; per-device Interactions
(Tap/Hold: Navigate, Toggle, More Info, Do nothing); density/detail
controls with precedence note ("Card density wins over Detail Level");
device group headers with promote/glue; empty states that teach ("No
devices yet. Add Devices"); runtime confirm dialog (Activity Running →
Cancel / Turn Off); "Open Activity Debug"; config source Template vs
Manual with a shared store.
