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

- **`pull-keymapper.bat`** — no arguments needed. One manual step
  first, once per export (KeyMapper offers no headless export
  intent): on the remote, KeyMapper → **Back up all** → in the share
  sheet choose **Files/Downloads** (the sheet leads with Bluetooth —
  ignore it) and save into Download. The script then finds any
  `*key*.zip` there and pulls it into `remotes/keymapper/astrion/`
  (pass a name for a different folder). Commit the zip.
- **`push-keymapper.bat`** — provisioning a NEW remote: pushes the
  newest committed zip into the device's Download folder, verifies
  it landed, and opens KeyMapper; finish with **⋮ → Restore** and
  pick the file. Two taps instead of re-authoring every key.

ADB-over-wifi also works — pass the remote's IP as the first
argument — but USB is the normal path. Direct access to KeyMapper's
data directory needs root, so export-then-pull is the honest
portable flow.
