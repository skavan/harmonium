<script>
  /* Segmented control (handoff spec): sunk track, radius 7, 3px pad;
     active item filled accent, radius 5. Used for grid columns,
     column span, Drawer|Push, Visual|Code. options: strings or
     {value, label}. */
  let { value = $bindable(), options = [], onchange, class: cls = "", ...rest } = $props();
  const norm = $derived(options.map((o) => (typeof o === "string" || typeof o === "number"
    ? { value: o, label: String(o) } : o)));
  function pick(v) {
    value = v;
    onchange?.(v);
  }
</script>

<div class={"inline-flex rounded-[7px] bg-sunk p-[3px] " + cls} role="tablist" {...rest}>
  {#each norm as o (o.value)}
    <button role="tab" aria-selected={value === o.value}
      class={"cursor-pointer rounded-[5px] border-0 px-3.5 py-2 text-xs font-medium transition-colors " +
        (value === o.value
          ? "bg-accent font-semibold text-accent-ink"
          : "bg-transparent text-dim hover:text-ink")}
      onclick={() => pick(o.value)}>{o.label}</button>
  {/each}
</div>
