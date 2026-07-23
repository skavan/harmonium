<script>
  import { tv } from "tailwind-variants";
  let { variant = "default", size = "md", class: cls = "", children, ...rest } = $props();
  const styles = tv({
    base: "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-[inherit] cursor-pointer border-0 transition-colors disabled:opacity-45 disabled:cursor-default select-none",
    variants: {
      variant: {
        default: "bg-tile-hi text-ink hover:bg-hover",
        primary: "bg-accent text-accent-ink font-bold hover:brightness-110",
        ghost: "bg-transparent text-dim hover:bg-tile hover:text-ink",
        danger: "bg-transparent text-danger hover:bg-danger/15",
      },
      size: {
        md: "px-3.5 py-2 text-sm",
        sm: "px-2.5 py-1 text-xs",
        icon: "h-7 w-7 p-0 text-sm",
      },
    },
  });
</script>

<button class={styles({ variant, size }) + " " + cls} {...rest}>{@render children?.()}</button>
