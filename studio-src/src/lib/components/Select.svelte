<script>
  /* options: array of strings or {value, label}.
     NOTE: no bind on the native select — a bound undefined would be
     silently written back as "" on mount (phantom draft edits). */
  let { value = $bindable(), options = [], allowEmpty = false, class: cls = "", onchange, ...rest } = $props();
  const norm = $derived(options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)));
  function handle(e) {
    value = e.target.value || (allowEmpty ? undefined : e.target.value);
    onchange?.(e);
  }
</script>

<select
  value={value ?? ""}
  onchange={handle}
  class={"w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none focus:border-accent/60 " + cls}
  {...rest}
>
  {#if allowEmpty}<option value="">—</option>{/if}
  {#each norm as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
</select>
