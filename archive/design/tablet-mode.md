# Tablet mode — the workspace as a status board

Status: **THOUGHT (2026-09-03).** Nothing here is ruled or built. Prompted by Suresh's wall-mounted Lovelace dashboard next to Harmonium's default tablet rendering: "We have so much power in Harmonium — must be a strategy to use our workspaces in tablet mode intelligently."

## The instrument framing

A remote and a wall tablet are different instruments answering different questions. The remote answers "I want to do something, now, with my thumb": one room, one activity, focus-driven, built around navigation and the d-pad. A wall tablet answers "what is the state of this slice of the house — and let me nudge one thing while walking past": its unit is the STATUS FIELD — a wall of small truths, glanceable from two meters, where looking is constant and tapping is occasional. His hand-built Lovelace board is a good instrument of the second kind: seven screens with positions in one sweep, six heater zones, a lighting row, weather and a clock for the 95% of time nobody touches it. Harmonium on a tablet today is the 349-logical-px remote column doing its best in a stadium — huge title, two cards, one room deep. Right instrument, wrong hall.

## The strategic claim: a projection, not a product

Every card on the hand-built board already has a Harmonium primitive with RICHER semantics than the Lovelace card carrying it: the scene buttons are presets and activities (with truthful running state from the declared-state rules); Close All is the All-Off doctrine; the screens row is covers with the invert law and the trio controls; the heater and lighting rows are device tiles the control language already draws at three densities; the media summaries are Now Playing; the room grouping is pages and sections; "More…" is navigate. And the hand-built board shows the cost of double authoring — dead cards, Unavailable tiles drifting out of sync with reality.

So the strategy is one sentence: **one workspace, N renderings.** Tablet mode is not a second thing you author; it is the same config drawn at a different density, the way the fleet made five remotes one system. Add a heater once and the remote, the phone, and the wall all know.

## The three renderings (the phone is the hybrid)

- **Remote** (what exists): 349 logical px, one page at a time, d-pad focus is the first-class input, the amber ring is the most important pixel, battery is the first law.
- **Phone** (the hybrid, Suresh 2026-09-03: "a smart phone — which sits somewhere in between, with a dpad (like the browser mode) — but has a screen density that can accommodate many more tiles"): keeps the REMOTE'S navigation model — one room at a time, pages, the same key/back grammar where hardware or on-screen keys exist — but at phone density: more columns, tighter tile shapes, touch-first with the focus ring still available (the browser-mode d-pad already proves the engine runs both input models at once). A phone is carried, so it keeps the remote's battery manners; it is glanced at up close, so it does NOT need the two-meter type scale. Think of it as the remote with the density dial turned up, not a small tablet.
- **Board / tablet** (the new instrument): landscape, powered, wall-mounted, many pages at once. Composition, not navigation.

## What actually changes between renderings — three things only

**Density and unit.** The board composes what the remote navigates. The mapping falls out of existing structure: a page becomes a board REGION; a section becomes a card cluster inside it; each region has a DEPTH — `summary` (the page's activities as scene tiles plus its device groups as one-line chips with computed state: "Screens · 5 active") or `full` (every tile, the page as-is). His two dashboard screenshots are exactly these depths: Home = every room at summary depth; Pergola = one room at full. Tap a region header to zoom, one tap back. The phone sits between: still one page at a time, but sections render at higher column counts and the compact tile shapes lead.

**Input.** The board has no d-pad, no focus ring, no key doctrine — the amber ring was always the NAVIGATION signal and a wall board has no roving focus; the rest of the palette laws (resting badge, running wash, accent-as-text-is-state) carry over untouched so the house feels like one product. Touch grammar comes from the adapter registry: tap fires the domain's primary verb (the tap law tiles already have), long-press opens the detail page — which already exists; the current Deck · Screens page IS the more-info view, it just shouldn't be the only view. The phone keeps both grammars: touch primary, d-pad/focus alive for hardware keys and accessibility.

**Idleness.** A remote sleeps; a wall tablet is on and unwatched — which is why the hand-built board leads with weather and a clock. The board needs an AMBIENT layer: dim to clock / weather / Now Playing after a few minutes, wake to the board on touch. And it gets to ignore the battery-first law: a wall unit is powered, the profile can know that, and the fleet's radio budgeting relaxes per-profile instead of per-house. The phone does NOT get this exemption.

## Why the plumbing already exists

A tablet (and a phone) is just a fleet unit wearing a different profile. Profiles already carry skin and keymap; a profile that says `view: board` (or `view: phone`) instead of remote is the whole switch — same engine, same URL scheme, same hello, same command bus, same Save & Deploy fan-out, same Identify flashing on the wall. Theme and the identity palette apply unchanged. The Chromium-61 floor holds (the engine is the engine), even though wall tablets usually run newer webviews.

## What tablet mode refuses to be

Not a Lovelace competitor: no free-form card canvas, no graphs, no weather engine (weather is already ruled its own future design). Not a second editor: the Studio's pages and sections are the source, and the board needs at most three knobs per page — include on board or not, columns, default depth. The moment there is a separate "tablet layout" to maintain, the projection promise is dead and the double-authoring disease this exists to cure has been rebuilt inside Harmonium.

## Open questions (for rulings, before any build)

1. Is the Home board composed automatically from every room page, or curated? Leaning: automatic with a per-page opt-out — right by default.
2. Do summary chips ("Screens · 5 active") earn their own tiny tile shape in the control language, or reuse the launcher row?
3. What does the ambient layer show — and does that let a weather dependency in through the back door?
4. Phone density: a global "density dial" per profile (tile heights, columns, type scale as one knob), or per-page column overrides only?
5. Where does the board live in the fleet UI — is `view` a profile field beside skin and keymap, and does pairing offer "remote / phone / wall board" as the first question?

## Sequencing (when it is time)

Smallest honest first step: a `view=board` flag on the engine URL that renders the workspace's pages as a composed multi-column grid (regions by min-width), reusing the section renderer verbatim, with tap/hold touch grammar. Then depth knobs and the summary chips. The ambient layer last — it is the most designable and the least load-bearing. The phone rendering may be nearly free once the density dial exists, and could even ship first since it reuses navigation as-is.
