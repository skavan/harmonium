<script>
  /* Blessed-section CARD (handoff §6.3 + Suresh v0.43.6/7): the
     washed title bar and the section's CONTENT live in one bordered
     card — settings strip and rows render inside the accordion body,
     so the fold closes the whole thing. [switch] Title (count)
     ───rule─── grid summary · [Section settings] [＋ Add …] [▾].
     The switch writes section.enabled (off keeps items, stops
     rendering on the remote — off ≠ empty). The FOLD is editor-only
     UI state, never written to config. data-sec sits on the card so
     the test suite's selectors keep working. */
  let { title, count = 0, enabled = true, onToggle = null,
    gridSummary = "", settingsOpen = $bindable(false),
    addLabel = "", onAdd = null, add2Label = "", onAdd2 = null,
    collapsed = $bindable(undefined), children } = $props();
  const bodyShown = $derived(!!children && collapsed !== true);
</script>

<div class="overflow-hidden rounded-[12px] border border-line bg-tile" data-sec={title}>
  <div class={"flex items-center gap-2.5 bg-raised px-3.5 py-2 " + (bodyShown ? "border-b border-line" : "")}>
    {#if onToggle}
      <button role="switch" aria-checked={enabled} title={enabled
          ? title + " renders on the remote — switch off to hide it (items are kept)"
          : title + " is switched off — items are kept but don't render"}
        class={"relative h-[19px] w-[32px] shrink-0 cursor-pointer rounded-full border-0 transition-colors " +
          (enabled ? "bg-accent" : "bg-line-strong")}
        onclick={onToggle}>
        <span class={"absolute top-[2px] h-[15px] w-[15px] rounded-full bg-surface transition-all " +
          (enabled ? "left-[15px]" : "left-[2px]")}></span>
      </button>
    {/if}
    <span class="shrink-0 text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</span>
    <span class="shrink-0 rounded-full bg-sunk px-2 py-[3px] text-[11px] font-medium text-dim">{count}</span>
    <span class="h-px min-w-4 flex-1 bg-line"></span>
    {#if gridSummary}<span class="shrink-0 text-[11px] text-dim">{gridSummary}</span>{/if}
    <button class={"shrink-0 cursor-pointer rounded-[6px] border px-2.5 py-[7px] text-[11px] font-medium transition-colors " +
        (settingsOpen ? "border-accent/60 bg-accent-wash text-accent-text"
          : "border-line-strong bg-surface text-ink-2 hover:bg-sunk")}
      onclick={() => (settingsOpen = !settingsOpen)}>Section settings</button>
    {#if onAdd2 && add2Label}
      <button class="shrink-0 cursor-pointer rounded-[6px] border border-line-strong bg-surface px-2.5 py-[7px] text-[11px] font-medium text-ink-2 hover:bg-sunk"
        onclick={onAdd2}>{add2Label}</button>
    {/if}
    {#if onAdd && addLabel}
      <button class="shrink-0 cursor-pointer rounded-[6px] border-0 bg-accent px-3 py-[8px] text-[11px] font-semibold text-accent-ink hover:brightness-95"
        onclick={onAdd}>{addLabel}</button>
    {/if}
    {#if collapsed !== undefined}
      <button class="shrink-0 cursor-pointer rounded-[6px] border-0 bg-transparent px-1.5 py-1 text-[12px] text-dim hover:bg-sunk hover:text-ink"
        aria-label={collapsed ? "Expand " + title : "Collapse " + title}
        title={collapsed ? "Expand this section (editor only — the remote is untouched)" : "Collapse this section (editor only)"}
        onclick={() => (collapsed = !collapsed)}>
        <span class={"inline-block transition-transform " + (collapsed ? "-rotate-90" : "")}>▾</span>
      </button>
    {/if}
  </div>
  {#if bodyShown}
    <div class="space-y-3 ui-sec-body px-3.5 py-3">{@render children?.()}</div>
  {/if}
</div>
