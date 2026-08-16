<script>
  import { app, bindPreview, pushPreview, sendKey, previewGoto, setStatus, STUDIO_V } from "./state.svelte.js";
  import { toCanvas } from "html-to-image";
  let iframe = $state(null);
  $effect(() => { if (iframe) bindPreview(iframe.contentWindow); });
  const devices = $derived(Object.keys(app.draft?.remotes || { default: 1 }));

  /* ============ SOFT REMOTE (v0.53 latch; v0.54 — Suresh: "we need
     to be able to edit how the buttons look in the preview screen…
     mirror the remote"). The layout is DATA on the remote PROFILE
     (remotes.<id>.soft_layout: rows of logical buttons, null =
     blank), edited IN PLACE right here — no separate quirky editor.
     Keys are resolved by REVERSE keymap lookup from the previewed
     profile, so every button sends what THAT remote would send;
     a logical button the profile's keymap can't emit renders
     disabled. HOLD stays the sticky modifier: latch → holdable keys
     wash pale → next press sends the hold variant and releases.

     v0.56 — THE REMOTE-CREATION SCREEN (Suresh: "I want a 'remote'
     creation screen where I specify the physical buttons of a
     remote, in order… I should be able to add Custom Slots (Like
     Red, Green, or '.', '..', '...') and Blanks"). Slot cells are
     FREE TEXT over a datalist of the standard names, so a custom
     slot name types straight in. Custom names are ordinary strings
     in soft_layout, and v0.54's OPEN BUTTON VOCABULARY makes them
     first-class logical buttons the moment a key emits one — they
     are bindable in any screen's `buttons:` map with zero engine
     edits. Unknown names render by fallback: glyph = the name when
     it is short enough to read on a key, else "•". */
  const BTN_DEFS = {
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
  const defFor = (btn) =>
    BTN_DEFS[btn] || { g: btn.length <= 3 ? btn : "•", l: btn.toUpperCase() };
  const DEFAULT_LAYOUT = [
    ["back", "home", "power"],
    ["vol_up", "up", "ch_up"],
    ["left", "select", "right"],
    ["vol_down", "down", "ch_down"],
    ["menu", "mute", null],
  ];
  const profile = $derived(app.draft?.remotes?.[app.device] || null);
  const layout = $derived(profile?.soft_layout || DEFAULT_LAYOUT);

  /* ============ DEVICE PHOTO SKIN (v0.80 — Suresh: "replace the
     hastrion preview with an image of the real remote… Button
     mapping from the remote to the screen"). A skin on the remote
     PROFILE: remotes.<id>.skin = { image, screen:{x,y,w,h},
     buttons:[{btn,x,y,w,h}] } — every coordinate a PERCENTAGE of the
     image, so one asset works at any display width. The live iframe
     sits BEHIND the photo, showing through the transparent screen
     aperture; hotspots are invisible buttons over the photo's
     physical keys, sharing softPress + the wash brain with the grid
     soft remote (which remains the no-skin fallback). */
  const skin = $derived(profile?.skin || null);
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
  const SKIN_ASTRION = {
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
  function applySkinPreset() {
    if (!app.draft.remotes) app.draft.remotes = {};
    if (!app.draft.remotes[app.device])
      app.draft.remotes[app.device] = { capabilities: ["touch", "pointer"], keymap: {} };
    app.draft.remotes[app.device].skin = JSON.parse(JSON.stringify(SKIN_ASTRION));
  }
  function removeSkin() {
    mapping = false; selHot = -1;
    const p2 = app.draft.remotes?.[app.device];
    if (p2) {
      /* the measured viewport outlives the photo (v0.80.7) */
      if (p2.skin?.viewport) p2.viewport = { ...p2.skin.viewport };
      delete p2.skin;
    }
  }

  /* ---- ✎ MAP KEYS: drag a rect over a physical key, name it; click
     an existing hotspot to rename/delete; drag its body to move.
     Percentages are written live into the draft. ---- */
  let mapping = $state(false);
  let selHot = $state(-1);
  let selScreen = $state(false);   /* the LCD rect is editable too (v0.80.1) */
  let skinEl = $state(null);
  let imgNat = $state({ w: 1280, h: 4084 });   /* natural px, for the aspect readout */
  /* THE STRETCH, CAUGHT (v0.83.7 — P1 #9, his screenshot of the oval
     play button): the iframe transform assumed a 340px photo width,
     but the photo and the clip aperture size in PERCENT of the pane —
     collapse a Studio column (◧/◨) and the pane widens, the aperture
     grows with it, and the engine stays scaled for 340px: squish.
     A browser refresh restored the default width, which is why it
     always "fixed itself". Measure the photo's REAL width instead. */
  let imgW = $state(0);
  let drag = $state(null);      /* in-flight NEW rect {x0,y0,x1,y1} */
  let hotDrag = null;           /* in-flight MOVE {kind,i,dx,dy} */
  let rsz = null;               /* in-flight RESIZE {kind,i} (corner handle) */
  const pctOf = (ev) => {
    const r = skinEl.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100)),
      y: Math.max(0, Math.min(100, (ev.clientY - r.top) / r.height * 100)) };
  };
  function mapDown(ev) {
    if (!mapping || ev.target.closest(".hotspot")) return;
    const p = pctOf(ev);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    ev.preventDefault();
  }
  function mapMove(ev) {
    if (rsz) { const p = pctOf(ev);
      const o = rsz.kind === "screen" ? skin.screen : skin.buttons[rsz.i];
      if (o) { o.w = +Math.max(1, p.x - o.x).toFixed(2);
        o.h = +Math.max(0.4, p.y - o.y).toFixed(2); }
      return; }
    if (hotDrag) { const p = pctOf(ev);
      const o = hotDrag.kind === "screen" ? skin.screen : skin.buttons[hotDrag.i];
      if (o) { o.x = +Math.max(0, Math.min(100 - o.w, p.x - hotDrag.dx)).toFixed(2);
        o.y = +Math.max(0, Math.min(100 - o.h, p.y - hotDrag.dy)).toFixed(2); }
      return; }
    if (!drag) return;
    const p = pctOf(ev); drag.x1 = p.x; drag.y1 = p.y;
  }
  function mapUp() {
    if (rsz) { rsz = null; return; }
    if (hotDrag) { hotDrag = null; return; }
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    if (w > 1.5 && h > 0.6) {
      skin.buttons.push({ btn: "", x: +x.toFixed(2), y: +y.toFixed(2),
        w: +w.toFixed(2), h: +h.toFixed(2) });
      selHot = skin.buttons.length - 1; selScreen = false;
    }
    drag = null;
  }
  function hotDown(ev, i) {
    if (!mapping) return;
    selHot = i; selScreen = false;
    const p = pctOf(ev);
    hotDrag = { kind: "hot", i, dx: p.x - skin.buttons[i].x, dy: p.y - skin.buttons[i].y };
    ev.stopPropagation(); ev.preventDefault();
  }
  function scrDown(ev) {
    if (!mapping) return;
    selScreen = true; selHot = -1;
    const p = pctOf(ev);
    hotDrag = { kind: "screen", dx: p.x - skin.screen.x, dy: p.y - skin.screen.y };
    ev.stopPropagation(); ev.preventDefault();
  }
  function rszDown(ev, kind, i) {
    rsz = { kind, i };
    ev.stopPropagation(); ev.preventDefault();
  }
  function delHot(i) { skin.buttons.splice(i, 1); selHot = -1; }
  /* ⌖ nudge EVERY hotspot together (v0.80.1 — "one pixel off"):
     0.1% steps ≈ a third of a pixel x, one pixel y at display width */
  function nudgeAll(dx, dy) {
    for (const b of skin.buttons) {
      b.x = +Math.max(0, Math.min(100 - b.w, b.x + dx)).toFixed(2);
      b.y = +Math.max(0, Math.min(100 - b.h, b.y + dy)).toFixed(2);
    }
  }
  /* arrow keys nudge the SELECTED rect by EXACTLY ONE DISPLAY PIXEL
     (v0.83.5 — Suresh: "moving the rectangle by dragging is very
     imprecise… when the rectangle is selected the arrow keys should
     move one pixel"). The old 0.1% step was ~1px vertically but a
     third of a pixel horizontally — precise-feeling on one axis,
     mushy on the other. Now the step is computed from the rendered
     image size per axis; shift = resize by the same pixel. */
  function mapKeydown(ev) {
    if (!mapping || (!selScreen && selHot < 0)) return;
    const o = selScreen ? skin.screen : skin.buttons[selHot];
    if (!o) return;
    const r = skinEl?.getBoundingClientRect();
    const sx = r && r.width ? 100 / r.width : 0.1;    /* 1px in % */
    const sy = r && r.height ? 100 / r.height : 0.1;
    const d = { ArrowLeft: [-sx, 0], ArrowRight: [sx, 0],
      ArrowUp: [0, -sy], ArrowDown: [0, sy] }[ev.key];
    if (!d) return;
    if (ev.shiftKey) { o.w = +Math.max(0.5, o.w + d[0]).toFixed(3);
      o.h = +Math.max(0.2, o.h + d[1]).toFixed(3); }
    else { o.x = +Math.max(0, o.x + d[0]).toFixed(3);
      o.y = +Math.max(0, o.y + d[1]).toFixed(3); }
    ev.preventDefault();
  }
  /* the LCD truth meter: the aperture's PIXEL ratio vs 480×800 */
  const scrRatio = () => {
    const px = skin.screen.w / 100 * imgNat.w, py = skin.screen.h / 100 * imgNat.h;
    return py ? px / py : 0;
  };
  /* reverse keymap: logical button → the raw key this profile emits */
  const kmap = $derived(profile?.keymap || app.draft?.keymap || {});
  const keyFor = (btn) =>
    Object.keys(kmap).find((k) => kmap[k] === btn) || null;
  const holdKeyFor = (btn) =>
    Object.keys(kmap).find((k) => kmap[k] === btn + "_hold") || null;
  const anyHoldable = $derived(
    (profile?.skin ? profile.skin.buttons.map((b) => b.btn) : layout.flat())
      .some((b) => b && holdKeyFor(b)));

  /* ---- ACTIVE-ON-THIS-PAGE WASH (v0.79.1 — Suresh: "could we add a
     light, but visible wash to the soft remote keys that are active
     on the page? and if hold is engaged, the same"). The engine
     reports every preview landing (harmonium_screen → app.pvScreen);
     a logical button is ACTIVE when the current page answers it:
     the screen's own `buttons:` map, its control_target pass_through
     (or dpad_passthrough's standard set), the global_buttons, and —
     for hold variants — input.physical_buttons.hold. Focus movement
     is ambient everywhere and deliberately NOT counted: washing every
     arrow on every page would say nothing. */
  const PASSTHRU_SET = ["up", "down", "left", "right", "select", "back", "home"];
  const pvScr = $derived.by(() => {
    const id = app.pvScreen || "";
    const d = app.draft || {};
    if (id.startsWith("controller:")) return d.controllers?.[id.slice(11)] || null;
    if (id.startsWith("detail:")) return null;
    return d.screens?.[id] || d.controllers?.[id] || null;
  });
  const activeKeys = $derived.by(() => {
    const out = new Set();
    const d = app.draft || {};
    /* AMBIENT KEYS COUNT (v0.80.1 — Suresh: "we're not shading all
       the buttons like back, home, power, dpad, ok, mute"): v0.79.1
       deliberately left focus movement unwashed; overruled — the
       navigation set does something on EVERY page (arrows move
       focus, OK selects, back pops, home goes home), so it always
       washes. power/mute/vol wash when the page's control_target
       actually claims power/volume. */
    for (const k of PASSTHRU_SET) out.add(k);
    for (const k of Object.keys(d.input?.global_buttons || {})) out.add(k);
    for (const k of Object.keys(d.input?.physical_buttons?.hold || {}))
      out.add(k + "_hold");
    const sc = pvScr;
    if (sc) {
      for (const k of Object.keys(sc.buttons || {})) out.add(k);
      const pt = sc.control_target?.pass_through;
      if (Array.isArray(pt)) for (const k of pt) out.add(k);
      if (sc.dpad_passthrough) for (const k of PASSTHRU_SET) out.add(k);
      if (sc.control_target?.power) out.add("power");
      if (sc.control_target?.volume) {
        out.add("vol_up"); out.add("vol_down"); out.add("mute");
      }
    }
    return out;
  });
  /* tap mode: the button itself is answered · hold latch: its _hold is */
  const washed = (btn) => washOn && !holdLatch && activeKeys.has(btn);
  const holdWashed = (btn) => washOn && holdLatch && activeKeys.has(btn + "_hold");

  /* WHAT A KEY DOES, IN WORDS (v0.80.7 — Suresh: "a hover over a key
     told me what it did in a tooltip in both modes"): the same
     sources the wash reads, verbalized — explicit page binding,
     pass-through, global, then the engine's ambient meanings; the
     hold variant rides along. */
  function actionDesc(a) {
    if (!a) return "";
    if (a.navigate) return "opens " + a.navigate;
    if (a.seek) return "seek " + (a.seek > 0 ? "+" : "") + a.seek + "s";
    if (a.service) return a.service;
    if (a.sequence) return "runs " + a.sequence;
    return "custom action";
  }
  const keyDesc = (btn) => {
    const d = app.draft || {};
    const sc = pvScr;
    const parts = [];
    if (sc?.buttons?.[btn]) parts.push(actionDesc(sc.buttons[btn]));
    else if ((Array.isArray(sc?.control_target?.pass_through) &&
        sc.control_target.pass_through.includes(btn)) ||
        (sc?.dpad_passthrough && PASSTHRU_SET.includes(btn)))
      parts.push("passed through to the device");
    else if (d.input?.global_buttons?.[btn])
      parts.push(actionDesc(d.input.global_buttons[btn]) + " (global)");
    else if (btn === "select") parts.push("activates the focused tile");
    else if (["up", "down", "left", "right"].includes(btn)) parts.push("moves focus");
    else if (btn === "back") parts.push("back / up a screen");
    else if (btn === "home") parts.push("home page");
    else if (btn === "power") parts.push("activity power");
    const hb = btn + "_hold";
    const holdA = sc?.buttons?.[hb] || d.input?.global_buttons?.[hb];
    if (holdA) parts.push("hold: " + actionDesc(holdA));
    else if (d.input?.physical_buttons?.hold?.[btn])
      parts.push("hold: " + d.input.physical_buttons.hold[btn]);
    return parts.join(" · ");
  };
  const keyTitle = (btn) => {
    const base = defFor(btn).l + " — " + (keyDesc(btn) || "nothing on this page");
    return keyFor(btn) ? base
      : base + " · no key in the '" + app.device + "' keymap emits " + btn;
  };

  /* the PLAIN frame honours the device's true viewport too (v0.80.7 —
     Suresh: "The no device photo one is too short"): skin.viewport if
     a skin is on, else a profile-level viewport (removeSkin hoists the
     skin's up so the truth survives "no photo").
     v0.83.1 (statusreview: "the preview window is wrong height unless
     I click the photo mode on then off"): the old last-resort 320×537
     only healed AFTER the photo dance wrote a viewport into the
     profile. Now a profile without its own measurement BORROWS one
     from any profile in the workspace that has it, and the final
     fallback is the HA100 ground truth (349×581) instead of the
     historical guess — first mount matches the post-dance size. */
  const plainVp = $derived.by(() => {
    if (profile?.skin?.viewport) return profile.skin.viewport;
    if (profile?.viewport) return profile.viewport;
    for (const p2 of Object.values(app.draft?.remotes || {})) {
      const v = p2?.skin?.viewport || p2?.viewport;
      if (v) return v;
    }
    return { ...SKIN_ASTRION.viewport };
  });

  let holdLatch = $state(false);

  /* WASH TOGGLE (v0.83.2 — statusreview: "Lets have the highlight
     keys (in preview) be toggleable. Just a simple toggle."): one
     switch gates every wash — photo hotspots and the soft grid,
     tap and hold alike. Persisted per browser like the theme. */
  let washOn = $state(localStorage.getItem("hakr_studio_wash") !== "0");
  function toggleWash() {
    washOn = !washOn;
    localStorage.setItem("hakr_studio_wash", washOn ? "1" : "0");
  }

  /* SCREENSHOT (v0.83.2 — statusreview: "the screenshot should honor
     alpha on the preview (this is what will build my gifs)"). The
     engine's DOM is rendered to a canvas (html-to-image — same
     origin, so the iframe document is ours to read), composited into
     the skin photo's aperture at the photo's NATURAL resolution, and
     the photo drawn over it — everything outside the device stays
     TRANSPARENT, because the output canvas starts transparent and
     only the photo's own alpha lands on it. No skin → the bare
     screen at 2×. Downloads as PNG, named after the screen. */
  let snapping = $state(false);
  /* html-to-image can't read a cross-origin <link>'s cssRules (the
     engine's Material Symbols come from Google Fonts) and silently
     skips it — every icon would render as its ligature name. So we
     build the font CSS ourselves: fetch the stylesheet, swap each
     url(...) for a data: URL, and hand it over as fontEmbedCSS. */
  async function snapFontCSS(doc) {
    try {
      const link = doc.querySelector('link[rel=stylesheet][href*="fonts.googleapis"]');
      if (!link) return undefined;
      let css = await (await fetch(link.href)).text();
      const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)]
        .map((m) => m[1].replace(/["']/g, "")))];
      for (const u of urls) {
        const abs = new URL(u, link.href).href;
        const blob = await (await fetch(abs)).blob();
        const data = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result); fr.onerror = rej;
          fr.readAsDataURL(blob); });
        css = css.split(u).join(data);
      }
      return css;
    } catch { return undefined; }   /* fall back to the library's walk */
  }
  async function snapPreview() {
    if (snapping) return;
    snapping = true;
    /* SCROLL SURVIVES THE SNAP (v0.83.8 — Suresh: "When I take a pic
       with the screen scrolled… the capture is of the original
       unscrolled screen"): html-to-image renders a CLONE, and scroll
       offsets are live state — clones reset to 0. So each scrolled
       container's offset becomes an equivalent transform on its
       children for the duration of the capture (visually identical
       live, and inline transforms DO survive cloning), then reverts. */
    const undoScroll = [];
    try {
      const pv = document.getElementById("pv");
      const doc = pv.contentDocument;
      const vw = pv.contentWindow.innerWidth, vh = pv.contentWindow.innerHeight;
      for (const el of doc.querySelectorAll("*")) {
        const st = el.scrollTop, sl = el.scrollLeft;
        if (!st && !sl) continue;
        const kids = [...el.children];
        const prev = kids.map((k) => k.style.transform);
        kids.forEach((k) => { k.style.transform =
          `translate(${-sl}px, ${-st}px)` + (k.style.transform ? " " + k.style.transform : ""); });
        el.scrollTop = 0; el.scrollLeft = 0;
        undoScroll.push(() => {
          kids.forEach((k, i) => (k.style.transform = prev[i]));
          el.scrollTop = st; el.scrollLeft = sl;
        });
      }
      const bg = getComputedStyle(doc.body).backgroundColor;
      const screenCv = await toCanvas(doc.documentElement, {
        width: vw, height: vh, canvasWidth: vw * 2, canvasHeight: vh * 2,
        fontEmbedCSS: await snapFontCSS(doc),
        backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#0d0f12" });
      let out = screenCv;
      if (skin?.image) {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res; img.onerror = () => rej(new Error("photo failed to load"));
          img.src = skin.image; });
        out = document.createElement("canvas");
        out.width = img.naturalWidth; out.height = img.naturalHeight;
        const cx = out.getContext("2d");
        const sr = skin.screen;
        /* 2px bleed under the photo's aperture edge — its anti-aliased
           rim is semi-transparent, and screen pixels must sit beneath
           it or the seam shows through as background */
        const bl = 2;
        cx.drawImage(screenCv, sr.x / 100 * out.width - bl, sr.y / 100 * out.height - bl,
          sr.w / 100 * out.width + bl * 2, sr.h / 100 * out.height + bl * 2);
        cx.drawImage(img, 0, 0, out.width, out.height);
      }
      const a = document.createElement("a");
      a.download = "harmonium-" +
        (app.pvScreen || "preview").replace(/[^a-z0-9_-]+/gi, "_") + ".png";
      a.href = out.toDataURL("image/png");
      a.click();
      setStatus("screenshot saved" + (skin?.image ? " (transparent outside the device)" : ""), "ok");
    } catch (e) {
      setStatus("screenshot failed: " + (e?.message || e), "err");
    }
    undoScroll.forEach((f) => f());
    snapping = false;
  }
  function softPress(btn) {
    const hk = holdKeyFor(btn);
    if (holdLatch && hk) { sendKey(hk); holdLatch = false; return; }
    const k = keyFor(btn);
    if (k) sendKey(k);
  }

  /* ---- in-place layout editing (the ✎) ---- */
  let editing = $state(false);
  function ensureLayout() {
    if (!app.draft.remotes) app.draft.remotes = {};
    if (!app.draft.remotes[app.device])
      app.draft.remotes[app.device] = { capabilities: ["touch", "pointer"] };
    const p = app.draft.remotes[app.device];
    if (!p.soft_layout) p.soft_layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    return p.soft_layout;
  }
  function setCell(ri, ci, v) {
    /* blank = null (a real spacer in the physical remote's grid);
       anything else is the slot's logical-button name, verbatim */
    ensureLayout()[ri][ci] = (v || "").trim() || null;
  }
  function addRow() { ensureLayout().push([null, null, null]); }
  function delRow(ri) {
    const L = ensureLayout();
    L.splice(ri, 1);
    if (!L.length) L.push([null, null, null]);
  }
  function resetLayout() {
    if (app.draft.remotes?.[app.device]) delete app.draft.remotes[app.device].soft_layout;
  }

  /* ---- ＋ new remote profile (v0.56) ----
     Describing a remote starts with naming it. A blank profile is
     the smallest honest thing: touch/pointer capabilities and an
     EMPTY keymap — the keys arrive from the engine's capture-assign
     screen (keys:), which writes straight back into this profile. */
  let newOpen = $state(false);
  let newId = $state("");
  function mintProfile() {
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!id) return;
    if (!app.draft.remotes) app.draft.remotes = {};
    if (!app.draft.remotes[id])
      app.draft.remotes[id] = { capabilities: ["touch", "pointer"], keymap: {} };
    app.device = id;
    newId = "";
    newOpen = false;
    pushPreview();
  }
</script>

<svelte:window onkeydown={mapKeydown} />

<div class="flex w-[372px] shrink-0 flex-col items-center overflow-y-auto border-l border-line py-3.5">
  <div class="mb-2.5 flex items-center gap-2">
    {#key app.pvPulse}
      <span class="pv-blip text-[10px] text-ok" title="preview updated">●</span>
    {/key}
    <span class="text-xs text-dim">Preview as</span>
    <select id="devSel" bind:value={app.device} onchange={pushPreview}
      class="cursor-pointer rounded-[8px] border-0 bg-tile-hi px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none">
      {#each devices as d (d)}<option value={d}>{d}</option>{/each}
    </select>
    <button id="devNew" onclick={() => (newOpen = !newOpen)}
      title="Describe a new remote — name it here, lay out its buttons below, then learn its keys on the remote's own Key capture screen"
      class="cursor-pointer rounded-[8px] border border-dashed border-line-strong bg-transparent px-2 py-1 text-[11px] text-dim hover:text-ink">＋</button>
  </div>
  <!-- SHOWING: the preview names its own screen (v0.79.2 — Suresh:
       "Still no easy way for the preview page to move along
       sensibly"). app.pvScreen is engine-reported (every landing), so
       this reads the truth even after clicking around INSIDE the
       preview; the select jumps anywhere — pages first, then
       controllers. Context still steers too: selecting a page
       follows it, an open activity card offers Controller/Room page,
       a row's ⋯ menu offers "Preview it". -->
  <div class="mb-2.5 flex w-full max-w-[352px] items-center gap-1.5">
    <span class="shrink-0 text-xs text-dim">Showing</span>
    <div class="relative min-w-0 flex-1">
      <select value="" onchange={(e) => { if (e.target.value) previewGoto(e.target.value); e.target.value = ""; }}
        title="Jump the preview to any page or controller"
        class="w-full cursor-pointer truncate rounded-[8px] border-0 bg-tile-hi px-2.5 py-1.5 font-[inherit] text-xs text-ink outline-none">
        <option value="">{(() => {
          const id = app.pvScreen || "";
          const d = app.draft || {};
          if (id.startsWith("controller:"))
            return (d.controllers?.[id.slice(11)]?.name || id) + " (controller)";
          if (id.startsWith("detail:")) return id.slice(7) + " (device page)";
          return (d.screens?.[id]?.name || id || "…") + (d.screens?.[id] ? " (page)" : "");
        })()}</option>
        <optgroup label="Pages">
          {#each Object.entries(app.draft?.screens || {}) as [sid, s] (sid)}
            <option value={sid}>{s.name || sid}</option>
          {/each}
        </optgroup>
        <optgroup label="Controllers">
          {#each Object.entries(app.draft?.controllers || {}) as [cid, c] (cid)}
            <option value={"controller:" + cid}>{c.name || cid}</option>
          {/each}
        </optgroup>
        <optgroup label="Diagnostic">
          <option value="diag:">⚕ Diagnostics (viewport, build, connection)</option>
          <option value="keys:">⌨ Key capture</option>
        </optgroup>
      </select>
    </div>
    <!-- 📷 (v0.83.2): the preview as a PNG — with the photo skin on,
         the file keeps the photo's alpha (transparent outside the
         device), which is exactly what GIF/marketing compositing
         wants. -->
    <!-- ↻ (v0.83.7 — "Still getting stretched transport bar ... put a
         refresh icon next to the camera icon"): reloads the ENGINE
         iframe only — the one-tap cure for a stretched first paint,
         without losing the Studio session. -->
    <button id="pvReload" title="Reload the preview engine (cures a stretched first paint)"
      onclick={() => { try { iframe?.contentWindow?.location.reload(); } catch { if (iframe) iframe.src = iframe.src; } }}
      class="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-tile-hi text-dim hover:text-ink">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
        <polyline points="21 3 21 9 15 9"/>
      </svg>
    </button>
    <button id="pvSnap" onclick={snapPreview} disabled={snapping}
      title={skin ? "Screenshot: photo + live screen, transparent outside the device (PNG)"
        : "Screenshot the preview screen (PNG)"}
      class="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-tile-hi text-dim hover:text-ink disabled:opacity-50">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    </button>
  </div>
  {#if newOpen}
    <div class="mb-2.5 flex items-center gap-1.5">
      <input id="devNewId" bind:value={newId} placeholder="remote id (e.g. rs90)"
        onkeydown={(e) => { if (e.key === "Enter") mintProfile(); }}
        class="h-8 w-[150px] rounded-[6px] border border-line bg-field px-2 font-[inherit] text-[12px] text-ink outline-none" />
      <button id="devNewAdd" onclick={mintProfile}
        class="cursor-pointer rounded-[6px] border-0 bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-ink">Add</button>
    </div>
  {/if}

  {#if skin}
    <!-- THE REAL REMOTE (v0.80): iframe behind the photo's transparent
         aperture; the photo overlays pointer-events-none; hotspots
         re-enable pointing over the physical keys. All % of image. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={skinEl}
      class={"relative w-[340px] shrink-0 select-none " + (mapping ? "cursor-crosshair" : "")}
      onmousedown={mapDown} onmousemove={mapMove} onmouseup={mapUp} onmouseleave={mapUp}>
      <!-- TRUE VIEWPORT, SCALED (v0.80.2 — Suresh: "Width is squished
           even though map keys says 0.6 480x800… scrcpy IS 0.6"): the
           aperture RECT was 0.6, but rendering the engine AT aperture
           size gave it a 272px CSS viewport — narrower than the
           HA100's real 320×533 (480×800 @ DPR 1.5), so the layout
           cramped horizontally. The engine now renders at the
           device's true 320×533.33 and the whole frame scales down
           to fit the aperture — a faithful miniature, same as the
           old phone frame. 340 = the skin's display width. -->
      <!-- the clip runs 1px PROUD of the aperture on every side, with
           the iframe nudged back in by 1px (v0.83.3 — Suresh: "In
           photo mode the LCD panel is one pixel off on both axis…
           grey/white line"): percentage rounding left a hairline
           where the Studio's light background showed through the
           photo's anti-aliased rim. The ring is black, buried under
           the photo's opaque edge — same bleed trick as the 📷
           snapshot compositor. -->
      <!-- INDEPENDENT X/Y SCALE (v0.83.3 — Suresh: "we're 1 or two
           pixels off our vertical position!"): the height used to be
           DERIVED (width × viewport ratio), so unless the mapped
           rect's aspect exactly matched the viewport's, the content
           fell a hairline short of the aperture bottom (or spilled
           past it) — and every hand-nudge of the rect moved the
           line. Scaling each axis to ITS aperture dimension fills
           the rect edge-to-edge always; the residual anamorphic
           stretch is the rect-vs-viewport aspect delta (~0.6% on
           the astrion) — invisible, unlike a white line. -->
      <!-- OVERSCAN (v0.83.4 — the line survived s0.83.3 on the real
           machine): the content is deliberately scaled to the
           EXPANDED clip (rect + 1px on every side), so even when a
           browser rounds the scaled iframe's bottom edge a device
           pixel short at fractional zoom, the shortfall lands inside
           painted content, never on background. The 1px ring hides
           under the photo's opaque rim; center error is ±1px. -->
      <!-- SCROLL-PINNED (v0.83.7 — Suresh: "When I click presets or
           devices… it clips the hero and the viewport"): the engine's
           hero-jump chips call scrollIntoView, which propagates to
           ancestor scrollers ACROSS the iframe boundary — and an
           overflow:hidden clip is still programmatically scrollable,
           with plenty of room because the iframe's LAYOUT size is the
           full viewport (transforms don't shrink layout). The chip
           click was scrolling the clip itself. Any scroll here resets
           to 0 immediately. -->
      <div class="absolute z-0 overflow-hidden"
        onscroll={(e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; }}
        style="background:#000; left:calc({skin.screen.x}% - 1px); top:calc({skin.screen.y}% - 1px); width:calc({skin.screen.w}% + 2px); height:calc({skin.screen.h}% + 2px)">
        <iframe id="pv" bind:this={iframe} title="Live preview"
          src="/local/harmonium/index.html#preview=1"
          class="border-0 bg-bg"
          style="width:{skin.viewport?.w || 320}px; height:{skin.viewport?.h || 533.33}px; transform:scale({(skin.screen.w / 100 * (imgW || 340) + 2) / (skin.viewport?.w || 320)}, {(skin.screen.h / 100 * (imgW || 340) * (imgNat.h / imgNat.w) + 2) / (skin.viewport?.h || 533.33)}); transform-origin:0 0"></iframe>
      </div>
      <img src={skin.image} alt="" draggable="false"
        onload={(e) => (imgNat = { w: e.target.naturalWidth, h: e.target.naturalHeight })}
        bind:clientWidth={imgW}
        class="pointer-events-none relative z-10 w-full" />
      {#if mapping}
        <!-- the LCD rect is a first-class map object (v0.80.1 — "the
             LCD section has lost its aspect ratio"): drag to move,
             corner handle / shift+arrows to resize; the toolbar's
             ratio meter reads the truth against 480×800 -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class={"hotspot absolute z-20 cursor-move rounded-[4px] border-2 border-dashed " +
            (selScreen ? "border-ok bg-ok/10" : "border-ok/50")}
          style="left:{skin.screen.x}%; top:{skin.screen.y}%; width:{skin.screen.w}%; height:{skin.screen.h}%"
          onmousedown={scrDown}>
          <span class="absolute top-0.5 left-1 text-[9px] font-bold text-ok drop-shadow">screen</span>
          {#if selScreen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="absolute -right-1.5 -bottom-1.5 z-30 h-3 w-3 cursor-nwse-resize rounded-[3px] bg-ok"
              onmousedown={(e) => rszDown(e, "screen")}></span>
          {/if}
        </div>
      {/if}
      {#each skin.buttons as b, i (i)}
        {#if mapping}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class={"hotspot absolute z-20 cursor-move rounded-[8px] border " +
              (selHot === i ? "border-accent bg-accent/25" : "border-accent/50 bg-accent/10")}
            style="left:{b.x}%; top:{b.y}%; width:{b.w}%; height:{b.h}%"
            onmousedown={(e) => hotDown(e, i)}>
            <span class="absolute -top-0.5 left-1 text-[9px] font-bold text-accent-text drop-shadow">{b.btn || "?"}</span>
            {#if selHot === i}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="absolute -right-1.5 -bottom-1.5 z-30 h-3 w-3 cursor-nwse-resize rounded-[3px] bg-accent"
                onmousedown={(e) => rszDown(e, "hot", i)}></span>
            {/if}
          </div>
        {:else if b.btn}
          <button data-btn={b.btn} data-k={keyFor(b.btn)} onclick={() => softPress(b.btn)}
            disabled={!keyFor(b.btn) && !holdKeyFor(b.btn)}
            title={keyTitle(b.btn)}
            class={"hotspot absolute z-20 cursor-pointer rounded-[10px] border-0 p-0 active:bg-accent/40 disabled:cursor-default " +
              (holdWashed(b.btn) ? "bg-accent/30 ring-2 ring-accent/70"
                : holdLatch && holdKeyFor(b.btn) ? "bg-accent/10 ring-1 ring-accent/40"
                : washed(b.btn) ? "bg-accent/15 ring-1 ring-accent/50" : "bg-transparent")}
            style="left:{b.x}%; top:{b.y}%; width:{b.w}%; height:{b.h}%"></button>
        {/if}
      {/each}
      {#if drag}
        <div class="pointer-events-none absolute z-30 rounded-[6px] border border-dashed border-accent bg-accent/15"
          style="left:{Math.min(drag.x0, drag.x1)}%; top:{Math.min(drag.y0, drag.y1)}%; width:{Math.abs(drag.x1 - drag.x0)}%; height:{Math.abs(drag.y1 - drag.y0)}%"></div>
      {/if}
    </div>
    {#if mapping}
      <div class="mt-2 flex w-[340px] flex-wrap items-center gap-1.5">
        {#if selHot >= 0 && skin.buttons[selHot]}
          <input list="softbtns" value={skin.buttons[selHot].btn}
            onchange={(e) => { const b2 = skin.buttons[selHot];
              if (b2) b2.btn = e.target.value.trim(); }}
            placeholder="button name…"
            title="Which logical button this hotspot sends — standard names offered, custom names legal"
            class="h-8 w-[130px] rounded-[6px] border border-line bg-field px-2 font-[inherit] text-[12px] text-ink outline-none" />
          <button onclick={() => delHot(selHot)} title="Delete this hotspot"
            class="cursor-pointer rounded-[6px] border border-line-strong bg-surface px-2 py-1 text-[11px] text-danger">✕</button>
        {:else}
          <span class="text-[10.5px] text-dim">drag = new key · click to name/move · arrows nudge 1px (⇧ resize)</span>
        {/if}
        {#if selScreen || selHot >= 0}
          {@const sel = selScreen ? skin.screen : skin.buttons[selHot]}
          <!-- THE NUMBERS THEMSELVES (v0.83.5): the rect as editable
               percentages of the image — the same values stored at
               remotes.<id>.skin in the config. Type exact values or
               spin; the px readout translates to source pixels. -->
          <span class="flex items-center gap-1">
            {#each [["x", "x"], ["y", "y"], ["w", "w"], ["h", "h"]] as [lbl, k] (k)}
              <label class="flex items-center gap-0.5 text-[9px] text-dim">{lbl}
                <input type="number" step="0.01" value={sel[k]}
                  onchange={(e) => { const v = parseFloat(e.target.value);
                    if (!isNaN(v)) sel[k] = +Math.max(0, Math.min(100, v)).toFixed(3); }}
                  class="h-7 w-[58px] rounded-[5px] border border-line bg-field px-1 font-mono text-[10.5px] text-ink outline-none" /></label>
            {/each}
            <span class="text-[9px] text-faint" title="source pixels on this image">
              ≈{Math.round(sel.x / 100 * imgNat.w)},{Math.round(sel.y / 100 * imgNat.h)}
              {Math.round(sel.w / 100 * imgNat.w)}×{Math.round(sel.h / 100 * imgNat.h)}px</span>
            <span class="text-[9.5px] font-medium text-ink-2">⌨ arrows = 1px · ⇧ = resize</span>
          </span>
        {/if}
        <span class="flex-1"></span>
        <button id="skinMapDone" onclick={() => { mapping = false; selHot = -1; selScreen = false; }}
          class="cursor-pointer rounded-[6px] border-0 bg-accent px-3 py-1 text-[11px] font-bold text-accent-ink">Done</button>
        <div class="flex w-full items-center gap-1">
          <span class="text-[11px] font-semibold text-ink-2" title="Shift EVERY key hotspot together — for a whole map that sits a pixel off. The selected rect alone moves with the keyboard arrows.">⌖ nudge all</span>
          {#each [["◀", -0.1, 0], ["▶", 0.1, 0], ["▲", 0, -0.1], ["▼", 0, 0.1]] as [g, dx, dy] (g)}
            <button onclick={() => nudgeAll(dx, dy)} title={"nudge every key " + g}
              class="h-7 w-7 cursor-pointer rounded-[6px] border border-line-strong bg-surface p-0 text-[11px] text-ink-2 hover:bg-sunk">{g}</button>
          {/each}
          <span class="flex-1"></span>
          <span class={"text-[10px] " + (Math.abs(scrRatio() - 0.6) < 0.006 ? "text-ok" : "text-danger")}
            title="The LCD rect's pixel aspect on this image — the HA100 panel is 480×800 (0.600)">
            screen {scrRatio().toFixed(3)} {Math.abs(scrRatio() - 0.6) < 0.006 ? "✓ 480×800" : "→ want 0.600"}</span>
        </div>
      </div>
    {:else if anyHoldable}
      <button id="softHold" onclick={() => (holdLatch = !holdLatch)}
        title="Hold modifier — latch, then press a washed key to send its HOLD variant"
        class={"mt-2 flex h-9 w-[208px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border-0 font-[inherit] text-[12px] font-bold tracking-[.06em] select-none " +
          (holdLatch ? "bg-accent text-accent-ink" : "bg-tile-hi text-dim hover:text-ink")}>
        ✚ HOLD{holdLatch ? " — pick a key" : ""}</button>
    {/if}
  {:else}
  <div class="shrink-0 rounded-[22px] bg-black p-1 shadow-[0_0_0_2px_#2c333d,0_12px_40px_rgba(0,0,0,.5)]">
    <iframe id="pv" bind:this={iframe} title="Live preview"
      src="/local/harmonium/index.html#preview=1"
      class="rounded-[18px] border-0 bg-bg"
      style="width:{plainVp.w}px; height:{plainVp.h}px"></iframe>
  </div>
  {/if}

  <datalist id="softbtns">
    {#each Object.keys(BTN_DEFS) as bk (bk)}<option value={bk}></option>{/each}
  </datalist>

  {#if !skin}
  <div id="soft" class="mt-3 flex flex-col items-center">
    {#each layout as row, ri (ri)}
      <div class={"relative grid grid-cols-[repeat(3,64px)] justify-center gap-2 " + (ri > 0 ? "mt-2" : "")}>
        {#each row as btn, ci (ci)}
          {#if editing}
            <!-- free text over the standard names: type "Red", "…",
                 or pick a known button; empty = blank spacer -->
            <input list="softbtns" value={btn || ""}
              onchange={(e) => setCell(ri, ci, e.target.value)}
              title="What this slot is called (blank = spacer). Standard names are offered; any custom name is legal."
              class="h-11 w-full rounded-[12px] border border-dashed border-line-strong bg-field px-1 text-center font-[inherit] text-[11px] text-ink outline-none" />
          {:else if btn}
            <!-- washes, in precedence (v0.79.1): latched + this page
                 answers the HOLD variant → 25; latched + merely
                 holdable → 10 (next press still sends the hold);
                 tap mode + this page answers the button → 12, the
                 "light, but visible" ask. Unmapped in this profile's
                 keymap → disabled (the soft remote never lies). -->
            <button data-k={keyFor(btn)} data-btn={btn} onclick={() => softPress(btn)}
              disabled={!keyFor(btn) && !holdKeyFor(btn)}
              title={keyTitle(btn)}
              class={"flex h-11 cursor-pointer flex-col items-center justify-center rounded-[12px] border-0 p-0 font-[inherit] text-[13px] select-none active:bg-accent active:text-accent-ink disabled:cursor-default disabled:opacity-30 " +
                (holdWashed(btn) ? "bg-accent/25 text-ink"
                  : holdLatch && holdKeyFor(btn) ? "bg-accent/10 text-ink"
                  : washed(btn) ? "bg-accent/12 text-ink" : "bg-tile-hi text-ink")}>
              {defFor(btn).g}<small class="text-[9px] tracking-[.05em] text-dim">{defFor(btn).l}</small>
            </button>
          {:else}
            <span class="h-11"></span>
          {/if}
        {/each}
        {#if editing}
          <button onclick={() => delRow(ri)} title="Remove this row"
            class="absolute top-1/2 -right-7 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger">✕</button>
        {/if}
      </div>
    {/each}
    {#if editing}
      <div class="mt-2 flex items-center gap-2">
        <button onclick={addRow}
          class="cursor-pointer rounded-[8px] border border-dashed border-line-strong bg-transparent px-2.5 py-1 text-[11px] text-dim hover:text-ink">＋ row</button>
        <button onclick={resetLayout} title="Back to the stock arrangement"
          class="cursor-pointer rounded-[8px] border border-dashed border-line-strong bg-transparent px-2.5 py-1 text-[11px] text-dim hover:text-ink">reset</button>
        <button id="softDone" onclick={() => (editing = false)}
          class="cursor-pointer rounded-[8px] border-0 bg-accent px-3 py-1 text-[11px] font-bold text-accent-ink">Done</button>
      </div>
      <p class="mt-2 max-w-[248px] text-center text-[10.5px] leading-[1.45] text-dim">
        Type a slot's name in order, row by row — standard names are
        offered, custom ones (Red, Green, “.”, “..”) are legal. Empty
        = blank. Learn which physical key each slot sends on the
        remote itself: hold ⓘ → Key capture.
      </p>
    {:else}
      {#if anyHoldable}
        <button id="softHold" onclick={() => (holdLatch = !holdLatch)}
          title="Hold modifier — latch, then press a washed key to send its HOLD variant"
          class={"mt-2 flex h-9 w-[208px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border-0 font-[inherit] text-[12px] font-bold tracking-[.06em] select-none " +
            (holdLatch ? "bg-accent text-accent-ink" : "bg-tile-hi text-dim hover:text-ink")}>
          ✚ HOLD{holdLatch ? " — pick a key" : ""}</button>
      {/if}
    {/if}
  </div>
  {/if}
  <div class="mt-2 flex items-center gap-1.5 px-3.5 text-center text-[11px] text-dim">
    <span>Soft remote sends the '{app.device}' profile's real keys.</span>
    <span class="text-[10px] text-faint" title="Studio build — if a fix seems missing, hard-refresh (Ctrl+Shift+R): HA caches studio.html">s{STUDIO_V}</span>
    <button id="washTgl" onclick={toggleWash}
      title="Wash keys that do something on the current page (hold variants glow stronger)"
      class={"cursor-pointer border-0 bg-transparent p-0 text-[11px] hover:underline " +
        (washOn ? "text-accent" : "text-dim")}>{washOn ? "washes on" : "washes off"}</button>
    {#if skin}
      {#if !mapping}
        <button id="skinMap" onclick={() => { mapping = true; selHot = -1; }}
          title="Drag hotspots over the photo's physical keys — each sends its logical button"
          class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent hover:underline">✎ map keys</button>
        <button id="skinOff" onclick={removeSkin}
          title="Back to the generic grid soft remote"
          class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-dim hover:underline">no photo</button>
      {/if}
    {:else}
      {#if !editing}
        <button id="softEdit" onclick={() => { ensureLayout(); editing = true; }}
          title="Edit this profile's button layout — mirror the physical remote"
          class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent hover:underline">✎ edit layout</button>
        <button id="skinOn" onclick={applySkinPreset}
          title="Preview on a photo of the real remote (Astrion HA100 preset — drop your PNG at www/harmonium/skins/astrion.png)"
          class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent hover:underline">🖼 device photo</button>
      {/if}
    {/if}
  </div>
</div>
