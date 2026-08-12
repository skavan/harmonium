<script>
  /* Icon button (handoff spec): 38×38 (compact 34×34), radius 6,
     bordered, surface fill. Disabled = greyed, NEVER removed, so
     field rows don't reflow. Every instance must carry a `label`
     (aria-label + tooltip) — no glyph-only mystery meat. */
  import { twMerge } from "tailwind-merge";
  let { label, compact = false, class: cls = "", children, ...rest } = $props();
</script>

<button
  aria-label={label}
  title={label}
  class={twMerge(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-line-strong bg-surface text-[15px] text-ink-2 transition-colors hover:bg-sunk " +
    "focus-visible:outline-none focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] " +
    "disabled:cursor-default disabled:border-line disabled:bg-raised disabled:text-faint disabled:hover:bg-raised " +
    (compact ? "h-[34px] w-[34px]" : "h-[38px] w-[38px]"),
    cls)}
  {...rest}
>{@render children?.()}</button>
