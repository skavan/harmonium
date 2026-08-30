# Entity controls — adapters, variants, and card groups

Status: **PROPOSED v2 (2026-08-30) — design only; no implementation has started.** This revision supersedes the v1 draft after review. Target: **the 0.87 keynote.** v0.86.0 ships without any of this — its keynote (layered catalogs, derived classes, first-class fast-dpad) is complete and must not wait on a refactor that has not begun.

This document defines how an HA entity becomes a control in Harmonium, how that control may be drawn, and how several controls may share one visual card. It applies to every place a control is authored or generated: Activities → Cast (the `present` map), regular Devices sections (explicit tiles), and the generated bands of stock controllers.

## What changed from v1

The v1 draft's spine survives intact: the adapter/variant split, the Launcher contract, the parity contract, close-known-bugs-first, the migration discipline, and the acceptance-test culture were all right and are kept, much of it verbatim. The revision closes the review findings:

- **The resolution ladder is now specified.** v1 modeled two envelopes; the system has three, plus a precedence ladder whose invisibility already produced a live bug (the stuck volume dropdown, fixed 2026-08-30 by *surfacing* the ladder). A design that renames one rung without pinning the others recreates that bug in new vocabulary.
- **One canonical spelling.** v1's `shows` (present) vs `type` (tiles) split is killed. The adapter token is `type` in both envelopes; `variant` is the shape field in both; `shows` never ships.
- **Fingerprint safety is ruled.** Respelling tile fields changes the bytes the ownership referee fingerprints — unruled, the migration flips pristine stock controllers into forks or trips the stock-sync drift guard. Ruling below.
- **Weather is evicted** to its own future design. Modern HA serves forecasts through a websocket call, not a state attribute — that is a fetch/refresh/staleness subsystem, not an adapter variant, and it shares nothing with the machinery this document builds.
- **Card grouping is phase-gated on a focus-geometry spec.** v1 asserted "traversal follows member order" in an engine whose focus walk is geometric. The open questions are listed; phase 3 does not start until they are answered in their own document.
- **Auto is deterministic, and absent-variant semantics are pinned** (absent = legacy behavior, never Auto).

## Product decisions

1. **Draws as chooses behavior; Variant chooses shape.** A Number control always reads and writes a number. Slider, Stepper, and Vertical are ways of drawing that control, never different service contracts.
2. **Launcher Tile remains a first-class choice** — always available, including for entities with a native inline control, and the safe fallback for unsupported domains.
3. **Every authoring surface has parity.** The same entity offers the same Draws as and Variant choices, in the same order, with the same help text, wherever it is authored. One adapter registry, one compatibility function, one shared presentation-fields component. Copying options into both `PresPanel` and `TileRow` is the disease this design exists to cure, not an implementation strategy.
4. **The entity decides what can be controlled.** Domain, supported features, role claims, and entity metadata populate the list. Visual resemblance never justifies an incompatible service contract.
5. **Card grouping is presentation only.** A shared `card_group` joins controls into one visual container; entities, state, services, subscriptions, and focus identities stay separate.
6. **Existing configurations never change meaning silently.** New fields are additive, legacy spellings remain readable, migration is idempotent, and an old Launcher stays a Launcher until its owner chooses otherwise.
7. **Remote-first is part of the contract.** Every control and group works with a D-pad on the supported legacy WebView baseline. Touch is additional, never required.
8. **One canonical spelling.** The adapter token is `type`, the shape is `variant`, in both envelopes. Legacy spellings (`style`, `volume_style`, `slider: true`, `kind`, `shows` if any escaped) are compat-read, normalized on Studio save, and never written anew.
9. **The ladder is explicit and visible.** Variant resolution follows the three-rung ladder below, deterministically, and the Studio always shows *which rung won* when it is not the one being edited — the "⚙ pinned" pattern shipped in 0.86.0 is the template, generalized.
10. **Respelling never changes ownership.** Fingerprinting canonicalizes spellings before hashing, so normalization can never flip pristine stock into a fork. Ruling below.

## The model: adapter, variant, envelope, ladder

An **adapter** owns the semantic contract between an HA entity and a Harmonium control: compatibility, state reads, the attributes that supply options/bounds/step/unit/features, the service that writes, the representation of unknown/unavailable/malformed state, and the set of legal variants.

A **variant** is a renderer and interaction shape supported by that adapter. It never changes the contract.

An **envelope** is where the authored choice is stored. There are **three**, and v1's miss of the third is why this section exists:

- an activity-generated member: `activities.<id>.present[<member>]` (keyed by device id for cast members, by entity id for loose entities — an existing duality; see "Keying" below);
- an explicit tile in a Devices section: the tile object in `tiles`;
- a **generated band tile** in a (possibly stock) controller: the generator tile's own fields, beneath which sit the per-activity surface default (`surface.<x>`) and the global theme default.

### The resolution ladder

For any control, the effective variant resolves down exactly three rungs:

1. **The member's own choice** — `present[<member>].variant`, or the explicit tile's `variant`. (Legacy spellings read into this rung: `present.style`, `device_options[<entity>].volume_style`, a generator tile's `style`, `slider: true`, `kind: "volume"`.)
2. **The activity surface default** — `surface.<adapter>_variant` (today's `surface.volume_style` reads into this rung).
3. **The global/theme default** — `global.style.<adapter>` (today's `global.style.volume`), else the adapter's built-in default.

Rules: resolution stops at the first rung that answers; a rung never partially answers; and any editor writing rung 2 or 3 must display rung-1 pins that override it, each with a one-tap clear (the 0.86.0 volume-pin readout, generalized to every adapter). The legacy `device_options.volume_style` is read as rung 1 but never written again; the Studio's normalizer folds it into `present` on save.

### Keying

`present` is keyed by device id for cast members and entity id for loose entities. This duality is existing reality and this design does not change it; it *names* it. All new code resolves member keys through one shared helper, migration never rewrites keys, and the shared editor is key-shape-agnostic. Collapsing the duality is future work with its own migration, out of scope here.

### Canonical persisted shapes

An activity-generated entity and the same control as an explicit tile:

```jsonc
"present": {
  "number.sonos_basement_bass": { "type": "number", "variant": "stepper", "card_group": "sonos_tone", "name": "Bass" }
}
```

```jsonc
{ "type": "number", "entity": "number.sonos_basement_bass", "variant": "stepper", "card_group": "sonos_tone", "label": "Bass" }
```

Same `type` vocabulary, same `variant` vocabulary, both envelopes. `name`/`label` remain envelope-specific storage (existing reality, mapped by the shared editor to one "Display name" field); unifying them is not worth a migration. The persisted Launcher token remains `device` — renaming a working internal token buys nothing.

## Fingerprints and ownership — the respelling ruling

Normalization changes bytes; the ownership referee (`unitFp`, `healStockGen`, stock-sync) judges by bytes. **Ruling: fingerprinting canonicalizes before hashing.** `unitFp` (JS) and `unit_fp` (Python) gain one shared, versioned normalize step — legacy variant spellings map to canonical form before stringify — shipped in the same release as the compat reader, with byte-parity between the two implementations pinned by the existing stringify-parity test. Acceptance: every historical starter generation and every stock controller shape fingerprints **identically** before and after normalization; `probe-stock-sync` and the ownership battery stay green with zero `gen` bumps. If that acceptance cannot be met, the fallback is the loud path — respell stocklib + starter together with `gen` bumps — but the quiet path is the design intent.

## Initial adapter catalog

| Draws as | Compatible source | Reads | Writes | Initial variants |
| --- | --- | --- | --- | --- |
| Launcher Tile | any entity or cast device | name, icon, smart summary | Tap policy decides | Default |
| Number | `number`, `input_number` | state, min, max, step, unit, mode | that domain's `set_value` | Auto, Slider, Stepper, Vertical |
| Select | `select`, `input_select` | state, `options` | that domain's `select_option` | Auto, Picker, Cycle, Chips |
| Volume | `media_player`, or volume role | `volume_level`, features | media-player volume services | Auto, Compact, Slider, Stepper, Vertical |
| Brightness | compatible `light` | brightness, features | light brightness data | Auto, Slider, Stepper, Vertical |
| Power | compatible toggle entity or power role | state | the domain's toggle service | Default |
| Now Playing | media-player entity or role | media state, metadata | existing media actions | existing styles |
| Transport | media-player entity or role | supported features | existing media actions | Default |
| Sources | media-player or source-select role | source, source list | existing source service | Default |

Weather is gone from this table by design; `design-weather-card.md` (future) owns it, including the forecast websocket contract, refresh policy, and stale-data behavior. Nothing in this catalog blocks on it.

Number, Volume, and Brightness share one numeric rendering primitive but keep separate adapters: making `number.sonos_basement_bass` look vertical must never call a light or media-player service. The Number contract follows HA's number model — value, min, max, step, unit, mode from the entity, never hard-coded `0..100` or step 3; a malformed step gets a safe derived fallback.

## How Draws as is populated

1. Launcher Tile first, always.
2. Each registered adapter is asked whether it supports the entity's domain and published capabilities; only compatible adapters are offered.
3. A temporarily unavailable entity keeps its configured adapter visible — state loss never erases an authored choice.
4. An unknown adapter token is preserved in the raw config and shown as an actionable warning, never silently replaced.

For cast device-library members, choices come from claimed roles and traits (Volume only with a usable volume entity, and so on). Sibling entities like Sonos bass/treble are cast as entities themselves — a device bundle must not guess which of several `number` siblings a generic control means; an explicit trait may map this in the future.

Defaults: existing configs keep their behavior; the new-add flow may author a native adapter for newly added `number`/`select` entities; Launcher remains selectable after; `variant` defaults to Auto and Studio does not write the word.

## Auto — deterministic, or absent

- **Absent `variant` = legacy resolution**, byte-for-byte today's behavior. Absent is not Auto.
- **Written `auto` = these rules**, versioned with the engine:
  - Numeric: HA `mode: "slider"` → Slider; `mode: "box"` → Stepper; `mode: "auto"`/absent → Slider when `(max−min)/step ≤ 100`, else Stepper.
  - Select: **Picker. Period.** Cycle and Chips are explicit authored choices in v1 of this feature; layout-sensing Auto is future work, because two engine versions must never legally disagree about what Auto renders.
- Every Auto rule must be assertable in a probe with fixed inputs.

## Studio parity contract

Both authoring surfaces present, through one shared component: Display name, Status line, Display icon, Draws as, Variant (only when the adapter offers real choices, with rung-1 pin visibility per decision 9), Card group (blank default), and Tap behavior. Surface-specific placement (the cast member's "Where") stays surface-specific.

## Launcher Tile contract

Unchanged from v1, kept in full force: no inline value editor; the Tap selector (Smart default / Open / Nothing) stays orthogonal; and **Smart default must never produce an apparently interactive but inert tile** — when no authored controller resolves, the entity's generated detail page is the final fallback.

## Card grouping — semantics now, focus later

Semantics (unchanged from v1): `card_group` is an optional string; controls merge only within the same resolved screen, same rendered section, same non-empty value; first member anchors, authored order holds; grouping is a visual wrapper, never a focus stop or an enter/exit mode; an adapter advertises whether it has a row form, and an incompatible member renders standalone with a Studio warning; no group title in v1.

**Phase gate:** implementation of grouping does not begin until `design-card-group-focus.md` exists and answers, with probe sketches: how a multi-stop card occupies the grid (one spanning cell? per-member cells in a shared skin?); how the geometric `spatialMove` enters the card (nearest member by geometry, or first member?); what the focus ring draws around a focused member inside a shared card; how capture/latch interacts with members that capture (a slider mid-drag); and how hide/unavailable transitions of one member reflow the card without losing focus. These are exactly the questions the pad doctrine spent three releases answering for single tiles; they will not be answered as a side effect.

## Migration and compatibility

**Compatibility reader** (ships first, stays through the observed upgrade window): activity `shows`/`style` spellings, `type: "volume", slider: true`, `type: "stepper", kind: "volume"`, `device_options.volume_style`, and `device` all read into their canonical meanings. The reader is small, engine-side, and lets an updated engine render safely before anyone opens the Studio.

**Canonical migration** (Studio-side normalizer, on load): converts unambiguous legacy spellings to canonical `type` + `variant`; idempotent; preserves names, icons, status lines, tap behavior, targets, ARC `level_entity`, placement, ordering, and unknown fields; never invents `card_group`; never upgrades a Launcher to a native control; runs under the fingerprint ruling above so ownership never flips.

**Rollout:** the reader and migration ship together and do not gate on a fixture campaign — sanitized beta exports are gathered opportunistically and retained as fixtures as they arrive, and the double-normalize stability check (`normalize(normalize(x)) == normalize(x)`) plus before/after equivalence of tiles, subscriptions, resolved entities, and service calls run on every fixture we have. A Studio upgrade summary before the first post-migration Save & Deploy lists what was canonicalized and anything that could not be.

## Existing inconsistencies to close first (unchanged from v1 — the gate)

1. A loose Launcher with no obvious verb resolves to `detail:<entity>` instead of going inert.
2. Converting an ARC-split volume to Stepper preserves and uses `level_entity`.
3. Activity and regular-Devices Draws-as filtering are identical.
4. Number range/step come from entity metadata, not hard-coded assumptions.
5. The runtime media_player generated-detail fallback keeps working without a destructive controller migration.

Equivalence tests for every currently supported control are green **before** Number, Select, or grouping lands. This gate is the whole plan; phase 1 is the riskiest phase precisely because it refactors everything that already works, and the probe battery — not the new features — is where it succeeds or dies.

## Implementation sequence (sequencing, not authorization)

1. **Parity foundation:** shared adapter registry + shared Studio fields + the fingerprint-safe normalizer; route Launcher, Power, Volume, Now Playing, Transport, Sources through it with zero behavior change; close the five inconsistencies; generalize the pin readout to the full ladder.
2. **Number and Select:** native adapters, D-pad interactions, identical authoring in all surfaces.
3. **Card grouping:** gated on `design-card-group-focus.md`.
4. **Retire old authoring spellings** after migration evidence, keeping the runtime reader.

## Acceptance tests

v1's lists stand (adapter/engine, Studio parity, grouping/navigation, migration), minus Weather, plus:

- **Ladder:** for each adapter, a rung-1 pin beats rung 2 beats rung 3; the editor for a lower rung displays the winning pin; clearing the pin restores the lower rung's answer.
- **Fingerprint stability:** every historical stock shape fingerprints identically pre/post normalization; ownership and stock-sync batteries green with no gen bumps.
- **Auto determinism:** fixed entity fixtures produce the specified variant, asserted in probes.
- **Absent ≠ Auto:** a config with no `variant` renders byte-identically to the previous release.

## Non-goals

v1's list stands: no Mushroom cloning, no arbitrary attribute/service controls, no replacing the Composite Card proposal, no cross-section merging, no HA group-membership changes, no auto-redesign of user activities, no variant ever changing a service contract. Added: no Weather in this feature; no layout-sensing Select Auto in v1; no `present` key-shape unification; no grouping implementation before its focus spec.

## References

- `docs/design-entity-controls.v1.md` — the superseded draft, if retained; otherwise git history.
- [Mushroom Number card](https://github.com/piitaya/lovelace-mushroom/blob/main/docs/cards/number.md) · [Mushroom Select card](https://github.com/piitaya/lovelace-mushroom/blob/main/docs/cards/select.md) — one semantic card, presentation separate.
- [HA Number entity](https://developers.home-assistant.io/docs/core/entity/number/) · [HA Select entity](https://developers.home-assistant.io/docs/core/entity/select/).
- `src/core/gen-bands.js` — the live four-rung volume ladder this design canonicalizes; `studio-src/.../ControllerTab.svelte` — the 0.86.0 pin readout, the ladder-visibility template.
- `docs/design-layered-catalogs.md` — the spread model; `docs/design-ownership-buckets.md` — ownership rules; `docs/beta-gaps.md` §6.3–6.4 — the original sketches; `docs/screen-schema.md` — current contracts.
