<script>
  /* Graphite Rails button (design handoff §COMPONENTS).
     Variants map: default→Secondary · primary→Primary · ghost→Quiet ·
     danger→Danger (bordered, transparent). Radius 6, 12px labels.
     Focus: ring + 1px accent border. Disabled: raised fill, faint
     text — never removed from layout. */
  import { tv } from "tailwind-variants";
  let { variant = "default", size = "md", class: cls = "", children, ...rest } = $props();
  const styles = tv({
    base: "inline-flex items-center justify-center gap-1.5 rounded-[6px] font-[inherit] cursor-pointer select-none transition-colors " +
      "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] focus-visible:border-accent " +
      "disabled:cursor-default disabled:bg-raised disabled:text-faint disabled:hover:bg-raised",
    variants: {
      variant: {
        default: "border border-line-strong bg-surface text-ink font-medium hover:bg-sunk",
        primary: "border-0 bg-accent text-accent-ink font-semibold hover:brightness-95 disabled:border-0",
        ghost: "border-0 bg-transparent text-dim font-medium hover:bg-sunk hover:text-ink",
        danger: "border border-danger-line bg-transparent text-danger font-medium hover:bg-danger/10",
      },
      size: {
        md: "px-3.5 py-[9px] text-xs",
        sm: "px-3 py-2 text-xs",
        icon: "h-[34px] w-[34px] p-0 text-sm border border-line-strong bg-surface text-ink-2 hover:bg-sunk",
      },
    },
  });
</script>

<button class={styles({ variant, size }) + " " + cls} {...rest}>{@render children?.()}</button>
