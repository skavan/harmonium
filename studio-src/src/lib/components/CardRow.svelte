<script>
  /* Collapsible row card for list items (tiles, activities, conditions) —
     the harmonia device/activity card chrome: title row with reorder /
     duplicate / delete, body folds open.
     Redesign §7.1/7.2 additions (all optional props — old callers are
     untouched): ⠿ drag handle (hover-revealed; arms the PARENT's
     draggable via onarm), ● Edited chip when `edited`, and a ··· menu
     for worded actions (Move to …, Remove). */
  let {
    title = "",
    subtitle = "",
    open = $bindable(false),
    accent = "",
    edited = false,
    onup = null, ondown = null, onduplicate = null, ondelete = null,
    onarm = null,               /* mousedown on ⠿ — parent sets draggable */
    menu = null,                /* [{label, danger, divider, action}] */
    children,
  } = $props();
  let menuOpen = $state(false);
  /* FIXED, NOT ABSOLUTE (v0.79.2 — Suresh: "Dropdown gets clipped"):
     this card and the section card above it are both overflow-hidden
     (rounded corners), so an absolute menu was cut off at the card
     edge — worse the longer the menu grew (Save as snippet tipped
     it). The menu now escapes via position:fixed, anchored to the ···
     button's rect (the ActivityCard castRect pattern); any scroll or
     resize closes it rather than chasing the anchor. */
  let menuRect = $state(null);
  let menuUp = $state(false);   /* near the viewport bottom → open UP */
  function toggleMenu(e) {
    if (menuOpen) { menuOpen = false; return; }
    menuRect = e.currentTarget.getBoundingClientRect();
    const estH = (menu?.length || 0) * 34 + 12;
    menuUp = menuRect.bottom + 4 + estH > window.innerHeight;
    menuOpen = true;
  }
</script>

<svelte:window onclick={(e) => { if (menuOpen && !e.target.closest(".rowmenu")) menuOpen = false; }}
  onscrollcapture={() => (menuOpen = false)}
  onresize={() => (menuOpen = false)} />

<div class="group/row overflow-hidden rounded-[12px] border border-line ui-row-card">
  <div class="flex items-center gap-2 px-3 py-2">
    {#if onarm}
      <span class="-ml-1 shrink-0 cursor-grab text-[13px] text-faint opacity-0 transition-opacity select-none group-hover/row:opacity-100"
        title="Drag to reorder"
        onmousedown={onarm} role="button" tabindex="-1">⠿</span>
    {/if}
    <button
      class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-[inherit] text-ink"
      onclick={() => (open = !open)}
    >
      <span class="text-[10px] text-dim">{open ? "▼" : "▶"}</span>
      {#if accent}<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{accent}"></span>{/if}
      <span class="truncate font-semibold">{title}</span>
      {#if subtitle}<span class="truncate text-xs text-dim">{subtitle}</span>{/if}
      {#if edited}
        <span class="shrink-0 rounded-[4px] border border-ok/40 px-[5px] py-[2px] text-[9px] font-medium tracking-[.05em] text-ok uppercase"
          title="Differs from the last saved copy — Save & Deploy clears it">● Edited</span>
      {/if}
    </button>
    <span class="flex shrink-0 items-center gap-0.5 text-dim">
      {#if onup}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-ink" title="Move up" onclick={onup}>↑</button>{/if}
      {#if ondown}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-ink" title="Move down" onclick={ondown}>↓</button>{/if}
      {#if onduplicate}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-ink" title="Duplicate" onclick={onduplicate}>⧉</button>{/if}
      {#if ondelete}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-danger" title="Delete" onclick={ondelete}>✕</button>{/if}
      {#if menu?.length}
        <span class="rowmenu relative">
          <button class="cursor-pointer border-0 bg-transparent p-1 hover:text-ink" title="More actions"
            onclick={toggleMenu}>···</button>
          {#if menuOpen && menuRect}
            <div class="fixed z-50 w-[212px] rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]"
              style={menuUp
                ? "bottom:" + (window.innerHeight - menuRect.top + 4) + "px; left:" + Math.max(8, menuRect.right - 212) + "px"
                : "top:" + (menuRect.bottom + 4) + "px; left:" + Math.max(8, menuRect.right - 212) + "px"}>
              {#each menu as m, mi (mi)}
                {#if m.divider}
                  <div class="mx-1.5 my-1 h-px bg-line"></div>
                {:else}
                  <button class={"block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[9px] text-left font-[inherit] text-xs font-medium hover:bg-sunk " +
                      (m.danger ? "text-danger" : "text-ink")}
                    onclick={() => { menuOpen = false; m.action?.(); }}>{m.label}</button>
                {/if}
              {/each}
            </div>
          {/if}
        </span>
      {/if}
    </span>
  </div>
  {#if open}
    <div class="ui-row-body border-t border-line px-3 py-3">{@render children?.()}</div>
  {/if}
</div>
