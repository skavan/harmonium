# Entity controls, variants, and card groups

Status: **PROPOSED — revised after design review on 2026-08-30; no implementation has started.**

This document defines how an entity becomes a control in Harmonium, how that control may be drawn, and how several controls may share one visual card. It applies equally to:

- **Activities → Cast → Devices**, where the activity's `present` map changes how generated cast members draw; and
- **regular Devices sections**, where the page owns explicit entity tiles.

The two authoring surfaces must expose the same control choices, variants, defaults, labels, and validation. They are two entrances to one control system, not two feature implementations.

## Product decisions

1. **Draws as chooses behavior; Variant chooses shape.** A Number control always reads and writes a number. Slider, Stepper, and Vertical are ways of drawing that control, not different service contracts.
2. **Launcher Tile remains a first-class choice.** It is always available, including for entities with a native inline control. It is also the safe fallback when Harmonium does not support the entity's domain inline.
3. **Cast Devices and regular Devices sections have parity.** A Number, Select, Volume, Brightness, or Launcher authored in either place must use the same adapter and render the same control.
4. **The entity decides what can be controlled.** Domain, supported features, activity role claims, and entity metadata populate the Draws as list. A visual resemblance is not enough to offer an incompatible service contract.
5. **Card grouping is presentation only.** Sharing a `card_group` joins controls into one visual container. It does not merge their entities, state, services, subscriptions, or collapse their individual row-focus identities.
6. **Existing configurations do not change meaning silently.** New fields are additive, legacy forms remain readable, and migration is idempotent. An old loose entity that drew as a Launcher continues to do so until its owner chooses a native control.
7. **Remote-first interaction is part of the contract.** Every new control and group must work with a D-pad and the supported legacy WebView baseline. Touch is an additional input, not the only usable one.
8. **There is one canonical descriptor vocabulary.** Activity presentation overrides and explicit tiles have different owners, but new tools must not speak two live dialects for type, label, status, variant, or grouping.
9. **Defaults are resolved, not guessed.** A missing variant follows one documented resolution ladder. There is no persisted `auto` whose meaning can drift with layout or engine version.

## The model: adapter, variant, and envelope

An **adapter** owns the semantic contract between an HA entity and a Harmonium control:

- whether the entity is compatible;
- how current state is read;
- which attributes provide options, bounds, step, unit, and features;
- which service changes the value;
- how unknown, unavailable, or malformed state is represented; and
- which visual variants are legal.

A **variant** is a renderer and interaction shape supported by that adapter. It never changes which entity contract or service is used.

An **envelope** is where a presentation choice is stored. There are two storage owners:

- an activity-generated member stores an override in `activities.<id>.present[<member>]`; and
- a regular Devices section stores an explicit tile in its `tiles` array.

The owners remain different, but their descriptor fields do not. Studio edits both through one shared presentation descriptor and the engine resolves both through the same adapter registry. A generator tile inside a controller is not a third descriptor dialect; it is a default-bearing source in the resolution ladder defined below.

### Canonical descriptor

The canonical presentation fields are:

| Field | Meaning |
| --- | --- |
| `type` | adapter/widget identity: `device`, `number`, `select`, `volume`, and so on |
| `variant` | explicit visual/interaction shape; absent means resolve the documented default |
| `card_group` | optional visual-card id; blank/absent means standalone |
| `label` | display name override |
| `sub_text` | status-line override |
| `icon` / `icon_image` | display icon override |
| `tap` | tap-policy override where the envelope supports it |

Legacy activity fields `shows`, `name`, `sub`, and `style` are compatibility-read spellings only. New authoring and canonical migration write `type`, `label`, `sub_text`, and `variant`.

Activity presentation keys are also typed. `entity:<entity_id>` and `device:<device_id>` remove the existing ambiguity in which an unprefixed key may name either a device-library member or a loose entity. The compatibility reader accepts legacy unprefixed keys and the migration prefixes only those whose kind can be established unambiguously. An ambiguous key is preserved and reported rather than guessed.

### Proposed persisted shapes

An activity-generated entity:

```jsonc
"present": {
  "entity:number.sonos_basement_bass": {
    "type": "number",
    "variant": "stepper",
    "card_group": "sonos_tone",
    "label": "Bass"
  },
  "entity:number.sonos_basement_treble": {
    "type": "number",
    "variant": "stepper",
    "card_group": "sonos_tone",
    "label": "Treble"
  }
}
```

The same controls in a regular Devices section:

```jsonc
{
  "type": "number",
  "entity": "number.sonos_basement_bass",
  "variant": "stepper",
  "card_group": "sonos_tone",
  "label": "Bass"
}
```

The persisted value for Launcher may remain `device` for compatibility even though Studio labels it **Launcher Tile**. There is no value in rewriting every existing `device` tile solely to rename an internal token.

### Variant resolution order

Every adapter exposes one resolver that returns both the winning variant and its source. All generator, group, inline, and explicit-tile paths must call that resolver; duplicating shorter ladders in individual generators is prohibited.

For a generated activity member, the compatibility order is:

1. the member's explicit `present[target].variant`;
2. a legacy per-entity override such as `device_options[entity].volume_style` while it remains unread/migrated;
3. the generator tile's explicit variant;
4. the activity surface default for that adapter;
5. the global default for that adapter; and
6. the adapter's hard default.

For an explicit regular-Devices tile, the first applicable rung is the tile's own `variant`; generator-only rungs are skipped. Each control then follows the same remaining applicable order.

The canonical migration collapses `device_options[entity].volume_style` into the corresponding typed member descriptor when the target can be resolved, so it does not remain a permanent canonical rung. Until that migration is saved, the compatibility resolver preserves its current precedence. Existing generator-vs-surface precedence is also preserved in this feature; changing that behavior is a separate product decision.

Studio must show the resolved result and source. The blank choice should read, for example, **Default — Slider (controller generator)** or **Default — Stepper (this activity)**. A lower-precedence dropdown must not imply that changing it will beat a pinned higher-precedence value.

Missing `variant` means exactly this resolution order. The canonical format does not persist `variant: "auto"`.

## Initial adapter catalog

The catalog below is the intended product vocabulary. It replaces hard-coded, surface-specific dropdown logic.

| Draws as | Compatible source | Reads | Writes | Initial variants |
| --- | --- | --- | --- | --- |
| Launcher Tile | any entity or cast device | friendly name, icon, smart summary | the separate Tap policy decides | Default |
| Number | `number`, `input_number` | state, minimum, maximum, step, unit, mode | that domain's `set_value` | Slider, Stepper, Vertical |
| Select | `select`, `input_select` | current state and `options` | that domain's `select_option` | Picker, Cycle, Chips |
| Volume | a `media_player`, or a device claiming the volume role | `volume_level` and supported features | media-player volume services | Compact, Slider, Stepper, Vertical |
| Brightness | a compatible `light` | brightness and supported features | light brightness service data | Slider, Stepper, Vertical |
| Power | a compatible power/toggle entity or claimed power role | state | the domain's supported power/toggle service | Default |
| Now Playing | a compatible media-player entity or role | media state and metadata | existing media actions | existing styles |
| Transport | a compatible media-player entity or role | supported media features | existing media actions | Default |
| Sources | a compatible media-player entity or source-select role | source and source list | existing source service | Default |

The range-shaped controls—Number, Volume, and Brightness—should share one numeric rendering primitive, but each keeps its own adapter. For example, `number.sonos_basement_bass` is a **Number** using `number.set_value`; making it look vertical must never cause it to call a light or media-player service.

The initial Number contract follows HA's number model: current value, minimum, maximum, step, unit, and preferred mode come from the entity. Harmonium must not hard-code `0..100` or a step of `3` when the entity publishes its own values. A malformed or absent step gets a safe derived fallback and never produces invalid arithmetic. At the adapter-hard-default rung, Number maps `mode: slider` to Slider, `mode: box` to Stepper, and missing/unknown/`auto` mode to Slider. This mapping is versioned behavior, not a layout heuristic.

The Select adapter treats `select` and `input_select` as the same user concept while retaining their domain-specific service calls. Picker is the deterministic hard default. Cycle is the compact remote-first form. Chips are explicit in version one; Harmonium does not silently switch to or from Chips based on a changing option count or viewport.

Weather is deliberately outside this design. Modern forecast support requires its own fetch, refresh, cache, staleness, and failure contract rather than another row in an entity-state adapter table. `weather.*` continues to work as a Launcher Tile while a separate Weather-card design remains in the backlog.

## How Draws as is populated

The list is deterministic and comes from the shared adapter registry.

### For a loose or explicit entity

1. Offer **Launcher Tile** first, always.
2. Ask each registered adapter whether it supports the entity's domain and published capabilities.
3. Offer only compatible adapters.
4. Keep the configured adapter visible if an entity is temporarily unavailable; temporary state loss is not a reason to erase an authored choice.
5. If an old or unknown adapter token is loaded, preserve it in the raw configuration and show an actionable unsupported warning. Do not silently replace it while merely opening Studio.

Examples:

| Entity | Draws as choices |
| --- | --- |
| `number.sonos_basement_bass` | Launcher Tile, Number |
| `select.denon_sound_mode` | Launcher Tile, Select |
| `weather.home` | Launcher Tile |
| `light.kitchen` | Launcher Tile, Power, Brightness |
| unsupported domain | Launcher Tile |

### For a cast device-library member

Launcher Tile is again unconditional. Other choices come from the member's claimed roles and traits. Volume is offered only when the member has a usable volume entity; Sources only when it has a usable source entity; and so on.

Generic sibling entities such as Sonos bass and treble should normally be cast as entities themselves. A device bundle must not guess which of several sibling `number` entities a generic Number control means. A future explicit trait may provide such a mapping, but domain guessing inside a bundle is out of scope.

### Defaults

- Existing configurations keep their current Draws as behavior.
- A newly added `number`/`input_number` or `select`/`input_select` entity may be authored explicitly with its native adapter by the new-add flow.
- Launcher Tile remains selectable after that default is applied.
- A missing `variant` resolves through the pinned ladder and the Studio shows the winning value and source. New Number entities ultimately use the documented Number hard-default mapping; new Select entities ultimately use Picker.

## Studio parity contract

Both authoring surfaces display the following shared fields where applicable:

1. Display name
2. Status line
3. Display icon
4. Draws as
5. Variant, only when the selected adapter offers meaningful choices
6. Card group, blank by default
7. Tap behavior

Surface-specific placement remains surface-specific. In particular, an activity cast member may retain its **Where** choice because it can be promoted from the generated Devices band into Controls. A regular tile already lives in an authored section and does not need that field.

The implementation must use:

- one adapter catalog;
- one compatibility/filtering function;
- one set of variant labels and help text; and
- one reusable presentation-fields component or one thin wrapper over a shared component.

Copying a new Number option into both `PresPanel` and `TileRow` is not acceptable parity. It would recreate the inconsistency this design is meant to remove.

## Launcher Tile contract

Launcher Tile is both an explicit choice and the universal fallback. It has no inline value editor and does not pretend to support a domain service Harmonium does not understand.

The existing Tap selector remains orthogonal:

- **Smart default** preserves the current domain-aware behavior for existing entity tiles: obvious play/pause or toggle verbs may run; when there is no safe obvious verb, the tile opens its controller or entity detail.
- **Open** always opens the resolved controller/detail page.
- **Nothing** produces a read-only tile.

The important invariant is that Smart default must never create an apparently interactive but inert launcher. If no authored controller can be resolved, the entity's generated detail page is the final fallback.

## Variants

Variant options are adapter-owned. Studio must not offer a global bag of shapes that some controls cannot honor.

### Numeric variants

- **Slider** — horizontal continuous/ranged control.
- **Stepper** — decrement/value/increment; uses the adapter's true step.
- **Vertical** — vertical range control, useful for volume and brightness but still legal for a generic number.
- **Compact** — volume-specific existing compact presentation.

All numeric variants must clamp to the adapter's bounds, respect decimal precision, display the unit, and converge on HA's returned state after an optimistic interaction.

### Select variants

- **Picker** — opens or expands the complete option list.
- **Cycle** — left/right changes the highlighted option; Select commits.
- **Chips** — visible options become focusable chips; this variant is explicitly authored in version one.

There must always be a way to reach every option. Studio warns when Chips is a poor fit for the current option count, but the engine does not silently change an authored variant. A large or changing list remains safe under the default Picker.

## Card grouping

`card_group` is an optional string. Blank means the control remains an independent card. Controls merge only when all of the following match:

- the same resolved screen;
- the same rendered section/band; and
- the same non-empty `card_group` value.

The first member anchors the visual card, and members retain authored order. Reusing an id in another section does not pull controls across the page. The field is deliberately named `card_group` rather than `group`: Harmonium already uses groups for cast navigation and speaker membership, while HA media players also have runtime grouping.

The current engine's page walk is geometric: it chooses candidates from rendered rectangles. Authored order alone therefore cannot guarantee sensible movement inside a multi-row card. A card group is one outer grid cell with an explicit internal focus graph; its rows are not left to compete as unrelated top-level geometric candidates.

### Group focus identities

- The group owns one stable outer focus identity used when comparing it with neighboring grid cells.
- Every visible member owns a stable row focus identity derived from the group and member, not from its current array index.
- Landing on the outer identity immediately resolves to a row identity; the outer wrapper itself is never an activation target.
- The focused row receives the strong focus ring. The outer card receives a quieter group outline so the visual containment remains clear.
- Each row keeps its own entity, label, state, adapter, service, unavailable state, and capture state. The group never synthesizes one combined entity or action.

### Entering and leaving a group

- Entering from above selects the first visible row.
- Entering from below selects the last visible row.
- Entering from the left or right selects the visible row whose vertical center is closest to the incoming focus center; ties resolve to the first authored row.
- Up/Down moves to the previous/next visible row. At the first or last row it bubbles to normal spatial navigation using the outer card's rectangle, not the small row rectangle.
- Left/Right is first offered to the focused row's adapter. If that adapter declines the key, navigation bubbles from the outer card.
- Select runs the focused row's normal action or enters that row's existing capture contract.
- Back releases row capture first. When no row is captured, Back retains the page's normal navigation meaning; card grouping introduces no extra enter/exit mode.
- Touch targets a row directly and synchronizes the logical row focus before running its action.

### Interaction with the existing pad doctrine

Existing input precedence remains intact: an active widget capture wins first; device passthrough and the panel-borrow latch are resolved before the panel focus graph; only when the panel owns the pad does the group handle row navigation. CH-based panel walking treats the group as one outer grid stop and never changes a row's value. A grouping implementation may not create a second capture system.

### Dynamic rows and focus repair

Unavailable rows remain present, dimmed, and focusable under the normal unavailable contract, but do not issue invalid service calls. A conditionally hidden row leaves the internal graph. If the focused row disappears, focus moves to the next visible row, then the previous row, then a spatial neighbor of the outer card. If no rows remain, the group disappears and the existing page focus-repair path selects a surviving page target. Reordering preserves focus by stable row identity.

An adapter must advertise whether it has a row form suitable for a grouped card. Number, Select, Power, readouts, and Launcher can have row forms. Full-bleed cards such as Now Playing are initially standalone-only. If a configured member cannot join, Studio warns and the engine renders it standalone rather than hiding or breaking it.

Version one does not require a group title. The entities' own labels make a Bass/Treble card understandable. A separate card-title model can be designed later if real configurations need it; overloading one member's label as the group title is rejected.

## Migration and the ten-user beta

The user count makes validation tractable, but migration should still be productized rather than performed by hand.

### Compatibility reader

The engine initially accepts both old and new spellings:

- an unprefixed activity-presentation key is resolved as a legacy device or entity target without changing the stored key until that kind is unambiguous;
- activity `shows`/`name`/`sub` read as canonical `type`/`label`/`sub_text`;
- activity `shows: "stepper"` reads as `type: "volume", variant: "stepper"`;
- activity `style` and `device_options[entity].volume_style` participate in the documented variant ladder;
- regular `type: "volume", slider: true` reads as Volume + Slider;
- regular `type: "stepper", kind: "volume"` reads as Volume + Stepper; and
- `device` reads as Launcher Tile.

The compatibility reader is deliberately small and may remain longer than the old Studio controls. It lets an updated engine render safely before a user has opened and saved Studio.

### Canonical migration

On Studio load/import, the normalizer converts unambiguous legacy spellings to the canonical typed-target + descriptor form. The migration:

- is idempotent;
- preserves names, icons, status lines, tap behavior, targets, ARC `level_entity` wiring, placement, ordering, and all unknown fields;
- never assigns `card_group` where none existed;
- never writes `variant: "auto"`;
- never changes an existing Launcher into Number, Select, or another native control merely because the entity domain now permits it;
- prefixes a presentation target only when it can prove `entity:` or `device:`;
- migrates a resolvable legacy per-entity volume style into the corresponding item/member `variant` without changing the winning rendered style;
- preserves unknown/custom tiles and controller forks; and
- participates in the existing backup/migration discipline before a changed configuration is persisted.

Activities are user-owned data. Normalization may update a known schema spelling while preserving its meaning; it must not heal an activity toward a stock opinion. Stock controllers continue through the existing ownership referee: pristine stock may advance, while forks remain the user's.

### Stock ownership and fingerprints

Canonical respelling changes controller content and therefore participates in the ownership fingerprint contract. It may not be shipped as a normalizer-only change.

In the release that changes controller tile spellings:

1. current canonical shapes land in `stocklib` and starter truth together;
2. every affected stock-controller generation is bumped;
3. stock history is regenerated so every previously shipped pristine shape remains recognizable;
4. the ownership referee classifies/heals stock controllers before the general schema normalizer touches their content;
5. an old pristine stock copy heals to the new canonical stock shape;
6. an edited-in-place stock copy is first legitimized as the user's fork, after which only provably equivalent schema spellings may be canonicalized; and
7. existing `variant_of` forks remain user-owned and are never replaced with stock.

Fingerprint normalization must not broadly ignore `type`, `variant`, or other behavior-bearing fields. If a narrowly proven legacy/canonical equivalence is ever added to fingerprint normalization, it needs dedicated collision-of-intent tests showing that a real user edit still classifies as edited.

The required ordering is a build invariant: referee first, canonical schema migration second. A probe must fail if reversing that order would cause our own migration output to classify as a fork on the next load.

### Beta rollout

For the current install base:

1. Historical starter generations and constructed edge cases form the mandatory migration gate.
2. Obtain sanitized exports from willing users and retain every available export as an additional migration fixture; collecting all ten is valuable but does not block a release when the compatibility reader and mandatory fixtures pass.
3. Run old-config → normalize → normalize-again checks; the second pass must be byte/meaning stable.
4. Compare generated tiles, variant sources, subscriptions, resolved entities, and service calls before and after migration.
5. Ship the compatibility reader and migration together.
6. Show an upgrade summary in Studio before Save & Deploy, including preserved custom/forked items, typed targets created, and anything that could not be canonicalized.
7. Keep the reader through at least the observed upgrade window; old authoring controls do not need to remain once all known users have moved.

## Existing inconsistencies to close first

The abstraction must not preserve known mistakes as its reference behavior:

1. A loose Launcher with no obvious verb must resolve to `detail:<entity>` instead of becoming inert.
2. Converting an ARC-split volume control to Stepper must preserve and use its `level_entity` rather than falling back to the media entity.
3. Activity and regular-Devices Draws as filtering must be identical.
4. Number range and step must come from entity metadata rather than the existing hard-coded stepper assumptions.
5. The runtime `media_player` generated-detail fallback must continue working while controller ownership and stock-controller changes are considered separately. This feature must not require a destructive controller migration.

Equivalence tests for the current supported controls must be green before Number, Select, or grouping is layered on top. This is a release gate, not an aspirational test target.

## Implementation sequence

This is sequencing, not authorization to code.

1. **Freeze current behavior:** close the known launcher and ARC-split bugs, then expand the probe battery until the currently supported controls, resolution sources, service targets, and focus behavior are pinned.
2. **Descriptor and resolver foundation:** add the compatibility decoder, canonical descriptor helpers, typed-target resolver, adapter catalog, and pure variant-resolution function without rerouting every working renderer.
3. **Shared Studio authoring:** make both Devices surfaces consume the same catalog, filtering, labels, help text, default-source readout, and presentation-fields component.
4. **Number and Select:** add these native adapters through the new path, including deterministic defaults and their D-pad interactions.
5. **Existing controls, one at a time:** move Launcher, Power, Volume, Now Playing, Transport, Sources, and Brightness behind the shared resolver individually. Each conversion lands only when its focused equivalence probes pass; completion of the registry is not itself success.
6. **Card grouping:** implement the explicit outer-container/internal-row focus contract, row compatibility, ordering, warnings, and dynamic focus repair. Do not infer this behavior from CSS geometry.
7. **Canonical stock release:** land any stock respelling, generation bumps, regenerated history, migration, and ownership-order probes atomically.
8. **Retire old authoring spellings:** after beta migration evidence, remove redundant Studio controls while retaining the compact runtime reader for the agreed compatibility window.

## Acceptance tests

### Adapter and engine

- Number reads current/min/max/step/unit correctly for integer, decimal, negative, and non-`0..100` ranges.
- Number calls the correct domain service for both `number` and `input_number`, clamps values, and converges on returned HA state.
- Select lists every option and calls the correct domain service for both `select` and `input_select`.
- Number's hard-default mode mapping and Select's Picker default are deterministic across viewport sizes and repeated engine runs.
- Chips is never selected or abandoned implicitly.
- Unavailable/unknown entities remain visible, dimmed and safe; they do not emit invalid service calls.
- Volume Slider/Stepper/Compact behavior is equivalent before and after adapter routing, including ARC-split `level_entity`.
- Launcher Smart/Open/Nothing behavior is identical in generated and explicit tiles, with a working detail fallback.

### Resolution

- Every generator, group, inline, and explicit-tile path calls the shared resolver rather than maintaining a private shortened ladder.
- Each rung wins in the documented order, including the temporary legacy `device_options` rung.
- Missing `variant` preserves historical behavior and reports the winning value and source.
- No canonical configuration writes `variant: "auto"`.
- A configured but temporarily unavailable entity retains its adapter and explicit variant.
- Studio's displayed default value/source matches the engine's resolved result.

### Studio parity

- Given the same entity, both authoring surfaces offer the same Draws as and Variant options in the same order with the same help text.
- Both surfaces persist `type`, `label`, `sub_text`, `variant`, and `card_group` with the same meanings.
- Switching adapters round-trips without losing unrelated fields.
- Temporary entity unavailability does not make a configured option disappear from the editor.
- Newly added native entities get the documented default; existing Launcher entities do not change on load.
- A legacy unprefixed presentation key becomes typed only when its target kind is provable; an ambiguous key survives with a visible warning.
- Raw/unknown tile types and controller forks survive load/save.

### Grouping and navigation

- Two Number controls with one `card_group` render in one outer grid cell and retain stable, distinct internal row identities.
- The same id in a different section remains a different card.
- Mixed compatible rows preserve order and independent services.
- An incompatible full-card member falls back standalone with a Studio warning.
- Entry from above/below/left/right selects the row required by the interaction contract.
- Up/Down walks internal rows and bubbles from boundaries using the outer rectangle; Left/Right is offered to the row before it bubbles.
- CH-based panel walking treats the group as one outer stop and never changes a value.
- D-pad, touch, Back, existing capture/release, focus restoration, row reordering, and dynamic hide/unavailable transitions never trap or lose focus.

### Migration

- Every historical starter generation, constructed ownership edge case, and available sanitized beta fixture renders equivalently before and after migration.
- Normalization is idempotent.
- Old activity descriptor, Volume/Stepper/Slider, and unambiguous target spellings become canonical without losing custom fields.
- Missing `variant` and `card_group` preserve historical behavior.
- No existing loose entity is silently reinterpreted as a new native control.
- Old pristine stock heals to canonical stock; edited stock becomes a preserved fork; an existing fork remains untouched; migration output does not become a fork on the next load.
- Current stock, starter truth, stock history, and controller generations move together.
- Full engine, Studio, ownership, stock-sync, and supported-WebView probe batteries remain green.

## Non-goals for this feature

- cloning Mushroom's visual design or entire option surface;
- treating arbitrary attributes and services as safe generic controls;
- replacing the separately proposed Composite Card row editor;
- merging controls across sections or screens;
- changing HA device or media-player group membership;
- automatically redesigning existing user activities;
- using a control variant to change the underlying service contract;
- adding fuzzy viewport- or option-count-dependent variant selection; or
- implementing Weather or forecast retrieval, which requires a separate design for fetching, caching, refresh, staleness, and failure.

The Composite Card remains a possible later power-user layer. It can reuse these adapters and grouped row renderers, but ordinary Number and Select entities must not require users to author service/attribute recipes by hand.

## References

- [Mushroom Number card](https://github.com/piitaya/lovelace-mushroom/blob/main/docs/cards/number.md) — one semantic card for `number` and `input_number`, with presentation selected separately.
- [Mushroom Select card](https://github.com/piitaya/lovelace-mushroom/blob/main/docs/cards/select.md) — one semantic card for `select` and `input_select`.
- [Home Assistant Number entity](https://developers.home-assistant.io/docs/core/entity/number/) — current value, min/max, step, unit, and preferred display mode.
- [Home Assistant Select entity](https://developers.home-assistant.io/docs/core/entity/select/) — current option and required option list.
- `docs/design-ownership-buckets.md` — stock, variant, and user ownership rules.
- `docs/beta-gaps.md` §6.3–6.4 — original new-card and composite-card sketches.
- `docs/screen-schema.md` — current Launcher/device, cast generator, group, and controller contracts.
