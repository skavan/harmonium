# TO-DO — remote pairing

Parked 2026-08-02, to pick up when there is a physical remote in hand
and time to sit with it. Everything here is *built and tested*; what is
missing is the field pass and the decisions that only real hardware can
settle.

Three tracks, independent of each other:

- **A. Field-test v0.56** — the describe-and-learn loop, on hardware.
- **B. Pair a new remote end to end** — the RS90 runbook.
- **C. Token pairing / auth onboarding** — the other meaning of
  "pairing", and the one that stands between Harmonium and other people
  being able to use it.

---

## A. Field-test v0.56 (the describe-and-learn loop)

### State

Built, 14/14 suites green, screenshot-verified in a headless browser.
**Not deployed to any remote.** Nothing has been proven against a
KeyMapper-injected keystream, which is the only thing that matters.

### Deploy first (the short ceremony — no yaml changed)

1. `push-to-ha.bat` — engine `dist/index.html` + `studio/studio.html`
2. `script.harmonium_deploy_remotes` — **reseed OFF**
3. Kiosk: clear browser cache, then load start URL
4. Hard-refresh the Studio tab

No HA restart (no `.py` touched). No `harmonium.reseed` (no config
change).

### What to actually test

1. **Describe the remote.** Studio → ✎ edit layout → type the physical
   face in order. Confirm custom slot names survive Save & Deploy and
   come back after a reload (they are plain strings in
   `remotes.<id>.soft_layout`).
2. **Learn the keys.** On the remote: hold ⓘ → Key capture. Press each
   physical button; watch the row that appears. Tap the slot. Confirm
   the slot's sub line shows the raw key and the tile lights.
3. **Save.** Confirm the flash says how many keys went where, that
   the keymap survives a remote reload, and that a key you just taught
   *routes* on the next press without a reload.
4. **The thing most likely to be wrong:** what `e.key` actually is for
   KeyMapper-injected presses. The log row shows raw key · code ·
   keyCode precisely so the evidence is on screen rather than inferred.
   Watch for keys that arrive as `Unidentified`, as a dead key, or with
   a `code` but an empty `key` — the assignment map is keyed on
   `e.key`, and if a remote emits presses that don't produce a stable
   distinct `key`, that is a real design problem, not a bug to patch
   around.
5. **Holds.** Hold gestures are the *shell's* job by doctrine —
   KeyMapper long-press mappings emit distinct keycodes
   (`back_hold`, `home_hold`, `power_hold`, `left_hold`, `right_hold`).
   The capture screen learns those exactly like any other key: hold the
   button, tap a slot named for the hold. Whether that reads naturally
   as a *slot* — a physical button appearing twice in the layout, once
   for tap and once for hold — is an open UX question. Try it before
   deciding.

### Known gaps, deliberate

- **No unassign gesture.** A raw key is reassigned by capturing it
  again and tapping a different slot; a wrong entry is fixed in the
  Studio's Code tab. Add one only if it bites — the screen is meant to
  be a two-gesture loop, and every extra mode taxes the common path.
- **No per-slot hold affordance** (see above).
- **Save is all-or-nothing.** The session's assignments go together or
  not at all. Fine for a learning pass; revisit if partial saves turn
  out to matter.

---

## B. Pair a new remote end to end (the RS90 runbook)

The target: a remote nobody has ever configured becomes a working
Harmonium remote without opening a config file.

1. **Pair the remote to the device** (Bluetooth, at the Android level —
   nothing to do with Harmonium).
2. **Mint a profile.** Studio → ＋ beside "Preview as" → an id
   (`rs90`). This writes `remotes.rs90 = {capabilities: [touch,
   pointer], keymap: {}}` — deliberately empty. Add `physical_dpad`
   and `physical_volume` to its capabilities once you know the hardware
   has them; several tiles show or hide on those.
3. **Describe the face.** ✎ edit layout, in order, blanks included.
   This is the step that makes the soft remote in the Studio *mirror*
   the thing in your hand — and the same data drives the capture
   screen's slot grid, so describing it once serves both.
4. **Save & Deploy**, then open the remote on the device.
5. **Learn the keys.** Hold ⓘ → Key capture → press, tap, repeat →
   💾 Save.
6. **KeyMapper (the human half).** Physical buttons that Android does
   not deliver as keystrokes, and every long-press gesture, need
   KeyMapper mappings on the device. Existing Astrion conventions, for
   reference:

   | Gesture | Emits |
   |---|---|
   | Back tap / hold | `[` / `]` |
   | Home tap / hold | `F1` / `;` |
   | Power tap / hold | `F2` / `=` |
   | Menu tap / hold | `#` / `@` |
   | Mute | `` ` `` |
   | Channel ▲▼ | `PageUp` / `PageDown` |
   | D-pad left/right hold | `,` / `.` |

   These are conventions, not requirements — the point of v0.56 is that
   a new remote can emit whatever it likes and be taught. Pick codes
   that don't collide with anything the webview treats specially.
7. **Bind anything custom.** A custom slot becomes a first-class
   logical button the moment a key emits it. Bind it in a page's
   `buttons:` map (Studio → Key mappings → key bindings) to a sequence,
   a page, or a service call. This is where Red/Green earn their keep.
8. **Verify the boring things:** volume follows the focused device,
   Back unwinds and Home jumps, D-pad passthrough claims arrows+select
   during an activity and shows the accent rule, hold-Power ends the
   activity.

### Parked — the V2 UX (his words: "One day… V2 UX")

**Photograph the physical remote and map hotspot areas onto the image.**
Instead of a grid of typed slot names, you shoot a picture of the
remote, and draw regions on it; each region is a slot. The soft remote
in the Studio then *is* the remote, and the capture screen could show
the same photo with the pending key highlighting the region you tap.

Worth doing when the RS90 lands, because it is the point at which
Harmonium stops asking the user to translate their hardware into a
grid. Open questions when it comes up: where the image lives (config
data vs `www/`), how regions are authored (drag rectangles is probably
enough — polygons are a trap), and whether the *engine* renders the
photo too or it stays a Studio-side authoring aid.

---

## C. Token pairing / auth onboarding

Different sense of "pairing", same ambition: a remote that a stranger
can set up.

**Today (dev only):** a long-lived access token pasted into the URL
hash, stored in `localStorage`. It works, it is field-proven, and it is
completely unshippable — nobody is typing a 180-character token on a
remote, and telling them to paste it from a desktop is a confession,
not a feature.

**The ladder, in increasing order of how good it feels:**

1. **HA's native OAuth login flow.** `home-assistant-js-websocket`'s
   `getAuth` — the user signs into HA once on the device, a refresh
   token is stored and renewed automatically. Standard, no new
   surface area, and it is what the HA companion app does. This is the
   obvious next step.
2. **Trusted Networks auth provider.** For dedicated LAN devices,
   zero-touch: HA hands out a session based on source IP. Cheapest
   possible answer for a wall-mounted remote, at the cost of an HA-side
   config change the user must make themselves.
3. **TV-app-style pairing code** — the good one, and the one that needs
   *our* integration. The remote displays a short code; the user
   approves it in the HA UI; the integration mints a token and delivers
   it over the paired channel. Nothing typed, nothing pasted, nothing
   leaked, and it is the interaction people already know from every
   streaming device they own.

Option 3 is a natural fit for the integration as it stands: it already
owns an authenticated API, a storage store, and a sidebar panel to
approve from. Sequence it after the Studio ↔ yaml round-trip, but
before any serious attempt to hand Harmonium to another HA user —
onboarding is the first thing they will hit, and right now it is the
worst thing in the product.
