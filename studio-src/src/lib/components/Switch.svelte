<script>
  import { Switch } from "bits-ui";
  let { checked = $bindable(false), label = "", ...rest } = $props();
</script>

<label class="inline-flex cursor-pointer items-center gap-2">
  <Switch.Root
    bind:checked
    class="relative h-[20px] w-[36px] shrink-0 cursor-pointer rounded-full border-0 bg-tile-hi p-0 transition-colors data-[state=checked]:bg-accent"
    {...rest}
  >
    <Switch.Thumb
      class="block h-[16px] w-[16px] translate-x-[2px] rounded-full bg-dim transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-ink"
    />
  </Switch.Root>
  {#if label}<span class="text-sm">{label}</span>{/if}
</label>
