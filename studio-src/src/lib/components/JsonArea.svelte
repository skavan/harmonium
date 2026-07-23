<script>
  /* Mini raw-JSON editor for a sub-object (a tile's extra fields, an
     activity's controls map). Commits via onchange(parsed) when valid. */
  import { schedulePreview, setStatus } from "../state.svelte.js";
  let { value, onchange, rows = 6 } = $props();
  let text = $state(JSON.stringify(value ?? null, null, 2));
  let bad = $state(false);
  let t = null;
  function oninput() {
    clearTimeout(t);
    t = setTimeout(() => {
      try {
        const v = JSON.parse(text);
        bad = false;
        onchange?.(v);
        schedulePreview();
      } catch (e) {
        bad = true;
        setStatus("JSON not valid yet: " + e.message, "err");
      }
    }, 350);
  }
</script>

<textarea
  bind:value={text}
  {oninput}
  {rows}
  spellcheck="false"
  class={"w-full resize-y rounded-[8px] border bg-field p-2 font-mono text-[12px] leading-[1.5] text-ink outline-none " +
    (bad ? "border-danger" : "border-line")}
></textarea>
