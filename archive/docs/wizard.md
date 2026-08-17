# The Activity Wizard — UX-first design

Status: **phase 2 SHIPPED (v0.45, the Device Round)** — device
bundles, the tabbed builder (Setup·Devices·Jobs·Inputs·Actions·State
with completion dots, per Suresh: no idiot-proof wizard, "tabs with a
lit up dot when done"), generation, and the Consumes strip are live.
Remaining from this doc: dialect machine-read (bundle capabilities
feeding prefills/guardrails) and dialect-generated device pages.
Captured 2026-07-29 from Suresh's UX-backwards walk (Harmony wizard
as prior art) — see PROJECT.md v0.45.

## The premise

Users don't think in entities, roles, or transports. They think:

> "I want to control a Fire TV, feeding a Samsung TV, feeding a
> Soundbar. Media stuff happens on the Fire TV, inputs on the TV,
> volume on the Soundbar."

Every wizard question must be answerable from the living room. The
engineering vocabulary (roles, $context, dialects, sequences) is the
*storage format*; the user never meets it. Prefill everything
implied by earlier answers; ask only where real ambiguity exists.

## The prime directive: NEVER guess power

Harmony's fatal flaw: it switched devices off and on when the user
didn't want it to. In this house the Fire TV is NEVER turned off.

Rules, in order of force:

1. **No runtime magic.** There is no diff engine, no implicit
   power-off on activity switch, no hidden behavior. Switching
   activities runs the incoming activity's Start Action, period.
   Start Actions are written to be safe to run over any prior state
   (best-effort wakes, cold-start conditionals — the `firetv_on`
   pattern).
2. **Generated ≠ owned by the generator.** The wizard emits a Start
   Action as an ordinary room sequence — visible, editable, deletable
   in Studio like any hand-written one. Once the user touches it, it
   is theirs: regeneration NEVER silently overwrites an edited
   sequence (offer a side-by-side diff or write `<name>_v2`).
3. **Power-off is opt-in, per device, default NOTHING.** The Stop
   question shows the cast with checkboxes, all unchecked. An
   unchecked device is never mentioned in the Stop Action at all.
4. **Power-on is proposed, not assumed.** The generated Start Action
   wakes cast devices *best-effort and non-disruptively*
   (`continue_on_error: true`, conditional cold-start blocks), and
   the user sees and can strike every step before accepting.

## The question flow

Bracketed = which primitive the answer fills. Questions marked ⊘ are
skipped when earlier answers make them unambiguous.

**Q1 — What are we building?**
Watch (movie/TV) · Listen (music) · Play (game) · Custom.
[→ controller anatomy + view template + which questions follow.
A Listen activity never asks about a display.]

**Q2 — What devices are involved?**
Pick from defined device bundles (phase 2), in signal order where it
matters: source → display → audio. Bundles bring their entities; the
user never picks an entity_id.
[→ the cast. Bundle roles prefill: source device takes
media_player / dpad / system / app_class; its position implies its
jobs.]

**Q3 — Which device is the display?** ⊘ if only one candidate.
[→ source_select + power roles → the display bundle's entities.]

**Q4 — Which device controls volume?** ⊘ if only one candidate.
Volume *keys* and volume *level* may split (Samsung takes keys,
soundbar reports level — today's watch_firetv does exactly this);
the bundle's declared capabilities decide whether to ask twice.
[→ volume + volume_level roles.]

**Q5 — What input should [display] be set to?**
Options harvested live from the entity's source_list. "None /
ignore" is always offered and always honored.
[→ a select_source step in the Start Action draft, AND the
activity's `state.on` detection block — display on + source in
[X] is precisely how watch_firetv detects itself today.]

**Q6 — repeat Q5 for every cast device that has sources.**
Same "none/ignore" escape on each.

**Q7 — When this activity starts, what should wake?**
Cast list, pre-checked for devices the answers require, each
strikeable. Wakes are generated non-disruptively (see directive 4).
[→ wake steps in the Start Action draft.]

**Q8 — When this activity ends, should anything turn off?**
Cast list, ALL UNCHECKED (directive 3). `confirm_end` offered here.
[→ Stop Action draft, possibly empty.]

## What the answers generate

All existing primitives — the wizard adds NO new runtime concepts:

| Answers | Generates |
|---|---|
| Q1 | `view:` (controller), which questions get asked |
| Q2 | cast (bundles) + prefilled `context:` roles |
| Q3–Q4 | remaining `context:` roles |
| Q5–Q6 | `state:` detection block + input steps in Start Action |
| Q5–Q7 | `start: sequence:<slug>_on` — a DRAFT room sequence |
| Q8 | `stop:` sequence (or nothing) + `confirm_end` |

The generated Start Action follows the proven `firetv_on` shape:

1. `harmonium.set_activity` (display state first — instant UI)
2. best-effort wakes (`continue_on_error: true`), cold-start
   conditionals where the bundle declares them (e.g. Samsung WOL
   button only when the TV reads "off")
3. delay if the display needs one (bundle-declared, e.g. 5000ms)
4. `select_source` steps from Q5/Q6, skipping "none/ignore"

Final wizard screen = the draft sequence rendered as editable steps.
Accepting writes it to the room's `sequences:`; nothing runs until
the user starts the activity.

## Edge cases (accumulate here)

- **Shared devices across activities** (soundbar in Watch AND
  Listen): safe by construction — no diff engine, stop-off is
  opt-in, starts are idempotent-friendly. Switching Watch→Listen
  touches the soundbar only if Listen's Start says to.
- **One physical device = two HA devices** (the projector:
  androidtv_remote + ADB integrations, unlinked, different MACs).
  Bundles must span HA devices; the wizard sees ONE "Pergola
  Projector". The bundle also records which member entity fills
  `commands` (the ADB media_player — the only entity
  `androidtv.adb_command` accepts; role named `system` before v0.45.1).
- **Display with no controllable input** (projector on a single
  HDMI): Q5 auto-answers "none".
- **Controller consumes an unwired role**: not a wizard error —
  hide-unwired governs. The Consumes strip (Studio: scan the target
  view for `$context.*` refs, render wired/unwired chips) shows the
  contract at wiring time.
- **Custom (Q1)**: skips prefill, opens the raw activity card —
  the wizard is a front door, never a cage. Anything the wizard
  wrote remains editable in the card afterward; the card is the
  ground truth, the wizard just fills it.
- **Second-class starts**: `start:` may point at a plain HA script
  entity today; the wizard only ever generates first-class
  sequences, but must not break activities using scripts.

## Sequencing

1. **Phase 2 — device bundles** (first-class devices, devices→
   remotes rename migration). The wizard's vocabulary is bundles;
   it cannot exist before them. Bundles seed from HA's device
   registry (sibling-entity lookup) but allow manual grouping
   across HA devices.
2. **Consumes strip** — small, Studio-only, independently useful;
   can ship before the wizard.
3. **Dialect machine-read** — bundle capability declarations (has
   sources? needs boot delay? cold-start recipe?) live naturally in
   dialects; the wizard reads them for prefills and Q-skipping.
4. **The wizard itself** — a Studio flow that writes the same yaml
   a hand-built activity has. No engine changes anticipated.
