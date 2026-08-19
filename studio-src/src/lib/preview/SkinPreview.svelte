<script>
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
  import UploadBtn from "../components/UploadBtn.svelte";

  /* `pv` is PreviewPane's context (skin, wash + key brains, hold
     latch, iframe hand-off); `mapping` is the parent's — the footer's
     ✎ turns it on, Done here turns it off. */
  let { pv, mapping = $bindable() } = $props();
  const skin = $derived(pv.skin);
  const holdLatch = $derived(pv.holdLatch);
  const anyHoldable = $derived(pv.anyHoldable);
  const { keyFor, holdKeyFor, softPress, keyTitle, washed, holdWashed,
    toggleHold, setIframe } = pv;

  /* the engine iframe is OURS while the skin shows — hand it up so
     the pane's ↻ button and bindPreview keep working */
  let pvEl = $state(null);
  $effect(() => { if (pvEl) setIframe(pvEl); });
  /* leaving ✎ (from either door) clears the selection */
  $effect(() => { if (!mapping) { selHot = -1; selScreen = false; } });

  /* ---- ✎ MAP KEYS: drag a rect over a physical key, name it; click
     an existing hotspot to rename/delete; drag its body to move.
     Percentages are written live into the draft. ---- */
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
  /* THE STRETCH, ROUND 2 (v0.83.8 — it recurred ON s0.83.26): the
     live width fixed X, but Y was still COMPUTED — rendered photo
     height inferred from imgW × the natural aspect, where imgNat is
     yet another input that can be stale (cached-image onload timing,
     a swapped asset). Any skew between computed and rendered = an
     oval. So stop inferring: measure the CLIP BOX ITSELF — the exact
     rectangle the engine must fill — and scale each axis to it. The
     transform can no longer disagree with the layout it lives in,
     whatever produced that layout. Fallbacks keep first paint sane
     until the observer delivers real numbers. */
  let clipW = $state(0);
  let clipH = $state(0);
  /* if the two axes' scales ever part ways by >2% again, say so out
     loud with every input — the P1 #9 capture protocol, automated.
     v0.83.8 round 2 ("Still oval. No warnings in log"): a console
     line is too easy to lose behind HA's own iframe soup, so the
     skew now also renders as a RED STRIP right under the photo —
     if the oval is the transform, the strip appears with the
     guilty numbers; an oval WITHOUT the strip means the transform
     is uniform and the squish comes from somewhere upstream
     (a stale studio.html being the classic — check the s-stamp). */
  const pvSkew = $derived.by(() => {
    if (!skin || !clipW || !clipH) return 0;
    const sx = clipW / (skin.viewport?.w || 320);
    const sy = clipH / (skin.viewport?.h || 533.33);
    return sx / sy - 1;
  });
  /* AND the ground truth: the iframe's RENDERED box (post-transform,
     straight from getBoundingClientRect, once a second). Whatever
     input lied — bindings, imgNat, layout, zoom — an oval can only
     exist if this box's aspect ≠ the viewport's. If drawnSkew is
     clean while the play button is visibly oval, the stretch is not
     in the Studio's transform at all. */
  let drawnSkew = $state(0);
  $effect(() => {
    if (!skin) { drawnSkew = 0; return; }
    const vw = skin.viewport?.w || 320, vh = skin.viewport?.h || 533.33;
    const t = setInterval(() => {
      const pv = document.getElementById("pv");
      if (!pv) return;
      const r = pv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      drawnSkew = (r.width / vw) / (r.height / vh) - 1;
    }, 1000);
    return () => clearInterval(t);
  });
  $effect(() => {
    if (!skin || !clipW || !clipH) return;
    if (Math.abs(pvSkew) > 0.02)
      console.warn("[harmonium studio] preview scale anamorphic:",
        JSON.stringify({ skew: +pvSkew.toFixed(4),
          clipW, clipH, imgW, imgNat: { ...imgNat },
          rect: { ...skin.screen }, viewport: { ...(skin.viewport || {}) } }));
  });
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
</script>

<svelte:window onkeydown={mapKeydown} />

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
      <!-- SCALE TO THE MEASURED CLIP (v0.83.8 — the oval came back on
           s0.83.26): both axes now scale to the clip box's OWN
           rendered size (bind:clientWidth/Height), so the engine
           always fills exactly the rectangle the browser actually
           laid out — no more inferring Y from natural aspect. The
           formula fallbacks only carry the first frame. -->
      <div class="absolute z-0 overflow-hidden"
        bind:clientWidth={clipW} bind:clientHeight={clipH}
        onscroll={(e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; }}
        style="background:#000; left:calc({skin.screen.x}% - 1px); top:calc({skin.screen.y}% - 1px); width:calc({skin.screen.w}% + 2px); height:calc({skin.screen.h}% + 2px)">
        <iframe id="pv" bind:this={pvEl} title="Live preview"
          src="/local/harmonium/index.html#preview=1"
          class="border-0 bg-bg"
          style="width:{skin.viewport?.w || 320}px; height:{skin.viewport?.h || 533.33}px; transform:scale({(clipW || (skin.screen.w / 100 * (imgW || 340) + 2)) / (skin.viewport?.w || 320)}, {(clipH || (skin.screen.h / 100 * (imgW || 340) * (imgNat.h / imgNat.w) + 2)) / (skin.viewport?.h || 533.33)}); transform-origin:0 0"></iframe>
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
    {#if Math.abs(pvSkew) > 0.02 || Math.abs(drawnSkew) > 0.02}
      <!-- THE SKEW STRIP (v0.83.8 — P1 #9): the engine is being
           scaled differently per axis. These numbers ARE the bug
           report — photograph this strip. drawn = the iframe's
           real on-screen box; clip = what the bindings measured. -->
      <div id="pvSkew" class="mt-1.5 w-[340px] rounded-[6px] border border-danger px-2 py-1 font-mono text-[10px] leading-[1.5] text-danger">
        ⚠ preview skew — drawn {(drawnSkew * 100).toFixed(1)}% ·
        bound {(pvSkew * 100).toFixed(1)}% ·
        clip {clipW}×{clipH} · vp {skin.viewport?.w || 320}×{skin.viewport?.h || 533.33} ·
        img w{imgW} nat {imgNat.w}×{imgNat.h} ·
        rect {skin.screen.w}%×{skin.screen.h}%
      </div>
    {/if}
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
        <!-- v0.83.8 (beta-gaps P1 #7): swap the device photo without
             touching the filesystem — uploads to www/harmonium/skins/
             and points this skin at it -->
        <UploadBtn kind="skin" label="photo…"
          onDone={(p) => { if (skin) skin.image = p; }} />
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
      <button id="softHold" onclick={toggleHold}
        title="Hold modifier — latch, then press a washed key to send its HOLD variant"
        class={"mt-2 flex h-9 w-[208px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border-0 font-[inherit] text-[12px] font-bold tracking-[.06em] select-none " +
          (holdLatch ? "bg-accent text-accent-ink" : "bg-tile-hi text-dim hover:text-ink")}>
        ✚ HOLD{holdLatch ? " — pick a key" : ""}</button>
    {/if}
