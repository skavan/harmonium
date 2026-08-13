# The device photo

**Outcome:** the Studio preview renders inside a photo of *your*
remote, at the device's true viewport, with every physical button
mapped — and washed live to show what it does on the page you're
editing.

<p align="center">
  <img src="../media/studio-map.png" width="700"
    alt="The map-keys editor: named hotspots dragged over the device photo" />
</p>

## 1. Get the two facts from the device

Tap **ⓘ** on the remote itself — the diagnostics page. The **Panel**
band tells you the true CSS viewport (e.g. `349 × 581`) and pixel
ratio. Don't guess these from the hardware's advertised resolution:
cheap remotes run odd densities, and every guess will be a few
percent off. (Ours reads 349×581 @ 1.38 — a ~220 dpi oddball. The
diag page exists because we spent three rounds guessing.)

## 2. Photograph the remote

Straight-on, even light, the full face. Crop tight to the device.
Cut out the screen area (make it transparent) if you can — the
preview shows through it either way, but a clean cutout looks best.
Drop the image in HA at `www/harmonium/skins/<name>.png`.

## 3. Turn it on and map it

In the Studio preview's footer: **🖼 device photo**. For an
Astrion/HA100-class remote the built-in preset fits out of the box —
image, viewport, screen aperture and all 23 buttons pre-mapped, and
you're done.

For your own photo, switch to **✎ map keys**:

- **The screen**: drag the `screen` rect over the LCD aperture. The
  live ratio meter compares it against the viewport's aspect — match
  them and the preview isn't distorted.
- **Buttons**: drag a box over each physical key, name it from the
  suggestion list (`up`, `select`, `vol_up`, `menu`, the color keys…).
  Drag to move, corner handles to resize — and for precision, select
  a rect and use the **keyboard arrows: exactly one pixel per press**
  (⇧-arrows resize by the same pixel). The toolbar shows the selected
  rect's x/y/w/h as editable percentages with a source-pixel readout,
  and **⌖ nudge all** shifts every hotspot together when the whole
  crop sits a pixel off.

Everything is stored as percentages of the image, in
`remotes.<device>.skin` — so the same map survives any display size.

## 4. What you get

- The preview renders at the device's **true viewport** and scales
  into the aperture — what you see is pixel-for-pixel what the
  remote shows.
- **Washes**: keys that do something on the current page glow; held
  bindings glow stronger on hold. Ambient nav keys (D-pad, back,
  home) always wash; power/volume wash when the page's activity
  claims them.
- **Tooltips**: hover any key — mapped or not — and it says exactly
  what it's bound to on this page, hold bindings included. This
  works in the plain frame too (no photo needed).
- Clicking a hotspot **sends the real key** into the preview engine —
  you can drive the whole UI from the photo.

**No photo** (footer link) drops back to the plain frame, keeping the
measured viewport.

## Troubleshooting

- **Preview looks squashed/stretched** — the `screen` rect's aspect
  doesn't match the viewport's; the ratio meter in map mode shows
  both numbers, nudge until they agree.
- **Content is the wrong size (too big / cut off)** — the viewport is
  wrong. Get it from the device's ⓘ page, not from a spec sheet.
