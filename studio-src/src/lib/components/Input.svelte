<script>
  let { value = $bindable(), class: cls = "", ...rest } = $props();
</script>

<input
  bind:value
  class={"w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none placeholder:text-dim/60 focus:border-accent/60 " + cls}
  {...rest}
/>
