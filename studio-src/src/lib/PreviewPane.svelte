<script>
  /* The preview pane spine: device/screen toolbar, the wash + key-
     description brains both remotes share, the 📷 screenshot
     compositor, and the footer. The two remote faces are children —
     preview/SkinPreview.svelte (photo skin + ✎ map keys) and
     preview/SoftRemote.svelte (plain frame + soft grid) — fed by the
     `pv` context below (v0.83.11 round 2 split; behavior unchanged). */
  import { app, bindPreview, pushPreview, sendKey, previewGoto, setStatus, STUDIO_V } from "./state.svelte.js";
  import { toCanvas } from "html-to-image";
  import { BTN_DEFS, defFor, DEFAULT_LAYOUT, SKIN_ASTRION, PASSTHRU_SET, actionDesc } from "./preview/lib.js";
  import SkinPreview from "./preview/SkinPreview.svelte";
  import SoftRemote from "./preview/SoftRemote.svelte";
  let iframe = $state(null);   /* set via pv.setIframe by whichever child renders */
  $effect(() => { if (iframe) bindPreview(iframe.contentWindow); });
  const devices = $derived(Object.keys(app.draft?.remotes || { default: 1 }));
  let mapping = $state(false);   /* ✎ map keys — the footer's door; SkinPreview binds it */
  let editing = $state(false);   /* ✎ layout — the footer's door; SoftRemote binds it */

  const profile = $derived(app.draft?.remotes?.[app.device] || null);
  const layout = $derived(profile?.soft_layout || DEFAULT_LAYOUT);
  const skin = $derived(profile?.skin || null);
  function applySkinPreset() {
    if (!app.draft.remotes) app.draft.remotes = {};
    if (!app.draft.remotes[app.device])
      app.draft.remotes[app.device] = { capabilities: ["touch", "pointer"], keymap: {} };
    app.draft.remotes[app.device].skin = JSON.parse(JSON.stringify(SKIN_ASTRION));
  }
  function removeSkin() {
    mapping = false;   /* the child's selection dies with it */
    const p2 = app.draft.remotes?.[app.device];
    if (p2) {
      /* the measured viewport outlives the photo (v0.80.7) */
      if (p2.skin?.viewport) p2.viewport = { ...p2.skin.viewport };
      delete p2.skin;
    }
  }
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
    /* AMBIENT MEANINGS the engine gives unbound keys (v0.85.7 —
       Suresh: "Tooltip says hold FWD does nothing on this page. But
       works as expected on the physical hardware!"): the transport
       vocabulary drives the running music from any page, and the
       hold pair seeks on music pages — the tooltip must know what
       the engine knows, or it calls a working key dead. */
    else if (btn === "prev") parts.push("previous track (running music)");
    else if (btn === "next") parts.push("next track (running music)");
    else if (btn === "play_pause") parts.push("play / pause (running music)");
    else if (btn === "stop") parts.push("stop (running music)");
    else if (btn === "left_hold") parts.push("seek −15s (music pages)");
    else if (btn === "right_hold") parts.push("seek +15s (music pages)");
    const hb = btn + "_hold";
    const holdA = sc?.buttons?.[hb] || d.input?.global_buttons?.[hb];
    if (holdA) parts.push("hold: " + actionDesc(holdA));
    else if (d.input?.physical_buttons?.hold?.[btn])
      parts.push("hold: " + d.input.physical_buttons.hold[btn]);
    return parts.join(" · ");
  };
  /* PHYSICAL KEY IN THE TOOLTIP (v0.83.8 follow-up — Suresh: "On
     Astrion hover, show Physical Key info -- i.e. F1, F11 where
     applicable"): the reverse-keymap lookup already knows which raw
     key this profile emits — say it. Hold variants name theirs too. */
  const keyTitle = (btn) => {
    const k = keyFor(btn);
    const hk = holdKeyFor(btn);
    /* ‹›, not brackets — the Astrion's back/home keys ARE "[" and
       "]", and "[key: []" reads like a typo */
    const base = defFor(btn).l + (k ? " · key ‹" + k + "›" : "") +
      " — " + (keyDesc(btn) || "nothing on this page") +
      (hk ? " · hold key ‹" + hk + "›" : "");
    return k ? base
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
    /* THE ENGINE MUST HOLD STILL (v0.83.11 — Suresh's attachment: a
       scrolled snap collaging the presets row and DEVICES header of
       the SCROLLED view with an Activities tile from the UNSCROLLED
       one). html-to-image walks the live DOM asynchronously — the
       font fetch alone is hundreds of ms — and any WS diff in that
       window runs renderStates; a generated-tile signature change
       escalates to navigate(), which empties #grid mid-clone: the
       compensation transforms die with the old nodes and the zeroed
       scroll never comes back. Same-origin privilege: no-op the
       engine's re-render doors for the capture and restore after.
       renderStates is the ONE funnel for state-driven DOM change
       (its sig check is what calls navigate); the clock and the
       banner fitter are the two timers that touch layout.
       ROUND 2 (his second attachment — chips read PRESETS on a
       DEVICES capture, and a gap split the grid): (a) navigate is
       frozen TOO, so no path at all can rebuild #grid mid-clone;
       (b) zeroing the scroll fires the grid's scroll-spy, which
       RELEASED the tapped chip's pin (scrollTop no longer matched
       pin.top) and relit the wrong chip in the capture — and left
       the pin dead after. The spy handler is detached for the
       capture, so the pin never sees the zeroed scroll at all.
       (The engine's S is a top-level `let` — invisible as a window
       property from here — so detaching the handler IS the pin
       protection; there is no state to save.) */
    const frozen = {};
    const pinned = [];
    let fwin = null, heldSpy, gridEl = null, degraded = false, killAnim = null;
    try {
      const pv = document.getElementById("pv");
      const doc = pv.contentDocument;
      fwin = pv.contentWindow;
      for (const fn of ["renderStates", "updateClock", "fitBanner", "navigate"])
        if (typeof fwin[fn] === "function") { frozen[fn] = fwin[fn]; fwin[fn] = () => {}; }
      gridEl = doc.getElementById("grid");
      if (gridEl) { heldSpy = gridEl.onscroll; gridEl.onscroll = null; }
      /* PIN THE VERTICAL LAYOUT (round 3 — his b40 capture still
         spread the devices region a few px per tile until the bottom
         clipped, and only on HIS machine: html-to-image re-lays-out
         the clone inside an SVG image, where font metrics / display
         scaling can differ slightly from the live page — tiles are
         min-height + content-sized, so tiny per-line differences
         COMPOUND down the page. Headless never drifts; his Windows
         does. So the capture stops trusting re-layout: every banner
         and grid child gets its LIVE height inlined (border-box) for
         the duration — the clone can render text however it likes
         inside boxes that cannot move. Restored after. */
      /* SLOW WORK FIRST, DOM SURGERY LAST (2026-08-26 — his queue
         capture saved the UNSCROLLED list with no focus ring while
         the live view sat scrolled on the playing row, "jumps 3
         times"; unreproducible headless). The tell: snapFontCSS
         fetches the Google stylesheet + every font file — instant
         failure in the headless harness, hundreds of ms on his
         machine — and it used to run AFTER the scroll-zero +
         transform surgery, leaving the live DOM mutated across a
         long async window where any stray repaint/scroll corrupts
         what the walk later clones. Now every await happens BEFORE
         the surgery; the pin + scroll compensation run last, and
         toCanvas starts on the very next line. One short mutation
         window ≈ one visible repaint. */
      const vw = pv.contentWindow.innerWidth, vh = pv.contentWindow.innerHeight;
      const bg = getComputedStyle(doc.body).backgroundColor;
      /* THE "[object Event]" AUTOPSY (2026-08-26, his Porch capture).
         When html-to-image can't fetch an image (external artwork —
         Spotify/Deezer covers are CORS-walled), its catch stores
         `options.imagePlaceholder || ''` in a MODULE-LEVEL cache, so
         without a placeholder the clone gets `<img src="">` — which
         resolves to the page URL inside the assembled SVG and fails
         the WHOLE SVG image load: createImage rejects with the raw
         error Event. And because the '' is cached, any later retry
         inherits the poison. So the placeholder rides on the FIRST
         pass: unfetchable art becomes one transparent pixel, the SVG
         stays loadable, one pass, one repaint. */
      const snapOpts = {
        width: vw, height: vh, canvasWidth: vw * 2, canvasHeight: vh * 2,
        fontEmbedCSS: await snapFontCSS(doc),
        imagePlaceholder: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#0d0f12" };
      /* NO TRANSITIONS DURING THE SNAP (2026-08-26 — THE collage bug,
         caught by a per-frame trace: `.tile` has `transition:
         … transform .06s` (the press dip), so the scroll-compensation
         translate ANIMATED toward -scrollTop over ~100ms while the
         clone walk read each tile's computed transform mid-flight —
         early-cloned tiles nearly unshifted, later ones fuller: his
         top-of-list collage, and the visible "jumps 3 times" was the
         slide down and back. The old code's slow font fetch happened
         to let the transition settle, which is why it ever worked.
         One injected rule makes every mutation instant — the capture
         is deterministic and the live preview never visibly moves. */
      killAnim = doc.createElement("style");
      killAnim.textContent =
        "*,*::before,*::after{transition:none!important;animation:none!important;}";
      doc.head.appendChild(killAnim);
      for (const el of doc.querySelectorAll(
        "#banner, #grid, #grid > *, #grid .secgrid > *")) {
        const r = el.getBoundingClientRect();
        pinned.push([el, el.style.cssText]);
        el.style.height = r.height + "px";
        el.style.minHeight = r.height + "px";
        el.style.maxHeight = r.height + "px";
        el.style.boxSizing = "border-box";
      }
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
      let screenCv;
      try {
        screenCv = await toCanvas(doc.documentElement, snapOpts);
      } catch (e1) {
        /* backstop for the FONT flavor of the same failure: retry
           once with fonts skipped — a degraded capture that says so
           beats a dead button. */
        screenCv = await toCanvas(doc.documentElement, Object.assign({}, snapOpts, {
          fontEmbedCSS: undefined, skipFonts: true }));
        degraded = true;
      }
      if (!screenCv || !screenCv.width || !screenCv.height)
        throw new Error("the capture came back empty (0×0) — is the preview visible?");
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
      setStatus("screenshot saved" +
        (degraded ? " — some fonts/artwork couldn't be captured and were skipped"
          : (skin?.image ? " (transparent outside the device)" : "")), "ok");
    } catch (e) {
      /* never "[object Event]" again: an Event carries WHAT failed —
         name the resource so the report diagnoses itself */
      const t = e?.target;
      const why = e?.message ? e.message
        : (t && (t.src || t.href)) ? "could not load " + String(t.src || t.href).slice(0, 100)
        : (e && e.type) ? "a resource failed to load during capture (" + e.type + " event)"
        : String(e);
      setStatus("screenshot failed: " + why, "err");
    }
    undoScroll.forEach((f) => f());          /* spy still detached: no false release */
    pinned.forEach(([el, css]) => (el.style.cssText = css));
    /* transitions come back only AFTER the restores above, so the
       un-shift is as instant and invisible as the shift was */
    if (killAnim) killAnim.remove();
    if (gridEl) gridEl.onscroll = heldSpy;
    if (fwin) {
      for (const k of Object.keys(frozen)) fwin[k] = frozen[k];
      try { fwin.renderStates(); } catch {}   /* catch up on held diffs */
    }
    snapping = false;
  }
  function softPress(btn) {
    const hk = holdKeyFor(btn);
    if (holdLatch && hk) { sendKey(hk); holdLatch = false; return; }
    const k = keyFor(btn);
    if (k) sendKey(k);
  }

  /* ---- in-place layout editing (the ✎) ---- */
  function ensureLayout() {
    if (!app.draft.remotes) app.draft.remotes = {};
    if (!app.draft.remotes[app.device])
      app.draft.remotes[app.device] = { capabilities: ["touch", "pointer"] };
    const p = app.draft.remotes[app.device];
    if (!p.soft_layout) p.soft_layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    return p.soft_layout;
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

  /* THE CONTEXT the two remote faces receive — getters over the
     shared $deriveds/$state plus the verbs both need. */
  const pv = {
    get skin() { return skin; },
    get layout() { return layout; },
    get plainVp() { return plainVp; },
    get holdLatch() { return holdLatch; },
    get anyHoldable() { return anyHoldable; },
    toggleHold: () => (holdLatch = !holdLatch),
    keyFor, holdKeyFor, softPress, keyTitle, washed, holdWashed,
    ensureLayout,
    setIframe: (el) => (iframe = el),
  };
</script>

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
    <SkinPreview {pv} bind:mapping />
  {:else}
    <SoftRemote {pv} bind:editing />
  {/if}

  <datalist id="softbtns">
    {#each Object.keys(BTN_DEFS) as bk (bk)}<option value={bk}></option>{/each}
  </datalist>
  <div class="mt-2 flex items-center gap-1.5 px-3.5 text-center text-[11px] text-dim">
    <span>Soft remote sends the '{app.device}' profile's real keys.</span>
    <span class="text-[10px] text-faint" title="Studio build — if a fix seems missing, hard-refresh (Ctrl+Shift+R): HA caches studio.html">s{STUDIO_V}</span>
    <button id="washTgl" onclick={toggleWash}
      title="Wash keys that do something on the current page (hold variants glow stronger)"
      class={"cursor-pointer border-0 bg-transparent p-0 text-[11px] hover:underline " +
        (washOn ? "text-accent" : "text-dim")}>{washOn ? "washes on" : "washes off"}</button>
    {#if skin}
      {#if !mapping}
        <button id="skinMap" onclick={() => (mapping = true)}
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
