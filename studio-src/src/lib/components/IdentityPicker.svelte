<script>
  /* ACCENT PICKER v4 (V2 round 2 — Suresh: "I was thinking there
     would be two tabs at the top. Accents | Brands rather than a
     huge list", and "AppleTV vanishes because its white on white?"):
     the native select is gone. Closed = a slim button (dot + name).
     Open = a popover with TWO TABS — Accents | Brands — and a grid
     of swatch rows; every dot sits on its own dark chip with a ring,
     so white (Apple TV) and black (Sony) both read. None and the
     ✎ Custom row live in the footer. Behaviour is unchanged from v2:
     picking a slot NEVER deletes a held custom hex — the slot just
     wins while chosen; Custom brings the old colour straight back. */
  import { ACCENT_HEX, BRAND_HEX, BRAND_LABEL } from "../stocklib.js";
  let { accent = $bindable(), color = $bindable(), onchange = null } = $props();
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const HEX = { ...ACCENT_HEX, ...BRAND_HEX };
  const value = $derived(accent && HEX[accent] ? accent
    : color ? "custom" : "");
  const dotColor = $derived(value === "custom" ? (color || "#888888")
    : value ? HEX[value] : "transparent");
  const label = $derived(value === "custom" ? "Custom — " + (color || "")
    : value ? (BRAND_LABEL[value] || cap(value)) : "None");
  let open = $state(false);
  /* the popover opens on the tier of the CURRENT value */
  let tab = $state("accents");
  function toggle() {
    if (!open) tab = BRAND_HEX[accent] ? "brands" : "accents";
    open = !open;
  }
  function pick(v) {
    if (v === "custom") {
      accent = undefined;          /* the held custom hex applies again */
      if (!color) color = "#888888";
    } else if (v === "") {
      accent = undefined;          /* None — a held custom is not zapped */
      color = undefined;
    } else {
      accent = v;                  /* the slot wins; the custom hex is KEPT */
    }
    open = false;
    onchange?.();
  }
  const rows = $derived(tab === "accents"
    ? Object.entries(ACCENT_HEX).map(([k, hx]) => [k, hx, cap(k)])
    : Object.entries(BRAND_HEX).map(([k, hx]) => [k, hx, BRAND_LABEL[k] || cap(k)]));
</script>

<div class="relative flex h-[38px] w-full min-w-0 items-center gap-1.5">
  <button onclick={toggle}
    class="flex h-[38px] w-full min-w-0 cursor-pointer items-center gap-2 rounded-[4px] border border-line-strong bg-field px-2 text-left text-[12.5px] text-ink outline-none focus:border-accent">
    <span class="h-[14px] w-[14px] shrink-0 rounded-full border border-line-strong"
      style="background:{dotColor}"></span>
    <span class="min-w-0 flex-1 truncate">{label}</span>
    <span class="shrink-0 text-[10px] text-dim">▾</span>
  </button>
  {#if value === "custom"}
    <input type="color" value={color || "#888888"}
      oninput={(e) => { color = e.target.value; onchange?.(); }}
      class="h-[30px] w-[36px] shrink-0 cursor-pointer rounded-[4px] border border-line-strong bg-transparent p-0.5" />
  {/if}
  {#if open}
    <!-- click-away backdrop under the popover -->
    <div class="fixed inset-0 z-40" onclick={() => (open = false)}
      role="presentation"></div>
    <div class="absolute top-[40px] left-0 z-50 w-[280px] rounded-[10px] border border-line-strong bg-surface p-2 [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.35))]">
      <div class="mb-2 flex gap-1 rounded-[7px] bg-sunk p-0.5">
        {#each [["accents", "Accents"], ["brands", "Brands"]] as [k, lbl] (k)}
          <button onclick={() => (tab = k)}
            class={"flex-1 cursor-pointer rounded-[6px] border-0 px-2 py-1 text-[12px] " +
              (tab === k ? "bg-glass font-semibold text-ink" : "bg-transparent text-dim hover:text-ink")}>{lbl}</button>
        {/each}
      </div>
      <!-- 23 brands outgrow small windows: the grid scrolls, the
           tabs and footer stay put -->
      <div class="grid max-h-[300px] grid-cols-2 gap-1 overflow-y-auto">
        {#each rows as [k, hx, lbl] (k)}
          <button onclick={() => pick(k)} title={hx}
            class={"flex cursor-pointer items-center gap-2 rounded-[6px] border px-2 py-1.5 text-left text-[12px] " +
              (value === k ? "border-accent/70 bg-glass text-ink" : "border-transparent bg-sunk/60 text-ink-2 hover:bg-sunk hover:text-ink")}>
            <!-- the dot rides its own dark chip + ring, so white and
                 black brands stay visible (his Apple TV report) -->
            <span class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-sunk">
              <span class="h-[13px] w-[13px] rounded-full border border-line-strong"
                style="background:{hx}"></span>
            </span>
            <span class="min-w-0 truncate">{lbl}</span>
          </button>
        {/each}
      </div>
      <div class="mt-2 flex gap-1 border-t border-line pt-2">
        <button onclick={() => pick("")}
          class="flex-1 cursor-pointer rounded-[6px] border border-line bg-transparent px-2 py-1.5 text-[12px] text-dim hover:text-ink">None</button>
        <button onclick={() => pick("custom")}
          class="flex-1 cursor-pointer rounded-[6px] border border-line bg-transparent px-2 py-1.5 text-[12px] text-dim hover:text-ink">✎ Custom{color ? " — " + color : "…"}</button>
      </div>
    </div>
  {/if}
</div>
