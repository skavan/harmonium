# Mapping a physical remote

*Purpose: Describing a new physical remote model end to end: profile, layout, keymap. Audience: users with hardware not yet in the library.*

**Outcome:** a new remote model, fully described — every physical
button known to the engine, the Studio previewing on a photo of the
actual hardware, and a map you can verify without leaving your desk.

This is the end-to-end version. Two shorter guides cover the halves
in more depth: [hardware keys](hardware-keys.md) (what the buttons
*send*) and [the device photo](device-photo-skin.md) (what the
preview *shows*). If your remote is an Astrion/HA100, a finished
preset ships in the box — skip to step 6 and just verify.

Everything you build here lives in one place in the config —
`remotes.<id>` — and travels with the workspace:

```jsonc
"remotes": {
  "rs90": {
    "capabilities": ["physical_dpad", "touch"],   // what it IS
    "keymap": { "F1": "home", "[": "back" },      // key events → logical buttons
    "soft_layout": [["back","home","power"]],    // the on-screen stand-in
    "viewport": { "w": 349, "h": 581 },           // its TRUE screen size
    "skin": { "image": "…", "screen": {…}, "buttons": […] }  // the photo map
  }
}
```

## 1. Mint the profile

In the Studio's preview column: **Preview as → ＋**. Give the remote
a short id (`rs90`, `astrion`, `walltab`). That creates the profile;
everything below fills it in.

Set its **capabilities** under *System → Remotes & keymaps* —
`physical_dpad` is the important one: it tells the engine this
device navigates by arrows and focus, not just touch.

## 2. Learn what the buttons actually send

On the device itself, **hold ⓘ** in the top bar (or navigate to
`keys:`) — the key-capture screen. Press every physical button and
write down what arrives. This is ground truth: vendor firmwares
remap freely, and a button labeled "menu" may emit `#`, `F5`, or
nothing at all.

Nothing arrives for a button? The firmware is swallowing it — that's
KeyMapper territory (see the
[hardware-keys guide](hardware-keys.md) and Brad Sanders' community
sideloading guide). One rule matters here: **gestures are
KeyMapper's job**. Map hold and double-press to their *own* distinct
keycodes there; the engine deliberately runs no gesture timers, so a
"hold volume" arrives as its own cleanly-bindable key.

## 3. Bind the keymap

*System → Remotes & keymaps* → your profile → keymap: physical key →
logical button (`up`, `down`, `select`, `back`, `home`, `power`,
`vol_up`, `menu`, `red`…). The vocabulary is open — a custom name
(`voice`, `light`, `..`) becomes a first-class logical button the
moment something emits it, bindable in any page's `buttons:` map
with zero engine changes.

Bind the *logical* names once. What they **do** is policy, per page
class — arrows drive focus on room pages, pass through to the
device during an activity; Power's blast radius follows the page.
You never wire "F1 turns off the TV" — you wire "F1 is home."

## 4. Lay out the soft remote

Under the preview, **✎** (visible when no photo is on) edits the
profile's `soft_layout` — rows of buttons mirroring the physical
remote, blanks allowed. This is the on-screen stand-in used before a
photo exists, and each soft key sends what *that profile's* keymap
says the real key would send. Custom slot names type straight in.

## 5. Read the true viewport off the device

Tap **ⓘ** on the device — the diagnostics page. The Panel band shows
the real CSS viewport and pixel ratio (e.g. `349 × 581 @ 1.38`).
**Do not trust the spec sheet**: cheap remotes run odd densities,
and every guess lands a few percent off. This number is what makes
the preview pixel-faithful; it's stored on the profile (and inside
the skin) as `viewport`.

## 6. Photograph the remote and map it

1. Shoot straight-on, even light, full face; crop tight. Cutting the
   screen area out (transparent) looks best — the live preview shows
   through the aperture.
2. Drop it in HA at `www/harmonium/skins/<name>.png`.
3. Preview footer → **🖼 device photo**, then **✎ map keys**:
   - Drag the `screen` rect over the LCD. The **ratio meter**
     compares the rect's aspect to the viewport's — match them or
     the preview renders distorted.
   - Drag a box over each physical key and name it from the
     suggestion list. Drag to move, corner handles to resize — and
     for precision, select a rect and tap the **keyboard arrows:
     exactly one pixel per press** (⇧ resizes by the same pixel).
     The toolbar shows the selected rect's numbers (editable %, with
     a source-pixel readout), and **⌖ nudge all** shifts the entire
     map together when the crop sits a pixel off.

Everything is stored as **percentages of the image**, so the same
map survives any display size or re-export of the same crop.

## 7. Verify from the couch — or the desk

- **Washes**: keys that do something on the current page glow;
  latch **✚ HOLD** and the hold-variants glow stronger. (The
  `washes on/off` link in the footer toggles all of it.)
- **Tooltips**: hover any key — mapped or not — and it names its
  exact binding on this page, hold variants included.
- **Click a hotspot** and the preview engine receives the real key —
  you can drive the whole UI from the photo.
- Walk your pages with the **Showing** dropdown and watch the map
  answer differently per page class. That's the whole remote
  audited in a minute.
- **📷** (beside Showing) saves the photo + live screen as a PNG,
  transparent outside the device — proof shots, docs, GIF frames.

## Sharing a map

A finished profile is just config. Export the workspace (or hand
someone the `remotes.<id>` block) and their Studio previews on your
hardware the day they paste it in. If you map a remote model that
others own, consider contributing the skin + map as a preset —
that's how the Astrion one got here.
