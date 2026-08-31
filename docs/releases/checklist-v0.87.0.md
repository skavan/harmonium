# v0.87.0 — Program Checklist

*Opened 2026-08-30, on top of the v0.86.0 tag. Keynote: **entity controls** (`docs/design-entity-controls.md`, v2). Companion features ride alongside where they don't destabilize the keynote phases.*

## Keynote — entity controls (phased; each phase gates the next)

- [x] **Phase 0 — close the five pre-existing inconsistencies** (the gate: equivalence tests green before anything new):
  - [x] #1 inert-launcher → `detail:` fallback (device.js select/hold; `genericDetail` composer in details.js so `detail:<e>` never resolves null — sensors and other composer-less domains get a readout page)
  - [x] #2 ARC `level_entity` preserved on Stepper conversion (all four generator branches in gen-bands/gen-cast; stepper.js routes level reads/nudges/slider via `lvlEnt`, mute stays on the main entity)
  - [x] #3 identical Draws-as filtering in both surfaces (shared `showsForDomain`/`showsForRoles` in stocklib; PresPanel and TileRow both call them, no private filter copy survives — static fences enforce it)
  - [x] #4 Number range/step from entity metadata (`nudgeStep` honors `percentage_step`, `target_temp_step` + `min/max_temp`; kind defaults hold when absent)
  - [x] #5 media_player detail fallback intact (smoke-details + full battery green after the #1 change)
  - Fences: `tests/probe-entity-phase0.mjs` 13/13; full battery 120/120 in container (2026-08-30). **Phase 0 CLOSED** — gate open for Phase 1.
- [x] **Phase 1 — parity foundation** (2026-08-31):
  - [x] Adapter registry: `src/core/adapters.js` + byte-identical twin table in stocklib (probe-compared); SHOWS_ROLE and both Draws-as filters now derive from it; the six existing controls route through `resolveVariant`/`presType`/`presVariant` with zero behavior change (full battery green).
  - [x] Canonical spelling live end-to-end: engine compat reader (`canonTile` at expandTile — canonical `type`+`variant` tiles render as their legacy working shapes; legacy passes through byte-for-byte); `normalizeVariants` heals the activity envelope on Studio load (present `shows`/`style` → `type`/`variant`, `surface.volume_style` → `volume_variant`, idempotent); every editor now WRITES canonical and never legacy.
  - [x] FP-NORM v1: `unitFp`/`controllerFp` (JS) and `controller_fp` (python, new twin) canonicalize variant spellings before hashing; stock-history regenerated through the same function; cross-language hex pins in both suites; ownership battery green, zero gen bumps.
  - [x] Shared presentation fields: `PresFields.svelte` — Draws-as, Variant, Status line rendered from ONE component in both PresPanel and TileRow; variant options come from the registry (`variantOptions`), so both surfaces offer identical choices (TileRow gains Compact).
  - [x] Pin readout generalized: `ladderPins`/`clearLadderPin` in the shared layer, adapter-parameterized; ControllerTab is now a consumer.
  - Fences: `tests/probe-entity-phase1.mjs` (registry twins, reader equivalence, three-rung ladder, normalizer idempotence, fp pins) + FP-NORM fences in test-layered-catalogs.py. 121 JS + 5 python suites green in container.
  - Deferred to Phase 2 with rulings needed: folding `device_options.volume_style` into `present` (the present keying duality makes a naive fold misread for cast members); respelling tiles inside possibly-stock controllers (needs a subtract-aware ruling so a respelled pristine controller doesn't silently stop tracking stock); cast-group `shows` rename (a group's `style` is its nav-card style — renaming beside it invites confusion).
- [x] **Phase 2 — Number and Select adapters** (2026-08-31):
  - [x] **Number** (`number`/`input_number`): rides the stepper widget via `STEP_KINDS.number` — value = state; min/max/step/unit are the ENTITY's own (`stepBounds` unifies the range for nudge, drag, and track fill, so −/+ and slider can never disagree); `set_value` to the entity's domain; variants Slider / Stepper / Vertical (per-tile track override in stepper.js); **deterministic Auto**: HA `mode: slider` → Slider, `box` → Stepper, auto/absent → Slider iff (max−min)/step ≤ 100; malformed step → 1.
  - [x] **Select** (`select`/`input_select`): `CHIP_KINDS.select` + the new `picker` widget (widgets/picker.js — the sources-tile pattern generalized): sub line reads the current option, ◀▶ cycle in place (the value grammar), OK opens the new `pick:<entity>:<kind>` virtual screen (a live chips row); Cycle variant's OK steps forward pageless; Chips variant is the inline row. **Auto = Picker, period** (the design ruling).
  - [x] Both surfaces: registry rows in both twins (byte-compared); Draws-as offers Number/Select per entity domain, and NOT to devices without a mapping trait (`showsForRoles` tightened per the Sonos bass/treble rule); Variant selects labeled "Variant" with blank = Auto (the Studio never writes the word — `variantOptions` skips the explicit auto row); real detail pages for the four domains; `DETAIL_VOL_KIND` covers number; tileSig sees type/kind/slider/cycle so an Auto flip on state arrival re-renders (the v0.85.4 lesson).
  - Fences: `tests/probe-entity-phase2.mjs` (24 fences — working shapes, deterministic Auto on fixed fixtures, entity-owned range/step/unit, domain-correct services, picker/cycle/chips interaction paths, Studio offers). Full battery 122 JS + 5 python green in container.
- [x] **Phase 3 — card grouping** (2026-08-31):
  - [x] The gate spec exists and is RULED: `docs/design-card-group-focus.md` — key finding: the focus engine is already member-ready (rect-geometric spatialMove over per-tile elements), so the visual-wrapper-only design costs nothing. One spanning `.cardgrp` grid item at the anchor's footprint, members as flat rows keeping their `#tile_<id>` elements; entry = nearest member by geometry; ring on the member row; capture per-member; structural reflow via visibleTile + a renderStates guard for runtime hides.
  - [x] Implementation: section render walk merges same-group tiles (first member anchors, order holds, interlopers skipped over); `row: false` on media in both registry twins (no-row-form members render standalone, Studio warns); `presApply` + the volume band carry `present.card_group` into generated tiles; `card_group` in tileSig; the card skin in grid.css (members flat, hairlines, zero-layout-shift ring).
  - [x] Studio: Card group field in the shared PresFields component, both surfaces, with the no-row-form warning.
  - Fences: `tests/probe-entity-phase3.mjs` — the spec's five probe sketches made real, 15 fences. Full battery + python green.
- [x] **Phase 4 — retire old authoring spellings** (2026-08-31; the runtime reader stays by design):
  - [x] No editor writes or offers a legacy spelling (done in Phase 1; re-verified).
  - [x] The upgrade summary ships: `NORMALIZE_REPORT` counts what a load healed and the Studio's loaded-status says so before the first post-migration Save & Deploy ("modernized N legacy spellings").
  - [ ] Observation window (open by design, not code): sanitized beta exports retained as fixtures as they arrive; the double-normalize stability check runs on each. Nothing further gates 0.87 on this.

## Companion features

- [x] **Icon sets** (2026-08-31; three forks RULED — see the design doc's Forks section): Suresh's scope ruling was "anything HA has installed" — the distiller carries a SOURCES registry; v1 = `phu:` (parsed from the installed HACS module) + `mdi:` (HA's own frontend bundles every MDI path as JSON — no network, no vendoring). Engine mask slice: `<set>:<name>` → `/local/harmonium/icons/<set>/<name>.svg` as a currentColor mask (theme-tinted like a font glyph); hidden probe img + delegated error handler give the silent per-icon fallback, remembered so kiosks never re-request. Distillation runs on every deploy (`store.py` → `icons.py`), writes only referenced-and-missing/ours-and-stale files under per-file ownership stamps — a hand-replaced SVG is never overwritten — and never blocks a deploy. Studio: IconPicker previews set icons mask-rendered and shows the warning chip when the file is missing. Fences: `probe-icon-sets.mjs` (8) + `test-icon-distill.py` (12); full battery + 6 python suites green.
- [ ] **Save + Reload fan-out** — reload all of a workspace's wired remotes, not one (beta-gaps entry).
- [ ] **Pending-vs-global ordering hardening** (§6.7) — optional; moot in practice since the select auto-wiring.

## To discuss (design questions, no code until ruled)

- [ ] **Cast instances / aliases** (2026-08-31 — Suresh: "the idea of having an alias so we could do it easily"): the same device twice IN the cast, each instance with its own ⚙. Today's model keys everything by member id (one row per member — the refusal now says so and points at page tiles, which already allow unlimited duplicates). An alias/instance key (e.g. a named second row pointing at the same device) needs rulings on: key shape, wiring/roles (can an alias hold roles?), groups membership, the band generators, and migration. The design doc already defers key-shape changes to their own migration.
- [ ] **Compact variants for every renderer** (Suresh: "every tile renderer should have a compact variant, so when I group them they are, well, compact"): Number has one as of tonight (the volume row shape). Ruling needed on what "compact" MEANS per adapter — transport, sources, power, media — and whether card groups should be able to REQUEST the compact form from members (a group-level density knob) rather than per-member settings.

## Domain-parity backlog (ruled 2026-08-31: to-dos, not 0.87)

Gap analysis vs Mushroom / Bubble Card. Each is "a registry row + existing primitives" — the keynote machinery makes them cheap; none gates 0.87.

- [ ] **Light color + color temperature** — the biggest real hole (we stop at brightness/effects): a color-temp stepper + color chips on the light detail/controller; both reference cards ship it.
- [ ] **Lock adapter** — lock/unlock with the confirm doctrine (red pending pulse) on the scary direction.
- [ ] **Vacuum adapter** — start/pause/dock/locate; practically a remote already.
- [ ] **Humidifier adapter** — humidity stepper + mode chips; both primitives exist.
- [ ] **Alarm panel** — arm/disarm without code entry (D-pad code entry is its own question).
- Deliberate non-gaps, recorded: template/Jinja cards ({token} status lines cover the sane 80%); Person/Update cards (dashboard furniture); Calendar (same bucket as Weather — its own future fetch/refresh design); Bubble pop-ups (our virtual screens are the D-pad-safe idiom); multiple sub-buttons (one trailing zone + card groups); module store (layered catalogs/derived classes are the config-side analog).

## Carried context

- v0.86.0 shipped: layered catalogs + derived classes, first-class fast d-pad, Platforms editor, six fixes, the Astrion IME/wireless-ADB hardware story. Tester reply posted from `docs/posts/reply-beta-feedback-v0.86.md`.
- Weather card: its own future design (evicted from entity controls); not on the 0.87 critical path.
- Manifest: bump to `0.87.0-dev` on the first 0.87 commit after the tag.
