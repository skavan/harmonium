<script>
  import { app, bindPreview, pushPreview, sendKey, previewGoto } from "./state.svelte.js";
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
    screen: { x: 9.84, y: 3.8, w: 80, h: 41.8 },
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
  /* arrow keys nudge the SELECTED rect (shift = resize) */
  function mapKeydown(ev) {
    if (!mapping || (!selScreen && selHot < 0)) return;
    const o = selScreen ? skin.screen : skin.buttons[selHot];
    if (!o) return;
    const step = 0.1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
    if (!d) return;
    if (ev.shiftKey) { o.w = +Math.max(1, o.w + d[0]).toFixed(2);
      o.h = +Math.max(0.4, o.h + d[1]).toFixed(2); }
    else { o.x = +Math.max(0, o.x + d[0]).toFixed(2);
      o.y = +Math.max(0, o.y + d[1]).toFixed(2); }
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
  const washed = (btn) => !holdLatch && activeKeys.has(btn);
  const holdWashed = (btn) => holdLatch && activeKeys.has(btn + "_hold");

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
     skin's up so the truth survives "no photo"), else the old 320×537. */
  const plainVp = $derived(profile?.skin?.viewport || profile?.viewport ||
    { w: 320, h: 537 });

  let holdLatch = $state(false);
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
  <div class="mb-2.5 flex max-w-[352px] items-center gap-1.5">
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
      <div class="absolute z-0 overflow-hidden"
        style="left:{skin.screen.x}%; top:{skin.screen.y}%; width:{skin.screen.w}%; height:{skin.screen.h}%">
        <iframe id="pv" bind:this={iframe} title="Live preview"
          src="/local/harmonium/index.html#preview=1"
          class="border-0 bg-bg"
          style="width:{skin.viewport?.w || 320}px; height:{skin.viewport?.h || 533.33}px; transform:scale({(skin.screen.w / 100 * 340) / (skin.viewport?.w || 320)}); transform-origin:0 0"></iframe>
      </div>
      <img src={skin.image} alt="" draggable="false"
        onload={(e) => (imgNat = { w: e.target.naturalWidth, h: e.target.naturalHeight })}
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
          <span class="text-[10.5px] text-dim">drag = new key · click to name/move · arrows nudge (⇧ resize)</span>
        {/if}
        <span class="flex-1"></span>
        <button id="skinMapDone" onclick={() => { mapping = false; selHot = -1; selScreen = false; }}
          class="cursor-pointer rounded-[6px] border-0 bg-accent px-3 py-1 text-[11px] font-bold text-accent-ink">Done</button>
        <div class="flex w-full items-center gap-1">
          <span class="text-[10px] text-dim" title="Shift EVERY key hotspot together — for a whole map that sits a pixel off">⌖ all</span>
          {#each [["◀", -0.1, 0], ["▶", 0.1, 0], ["▲", 0, -0.1], ["▼", 0, 0.1]] as [g, dx, dy] (g)}
            <button onclick={() => nudgeAll(dx, dy)} title={"nudge every key " + g}
              class="h-6 w-6 cursor-pointer rounded-[5px] border border-line-strong bg-surface p-0 text-[10px] text-ink-2 hover:bg-sunk">{g}</button>
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
