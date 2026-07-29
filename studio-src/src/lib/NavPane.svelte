<script>
  import { app, slices, selectSlice, addView, toggleAdvanced } from "./state.svelte.js";
  /* Graphite Rails nav — GRACE PASS against the design-intent frame
     (Suresh's side-by-side): a wash that actually reads on the active
     row (accent-text label, filled token, rounded pill + inset bar),
     type a step larger everywhere, children INDENTED for real (deep
     guide, no token, no ambiguity), quiet stock condensed to the
     intent's own words ("+ 6 stock device pages"), and the
     DEFAULTS/CUSTOM subheads dropped — the badges already say it.
     Presentation only; slice keys and nav contracts unchanged. */
  let q = $state("");
  let searchEl = $state(null);
  let stockOpen = $state(false);

  const GROUP_LABEL = {
    Views: "① Pages", Controllers: "② Controllers",
    Model: "③ Building blocks", System: "④ System",
  };
  const TOKEN = { Views: "P", Controllers: "C", Model: "B", System: "S" };

  /* annotations read like the intent: one short fact, right-aligned */
  const subShow = (s) => {
    let t = s.sub || "";
    if (t.startsWith("view · ")) t = t.slice(7);
    if (s.key === "sequences") t = t.replace(" sequences", "");
    if (s.key === "activities") t = t.replace(" across rooms", "");
    if (s.key === "snippets") t = t === "0 saved blocks" ? "none yet" : t.replace(" saved blocks", " saved");
    if (s.key === "input") t = "tap/hold";
    if (s.key === "theme" || s.key === "devices") t = "";
    return t;
  };
  const isEdited = (s) => (s.sub || "").startsWith("copy of ");

  /* which stock controllers have a story (used by an activity, or
     carrying a nested library) — the rest condense */
  const usedCtrls = $derived.by(() => {
    const used = new Set();
    for (const a of Object.values(app.draft?.activities || {}))
      if (a.screen?.startsWith?.("controller:")) used.add(a.screen.slice(11));
    return used;
  });

  const groups = $derived.by(() => {
    const out = [];
    let cur = null;
    const raw = slices();
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (s.subhead) continue;   /* Defaults/Custom — the badges say it */
      if (q && !(s.label || "").toLowerCase().includes(q.toLowerCase())) continue;
      if (!cur || cur.name !== s.group) out.push((cur = { name: s.group, items: [] }));
      /* condense quiet stock: sub "stock", unused, no nested library */
      if (!q && !stockOpen && s.sub === "stock" &&
          !usedCtrls.has((s.key || "").slice(11)) &&
          !(raw[i + 1]?.deep)) {
        let quiet = cur.items.find((x) => x.condensed);
        if (!quiet) cur.items.push((quiet = { condensed: true, key: "_condensed", labels: [] }));
        quiet.labels.push(s.label);
        continue;
      }
      cur.items.push(s);
    }
    return out;
  });

  function onkeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchEl?.focus();
    }
  }
</script>

<svelte:window {onkeydown} />

<nav id="nav" class="flex w-[252px] shrink-0 flex-col border-r border-line">
  <div class="px-3 pt-3.5 pb-1">
    <div class="flex h-[38px] items-center gap-2 rounded-[9px] border border-line bg-field px-3 focus-within:border-accent">
      <input bind:this={searchEl} bind:value={q} placeholder="Search pages, controllers…"
        class="w-full min-w-0 border-0 bg-transparent font-[inherit] text-[13px] text-ink outline-none placeholder:text-faint" />
      <span class="shrink-0 rounded-[4px] border border-line px-1 py-px font-mono text-[9px] text-faint">⌘K</span>
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
  <!-- WORKSPACE MAP — the pinned landing row -->
  <button id="navMap"
    class={"relative mt-2 flex h-[40px] w-full cursor-pointer items-center gap-2.5 truncate rounded-[9px] border-0 bg-transparent px-2.5 text-left font-[inherit] text-[14px] " +
      (app.selKey === "map"
        ? "bg-accent-wash font-semibold text-accent-text [box-shadow:inset_2.5px_0_0_var(--color-accent)]"
        : "text-ink hover:bg-sunk")}
    onclick={() => selectSlice("map")}>
    <span class={"flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] text-[10px] font-bold " +
      (app.selKey === "map" ? "bg-accent text-accent-ink" : "bg-sunk text-dim")}>◈</span>
    <span class="truncate font-medium">Workspace map</span>
    {#if app.selKey !== "map"}
      <small class="ml-auto shrink-0 text-[11.5px] font-normal text-faint">overview</small>
    {/if}
  </button>
  {#each groups as g (g.name)}
    <div class="flex items-center gap-2 px-1.5 pt-6 pb-2">
      <span class="ui-nav-heading font-semibold tracking-[.13em] text-dim uppercase">{GROUP_LABEL[g.name] || g.name}</span>
      <span class="h-px flex-1 bg-line"></span>
      <span class="text-[10.5px] text-faint">{g.items.filter((s) => !s.condensed).length}</span>
    </div>
    {#each g.items as s (s.key)}
      {#if s.condensed}
        <!-- the intent's own words: "+ 6 stock device pages" -->
        <button
          class="flex h-[34px] w-full cursor-pointer items-center truncate rounded-[9px] border-0 bg-transparent px-2.5 pl-[46px] text-left font-[inherit] text-[13px] text-dim hover:bg-sunk hover:text-ink"
          title={"Untouched stock controllers — " + s.labels.join(" · ")}
          onclick={() => (stockOpen = true)}>
          <span class="truncate">+ {s.labels.length} stock device page{s.labels.length > 1 ? "s" : ""}</span>
        </button>
      {:else}
      <button
        class={"item relative flex w-full cursor-pointer items-center gap-2.5 truncate rounded-[9px] border-0 bg-transparent text-left font-[inherit] " +
          (s.deep ? "h-[35px] pr-2.5 pl-[46px] text-[13.5px] " : "h-[38px] px-2.5 text-[14px] ") +
          (s.key === app.selKey
            ? "bg-accent-wash font-semibold text-accent-text [box-shadow:inset_2.5px_0_0_var(--color-accent)]"
            : "text-ink hover:bg-sunk")}
        onclick={() => selectSlice(s.key)}
      >{#if s.deep}<span class="absolute top-0 bottom-0 left-[27px] w-px bg-line"></span>{/if}{#if !s.deep}<span
          class={"flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] text-[10.5px] font-semibold " +
            (s.key === app.selKey ? "bg-accent text-accent-ink" : "bg-sunk text-dim")}
        >{TOKEN[s.group] || "·"}</span>{/if}<span class="min-w-0 truncate">{s.label}</span>{#if s.sub === "stock"}<span
          class="ml-auto shrink-0 rounded-[4px] border border-line px-[5px] py-[2px] text-[9px] font-medium tracking-[.06em] text-dim uppercase">stock</span>{:else if isEdited(s)}<span
          title={s.sub}
          class="ml-auto shrink-0 rounded-[4px] bg-accent-wash px-[5px] py-[2px] text-[9px] font-semibold tracking-[.06em] text-accent-text uppercase">edited</span>{:else if subShow(s)}<small
          class={"ml-auto max-w-[45%] shrink-0 truncate pl-1 text-[11.5px] font-normal " +
            (s.key === app.selKey ? "text-accent-text/70" : "text-faint")}>{subShow(s)}</small>{/if}</button>
      {/if}
    {/each}
    {#if g.name === "Views"}
      <button
        class="mt-2 block w-full cursor-pointer rounded-[9px] border border-dashed border-line-strong bg-transparent px-3 py-2.5 text-center font-[inherit] text-[13px] text-dim hover:border-accent/60 hover:text-accent"
        title="Create a free-standing page — add an activity to make it a place where things run"
        onclick={addView}>＋ Add page</button>
    {/if}
    {#if g.name === "Controllers" && stockOpen && !q}
      <button
        class="block w-full cursor-pointer rounded-[9px] border-0 bg-transparent px-2.5 pl-[46px] py-1 text-left font-[inherit] text-[11.5px] text-faint hover:text-ink"
        onclick={() => (stockOpen = false)}>collapse stock ▴</button>
    {/if}
  {/each}
  </div>

  <div class="flex items-center gap-2.5 border-t border-line px-4 py-3">
    <button role="switch" aria-checked={app.advanced} id="advSwitch"
      class={"relative h-[19px] w-[32px] shrink-0 cursor-pointer rounded-full border-0 transition-colors " +
        (app.advanced ? "bg-accent" : "bg-line-strong")}
      onclick={toggleAdvanced}>
      <span class={"absolute top-[2px] h-[15px] w-[15px] rounded-full bg-surface transition-all " +
        (app.advanced ? "left-[15px]" : "left-[2px]")}></span>
    </button>
    <span class="text-[12.5px] text-dim">Advanced mode</span>
  </div>
</nav>
