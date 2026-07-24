<script>
  import { app, slices, selectSlice, addView } from "./state.svelte.js";
  /* four fixed groups: VIEWS / CONTROLLERS / MODEL / SYSTEM
     (Suresh's sidebar); ⌞ items nest under the one above */
  const groups = $derived.by(() => {
    const out = [];
    let cur = null;
    for (const s of slices()) {
      if (!cur || cur.name !== s.group) out.push((cur = { name: s.group, items: [] }));
      cur.items.push(s);
    }
    return out;
  });
</script>

<nav id="nav" class="w-[190px] shrink-0 overflow-y-auto border-r border-line px-2 py-2.5">
  {#each groups as g (g.name)}
    {#if g.name === "Model"}<div class="mt-3 border-t border-line"></div>{/if}
    <div class="px-2 pt-2.5 pb-1 text-[11px] font-bold tracking-[.07em] text-dim uppercase">{g.name}</div>
    {#each g.items as s (s.key)}
      {#if s.subhead}
        <div class="px-2 pt-2 pb-0.5 pl-3 text-[10px] font-bold tracking-[.08em] text-dim/70 uppercase">{s.subhead}</div>
      {:else}
      <button
        class={"item block w-full cursor-pointer truncate rounded-[8px] border-0 bg-transparent py-2 text-left font-[inherit] text-sm " +
          (s.deep ? "pr-2.5 pl-7 " : "px-2.5 ") +
          (s.key === app.selKey ? "bg-tile-hi font-semibold text-accent" : "text-ink hover:bg-tile")}
        onclick={() => selectSlice(s.key)}
      >{#if s.deep}<span class="text-dim">⌞ </span>{/if}{s.label} <small class="font-normal text-dim">· {s.sub}</small></button>
      {/if}
    {/each}
    {#if g.name === "Views"}
      <button
        class="block w-full cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2.5 py-1.5 text-left font-[inherit] text-xs text-dim hover:border-accent/60 hover:text-accent"
        title="Create a free-standing view — add an activity to make it a place where things run"
        onclick={addView}>＋ Add view</button>
    {/if}
  {/each}
</nav>
