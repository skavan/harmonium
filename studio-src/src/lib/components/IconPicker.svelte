<script>
  /* ICON COMBOBOX (v0.52; recut 2026-09-02 — his HA tile-card
     screenshot: "The search starts from the first key across
     multiple icon sets"). One box, HA's feel: from the FIRST
     keystroke the dropdown mixes the bundled Material catalog with
     every installed set — phu:/mdi: from the integration's cross-set
     search (60 interleaved rows per keystroke, never a whole-pack
     pull; mdi's old ~2MB fetch was why it felt dead), plus any pack
     that only exists as a lovelace module (fa6-solid:, hue:, …) via
     the customIcons bridge in state.svelte.js. Typing "set:frag"
     narrows to that one set. Every row renders its real glyph; free
     text is kept verbatim (emoji and custom strings stay legal). */
  import { ICON_NAMES } from "../iconNames.js";
  import { customSearch, iconList, iconSearch, lookupSetIcon }
    from "../state.svelte.js";
  let { value = $bindable(""), placeholder = "icon — type to search",
    onchange = null } = $props();
  let open = $state(false);
  let inputEl = $state(null);
  let rect = $state(null);
  const place = () => { rect = inputEl?.getBoundingClientRect() || null; };
  const cur = $derived((value || "").startsWith("material:")
    ? value.slice(9) : null);
  /* a complete "<set>:<name>" value previews via the live resolver
     (server first, the pack's own registered resolver as fallback) */
  const setIcon = $derived(!cur &&
    /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(value || "") ? value : null);
  let setLook = $state(null);   /* {viewBox,path} | "missing" | "no_source" | null */
  $effect(() => {
    const ref = setIcon;
    setLook = null;
    if (!ref) return;
    const t = setTimeout(async () => {
      const v = await lookupSetIcon(ref);
      if (ref === setIcon) setLook = v;
    }, 250);                     /* debounce while typing */
    return () => clearTimeout(t);
  });
  const setWarnTitle = $derived(setLook === "no_source"
    ? "no source for '" + (value || "").split(":")[0] +
      ":' — install the pack (e.g. via HACS) and add the prefix under " +
      "System → Icon sets, and this lookup goes live"
    : "'" + value + "' is not in the installed pack — check the name");
  const q = $derived(((value || "").startsWith("material:")
    ? value.slice(9) : value || "").toLowerCase().trim().replace(/\s+/g, "_"));
  /* "set:frag" narrows the search to that one set */
  const setTyping = $derived.by(() => {
    const m = /^([A-Za-z0-9_-]+):([A-Za-z0-9_-]*)$/.exec(value || "");
    return m && m[1] !== "material" ? { set: m[1], frag: m[2] } : null;
  });
  /* the debounced fetch: cross-set search, or one set's list; a
     set the server doesn't know falls through to the browser-side
     custom packs. `busy` keeps an honest "searching…" row up —
     an in-flight fetch must never read as an empty set. */
  let srvHits = $state([]);      /* [{set,name,viewBox,path}] */
  let busy = $state(false);
  $effect(() => {
    const st = setTyping, frag = st ? st.frag : q;
    const key = (st ? st.set + ":" : "~") + frag;
    if (!st && !q) { srvHits = []; busy = false; return; }
    busy = true;
    const cheap = st ? null : q;   /* q-search caches make repeats instant */
    const cur = () => (setTyping ? setTyping.set + ":" : "~") +
      (setTyping ? setTyping.frag : q);
    const t = setTimeout(async () => {
      try {
        /* the SERVER answers first and alone gates the spinner; the
           custom bridge (heavy module imports, other packs' own
           resolvers — all deadline-bounded in state.svelte.js) joins
           the list late, never holds it (round 2: "Sat there for
           ages with a spinning wheel"). */
        let rows = [];
        let wantCust = true;
        if (st) {
          const rep = await iconList(st.set, st.frag);
          if (rep && !rep.no_source) {
            rows = (rep.icons || []).map((i) => ({ ...i, set: st.set }));
            wantCust = false;    /* the server owns this set */
          }
        } else {
          rows = (await iconSearch(cheap)) || [];
        }
        if (cur() !== key) return;
        srvHits = rows;
        busy = false;
        if (wantCust)
          customSearch(st ? st.frag : cheap, st ? st.set : null,
            st ? 60 : 16).then((cust) => {
            if (cur() !== key || !cust.length) return;
            /* a declared set the SERVER also speaks (banked files,
               the custom_icons service) answers twice — same
               set:name from both halves is one row, or svelte's
               keyed each throws (his live find: typing an icon
               crashed the tile row with each_key_duplicate) */
            const have = new Set(srvHits.map((r) => r.set + ":" + r.name));
            const add = cust.filter((r) => !have.has(r.set + ":" + r.name));
            if (add.length) srvHits = [...srvHits, ...add];
          }).catch(() => {});
      } finally {
        if (cur() === key) busy = false;   /* the spinner can never stick */
      }
    }, 160);
    return () => clearTimeout(t);
  });
  /* material names use underscores; the typed query may use
     hyphens (mdi habit) — match across the separator line */
  const qm = $derived(q.replace(/-/g, "_"));
  const hits = $derived.by(() => {
    if (setTyping) return [];
    if (!q) return ICON_NAMES.slice(0, 60);
    /* prefix matches lead, shortest first — "door" must surface
       door_open above every *_indoor that merely contains it */
    const m = ICON_NAMES.filter((n) => n.includes(qm));
    m.sort((a, b) => (a.startsWith(qm) === b.startsWith(qm))
      ? (a.length - b.length || (a < b ? -1 : 1))
      : (a.startsWith(qm) ? -1 : 1));
    return m.slice(0, 12);
  });
  function pick(n) {
    value = "material:" + n;
    open = false;
    onchange?.({ target: { value } });
  }
  function pickSet(it) {
    value = it.set + ":" + it.name;      /* cache already seeded */
    open = false;
    onchange?.({ target: { value } });
  }
</script>

<div class="relative flex items-center gap-2">
  <!-- leading-none + overflow-hidden (v0.79.2 — Suresh: "The icon is
       top right instead of center"): a glyph name that renders as
       TEXT (font still loading, or an unligated name) inherited the
       page line-height and spilled out of the 38px chip toward the
       top; pinned to the box, clipped, centred. -->
  {#if setIcon && setLook && typeof setLook === "object"}
    <span class="grid h-[38px] w-[38px] shrink-0 place-items-center self-center overflow-hidden rounded-[8px] border border-line bg-tile text-ink"
      title={value}>
      <svg class="h-[22px] w-[22px]" viewBox={setLook.viewBox || "0 0 24 24"}
        aria-hidden="true"><path d={setLook.path} fill="currentColor"/></svg>
    </span>
  {:else if setIcon && (setLook === "missing" || setLook === "no_source")}
    <span class="material-symbols-outlined grid h-[38px] w-[38px] shrink-0 place-items-center self-center overflow-hidden rounded-[8px] border border-danger/50 bg-tile text-[20px] leading-none text-danger"
      title={setWarnTitle}>warning</span>
  {:else if setIcon}
    <span class="material-symbols-outlined grid h-[38px] w-[38px] shrink-0 place-items-center self-center overflow-hidden rounded-[8px] border border-line bg-tile text-[20px] leading-none text-faint"
      title="looking up {value}…">hourglass_empty</span>
  {:else}
    <span class="material-symbols-outlined grid h-[38px] w-[38px] shrink-0 place-items-center self-center overflow-hidden rounded-[8px] border border-line bg-tile text-[22px] leading-none text-ink"
      title={value || "no icon"}>{cur || "•"}</span>
  {/if}
  <input bind:value bind:this={inputEl} spellcheck="false" {placeholder}
    onfocus={() => { place(); open = true; }}
    oninput={() => { place(); open = true; }}
    onblur={() => setTimeout(() => (open = false), 150)}
    class="h-[38px] w-full min-w-0 rounded-[4px] border border-line-strong bg-field px-[11px] font-mono text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent" />
  {#if open && rect && (hits.length || srvHits.length || busy)}
    <div class="fixed z-50 grid max-h-[300px] grid-cols-2 content-start gap-[2px] overflow-y-auto rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]"
      style="left:{rect.left}px; top:{rect.bottom + 4}px; width:{Math.max(rect.width, 320)}px">
      {#each hits as n (n)}
        <button class="flex cursor-pointer items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 py-[5px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
          onmousedown={(e) => { e.preventDefault(); pick(n); }}>
          <span class="material-symbols-outlined shrink-0 text-[20px]">{n}</span>
          <span class="min-w-0 truncate font-mono text-[11px]">{n}</span>
        </button>
      {/each}
      {#each srvHits as it (it.set + ":" + it.name)}
        <button class="flex cursor-pointer items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 py-[5px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
          onmousedown={(e) => { e.preventDefault(); pickSet(it); }}>
          <svg class="h-[20px] w-[20px] shrink-0" viewBox={it.viewBox}
            aria-hidden="true"><path d={it.path} fill="currentColor"/></svg>
          <span class="min-w-0 truncate font-mono text-[11px]">{it.set}:{it.name}</span>
        </button>
      {/each}
      {#if busy}
        <div class="col-span-2 flex items-center gap-2 px-2 py-[5px] text-[11px] text-dim">
          <span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
          searching the installed sets…
        </div>
      {:else if !hits.length && !srvHits.length}
        <div class="col-span-2 px-2 py-[5px] text-[11px] text-dim">
          no icon matches — free text is kept as typed
        </div>
      {/if}
    </div>
  {/if}
</div>
