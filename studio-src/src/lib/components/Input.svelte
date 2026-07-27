<script>
  /* twMerge: passed width/size classes must beat the base w-full —
     same conflict class as Select (v0.34.1). */
  import { twMerge } from "tailwind-merge";
  let { value = $bindable(), class: cls = "", ...rest } = $props();
</script>

<input
  bind:value
  class={twMerge("w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none placeholder:text-dim/60 focus:border-accent/60", cls)}
  {...rest}
/>
