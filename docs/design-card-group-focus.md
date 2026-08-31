# Card groups × the focus walk — the geometry spec

Status: **RULED (2026-08-31).** This is the document `design-entity-controls.md` gates Phase 3 on. It answers the five open questions with the engine's actual machinery, and each answer carries its probe.

The finding that shapes everything: **the focus engine is already member-ready.** `focusables()` (ui/focus.js) enumerates per-tile DOM elements (`#tile_<id>`), skipping any with `offsetParent === null`; `spatialMove` is purely rect-geometric over those elements; the ring is the `.focused` class on the tile element; capture (`S.captured` + `.captured`) is per-tile. None of it knows or cares what container a tile element sits in. So the design's rule — *grouping is a visual wrapper, never a focus stop* — is not merely compatible with the walk, it is the only implementation that costs nothing: keep each member's `#tile_<id>` element and true geometry, and every focus behavior below follows from code that already shipped.

## 1. How a multi-stop card occupies the grid

**One spanning grid item, members as stacked rows inside.** The card is a `div.cardgrp` grid child taking the ANCHOR's footprint (the first member's `spanOf` result — first member anchors, per the parent design); members render inside it as a flex column, each keeping its own `.tile` element at full card width. Per-member grid cells in a shared skin are rejected: drawing one skin across separate grid cells needs `:has()`/subgrid (both above the Chromium-61 syntax/CSS floor), and a member hiding would reshuffle sibling cells instead of closing a row gap.

Members merge only within the same resolved screen, same rendered section, same non-empty `card_group` — enforced by construction, since grouping happens inside the section render walk. Authored order holds; a same-group tile authored later in the section joins the card at the anchor's position.

*Probe:* two grouped tiles render inside one `.cardgrp`; the wrapper is a child of the section host; the members' elements still resolve by `#tile_<id>`; a third same-group tile authored after an interloper still lands in the same card, after its siblings.

## 2. How `spatialMove` enters the card

**Nearest member by geometry — because that is what rect math does.** No entry special-casing exists or is added: members are ordinary `focusables()` entries with real bounding rects, so ▼ from above lands on the top member (smallest `dy`, `cross × 2.5` penalty keeping it in-column), ◀/▶ from beside lands on the row at that height, and walking OUT of the card is the same math in reverse. The card wrapper itself never appears in `focusables()` — it has no tile id — so "never a focus stop" is structural, not a convention.

*Probe:* focus a tile above the card, send ▼ — focus lands on the first member, not past the card and not on any wrapper; ▼ again walks member to member; ▼ off the last member leaves the card.

## 3. What the ring draws around a focused member

**The member row, exactly as standalone.** `.tile.focused` (accent border, wash) draws on the member element inside the card; the card gets no focus treatment ever. Inside the card, member tiles go flat — background and shadow move to the wrapper, a hairline separates rows — but the 2px border slot every tile already reserves (`border: 2px solid transparent`) stays, so the ring appears in place without layout shift. `gridScrollTo` keeps working: the member element is still inside `#grid`.

*Probe:* focused member has `.focused`; the wrapper's classList never contains `focused`; the member's client rect is inside the wrapper's rect (the ring is visibly "a row of the card").

## 4. How capture interacts with capturing members

**Per-member, unchanged.** Capture state is keyed to the focused tile and its element (`enterCapture` → `#tile_<id>.captured`); a slider mid-drag (`wireSlider` is element-scoped, `sl._drag` guards render fights) behaves identically inside a card. The value grammar (`nav: "value"` — ◀▶ nudge in place, ▲▼ always walk) already governs stepper/volume/picker members, so a card of controls walks vertically through members while each row adjusts horizontally — one grammar, no latch, no card-level capture semantics of any kind.

*Probe:* a volume-stepper member inside a card takes ◀ as a nudge (service call, focus unmoved) and ▼ as a walk to the next member — byte-identical to the same tile standalone.

## 5. How hide/unavailable transitions reflow the card

**The flex column closes the gap; an empty card hides itself; focus follows existing doctrine.** A member that self-hides at runtime (a chips row with no options) toggles `.hidden` on its own element — the column reflows, and `focusables()` already skips it (`offsetParent === null`). `renderStates` toggles `.hidden` on any card whose members are all hidden, so an empty card is never visible chrome and never traps geometry. A member that vanishes STRUCTURALLY (tile set change) goes through the `tileSig` re-render, which already keeps focus on a surviving id and falls back to `initial_focus` otherwise (the v0.83.11 spkgrp lesson, unchanged). `card_group` joins `tileSig` so grouping changes re-render like any structural change.

*Probe:* hide one member's options → its row disappears, the card shrinks, the walk skips it; empty the whole card → the wrapper takes `.hidden`; restore → both return.

## Row-form advertisement

The adapter registry carries it: `row: false` marks an adapter with no row form (Now Playing — an art hero cannot flatten into a card row). At render, a `card_group` on a row-less member is ignored and the member renders standalone; the Studio shows the warning at authoring time. Everything else — Launcher, Volume, Power, Transport, Sources, Number, Select — has a row form (they are already drawn as card-shaped rows today).

## Non-goals (v1, restated from the parent design)

No group title; no card-level focus stop or enter/exit mode; no cross-section merging; no nesting; no reordering members across the card boundary by drag (authored order is the order).
