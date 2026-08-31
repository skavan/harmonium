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
  let { value = $bindable(""), placeholder = "icon — type to search",
    onchange = null } = $props();
  let open = $state(false);
  let inputEl = $state(null);
  let rect = $state(null);
  const place = () => { rect = inputEl?.getBoundingClientRect() || null; };
  const cur = $derived((value || "").startsWith("material:")
    ? value.slice(9) : null);
  /* ICON SETS (0.87 — design-icon-sets): "<set>:<name>" free-typed is
     a FILE at /local/harmonium/icons/<set>/<name>.svg. The chip
     previews it mask-rendered (theme-tinted, like the remote); a
     missing file turns the chip into the warning (ruling: silent
     fallback on the remote, visible warning here). Deploys distill
     the file from the installed pack; hand-dropping the SVG works
     too. */
  const setIcon = $derived(!cur &&
    /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(value || "") ? value : null);
  const setUrl = $derived(setIcon
    ? "/local/harmonium/icons/" + setIcon.replace(":", "/") + ".svg"
    : null);
  let setMissing = $state(false);
  $effect(() => {
    setMissing = false;
    if (!setUrl) return;
    const im = new Image();
    im.onerror = () => (setMissing = true);
    im.src = setUrl;
  });
  const q = $derived(((value || "").startsWith("material:")
    ? value.slice(9) : value || "").toLowerCase().trim().replace(/\s+/g, "_"));
  const hits = $derived(!q
    ? ICON_NAMES.slice(0, 60)
    : ICON_NAMES.filter((n) => n.includes(q)).slice(0, 60));
  function pick(n) {
    value = "material:" + n;
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
  {#if setIcon && !setMissing}
    <span class="flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center overflow-hidden rounded-[8px] border border-line bg-tile"
      title={value}>
      <span class="inline-block h-[22px] w-[22px] bg-current text-ink"
        style="-webkit-mask-image:url('{setUrl}');mask-image:url('{setUrl}');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center"></span>
    </span>
  {:else if setIcon}
    <span class="material-symbols-outlined flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center overflow-hidden rounded-[8px] border border-danger/50 bg-tile text-[20px] leading-none text-danger"
      title={"no file yet for " + value + " — Save & Deploy distills it from the installed pack, or drop the SVG in www/harmonium/icons/" + value.split(":")[0] + "/"}>warning</span>
  {:else}
    <span class="material-symbols-outlined flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center overflow-hidden rounded-[8px] border border-line bg-tile text-[22px] leading-none text-ink"
      title={value || "no icon"}>{cur || "•"}</span>
  {/if}
  <input bind:value bind:this={inputEl} spellcheck="false" {placeholder}
    onfocus={() => { place(); open = true; }}
    oninput={() => { place(); open = true; }}
    onblur={() => setTimeout(() => (open = false), 150)}
    class="h-[38px] w-full min-w-0 rounded-[4px] border border-line-strong bg-field px-[11px] font-mono text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent" />
  {#if open && rect && hits.length}
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
