<script>
  /* options: array of strings or {value, label}.
     NOTE: no bind on the native select — a bound undefined would be
     silently written back as "" on mount (phantom draft edits).
     twMerge: a passed class (w-64) must BEAT the base (w-full) — raw
     concatenation left the winner to stylesheet order, which broke
     every fixed-width Select (v0.34.1, Suresh's State-header report). */
  import { twMerge } from "tailwind-merge";
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
  class={twMerge("h-[38px] w-full cursor-pointer rounded-[4px] border border-line-strong bg-field px-[11px] font-[inherit] text-[13px] text-ink outline-none focus:border-accent focus:[box-shadow:var(--ring-focus)]", cls)}
  {...rest}
>
  {#if allowEmpty}<option value="">—</option>{/if}
  {#each norm as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
</select>
