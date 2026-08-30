# Design — Fast D-pad (action-valued dpad commands)

Status: **BUILT (engine core, 2026-08-27) — unversioned, staged.** Field-tested transport findings below; the house Fire TV dialect is the first deployment and the reference example.

## The problem

D-pad presses on Android/Fire TV are slow and laggy. The whole path is: engine `rc()` → `remote.send_command` → androidtv integration → ADB `input keyevent N` on the device. The lag is not the transport — it is the on-device `input` binary, which spawns a Java process (app_process) for every single press: 150-400ms per keystroke before the key even registers. `sendevent` — raw writes to the kernel input node — lands in single-digit milliseconds, verified on the house Fire TV via HA's learn-sendevent action.

## Field measurements (house Fire TV, 2026-08-27)

All testing through `androidtv.adb_command` with sendevent recipes (the timing tests ran against the BT remote's node, current at the time — see the node-stability lesson below):

- Separate HA-paced calls (150ms gaps): reliable. Below 150ms: keys start dropping.
- One device-paced burst (`for` loop + `sleep 0.08`): drops ~2 of 5 presses each direction. At `sleep 0.2`: reliable.
- The same burst without the MSC_SCAN metadata lines (4 sendevent calls per press instead of 6): still drops at 0.08.

Three pacing mechanisms, one ceiling: **the Fire TV UI consumes at most ~6 presses per second** — the launcher's focus-move animation, not the transport, is the limit. Two corollaries decided the design: no transport work can beat ~170ms per press, and a device-side burst is actively worse for scrolling because a dispatched burst keeps scrolling after the finger lifts. Host-paced single presses stop the instant the key is released.

A second useful negative result: the MSC_SCAN lines are unnecessary. A press is just key-down, syn, key-up, syn — four `sendevent` calls, no scan codes, which means no learn step is needed for new keys: the Linux key codes are public (up 103, down 108, left 105, right 106, enter 28, back 158, home 172, menu 139).

### The node-stability lesson (first field failure, same day)

The first deployment died with `sendevent: /dev/input/event5: No such file or directory` on every press. The learned command's node — HA's learn-sendevent necessarily captures whichever device the physical press came FROM — was the **Bluetooth remote's** input device, and BT remotes detach when they sleep: their event node vanishes and re-enumerates on wake, possibly under a new number. Never inject into the BT remote's node.

The right target is the box's **built-in keypad device** — on this (amlogic) box, `aml_keypad`, a permanent SoC device that declares the full key set (KEY_UP/DOWN/LEFT/RIGHT/ENTER, and KEY_OK/KEY_SELECT besides). Discovery, via `adb_command` with the output read back from the media_player's `adb_response` attribute (`/proc/bus/input/devices` is permission-denied to the adb shell user; `getevent` is not):

```
getevent -pl 2>/dev/null | grep -E 'add device|name:|KEY_DOWN'
```

Pick the always-present device that lists the dpad keys. Built-in devices enumerate in boot order, so their numbering is stable across reboots on a given box — but re-verify after a system update. A per-press by-name resolve (`getevent -pl | grep -B1 <name>`) would be fully robust but spends the latency the whole design exists to save; it stays a fallback idea for the guided-setup future.

## The design

Tap = one sendevent ADB call. Hold = the engine re-firing that same call at the consumption ceiling. No bursts, no new service, no repeat machinery in config.

### Engine changes (both live, probe-fenced)

**1. `rc()` runs action objects** (`src/widgets/helpers.js`). A `dpad_commands` value may now be a full action object instead of a key-name string. Strings keep the `remote.send_command` path byte-identical; objects run through `runAction` and carry their own service and target (the entity rung is the action's to name — `"$context.media_player"` keeps a dialect house-portable, an explicit entity id pins it). Object sends are paced in `rc()` itself — every path funnels through it (physical keydown, hold-repeat, widget capture, the on-screen pad) — dropping any press inside `TIMING.dpadRepeat` (170ms) of the last, which mirrors what the device UI would do with it anyway.

**2. Hold-repeat on the pad** (`src/ui/input.js`). Browser auto-repeat (`e.repeat`) now drives the device for the four arrows, only when all three hold: the pad is the device's (passthrough page, no CH borrow), the key's resolved command is an action object, and `rc()`'s pacing admits the press. String-valued commands keep today's behavior — repeats dropped — because repeating `input keyevent` would queue seconds of backlog. The arrows on the physical remotes pass through natively (Key Mapper only remaps the special keys), so they deliver real keydown/repeat/keyup timing; the v0.11 field lesson about injected keys not delivering hold timing does not apply to them.

### What stays stock

The stock `firetv` dialect keeps its string commands. Event node paths and input codes are per-device facts (`/dev/input/event1` is this house's box; another Fire TV may enumerate differently), so action-valued dpad commands are a per-house Studio tuning — exactly what the dialect fork is for under the 0.86 layering (dpad_commands merges as one unit; a forked block is yours forever). This is also the first real test of that tuning path.

### The house Fire TV dialect (reference example)

In the firetv dialect's `dpad_commands` (Code tab for now — the Studio's dpad fields are string inputs; a field-level editor for action values is a follow-up):

```json
{
  "up":     { "service": "androidtv.adb_command", "entity": "media_player.fire_tv_family_192_168_1_65", "data": { "command": "sendevent /dev/input/event1 1 103 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 103 0; sendevent /dev/input/event1 0 0 0" } },
  "down":   { "service": "androidtv.adb_command", "entity": "media_player.fire_tv_family_192_168_1_65", "data": { "command": "sendevent /dev/input/event1 1 108 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 108 0; sendevent /dev/input/event1 0 0 0" } },
  "left":   { "service": "androidtv.adb_command", "entity": "media_player.fire_tv_family_192_168_1_65", "data": { "command": "sendevent /dev/input/event1 1 105 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 105 0; sendevent /dev/input/event1 0 0 0" } },
  "right":  { "service": "androidtv.adb_command", "entity": "media_player.fire_tv_family_192_168_1_65", "data": { "command": "sendevent /dev/input/event1 1 106 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 106 0; sendevent /dev/input/event1 0 0 0" } },
  "select": { "service": "androidtv.adb_command", "entity": "media_player.fire_tv_family_192_168_1_65", "data": { "command": "sendevent /dev/input/event1 1 232 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 232 0; sendevent /dev/input/event1 0 0 0" } },
  "back":   { "service": "androidtv.adb_command", "entity": "media_player.fire_tv_family_192_168_1_65", "data": { "command": "sendevent /dev/input/event1 1 158 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 158 0; sendevent /dev/input/event1 0 0 0" } },
  "home":   { "service": "androidtv.adb_command", "entity": "media_player.fire_tv_family_192_168_1_65", "data": { "command": "sendevent /dev/input/event1 1 102 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 102 0; sendevent /dev/input/event1 0 0 0" } },
  "menu": "MENU"
}
```

### The keylayout lesson (second field round, same day)

The scancode→Android mapping is NOT Generic.kl when a vendor file matches the device: aml_keypad reports vendor/product 0001/0001, so `/vendor/usr/keylayout/Vendor_0001_Product_0001.kl` governs it, and that map disagrees with Generic in exactly the keys that failed. Field results: select as 28 (ENTER) — dead; select as 353 (Generic's DPAD_CENTER) — dead, 353 isn't in the vendor file at all; home as 172 (Generic's HOME) — dead, same reason. The vendor file's actual map: **DPAD_CENTER = 232 (or 97), HOME = 102, BACK = 158, MENU = 139, arrows = the standard 103/108/105/106**. So the working house set is arrows + 232/158/102. Two rules for the next box: read the device's own .kl (`cat /vendor/usr/keylayout/Vendor_XXXX_Product_XXXX.kl` — Generic.kl only applies when no vendor file matches), and prefer codes both declared by the kernel device (getevent -pl) and mapped in that .kl. Menu stays a string on `remote.send_command` — rare single presses where the `input keyevent` lag is invisible (its fast form here would be 139).

Deploy order matters: the engine update must be live before the config carries action objects — the old `rc()` would pass an object to `remote.send_command` and the pad would go dead on that page.

## Fences

`tests/probe-fast-dpad.mjs`: cmdFor hands back the action object while string neighbors stay strings; a physical tap on a passthrough page fires `androidtv.adb_command` and not `remote.send_command`; a second press inside the pacing window is dropped and one after it lands; auto-repeat drives the device at the paced rate (not browser rate); a string dialect never repeats and its tap still rides `remote.send_command`. Neighboring probes re-run green: dpad-dialect, btnstrip-dpad, d-routing, pad-latch, hold-doctrine, input-policy, ch-hold.

## Deferred

- Studio field-level editing of action-valued dpad commands (today: Code tab / config API).
- A `harmonium.press` service or capability probe that discovers a box's event node automatically (`getevent -pl` via `adb_response`) — see beta-gaps §6.7; would let this graduate from per-house tuning to a guided setup.
- Hold-repeat acceleration (faster after the first second) — pointless while the UI ceiling is ~6/sec; revisit only if some platform consumes faster.
