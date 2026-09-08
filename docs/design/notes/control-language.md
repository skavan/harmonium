# The Harmonium control language

Status: **RULED (2026-09-01, V7).** Distilled from the Claude Design
canvas `docs/design/Harmonium control language V7.html` — the visual
source of truth, superseding all predecessors. V7 = V5 + **§9
(switch · button · lock, and the state-pair rule)** + the
**right-side glyph rule** ("chevron means you leave, tune means you
stay") + the **two-line block alignment** (name AND status at x52,
glyph centred on the pair — everywhere a card carries icon + name +
status). V5 itself was V4 + the NO-HEX rule (§1), the 116px
discrete compact (§4C), the two-line row rule (§5), and the §8
token verdicts (--fs-0/--fw-0 display step, --tab-h; --bar-h
correctly NOT minted; the --on/--accent semantic split blessed).
`tests/probe-v3-geometry.mjs` measures the rendered shapes against
the canvas numbers and `tests/probe-control-language.mjs` statically
sweeps every component stylesheet for raw hexes; a drift fails by
name.

## Foundations (the shipped numbers)

The panel: 480×800 physical, **349 logical** — 480 stays the authored
reference the column count is computed from, never a width anything is
seen at. Span-2 renders 325, a 1-wide 157; build against the computed
value, never the constant. Control cards are span-2 by default and
stay span-2 — a numeric control never sits in a 157px column.

Type: system UI stack; Material Symbols Outlined is the only loaded
font. Label 15/600, status 13/400, heading 12/700 caps, fat value
21/600 tnum, row/inset value 14/600 tnum. Title icons: a 24px glyph in
a 28px slot, 10px gap.

Chassis: 12/10 side padding and gaps; 84 minimum tile height; tile
padding 12/14 (the 2px focus border lives INSIDE that budget); ONE
12px radius — tiles, buttons, tracks, pills; every numeric ± button
58×46. Card heights: **fat 156** (12+22+10+44+10+46+12), **compact /
stepper / chips 100** (12+22+8+46+12), **discrete compact 116**
(12+20+2+15+9+46+12 — the two-line block plus the trio, V5 §4C),
**launcher and rows 84** — one list height whether a status line
exists or not.

### Track geometry (V4 §2, RULED 2026-09-01 — fully tokenised)

The theme tokens (src/styles/tokens.css, pasted per §0): --radius 12
· --track-inset 2 · --lead-ratio 3 · --fill-min 4px · --track-h-1 44
· --track-h-2 32 · --btn-w 58 · --btn-h 46 · --focus-w 2 ·
--focus-offset 2 · --track-channel #1A212B · --track-hairline
#2A3340. Everything else DERIVES:

    channel radius = min(--radius, h/2)
    fill inset     = --track-inset (all sides)
    fill trailing  = min(inner, fill-h/2), inner = --radius - inset
    fill LEADING   = clamp(0, inner × (w/h − 1) / (--lead-ratio − 1), inner)
    fill width     = max(--fill-min, pct − 2·inset); zero/unknown = no fill

The leading corner reads the FILL'S OWN aspect — square at 1:1, half
at 2:1, full at --lead-ratio (3:1 default, "the one number chosen by
eye — try 2.5 and 4 on the panel") — so a 14% zone member reads as a
quantity beside three longer fills. It saturates at 42% on the fat
track, 55% on compact; no exception at either end. JS supplies
exactly two per-fill custom properties (--pct, --fill-ratio —
registry.js setFill). ONE deviation from §2's CSS listing, forced
by the platform: the stock Astrion webview is Chromium 61
(probe-syntax-floor) and CSS min()/clamp()/inset need 79+/87+ — so
setFill computes the SAME derivations from the SAME theme tokens
and writes px. The formula, tokens and devtools tunability stand;
only where the arithmetic runs moved.
One radius, never one per size: tracks match their NEIGHBOURS.
Value labels inset 10px (14 on fat), flipping to accent ink ≥88%.
The 12px read-only meter keeps the literal 6/4 pair; the Now
Playing progress stays the slim locked-height exception.

### The no-hex rule (V5 §1)

"Any hex written into a component is a bug. Colour comes in exactly
one way: the token name." Enforced by a static fence in
probe-control-language: every engine stylesheet except tokens.css is
swept. Hexes legitimately live in exactly three places — tokens.css
(the definitions), a `var(--token, #hex)` fallback (the token owns
the colour; the hex is only the Chromium-61-safe floor), and the
`--svc-*` service-BRAND token definitions (Spotify green is not a
skin decision). The 2026-09-01 sweep also minted `--warn` (amber
caution — not an error, not the accent) and `--logo-chip` (the light
ground behind dark brand wordmarks), and caught the auth button
still wearing the retired #1a1400 ink.

### Token map for the canvas (V4 §0 step 4 — the real names)

Colour, canvas → shipped token (src/styles/tokens.css, all
theme-overridable per remote profile): canvas → `--bg` · tile →
`--tile` · control → `--tile-hi` · track channel → `--track-channel`
· hairline → `--track-hairline` · disabled surface → `--ctl-dis` ·
accent → `--accent` · accent ink → `--accent-ink` · text →
`--text` / `--dim` (secondary) / `--faint` (disabled) · status
online → `--ok` · active-icon colour → `--on` (= accent) · accent
wash → `--wash` · danger → `--danger`.

Header bar (#bar): the height stays DERIVED, ≈54px, from `--bar-pad`
(11px 14px 8px), `--bar-fs` (17px title), `--bar-sub` (13px),
`--bar-gap` (8px) — V5 §8 ruled NO `--bar-h` ("if a value falls out
of other values, let it"). Hero/banner (#banner): height is
per-screen config (`banner.height`); the title rides the display
step `--fs-0` 34 / `--fw-0` 300 and the `.hjump` tab strip rides
`--tab-h` 52 (all three minted per V5 §8). `--on` vs `--accent`:
same hex today, DIFFERENT meanings — --on says "the device is
running", --accent says "selected / this is the value"; a theme may
split them (V5 §8 blessed the pair). Now Playing heights:
`--np-art-h` 150 / `--np-hero-h` 244.

The canvas palette is the RULED skin (2026-08-31 — "I want those
passes"): canvas #0A0B0D, tile #171E27, control #222B36, channel
#1A212B, hairline #2A3340, disabled #141A22, accent #FFB020, accent
ink #14181D, text #F2F5F8 / #98A2AE / #5B6674, status-online #4ADE80.
All live on theme-overridable tokens; `--on` = accent (one colour
rule for "active"); the ink sweep retired the old #1a1400.

Focus: the 2px accent ring at a 2px offset (tightened from 3px on
review, 2026-08-31).

## The numeric family — three shapes, one chassis

- **Slider · fat** (156): 44px drag track, − [21/600 value] + row.
  The headline value — one per screen (guidance, not a validator).
- **Stepper** (100): − [21/600 value] +, NO track — discrete values.
- **Compact** (100): − [32px track, value inset right at 14/600,
  10px in] +. Continuous but secondary; scrubbable.

The title line is the name, nothing else; no tile shows the same
number twice; an empty status line leaves no hole (the card heights
sum without it — rows alone keep the slot so lists never reflow).

## Device tiles — A DEVICE TILE IS THE NUMERIC CARD

No tile-specific geometry exists. The fork is by CAPABILITY, never
domain: continuous value → ± around the value; discrete positioning →
three stretched 92×46 buttons (the trio). Exactly two action-row
fillings, ever — never both, never a fourth button, never a control
sharing the row with a secondary action (oscillate and friends live
on the detail page).

- **A · Launcher** (84): icon, name, status, the 58×46 tune button
  (vertically centered). Identical for every domain.
- **B · Inline fat** (156): the fat slider unmodified. Continuous
  (fan): the value at 21px between the ± buttons. Discrete (cover):
  the trio fills the row and the value moves INTO the track — the
  track doubles as the position readout (and scrubs the position;
  an unreadable position shows the bare state word in the track).
  Tune = a **24px unboxed glyph** in the title row (44×44 hit area) —
  a 58×46 button would force the tile to 180. Volume carries no tune
  at all (no detail page exists). Tilt stays a second action row.
- **C · Inline compact**: the compact card. Continuous (100): − [32px
  track, inset value] + — byte-identical to numeric Compact.
  Discrete (**116**, V5 §4C): the launcher's two-line block — name
  15/600 at y14, the state on its OWN status line 13/400 at y34
  ("Open · 96%") — then the trio at y58. The value NEVER sits beside
  the name (the "Sou…" lesson generalised: a long value competes
  with the name and wins). No tune affordance — the icon-plus-name
  zone is the detail target. The v2 fixed 194px side cluster stays
  RETIRED: it starved every name at the panel's real 349px (the
  "Di…" screenshot).

Status is shown only when no control shows it: always in the
launcher, in fat only as the in-track state word, in discrete
compact on its own status line — always its own line, never beside
the name. Unavailable greys the glyph and text, keeps the chassis
and keeps the actions live.

## Rows, toggles, buttons

- Rows (nav, source, speaker groups, launcher lists): 84. The row
  grammar, exact (2026-09-01, his rule-book-vs-build screenshots):
  a BARE 24px glyph in a 28px slot at x14 — no disc — name 15/600
  and status 13/400 at x52, the right-side glyph (chevron or tune)
  UNBOXED in the same 28px slot at the same x the chevron uses. A
  SINGLE-LINE row is one line — the empty status line leaves no
  hole, the name centres ("the two-line block applies when there
  are TWO LINES"). A right-aligned value truncated the name the
  moment either grew (the "Sou…" screenshot). The icon disc and
  the +2 label bump remain the library/browse/queue language only;
  activity rows keep their ruled accent circle. The boxed 58×46
  tune button is the GRID launcher's form (§4A), never the row's.
- **Right-side glyph (V7): chevron means you LEAVE, tune means you
  STAY.** A row that navigates — another page, another room,
  another list — ends in chevron_right (nav rows). A row that opens
  the controller or picker FOR the thing it names ends in tune:
  source and select rows, the speaker-group launcher, and every
  device launcher's 58×46 trail. Never mixed in one list by
  accident.
- **The two-line block (V7, from his screenshots): the launcher's
  own text block, everywhere.** Any card carrying icon + name +
  status — launchers of every domain, the 116 discrete compact —
  puts the name AND the status at x52, both truncating, with the
  24px glyph at x14 vertically centred against the pair. The status
  never hugs the tile's left edge below the icon.
- Toggle groups: pills at 46px/12px, **three columns always** — a
  four-item set leaves the last cell empty rather than reflowing.
  Active = accent fill + accent ink; disabled = the disabled surface.
- Buttons: one primary (46) per screen; 58×46 squares; the 64px round
  power button is the only circle in the system.
- Grouped tile: several compact controls stacked in one card — 14px
  between members, 8px inside one (the channel track is what lets
  four stacked fills coexist).

## Stateless & binary domains (V7 §9 — switch · button · lock)

Two rules these three establish. **Fat exists to house a track**: no
continuum, no fat variant — asked for fat, they render their compact
tile (the density scale doing its job). **Binary state is never a
sliding toggle**: every binary control is a STATE PAIR — two
explicit labelled targets, 1fr 1fr at 46 with the 10px gap (143.5px
each in a 325 card). Three segment states, one meaning each: the
side that is not current is raised `--tile-hi` (the action
available); the current side is `--on` when the device is ENGAGED
(on, locked) and recessed `--ctl-dis` with a `--text` label when it
is not (off, unlocked) — orange never appears on a device that is
not running. Recessed-current and disabled share the fill and are
told apart by the label (`--text` vs `--faint`). A pair is not the
§5 pill group: pills pick one of N like options (3-up always), a
pair issues one of two opposed commands (2-up always). Offline
raises both sides.

- **Switch** (compact 100 · launcher 84): the pair IS the readout,
  so compact carries no status line — the only discrete domain that
  stays at 100. Off/On with power_settings_new / bolt glyphs.
  Engine: `{type:"switch"}` (switch, input_boolean).
- **Button** (84 · `{type:"press"}` — button, input_button, scene):
  the tile IS the control, on `--tile-hi` (the pressable surface is
  the signal). Press fills accent and the status line says **Sent**
  for ~1.2s — DELIBERATELY OPTIMISTIC, fires on press, no
  acknowledgement (noted here so nobody "fixes" it). No tune, no
  chevron, no detail page. The one tile that works at span 1 —
  icon above name at 157.
- **Lock** (116 — the two-line block · five states): locking is safe
  and unlocking is not, so they are different gestures — lock is
  ONE PRESS, unlock is a **500ms hold** (`--hold-ms`, counted from
  button-down) that fills the target with accent as it goes; the
  status line spells "Hold to unlock…" once the press begins, and
  releasing early undoes it. The fill inverts the label as it
  passes (a clipped accent-ink duplicate row — the 96% track's flip
  rule applied to a moving edge; driven in JS px for the
  Chromium-61 floor). All five states render: locked (accent —
  `--on` territory), unlocked (recessed, not lit), locking/
  unlocking (both sides disabled, named on the status line), and
  jammed — the first real use of `--danger` (error glyph, "Jammed —
  check the bolt", Retry re-issues lock). A latch with OPEN support
  grows the pair to the covers' 92px icon-only trio (lock /
  lock_open / door_open); unlock AND open both hold. On the d-pad,
  ◀▶ rove the pair and a tap-OK only ever LOCKS; holding OK is the
  hold gesture (the chassis hold timer clears the same
  deliberate-press bar).

## Cover invert (V7 round, config)

`"invert": true` on a cover tile flips the DISPLAY axis for covers
whose HA position reads backwards on the wall (projector screens):
readout, state word, fill and scrub all live in the flipped space
("2% open" reads "Closed · 98%"); the trio keeps its physical
directions and end-stop logic stays in HA's own space.

## Spelling (unchanged by v3)

Draws-as: fan/cover are first-class adapters ({type:"fan"|"cover",
variant:"inline"|"compact"}, default inline); the Launcher carries no
variants. The Wave C spelling ({type:"device", variant}) stays a
compat read in the engine and heals in the Studio. A density tile
pins its own chassis (card, span-2) wherever it lands.

## Adoption ledger

- Waves A/B/C (2026-08-31): first cut, per the v1/v2 canvases.
- v3 re-cut (2026-08-31, same day — the final-review screenshots):
  the real 349px render width surfaced; heights re-summed to
  156/100/84 exactly (border folded into the padding budget); the
  channel track; fan/cover re-cut onto the numeric chassis; the
  side cluster and oscillate retired; source/select rows; 3-up
  pills; grouped-tile rhythm. Fences: `tests/probe-v3-geometry.mjs`
  + `tests/probe-control-language.mjs`.
- Palette + nav pass (2026-08-31, ruled in on review): the skin
  tokens above; plain/summary nav cards and the speaker-group
  launcher joined the v3 row shape (chevron cue, centered 84);
  focus ring offset 3 → 2.
- V4 (2026-09-01): the token system into the theme; the leading-
  radius rule live on every horizontal track (setFill); ± buttons
  and pills on --btn-w/h; the ring on --focus-w. Fences:
  probe-v3-geometry pins the canvas's own lead table (2.9 @ 30%
  compact, saturation, square sliver).
- V5 (2026-09-01): the canvas adopted the shipped token names and
  the two-line row fix as written; in return the code adopted the
  116 discrete compact, the no-hex rule (swept + fenced, --warn and
  --logo-chip minted), --fs-0/--fw-0 on the hero title, --tab-h on
  the tab strip, and NO --bar-h. ONE standing deviation, reasoned
  and documented in §Track geometry: V5 §2's pure-CSS derivations
  need Chromium 79+; the stock panel is 61, so setFill runs the
  identical formula from the identical tokens in JS.
- V7 (2026-09-01): §9 switch/button/lock live (state pair, press
  tiles, the five-state lock with the 500ms hold and `--hold-ms`
  minted); the chevron/tune rule applied (source, picker and
  speaker-group rows now cue tune; nav keeps the chevron); the
  two-line block aligned to the launcher's own (status at x52,
  glyph centred — his battery-tile and compact-cover screenshots);
  cover `invert`. A density ask on a switch/lock lands on the pair
  (no fat exists). Fences: probe-v3-geometry (§9 numbers at 349 +
  the x52 block) and probe-control-language Wave E (states,
  optimistic Sent, the hold's early-release undo).
- V7 row audit (2026-09-01, "GO THROUGH EVERY TILE/ELEMENT"): the
  row form re-cut to the canvas (bare glyph, x52 text, unboxed cue
  slot, single-line centring); the two-line block alignment extended
  to every cue-carrying card (picker, sources, nav, group rows);
  the "…" pre-state sentinel barred from every status line (chassis
  level). Fences grew to pin the row grammar.
- DECLARED deviations, flagged for ruling: (1) the header bar keeps
  the earlier "larger header" ruling (17px title, ≈54 derived) — the
  V7 canvas draws a 15/600 title with a boxed back chip; (2) the V7
  §3 unavailable-NUMERIC specimen (ctl-dis surface, "Unavailable"
  beside the name, collapsed to 100) contradicts both V7's own
  Unavailable rule ("keep the chassis and keep the actions live")
  and the never-beside-a-name law — the build follows the rules
  text: full chassis, greyed, actions live.
- Still open (needs Suresh's ruling before code): densities for
  further domains; the one-fat-slider Studio hint; the Studio's own
  editor chrome is outside the panel language (a Studio token sweep
  is a separate ruling).
