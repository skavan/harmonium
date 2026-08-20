# Harmonium v0.84.1 — the community debut

*Purpose: What changed since v0.83.9-Beta, for users updating via HACS and for the release/forum post. Audience: users.*

> Version stamps: manifest + engine `0.84.1`, Studio `0.84.1 b48`.
> Updating requires an **HA restart** (integration Python changed:
> the `__init__.py` modularization and the bundled-sounds deploy).

The release that gets Harmonium ready for other people's houses:
the whole input story rethought and made consistent, docs rewritten
and re-shot, four video tutorials, battery alerts, and a stack of
field fixes.

## 📺 Video tutorials

Install via HACS, build a Watch TV activity, build a Listen to
Music activity, and set up Presets & Devices — four short videos,
linked from the README and every matching guide.

## The pad doctrine — one sentence for every screen

*The D-pad drives whichever screen you're navigating* — field-tuned
over three rounds on a real remote.

- On a **passthrough controller** (Watch TV, a receiver's on-screen
  menu) the pad belongs to the device, and **CH▲/CH▼ walk the LCD
  instead** (▲ = up): any CH press borrows the whole pad for a
  rolling 8 seconds (configurable: `input.pad_latch_seconds`) — a
  bold accent strip at the bottom edge says so — then the pad
  returns to the device. Back, a touch, or navigating hands it
  back instantly.
- **Everywhere else — music included — the pad just navigates**,
  and OK always means the focused tile: play/pause on the
  now-playing hero, mute on a volume row, fire on a preset. No
  modes, no surprises.
- The music conveniences ride keys the panel doesn't need:
  **hold-◀/▶ seek −15/+15 s**, **hold-CH = previous/next track**,
  **short CH jumps sections** — the category strip in the Library,
  the section tabs on the controller (and simply walks when there's
  nothing to jump) — and the **menu key opens the Music Library**.
- Every profile gets the hold keys automatically; the KeyMapper
  recipes (Channel Up/Down and D-pad Left/Right long-press) are in
  the hardware-keys guide, and the D-pad no longer wanders into the
  hero tab row.

## New Astrion faceplate supported (astrion2)

The 2026 Astrion revision replaces the glyph row with **⏮ ⏯ ⏹ ⏭**
(same F4–F7 keycodes). The new **`astrion2`** profile names them
`prev`/`play_pause`/`stop`/`next` — and those keys need no
bindings: they drive the running activity's music from **any**
page. Complete with its own device-photo skin, wheel-pad hotspots
and all.

## Real battery back: find the wake lock

If the remote never deep-sleeps, some app is holding a partial
wake lock — on our own unit it was the HA Companion app (held
since boot, cleanly uninstallable); the stock HaRemote launcher is
another documented offender — and the sideloading guide's
"install the HA Companion app" step is now explicitly marked
SKIP in our docs (Fully's integration covers everything
Harmonium needs). The hardware-keys guide now has a
**measure-first** recipe: two adb commands to name the culprit,
the matching remedy for each, and a loud **do-not-brick warning**
(never `pm disable` the stock app). Finding credit:
[marcusadolfsson/astrion-custom](https://github.com/marcusadolfsson/astrion-custom).

## Four nav modes — every tile speaks the same grammar

What ◀▶ and OK do on a focused tile is now a declared, per-tile
policy (`nav`), not widget folklore: **action** (OK fires),
**value** (◀▶ adjust · OK = mute/toggle/join — volume rows, every
stepper, brightness, setpoint), **options** (◀▶ rove the choices ·
OK commits — HVAC/fan/preset chip rows), and **capture** (dpad
passthrough only). ▲/▼ always walk. The old "OK grabs the pad"
select-capture is gone everywhere else.

The **Speaker Group page** rebuilt on this grammar: each player is
a real tile — walk them, trim one with ◀▶, group/ungroup it with
OK — plus a Group Volume tile that rides every linked member
(offsets preserved) and ungroups everyone on OK. And structural
re-renders no longer steal the focus mid-interaction.

**App launchers wake the box by default** now: any app tile whose
player reports asleep fires `media_player.turn_on` first, waits a
beat, then launches (a dialect can override or opt out with
`"wake": false`).

**Clean activity hand-offs**: each activity's Actions tab gained
*Confirm before switching away* and *Run my Stop when another
activity starts* — off by default (the incoming Start owns the
transition; shared devices never flicker), opt in for activities
whose Stop touches only their own gear. And the library's category
tabs now scroll themselves into view when you step to one past the
strip's edge.

**Teach it a new platform**: dialects (Fire TV / Google TV / Tizen
app launching) are documented end to end in the new
[creating-a-dialect guide](../cookbook/creating-a-dialect.md),
Apple TV worked example included. And the README now says the quiet
part loudly: Harmonium is a web page — any browser is a remote.

## Battery alerts (blueprint)

A remote that nags before it dies: tiered alerts (below 20% hourly,
below 10% every 15 min, below 5% every 5 min), only 09:00–23:00,
never while charging — via beep, spoken announcement, and/or
on-screen banner. Ships as an HA blueprint (one-click import) and
works **while the device sleeps**, because it runs HA-side off the
Fully Kiosk integration's sensors. The bundled chirp deploys to
`/local/harmonium/sounds/beep.mp3` automatically. The Studio shows
your alerts under *System → Remotes & keymaps* — live level, tier
profile, an on/off switch, and a Test button. The overlay banner
clears itself when the battery recovers. See the
[battery-alerts guide](../cookbook/battery-alerts.md).

## Sliders stopped stealing your scrolls

A vertical swipe that merely starts on a volume track now scrolls
the page; the slider engages only on a deliberate horizontal drag,
and tap-to-set still works. One shared, intent-gated pointer
handler across volume, stepper, and speaker-group sliders.

## Custom keys, bindable everywhere

Every logical button any remote profile emits — the Astrion's glyph
row included — is offered point-and-click in *Page settings → Keys*,
and bindings inherit: **Apply to children** on a room page covers
its child pages and controllers (a child's own binding wins).

## The Studio

- 📷 screenshots are dependable now: the capture freezes the live
  engine for its duration and pins the measured layout, so scrolled
  pages, live state churn, and per-machine font metrics can no
  longer scramble the PNG.
- Version stamps (`s… b…`), collapsible columns, import chooser,
  and the virgin-install starter flow all carried forward.

## Under the hood

- The big-file split: the activity editor, Studio state, preview
  pane, hub editor, tile row, engine generators, and the
  integration's `__init__.py` are now small, single-purpose
  modules — behavior-preserving, payload-verified.
- Engine scrolling no longer uses `scrollIntoView` anywhere (no
  more embedding-scroll leaks); hero-chip taps pin honestly.
- Remote provisioning: `setup-remote.bat` (rotation lock),
  KeyMapper backup truth (`pull-keymapper.bat` pulls the newest
  backup), and the Astrion key map regenerates from `data.json`.
- App launches wake a dozing device first — by default now, no
  dialect declaration needed (see the nav-modes section).
- Docs: cookbook edit pass to the current taxonomy, screen-schema
  reference reworked, all screenshots re-shot, README rewritten
  ("fast-loading", videos up top), GitHub issue templates.

## Updating

HACS → update Harmonium → **restart Home Assistant** (Python
changed; the restart also deploys the new engine and the beep
sound) → hard-refresh the Studio tab → on each hardware remote,
clear the Fully cache and reload. Open the Studio once and
**Save & Deploy** so healed stock controllers (music gen 5) reach
your config.
