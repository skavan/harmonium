<script>
  /* Collapsible row card for list items (tiles, activities, conditions) —
     the harmonia device/activity card chrome: title row with reorder /
     duplicate / delete, body folds open. */
  let {
    title = "",
    subtitle = "",
    open = $bindable(false),
    accent = "",
    onup = null, ondown = null, onduplicate = null, ondelete = null,
    children,
  } = $props();
</script>

<div class="overflow-hidden rounded-[12px] border border-line bg-tile">
  <div class="flex items-center gap-2 px-3 py-2">
    <button
      class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-[inherit] text-ink"
      onclick={() => (open = !open)}
    >
      <span class="text-[10px] text-dim">{open ? "▼" : "▶"}</span>
      {#if accent}<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{accent}"></span>{/if}
      <span class="truncate font-semibold">{title}</span>
      {#if subtitle}<span class="truncate text-xs text-dim">{subtitle}</span>{/if}
    </button>
    <span class="flex shrink-0 items-center gap-0.5 text-dim">
      {#if onup}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-ink" title="Move up" onclick={onup}>↑</button>{/if}
      {#if ondown}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-ink" title="Move down" onclick={ondown}>↓</button>{/if}
      {#if onduplicate}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-ink" title="Duplicate" onclick={onduplicate}>⧉</button>{/if}
      {#if ondelete}<button class="cursor-pointer border-0 bg-transparent p-1 hover:text-danger" title="Delete" onclick={ondelete}>✕</button>{/if}
    </span>
  </div>
  {#if open}
    <div class="border-t border-line bg-inset px-3 py-3">{@render children?.()}</div>
  {/if}
</div>
