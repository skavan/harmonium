<script>
  let { label, hint = "", class: cls = "", children } = $props();
</script>

<label class={"block min-w-0 " + cls}>
  <span class="mb-1 block text-[11px] font-bold tracking-[.07em] text-dim uppercase">{label}</span>
  {@render children?.()}
  {#if hint}<span class="mt-1 block text-[11px] text-dim italic">{hint}</span>{/if}
</label>
