<script>
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
  import { defFor } from "./lib.js";

  import { app } from "../state.svelte.js";

  let { pv, editing = $bindable() } = $props();
  const layout = $derived(pv.layout);
  const plainVp = $derived(pv.plainVp);
  const holdLatch = $derived(pv.holdLatch);
  const anyHoldable = $derived(pv.anyHoldable);
  const { keyFor, holdKeyFor, softPress, keyTitle, washed, holdWashed,
    toggleHold, ensureLayout, setIframe } = pv;

  let pvEl = $state(null);
  $effect(() => { if (pvEl) setIframe(pvEl); });

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
</script>

  <div class="shrink-0 rounded-[22px] bg-black p-1 shadow-[0_0_0_2px_#2c333d,0_12px_40px_rgba(0,0,0,.5)]">
    <iframe id="pv" bind:this={pvEl} title="Live preview"
      src="/local/harmonium/index.html#preview=1"
      class="rounded-[18px] border-0 bg-bg"
      style="width:{plainVp.w}px; height:{plainVp.h}px"></iframe>
  </div>

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
        <button id="softHold" onclick={toggleHold}
          title="Hold modifier — latch, then press a washed key to send its HOLD variant"
          class={"mt-2 flex h-9 w-[208px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border-0 font-[inherit] text-[12px] font-bold tracking-[.06em] select-none " +
            (holdLatch ? "bg-accent text-accent-ink" : "bg-tile-hi text-dim hover:text-ink")}>
          ✚ HOLD{holdLatch ? " — pick a key" : ""}</button>
      {/if}
    {/if}
  </div>
