# Forum replies — v0.85.6

Post these after the release is tagged and pushed.

---

## Reply to reporter 1 (Expert Mode / Apple TV / card height)

Thanks for this report — all three items are addressed in v0.85.6, and your
follow-up with the real Apple TV `source_list` directly shaped what shipped.

**Apple TV.** You were right that it belonged in dialects. The remote was
sending Fire TV's command names, and Home Assistant's Apple TV integration
only accepts its own — lowercase, and its "back" command is literally called
`menu`. Two things changed:

- Every dialect can now declare its own **D-pad commands** (Apps → your
  dialect → D-pad commands), so any platform with different command names is
  a one-time setting rather than a code change.
- A stock **Apple TV dialect** ships preconfigured, including sixteen
  launchable apps checked against your list — "HBO Max" and all. Delete the
  ones you don't use; your edits survive updates. One thing to know if a
  launch does nothing: the app's name must match your player's `source_list`
  exactly, and those names shift with rebrands.

Since you have the real hardware and we don't, a quick confirmation in this
thread that the buttons behave would be very welcome.

**Card height.** Two answers, and the easy one first: if what you're after is
a bigger Now Playing card, you don't need to size anything by hand. Open the
activity, Controller tab, and set the Now Playing style — v0.85.6 adds
**Art Hero — Large**, which is near full screen, holds its size through
play/pause/idle, and dims the artwork instead of blanking it.

The precise route also exists now: any tile can be given an exact height in
its **Styling** tab. One thing you'll hit on the way: as of this release the
built-in controllers are **read-only** in the Studio (so updates can never
silently wipe anyone's customisations again). To edit an individual tile,
press **⧉ Duplicate to edit** on the controller first — the copy is yours
forever, and the Styling tab is live there.

**Expert Mode.** Your finding is now in the hardware-keys guide, with one
addition worth knowing: a KeyMapper backup does *not* carry the Expert Mode
setting, so it has to be re-enabled (one ADB line) on every device you
restore to.

**Upgrading:** after the HACS update, restart Home Assistant, press "Clear
browser cache" on the Fully device page if the remote looks unchanged (the ⓘ
page should say 0.85.6), then **open the Studio and press Save & Deploy
once** — that's what applies the new stock content, including the Apple TV
dialect, to your config. Updates never rewrite your config behind your back.

---

## Reply to reporter 2 (missing bands / set_activity / power button)

Thanks for writing all three down — the first one turned out to be a real
bug with a long history, and you're the one who caught it.

**Missing bands on the Music controller.** Fresh installs were shipping an
old, cut-down copy of the Music controller — the speakers, groups, presets
and devices bands existed in the library but never made it into the starter
config, so a brand-new install was born without them (your first save in the
Studio is what quietly repaired it). v0.85.6 generates the starter from the
library itself, and a test now fails the build if the two ever drift apart
again. New installs get the complete controller from first boot.

**`harmonium.set_activity`.** Working as designed, but the design deserved a
better explanation than it got: it changes which activity a room *shows* on
the remote — it does not run the activity's Start sequence, so nothing
turns on. For a full start from an automation today, call `harmonium.run`
with the activity's Start sequence. And you've convinced me the service
should just take a `start: true` option — it's on the list for an upcoming
release.

**The vanishing power button.** I haven't reproduced this one yet. My best
suspect is the power target's entity being briefly unavailable after an HA
restart. Next time it happens, two things would pin it down: does the button
come back on its own (and roughly when), and had HA restarted shortly
before? A screenshot of the ⓘ page at the time would help too.

**Upgrading:** restart Home Assistant after the HACS update, clear the Fully
browser cache if the remote looks unchanged (ⓘ should say 0.85.6), then
**open the Studio and press Save & Deploy once** — that save is what brings
your config up to date, including the repaired Music controller.
