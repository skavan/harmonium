<script>
  /* Inheritance source chip (handoff spec): FROM THEME / FROM PAGE /
     FROM SECTION (glass, bordered, dim) or SET HERE (accent wash) with
     a Reset link. v1 SUBSET: only rendered for knobs the engine truly
     inherits — the full Theme→Workspace→Page→Section→Item cascade is a
     later engine batch. */
  let { source = "", onreset = null } = $props();
  const set = $derived(source === "here");
</script>

<span class="inline-flex items-center gap-1.5">
  <span class={"rounded-[4px] px-[5px] py-[2px] text-[9px] font-medium tracking-[.05em] uppercase " +
    (set ? "bg-accent-wash text-accent-text" : "border border-line bg-glass text-dim")}>
    {set ? "Set here" : "From " + source}
  </span>
  {#if set && onreset}
    <button class="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-accent-text hover:underline"
      onclick={onreset}>Reset</button>
  {/if}
</span>
