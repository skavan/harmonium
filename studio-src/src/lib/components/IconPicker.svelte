<script>
  /* ICON COMBOBOX (v0.52 — Suresh: "everywhere we ask for an icon we
     could have a search pane that showed the icon and its name").
     One box over the full Material Symbols catalog (3,896 names,
     bundled — no network): type to search, every hit renders its
     GLYPH beside its name, pick writes material:<name>. Free text is
     kept verbatim (emoji and custom strings stay legal). Same
     fixed-positioned dropdown as the Service/Entity pickers, plus a
     live preview chip of the current value. */
  import { ICON_NAMES } from "../iconNames.js";
  import { lookupSetIcon, setPack } from "../state.svelte.js";
  let { value = $bindable(""), placeholder = "icon — type to search",
    onchange = null } = $props();
  let open = $state(false);
  let inputEl = $state(null);
  let rect = $state(null);
  const place = () => { rect = inputEl?.getBoundingClientRect() || null; };
  const cur = $derived((value || "").startsWith("material:")
    ? value.slice(9) : null);
  /* ICON SETS (0.87 re-cut, 2026-09-01 — Suresh: "When I type
     phu:xxxx we should do the same lookup that every other HA page
     does… live preview in the studio and then mint into the deployed
     artifacts"): a "<set>:<name>" value asks the integration LIVE
     (/api/harmonium/icons — the same resolver the deploy minting
     runs) and previews the real path data inline. The warning chip
     now means what it says: the installed pack lacks this name, or
     no pack is installed for the set — never "not deployed yet". */
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
    ? "no icon pack installed for '" + (value || "").split(":")[0] +
      ":' — install it (e.g. via HACS) and this lookup goes live"
    : "'" + value + "' is not in the installed pack — check the name");
  const q = $derived(((value || "").startsWith("material:")
    ? value.slice(9) : value || "").toLowerCase().trim().replace(/\s+/g, "_"));
  /* SET AUTOCOMPLETE (2026-09-01 — Suresh: "when I start typing
     phu: I get the same dropdown I get when we type material:"):
     "<set>:frag" swaps the dropdown to the installed pack's names,
     each row previewing its real path data (one API call, cached).
     material: keeps the bundled font flow. */
  const setTyping = $derived.by(() => {
    const m = /^([A-Za-z0-9_-]+):([A-Za-z0-9_-]*)$/.exec(value || "");
    return m && m[1] !== "material" ? { set: m[1], frag: m[2] } : null;
  });
  let packState = $state({});        /* set -> pack array once loaded */
  $effect(() => {
    const st = setTyping;
    if (!st || packState[st.set]) return;
    const v = setPack(st.set);
    if (v instanceof Promise)
      v.then((arr) => { if (Array.isArray(arr)) packState = { ...packState, [st.set]: arr }; });
    else if (Array.isArray(v)) packState = { ...packState, [st.set]: v };
  });
  /* INSTANT: pure local filtering over the cached pack */
  const setHits = $derived.by(() => {
    const st = setTyping;
    const pack = st && packState[st.set];
    if (!pack) return [];
    const f = st.frag.toLowerCase();
    const hit = f ? pack.filter((i) => i.name.toLowerCase().includes(f)) : pack.slice();
    hit.sort((a2, b2) => (a2.name.startsWith(f) === b2.name.startsWith(f))
      ? (a2.name < b2.name ? -1 : 1) : (a2.name.startsWith(f) ? -1 : 1));
    return hit.slice(0, 60);
  });
  const hits = $derived(setTyping ? []
    : !q ? ICON_NAMES.slice(0, 60)
    : ICON_NAMES.filter((n) => n.includes(q)).slice(0, 60));
  function pick(n) {
    value = "material:" + n;
    open = false;
    onchange?.({ target: { value } });
  }
  function pickSet(it) {
    value = setTyping.set + ":" + it.name;   /* cache already seeded */
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
    <span class="flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center overflow-hidden rounded-[8px] border border-line bg-tile text-ink"
      title={value}>
      <svg class="h-[22px] w-[22px]" viewBox={setLook.viewBox || "0 0 24 24"}
        aria-hidden="true"><path d={setLook.path} fill="currentColor"/></svg>
    </span>
  {:else if setIcon && (setLook === "missing" || setLook === "no_source")}
    <span class="material-symbols-outlined flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center overflow-hidden rounded-[8px] border border-danger/50 bg-tile text-[20px] leading-none text-danger"
      title={setWarnTitle}>warning</span>
  {:else if setIcon}
    <span class="material-symbols-outlined flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center overflow-hidden rounded-[8px] border border-line bg-tile text-[20px] leading-none text-faint"
      title="looking up {value}…">hourglass_empty</span>
  {:else}
    <span class="material-symbols-outlined flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center overflow-hidden rounded-[8px] border border-line bg-tile text-[22px] leading-none text-ink"
      title={value || "no icon"}>{cur || "•"}</span>
  {/if}
  <input bind:value bind:this={inputEl} spellcheck="false" {placeholder}
    onfocus={() => { place(); open = true; }}
    oninput={() => { place(); open = true; }}
    onblur={() => setTimeout(() => (open = false), 150)}
    class="h-[38px] w-full min-w-0 rounded-[4px] border border-line-strong bg-field px-[11px] font-mono text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent" />
  {#if open && rect && setTyping && setHits.length}
    <div class="fixed z-50 grid max-h-[300px] grid-cols-2 content-start gap-[2px] overflow-y-auto rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]"
      style="left:{rect.left}px; top:{rect.bottom + 4}px; width:{Math.max(rect.width, 320)}px">
      {#each setHits as it (it.name)}
        <button class="flex cursor-pointer items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 py-[5px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
          onmousedown={(e) => { e.preventDefault(); pickSet(it); }}>
          <svg class="h-[20px] w-[20px] shrink-0" viewBox={it.viewBox}
            aria-hidden="true"><path d={it.path} fill="currentColor"/></svg>
          <span class="min-w-0 truncate font-mono text-[11px]">{setTyping.set}:{it.name}</span>
        </button>
      {/each}
    </div>
  {:else if open && rect && hits.length}
    <div class="fixed z-50 grid max-h-[300px] grid-cols-2 content-start gap-[2px] overflow-y-auto rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]"
      style="left:{rect.left}px; top:{rect.bottom + 4}px; width:{Math.max(rect.width, 320)}px">
      {#each hits as n (n)}
        <button class="flex cursor-pointer items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 py-[5px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
          onmousedown={(e) => { e.preventDefault(); pick(n); }}>
          <span class="material-symbols-outlined shrink-0 text-[20px]">{n}</span>
          <span class="min-w-0 truncate font-mono text-[11px]">{n}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
