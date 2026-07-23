<script>
  /* Accordion section: uppercase header + chevron, body folds. */
  let { label, badge = "", open = $bindable(false), children } = $props();
</script>

<div class="border-t border-line pt-3">
  <button
    class="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
    onclick={() => (open = !open)}
  >
    <span class="text-[10px] text-dim">{open ? "▼" : "▶"}</span>
    <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">{label}</span>
    {#if badge}<span class="text-xs text-dim">{badge}</span>{/if}
  </button>
  {#if open}
    <div class="mt-3 space-y-3">{@render children?.()}</div>
  {/if}
</div>
