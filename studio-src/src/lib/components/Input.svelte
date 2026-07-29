<script>
  /* twMerge: passed width/size classes must beat the base w-full —
     same conflict class as Select (v0.34.1). */
  import { twMerge } from "tailwind-merge";
  let { value = $bindable(), class: cls = "", ...rest } = $props();
</script>

<input
  bind:value
  class={twMerge("h-[38px] w-full rounded-[4px] border border-line-strong bg-field px-[11px] font-[inherit] text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent focus:[box-shadow:var(--ring-focus)]", cls)}
  {...rest}
/>
