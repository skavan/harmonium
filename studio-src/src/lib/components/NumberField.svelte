<script>
  /* Number field with px suffix + stepper (handoff spec). Width 132.
     Inherited value renders faint IN the field (never an empty box);
     typing replaces it. min enforced with the note left to callers. */
  let { value = $bindable(), min = 0, max = 999, step = 1,
    suffix = "px", placeholder = "", onchange, class: cls = "" } = $props();
  function nudge(dir) {
    const cur = value === undefined || value === "" ? +placeholder || 0 : +value;
    let v = cur + dir * step;
    if (v < min) v = min;
    if (v > max) v = max;
    value = v;
    onchange?.(v);
  }
</script>

<div class={"inline-flex h-[38px] w-[132px] items-stretch overflow-hidden rounded-[4px] border border-line-strong bg-field focus-within:border-accent focus-within:[box-shadow:var(--ring-focus)] " + cls}>
  <input type="number" bind:value {min} {max} {placeholder}
    class="w-full min-w-0 border-0 bg-transparent px-[11px] font-[inherit] text-[13px] text-ink outline-none placeholder:text-faint [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    onchange={(e) => onchange?.(e.target.value)} />
  <span class="flex items-center pr-2 text-[11px] text-dim">{suffix}</span>
  <span class="flex flex-col border-l border-line-strong">
    <button class="flex-1 cursor-pointer border-0 bg-transparent px-[9px] text-[9px] leading-none text-dim hover:bg-sunk hover:text-ink"
      aria-label="Increase" onclick={() => nudge(1)}>▲</button>
    <button class="flex-1 cursor-pointer border-0 border-t border-line bg-transparent px-[9px] text-[9px] leading-none text-dim hover:bg-sunk hover:text-ink"
      aria-label="Decrease" onclick={() => nudge(-1)}>▼</button>
  </span>
</div>
