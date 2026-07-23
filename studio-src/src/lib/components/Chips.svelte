<script>
  /* Editable string-array as removable chips + an adder input.
     Used for pass_through keys, state "in" lists, screen_order, etc. */
  let { items = $bindable([]), suggestions = [], placeholder = "add…" } = $props();
  let text = $state("");
  const uid = "chips_" + Math.random().toString(36).slice(2, 8);
  function add() {
    const v = text.trim();
    if (v && !(items || []).includes(v)) items = [...(items || []), v];
    text = "";
  }
</script>

<div class="flex flex-wrap items-center gap-1.5">
  {#each items || [] as it, i (it)}
    <span class="inline-flex items-center gap-1 rounded-full bg-tile-hi px-2.5 py-1 text-xs">
      {it}
      <button
        class="cursor-pointer border-0 bg-transparent p-0 text-dim hover:text-danger"
        onclick={() => (items = items.filter((_, j) => j !== i))}
        title="Remove">✕</button>
    </span>
  {/each}
  <input
    bind:value={text}
    list={suggestions.length ? uid : undefined}
    {placeholder}
    onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
    onchange={add}
    class="w-28 rounded-[8px] border border-line bg-field px-2 py-1 text-xs text-ink outline-none placeholder:text-dim/60 focus:border-accent/60"
  />
  {#if suggestions.length}
    <datalist id={uid}>{#each suggestions as s (s)}<option value={s}></option>{/each}</datalist>
  {/if}
</div>
