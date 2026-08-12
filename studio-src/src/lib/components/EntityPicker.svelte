<script>
  /* Entity COMBOBOX: one free-text box that searches as you type.
     The dropdown filters compatible entities (by id AND friendly name),
     with "This activity's devices" pinned on top when the caller passes
     a preferred list. Anything typed that isn't in the registry is kept
     verbatim — that IS the custom / $context.* escape hatch, no mode
     switch needed. Works bound (bind:value) or callback-style
     (value + oninput), like a native input. */
  import { entitiesFor } from "../state.svelte.js";
  let {
    value = $bindable(),
    domains = null,
    preferred = [],
    placeholder = "entity_id — type to search",
    oninput = null,
    onchange = null,
    ...rest
  } = $props();
  const list = $derived(entitiesFor(domains));

  let open = $state(false);
  let typed = $state(false); /* typing filters; plain focus shows all */
  let hi = $state(0);
  let inputEl = $state(null);
  let dropEl = $state(null);
  let rect = $state(null);   /* FIXED-positioned dropdown: measured from
                                the input so no ancestor can clip it */
  let vAtFocus = "";
  const place = () => { rect = inputEl?.getBoundingClientRect() || null; };
  function onAnyScroll() {
    /* the dropdown is FIXED-positioned: on any scroll, re-glue it to
       the input (closing here would race the browser's own
       focus-scroll and kill the dropdown at birth) */
    if (open) place();
  }

  const q = $derived(open && typed ? (value || "").toLowerCase() : "");
  const hit = (e) =>
    !q ||
    e.entity_id.toLowerCase().includes(q) ||
    (e.name || "").toLowerCase().includes(q);
  const domOk = (id) => !domains || domains.includes(id.split(".")[0]);
  const prefRows = $derived(
    preferred
      .filter(domOk)
      .map((id) => list.find((x) => x.entity_id === id) || { entity_id: id, name: "" })
      .filter(hit),
  );
  /* domain CHIPS: when the caller doesn't constrain domains, offer
     one-tap narrowing (media_player · remote · light …) ordered by
     how many entities each domain has */
  let domFilter = $state(null);
  /* the CONTROL domains are always offered (remote included — Suresh);
     the rest ride in by entity count */
  const CORE_DOMS = ["media_player", "remote", "light", "switch", "climate", "cover", "fan"];
  const domChips = $derived.by(() => {
    if (domains) return [];
    const counts = {};
    for (const e of list) {
      const dom = e.entity_id.split(".")[0];
      counts[dom] = (counts[dom] || 0) + 1;
    }
    const byCount = Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([dom]) => dom);
    return [...new Set([...CORE_DOMS.filter((d) => counts[d]), ...byCount])].slice(0, 12);
  });
  const CAP = 120;
  const restAll = $derived(
    list
      .filter((x) => !preferred.includes(x.entity_id))
      .filter((x) => !domFilter || x.entity_id.split(".")[0] === domFilter)
      .filter(hit),
  );
  const restRows = $derived(restAll.slice(0, CAP));
  const flat = $derived([...prefRows, ...restRows]);

  function pick(id) {
    value = id;
    oninput?.({ target: { value: id } });
    open = false;
    typed = false;
    inputEl?.blur(); /* blur handler fires onchange once, if changed */
  }
  function handleInput(e) {
    value = e.target.value;
    typed = true;
    if (!open) place();
    open = true;
    hi = 0;
    oninput?.(e);
  }
  function handleFocus() {
    vAtFocus = value ?? "";
    place();
    open = true;
    typed = false;
    hi = 0;
  }
  function handleBlur() {
    open = false;
    typed = false;
    domFilter = null;
    if ((value ?? "") !== vAtFocus) onchange?.({ target: { value } });
  }
  function handleKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) open = true;
      else hi = Math.min(hi + 1, flat.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      hi = Math.max(hi - 1, 0);
    } else if (e.key === "Enter") {
      if (open && flat.length) { e.preventDefault(); pick(flat[Math.min(hi, flat.length - 1)].entity_id); }
      else inputEl?.blur();
    } else if (e.key === "Escape") {
      open = false;
      typed = false;
    }
  }
</script>

{#snippet row(e, i)}
  <button
    type="button"
    class={"block w-full cursor-pointer border-0 bg-transparent px-2 py-1 text-left " +
      (i === hi ? "bg-accent/20" : "hover:bg-accent/10")}
    onmousedown={(ev) => { ev.preventDefault(); pick(e.entity_id); }}
    onmouseenter={() => (hi = i)}
  >
    <span class="font-mono text-[11.5px] text-ink">{e.entity_id}</span>
    {#if e.name && e.name !== e.entity_id}
      <span class="ml-1.5 text-[10.5px] text-dim">{e.name}</span>
    {/if}
  </button>
{/snippet}

<svelte:window onscrollcapture={onAnyScroll} onresize={onAnyScroll} />

<div class="relative w-full min-w-0">
  <input
    bind:this={inputEl}
    value={value ?? ""}
    {placeholder}
    spellcheck="false"
    autocomplete="off"
    oninput={handleInput}
    onfocus={handleFocus}
    onblur={handleBlur}
    onkeydown={handleKey}
    class="w-full min-w-0 rounded-[8px] border border-line bg-field px-2.5 py-1.5 pr-6 font-mono text-[12.5px] text-ink outline-none placeholder:text-dim/60 focus:border-accent/60"
    {...rest}
  />
  <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-dim">▾</span>
  {#if open && (flat.length || domFilter)}
    <div bind:this={dropEl}
      style={rect ? `position:fixed; left:${rect.left}px; top:${Math.min(rect.bottom + 4, window.innerHeight - 270)}px; width:${rect.width}px;` : ""}
      class="z-50 max-h-64 overflow-y-auto rounded-[8px] border border-line bg-tile-hi py-1 shadow-lg">
      {#if domChips.length > 1}
        <div class="flex flex-wrap gap-1 border-b border-line px-2 pt-0.5 pb-1.5">
          {#each domChips as dom (dom)}
            <button
              type="button"
              class={"cursor-pointer rounded-full border px-1.5 py-px text-[10px] " +
                (domFilter === dom
                  ? "border-accent bg-accent font-bold text-accent-ink"
                  : "border-line bg-transparent text-dim hover:border-accent/60 hover:text-ink")}
              onmousedown={(ev) => { ev.preventDefault(); domFilter = domFilter === dom ? null : dom; hi = 0; }}
            >{dom}</button>
          {/each}
        </div>
      {/if}
      {#if prefRows.length}
        <div class="px-2 pt-1 pb-0.5 text-[9.5px] font-bold tracking-[.08em] text-accent uppercase">This activity's devices</div>
        {#each prefRows as e, i (e.entity_id)}{@render row(e, i)}{/each}
        {#if restRows.length}
          <div class="mt-0.5 border-t border-line px-2 pt-1 pb-0.5 text-[9.5px] font-bold tracking-[.08em] text-dim uppercase">All entities</div>
        {/if}
      {/if}
      {#each restRows as e, i (e.entity_id)}{@render row(e, prefRows.length + i)}{/each}
      {#if restAll.length > CAP}
        <div class="px-2 py-1 text-[10.5px] text-dim italic">…{restAll.length - CAP} more — keep typing to narrow</div>
      {/if}
    </div>
  {/if}
</div>
