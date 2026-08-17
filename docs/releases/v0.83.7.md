# Harmonium v0.83.7 — The Controller Release

The biggest release since the Studio itself: activities gained a
control panel of their own, speakers became a first-class building
block, Now Playing learned three shapes, and a stack of field bugs —
including dead volume keys on fresh installs — got fixed.

## The Controller tab

Every activity now has a **Controller** tab — per-activity switches
over the *shared* control surface, no custom copy needed:

- **Band switches** — turn Now Playing, Transport, Modes, the Volume
  band, Speakers, Cast-group cards, Source picker, Presets and the
  Devices section on or off *for this activity only*. Absent = Auto =
  the band's own rules; other activities on the same surface keep
  their own answers.
- **Reorder** the bands with ↑↓ — non-band tiles hold their slots.
- **Label slots** — rename any single-tile band on the remote (empty
  = no label, ↺ restores); Presets and Devices rename their section
  headings. Placeholders show what the band actually says today.
- **Volume style** per activity (Compact / Slider / Stepper), and the
  stepper is now its own shape: "Vol n%" on the title line with a
  fat draggable track between − / +.
- **Presets** folded in beneath — the activity's one-touch shortcuts,
  now with a searchable service picker (media_player services first)
  and cast-first entity targeting.

## Speakers

- **Speaker grouping card**: join/unjoin players against the running
  activity's stream (standard `media_player.join` contract — Sonos,
  Music Assistant), with a group volume that preserves relative
  levels, and a per-player **volume link** toggle — an unlinked
  player keeps playing in the group while the group slider leaves it
  alone.
- **Speaker Groups**: named, workspace-level sets of joinable players
  ("Outdoor Music Players") independent of any activity's cast —
  edited under Model → Speaker Groups, selected per activity on the
  Controller tab. Two card modes: a slim **launcher** ("5 available ·
  2 linked" → the group's own page, with a volume row per player) or
  the full card **inline**.
- Every player row's volume is `[−] [track with the % inside] [+]`;
  on the inline card, tap a player's name to reveal it.
- Cast groups can hold loose entities now, and grouped entities leave
  the Devices section for their group's page.

## Now Playing, three ways

Pick per activity on the Controller tab: **Standard card** (state and
source on separate lines), **Slim row** (a one-liner with a live play
indicator and auto-scrolling title), or the **Art hero** — artwork
riding the right edge at full strength, fading toward the track text,
with the library jump as a full-height fade-in zone over the art. The
original full-bleed wash survives as **Art wash**.

## Fixes that matter

- **Volume keys work on fresh installs**: unbound `vol_up`/`vol_down`
  now route to the running activity's wired volume at the engine
  level (the starter config shipped without bindings — every new
  install had dead volume keys).
- Generated **Stop is conditional**: ending an activity clears the
  room's routing only if that activity still owns it — a room can run
  more than one.
- **Mute indicator** on volume tiles (glyph + dimmed track), and the
  volume % is said once, not twice.
- Icon-font gate: no more ligature-text flash before Material Symbols
  loads.
- A malformed entity id can no longer silently kill a whole page's
  live updates.
- `harmonium.run` explains the draft/saved seam instead of erroring
  cryptically.
- Studio: the stretched-preview bug was pinned to the preview's
  scale math and fixed; a ↻ button reloads the engine preview in one
  tap.
- Soundbar-style devices (volume-only claims) get their Inputs row.

## Fresh-install polish

A virgin HACS install now seeds a starter config server-side (with
the bundled Astrion skin and working volume-key bindings) and the
Studio opens on it ready to Save & Deploy — no more red "no config
found".

## For tinkerers

`pull-keymapper.bat` / `push-keymapper.bat` back up the remote's
KeyMapper wiring into the repo over USB and restore it onto a new
device — see docs/cookbook/hardware-keys.md.

---

Full detail: `docs/PROJECT.md` (the changelog) and
`docs/cookbook/creating-an-activity.md` §8 for the Controller tab.
