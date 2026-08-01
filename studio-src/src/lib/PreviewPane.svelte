<script>
  import { app, bindPreview, pushPreview, sendKey } from "./state.svelte.js";
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
  /* reverse keymap: logical button → the raw key this profile emits */
  const kmap = $derived(profile?.keymap || app.draft?.keymap || {});
  const keyFor = (btn) =>
    Object.keys(kmap).find((k) => kmap[k] === btn) || null;
  const holdKeyFor = (btn) =>
    Object.keys(kmap).find((k) => kmap[k] === btn + "_hold") || null;
  const anyHoldable = $derived(layout.flat().some((b) => b && holdKeyFor(b)));

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
  {#if newOpen}
    <div class="mb-2.5 flex items-center gap-1.5">
      <input id="devNewId" bind:value={newId} placeholder="remote id (e.g. rs90)"
        onkeydown={(e) => { if (e.key === "Enter") mintProfile(); }}
        class="h-8 w-[150px] rounded-[6px] border border-line bg-field px-2 font-[inherit] text-[12px] text-ink outline-none" />
      <button id="devNewAdd" onclick={mintProfile}
        class="cursor-pointer rounded-[6px] border-0 bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-ink">Add</button>
    </div>
  {/if}

  <div class="shrink-0 rounded-[22px] bg-black p-1 shadow-[0_0_0_2px_#2c333d,0_12px_40px_rgba(0,0,0,.5)]">
    <iframe id="pv" bind:this={iframe} title="Live preview"
      src="/local/harmonium/index.html#preview=1"
      class="h-[537px] w-[320px] rounded-[18px] border-0 bg-bg"></iframe>
  </div>

  <datalist id="softbtns">
    {#each Object.keys(BTN_DEFS) as bk (bk)}<option value={bk}></option>{/each}
  </datalist>

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
            <!-- latched + holdable → pale accent wash: the next press
                 sends the HOLD variant. Unmapped in this profile's
                 keymap → disabled (the soft remote never lies). -->
            <button data-k={keyFor(btn)} data-btn={btn} onclick={() => softPress(btn)}
              disabled={!keyFor(btn) && !holdKeyFor(btn)}
              title={keyFor(btn) ? "" : "No key in the '" + app.device + "' keymap emits " + btn}
              class={"flex h-11 cursor-pointer flex-col items-center justify-center rounded-[12px] border-0 p-0 font-[inherit] text-[13px] select-none active:bg-accent active:text-accent-ink disabled:cursor-default disabled:opacity-30 " +
                (holdLatch && holdKeyFor(btn) ? "bg-accent/25 text-ink" : "bg-tile-hi text-ink")}>
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
  <div class="mt-2 flex items-center gap-1.5 px-3.5 text-center text-[11px] text-dim">
    <span>Soft remote sends the '{app.device}' profile's real keys.</span>
    {#if !editing}
      <button id="softEdit" onclick={() => { ensureLayout(); editing = true; }}
        title="Edit this profile's button layout — mirror the physical remote"
        class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent hover:underline">✎ edit layout</button>
    {/if}
  </div>
</div>
