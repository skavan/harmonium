# Hardware keys

*Purpose: Making every physical button do the right thing on every page — including KeyMapper backup/restore. Audience: hardware-remote users.*

**Outcome:** every physical button on the remote does the right
thing on every page — arrows drive focus, volume is always volume,
and during an activity the D-pad belongs to the device you're
watching.

## 0. The hardware side (Astrion/HA100)

Getting the buttons to *emit* something a webview can see is the
sideloading + KeyMapper story, covered start-to-finish by Brad
Sanders' community guide:
[Astrion Remote for Home Assistant — sideloading, Fully Kiosk, button
remapping](https://community.home-assistant.io/t/astrion-remote-for-home-assistant-sideloading-fully-kiosk-button-remapping-guide/1008570).

One Harmonium-specific rule for KeyMapper: **gestures are KeyMapper's
job**. Map *hold* and *double-press* to their own distinct keycodes
there — the engine deliberately runs no gesture timers (one
exception: select's hold-capture). A "hold volume" that emits its own
keycode arrives as its own binding, cleanly.

## 1. See what the buttons send

On the device: **hold ⓘ** (or navigate to `keys:`) — the key-capture
screen. Press every physical button and note what arrives
(`event.key` / keycode). This is ground truth; vendor firmwares remap
freely.

## 2. Bind them

*System → Remotes & keymaps* in the Studio. Each remote profile
declares its **capabilities** (`physical_dpad`, `touch`, `pointer`,
Fully yes/no) and its **keymap**: physical key → logical button
(`up`, `down`, `select`, `back`, `home`, `vol_up`, `menu`,
`red`/`green`/`blue`/`yellow`, …).

Bind the *logical* names once; what those logical buttons do is
policy, decided per page class:

- **Room pages**: arrows move focus, select activates, Home goes to
  the home screen, Power offers All Off (confirmed).
- **Controller pages (activity running)**: arrows + select pass
  through to the wired `dpad` device; back/home/menu follow the
  activity's controls; volume drives the wired volume target.
- **Everywhere**: bindings can be per-page (page buttons), global
  (`global.buttons`), or hold-variants (`menu_hold` etc. — fed by
  KeyMapper's distinct keycodes). Volume needs NO binding at all:
  unbound `vol_up`/`vol_down` route to the running activity's wired
  volume (the Volume role) by default, like mute always has — a
  `buttons` entry still wins when you want something else.

Which profile a device uses: the engine's `?device=` /
provisioned profile name — check it on the ⓘ page ("Profile
'astrion'").

## 3. Verify without leaving the desk

With [the device photo](device-photo-skin.md) on, the Studio preview
washes every key that does something on the current page — and the
tooltip on each key spells out its exact binding, hold included.
Click a key in the photo and the preview engine receives it for
real. Walk your pages in the *Showing* strip and watch the washes
change; that's the whole keymap audited in a minute.

## Troubleshooting

- **A button does nothing anywhere** — it isn't in the profile's
  keymap, or the firmware swallows it (check `keys:` capture first;
  if nothing arrives there, it's KeyMapper/firmware territory).
- **Arrows scroll the page instead of moving focus** — the profile
  is missing `physical_dpad`, so the engine is treating the device
  as touch-first.
- **Volume drives the wrong thing during an activity** — that's the
  activity's wiring, not the keymap: fix the `volume` role in the
  activity's Devices tab.


## Backing up KeyMapper (the wiring is half the remote)

Everything above assumes KeyMapper is configured on the device — and
until now that configuration lived ONLY there. Two repo scripts make
it travel with the code. Both use the repo's own adb (`tools/adb/` —
three files committed once from any scrcpy or platform-tools folder,
see the README there), so a fresh clone runs them with zero setup.
Plug the remote in over **USB** (the same connection it was
provisioned with) and:

- **`pull-keymapper.bat`** — no arguments needed. One-time setup on
  the remote first (KeyMapper offers no headless export intent):
  KeyMapper → **Settings → Change automatic backup location →
  Change** → save `key_mapper.zip` into **Download**. From then on
  KeyMapper rewrites that backup on every mapping change, so the
  device copy is always current — no manual export step, ever.
  (Don't bother with ⋮ → *Export all*: on the Astrion the share
  sheet offers no save-to-files target, so it jumps straight to the
  Bluetooth picker.) The script pulls the **newest** `*key*.zip`
  from Download into `remotes/keymapper/astrion/key_mapper.zip`
  (pass a name for a different folder). Commit the zip. Quirk: the
  save dialog suffixes `(2)`/`(3)` instead of overwriting and can't
  delete its own pileup — the script always takes the newest and
  names it cleanly; tidy Download with the remote's File Manager
  when the dupes bother you.
- **`push-keymapper.bat`** — provisioning a NEW remote: pushes the
  newest committed zip into the device's Download folder, verifies
  it landed, and opens KeyMapper; finish with **⋮ → Restore** and
  pick the file. Two taps instead of re-authoring every key.

ADB-over-wifi also works — pass the remote's IP as the first
argument — but USB is the normal path. Direct access to KeyMapper's
data directory needs root, so export-then-pull is the honest
portable flow.

## The glyph row (F4–F7): light · cover · music · climate

The four buttons at the bottom of the Astrion's face (💡 lightbulb,
curtains, ♪ music, climate) emit `F4`–`F7` — and F-keys reach the
webview raw, so these need NO KeyMapper mapping at all. The astrion
profile names them `light` / `cover` / `music` / `climate`, matching
the device-photo skin's hotspots (which light up the moment the keys
are named). On your own remote, the Key capture screen (hold ⓘ →
Key capture) writes the same entries in four presses.

What they DO is yours to bind in **Page settings → Keys** — the
binding dropdown offers every custom button your remote profiles
emit (v0.83.11), alongside the fixed set. The natural defaults:
`music` → navigate to the Music Library page; `light`/`cover`/
`climate` → navigate to a domain page, fire a scene, or open a
device's detail page (`detail:<entity>` is a valid navigate target).
Unbound keys simply do nothing — bind what the house actually uses.

**Apply to children** (same panel): a room page that switches it on
offers its bindings to everything under it — child pages via their
parent chain, and the controllers its activities land on — so
binding the glyph row once on Porch covers the whole Porch world.
A child's own binding always wins; `global.buttons` sits underneath
everything.

## Back/Home OUTSIDE Harmonium (don't get stranded)

The Astrion's physical Back and Home keys emit `[` and `]` — which
Android itself doesn't understand. Inside the kiosk the engine
translates them; anywhere else (the Android UI, an app you F-keyed
into, or Fully's own settings sheet pulled up OVER the kiosk) they
do nothing, and there is no visible way back.

The escape hatch lives in KeyMapper, which is already intercepting
every key: two mappings — trigger = the Back key with
**long-press**, action = *Go back*; trigger = the Home key with
long-press, action = *Go home* — each with the constraint **Fully
Kiosk Browser in foreground**. Long-press matters: a plain
(short-press) remap would swallow `[`/`]` before the engine ever
sees them and break Back/Home inside Harmonium; long-press triggers
leave short presses flowing through untouched. The constraint
matters too: scope ONLY these two to Fully — the app-launcher
F-keys stay global, because they're the way back to Fully from any
other app you land in.

What this replaced (decided 2026-08-17): those long-presses used to
emit `]`/`;` — harmonium's `back_hold`/`home_hold`, which forward
the DEVICE's back/home to the control target. That was redundant on
controller screens (short back/home already pass through) and its
unique value — device back/home from a hub page — wasn't worth
being stranded in Fully's settings for. Retired on the Astrion:
the stale keymap entries are gone from the starter config (clean
your live config's astrion profile in the Studio if you care — the
entries are inert either way), the engine keeps the mechanism (the
default profile's `{`/`}` still speak it, and long-press Power
`=` → `power_hold` → All Off is untouched), and
`astrion-remote-map.md` documents the new rows. After changing
mappings, run `pull-keymapper.bat` so the backup zip carries them.
