<script>
  /* Service COMBOBOX (v0.47.6): one box that searches the HA service
     catalog (id + friendly name) as you type — "open cover" finds
     cover.open_cover. Free text is kept verbatim (catalog unreachable
     or a service HA doesn't advertise). FIXED-positioned dropdown so
     no overflow-hidden ancestor can clip it (the EntityPicker trick). */
  import { app } from "../state.svelte.js";
  let { value = $bindable(""), placeholder = "domain.service — type to search",
    onchange = null } = $props();
  let open = $state(false);
  let inputEl = $state(null);
  let rect = $state(null);
  const place = () => { rect = inputEl?.getBoundingClientRect() || null; };
  const q = $derived((value || "").toLowerCase().trim());
  const hits = $derived(app.services
    .filter((s) => !q || s.id.includes(q) ||
      (s.name || "").toLowerCase().includes(q))
    .slice(0, 40));
  function pick(id) {
    value = id;
    open = false;
    onchange?.({ target: { value: id } });
  }
  $effect(() => {
    if (!open) return;
    const glue = () => place();
    window.addEventListener("scroll", glue, true);
    window.addEventListener("resize", glue);
    return () => {
      window.removeEventListener("scroll", glue, true);
      window.removeEventListener("resize", glue);
    };
  });
</script>

<div class="relative">
  <input bind:value bind:this={inputEl} spellcheck="false" {placeholder}
    onfocus={() => { place(); open = true; }}
    oninput={() => { place(); open = true; }}
    onblur={() => setTimeout(() => (open = false), 150)}
    class="h-[38px] w-full rounded-[4px] border border-line-strong bg-field px-[11px] font-mono text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent" />
  {#if open && rect && hits.length}
    <div class="fixed z-50 max-h-[280px] overflow-y-auto rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]"
      style="left:{rect.left}px; top:{rect.bottom + 4}px; width:{rect.width}px">
      {#each hits as s (s.id)}
        <button class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[6px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
          onmousedown={(e) => { e.preventDefault(); pick(s.id); }}>
          <span class="font-mono text-[11.5px]">{s.id}</span>
          {#if s.name}<span class="pl-1.5 text-[10.5px] text-dim">{s.name}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
