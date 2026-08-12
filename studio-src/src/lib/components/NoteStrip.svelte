<script>
  /* Note strip (handoff spec): warm note surface, round "i", one
     sentence, optional right action. Used for teach strips (pass
     `dismissKey` to persist dismissal per editor in this browser),
     shared-controller warnings, and shadowing-CSS notices. */
  let { tone = "i", dismissKey = "", class: cls = "", children, action } = $props();
  let dismissed = $state(dismissKey
    ? localStorage.getItem("hakr_teach_" + dismissKey) === "1" : false);
  function dismiss() {
    dismissed = true;
    if (dismissKey) localStorage.setItem("hakr_teach_" + dismissKey, "1");
  }
</script>

{#if !dismissed}
  <div class={"flex items-center gap-2.5 rounded-[8px] border border-note-line bg-note-bg px-3.5 py-[11px] " + cls}>
    <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-accent-text text-[10px] font-semibold text-accent-text">{tone}</span>
    <span class="min-w-0 flex-1 text-xs leading-[1.45] text-ink-2">{@render children?.()}</span>
    {#if action}{@render action()}{/if}
    {#if dismissKey}
      <button class="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-ink"
        aria-label="Dismiss" title="Dismiss" onclick={dismiss}>✕</button>
    {/if}
  </div>
{/if}
