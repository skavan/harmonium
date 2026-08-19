/* The preview pane's pure vocabulary: soft-button glyphs, the
   stock grid, the measured Astrion HA100 skin preset, the ambient
   key set, and the action verbalizer. No state. Split out of
   PreviewPane.svelte (v0.83.11 round 2). */
export const BTN_DEFS = {
    back: { g: "↩", l: "BACK" }, home: { g: "⌂", l: "HOME" },
    power: { g: "⏻", l: "POWER" }, menu: { g: "≡", l: "MENU" },
    up: { g: "▲", l: "UP" }, down: { g: "▼", l: "DOWN" },
    left: { g: "◀", l: "LEFT" }, right: { g: "▶", l: "RIGHT" },
    select: { g: "OK", l: "ENTER" },
    vol_up: { g: "＋", l: "VOL" }, vol_down: { g: "－", l: "VOL" },
    ch_up: { g: "CH＋", l: "CH" }, ch_down: { g: "CH－", l: "CH" },
    mute: { g: "🔇", l: "MUTE" }, info: { g: "ⓘ", l: "INFO" },
  };
  /* the ONE renderer for a slot name — standard or custom */
export const defFor = (btn) =>
    BTN_DEFS[btn] || { g: btn.length <= 3 ? btn : "•", l: btn.toUpperCase() };
export const DEFAULT_LAYOUT = [
    ["back", "home", "power"],
    ["vol_up", "up", "ch_up"],
    ["left", "select", "right"],
    ["vol_down", "down", "ch_down"],
    ["menu", "mute", null],
  ];

/* the Astrion HA100 preset. The SCREEN rect is MEASURED, not
     eyeballed (v0.80.1 — Suresh: "one pixel off on x, 2 on y…
     the LCD has lost its aspect ratio"): an alpha-scan of the real
     Photoshop export (1280×4084) found the transparent aperture at
     exactly 9.84/3.80/80.00/41.80 — pixel ratio 0.5999, true
     480×800. The v0.80 eyeballed rect (10.1/3.6/80.7) was the whole
     bug: −0.26%/+0.20% offset (his 1px/2px) and ~1% aspect error.
     Buttons carry the same measured correction. Custom names
     (voice/light/cover/music/climate/colors) are ordinary logical
     buttons — bindable the moment a keymap or screen names them. */
export const SKIN_ASTRION = {
    image: "/local/harmonium/skins/astrion.png",
    /* the HA100's REAL CSS viewport — GROUND TRUTH from the diag:
       page on the device itself (v0.80.6 — Suresh read it off the
       screen: "Viewport 349x581, Pixel Aspect Ratio 1.38"). A
       custom ~220dpi density: 349×1.375=480, 581×1.377=800, ratio
       0.6007 — which is why every standard-DPR guess (1.0, 1.33,
       1.5) missed, and why his Photoshop offsets kept reading a few
       percent. Tap ⓘ on any device to get this number for its skin.
       Configurable per skin; absent = 320×533.33. */
    viewport: { w: 349, h: 581 },
    /* v0.83.3 — RE-MEASURED ON THE SHIPPED ASSET (Suresh: "In photo
       mode the LCD panel is one pixel off on both axis… grey/white
       line"): the old rect (9.84/3.80/80.00/41.80) was alpha-scanned
       on the ORIGINAL 1280×4084 Photoshop export, but the shipped
       814×2600 PNG is a slightly different crop — its enclosed
       transparent hole flood-fills to x 82..737, y 93..1178. The
       few-pixel gap between the two rects showed the page background
       through the unfilled rows above the iframe. If you edit the
       asset, re-measure: the hole is the truth, not these numbers. */
    /* y FIELD-TRUED to 3.764 (v0.83.6 — Suresh, after nudging with
       the 1px arrows: "y was at 3.54 -- nudging to 3.764 fixed it…
       can we set that as default?"). The alpha-scan said 3.58; the
       actual rendered truth on the authoring display wanted ~2px
       lower. The eye on the real preview beats the scan. Units:
       percentages of the photo. */
    screen: { x: 10.07, y: 3.764, w: 80.59, h: 41.77 },
    buttons: [
      { btn: "back", x: 9.84, y: 52.2, w: 20.3, h: 5.3 },
      { btn: "home", x: 30.14, y: 52.2, w: 39.1, h: 5.3 },
      { btn: "power", x: 69.24, y: 52.2, w: 20.6, h: 5.3 },
      { btn: "vol_up", x: 9.84, y: 59.7, w: 17, h: 9.5 },
      { btn: "ch_up", x: 73.24, y: 59.7, w: 17, h: 9.5 },
      { btn: "vol_down", x: 9.84, y: 69.5, w: 17, h: 9.2 },
      { btn: "ch_down", x: 73.24, y: 69.5, w: 17, h: 9.2 },
      { btn: "up", x: 39.74, y: 60.0, w: 20, h: 5.5 },
      { btn: "left", x: 27.24, y: 65.5, w: 12.5, h: 7.5 },
      { btn: "select", x: 39.74, y: 65.5, w: 20, h: 7.3 },
      { btn: "right", x: 59.74, y: 65.5, w: 13.5, h: 7.5 },
      { btn: "down", x: 39.74, y: 72.8, w: 20, h: 5.6 },
      { btn: "mute", x: 9.84, y: 81.2, w: 20.3, h: 5.3 },
      { btn: "voice", x: 30.14, y: 81.2, w: 39.1, h: 5.3 },
      { btn: "menu", x: 69.24, y: 81.2, w: 20.6, h: 5.3 },
      { btn: "light", x: 9.84, y: 86.7, w: 20.2, h: 5.2 },
      { btn: "cover", x: 30.04, y: 86.7, w: 20.2, h: 5.2 },
      { btn: "music", x: 50.24, y: 86.7, w: 20.2, h: 5.2 },
      { btn: "climate", x: 70.44, y: 86.7, w: 20.2, h: 5.2 },
      { btn: "red", x: 9.84, y: 93.9, w: 20.2, h: 4.4 },
      { btn: "green", x: 30.04, y: 93.9, w: 20.2, h: 4.4 },
      { btn: "blue", x: 50.24, y: 93.9, w: 20.2, h: 4.4 },
      { btn: "yellow", x: 70.44, y: 93.9, w: 20.2, h: 4.4 },
    ],
  };

export const PASSTHRU_SET = ["up", "down", "left", "right", "select", "back", "home"];

export function actionDesc(a) {
    if (!a) return "";
    if (a.navigate) return "opens " + a.navigate;
    if (a.seek) return "seek " + (a.seek > 0 ? "+" : "") + a.seek + "s";
    if (a.service) return a.service;
    if (a.sequence) return "runs " + a.sequence;
    return "custom action";
  }
