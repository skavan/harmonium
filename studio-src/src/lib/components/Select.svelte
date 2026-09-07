<script>
  /* options: array of strings or {value, label}.
     NOTE: no bind on the native select — a bound undefined would be
     silently written back as "" on mount (phantom draft edits).
     twMerge: a passed class (w-64) must BEAT the base (w-full) — raw
     concatenation left the winner to stylesheet order, which broke
     every fixed-width Select (v0.34.1, Suresh's State-header report). */
  import { twMerge } from "tailwind-merge";
  let { value = $bindable(), options = [], allowEmpty = false, blankLabel = "\u2014", class: cls = "", onchange, ...rest } = $props();
  const norm = $derived(options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)));
  /* OPTGROUPS (2026-09-06, the Lands-on triage): an option may carry
     `group` \u2014 options sharing one render under an <optgroup>, in
     first-seen order; group-less options render bare, in place.
     No group anywhere = the flat render, unchanged. */
  const grouped = $derived.by(() => {
    if (!norm.some((o) => o && o.group)) return null;
    const out = [];
    for (const o of norm) {
      const g = o.group || "";
      const last = out[out.length - 1];
      if (last && last.label === g) last.opts.push(o);
      else out.push({ label: g, opts: [o] });
    }
    return out;
  });
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
  {#if allowEmpty}<option value="">{blankLabel}</option>{/if}
  {#if grouped}
    {#each grouped as g, gi (g.label + gi)}
      {#if g.label}
        <optgroup label={g.label}>
          {#each g.opts as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
        </optgroup>
      {:else}
        {#each g.opts as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      {/if}
    {/each}
  {:else}
    {#each norm as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
  {/if}
</select>
