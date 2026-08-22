<script>
  /* The escape hatch: the selected slice as raw JSON. Valid JSON is
     committed to the draft (and the preview follows); invalid JSON
     flags red and never clobbers the draft. */
  import { app, getSlice, setSlice, schedulePreview, setStatus } from "../state.svelte.js";

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        /* plain-http HA (the common case) is not a secure context, so
           navigator.clipboard doesn't exist at all — fall back to the
           deprecated-but-universal execCommand path (2026-08-21,
           field: "copy failed: Cannot read properties of undefined
           (reading 'writeText')"). */
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (!ok) throw new Error("browser refused the copy");
      }
      setStatus("copied " + app.selKey + " to clipboard", "ok");
    } catch (e) { setStatus("copy failed: " + e.message, "err"); }
  }

  let text = $state("");
  let bad = $state(false);
  let editing = false;

  /* refresh from the draft whenever the slice changes or the code tab
     opens (so visual-editor edits show up) */
  $effect(() => {
    const key = app.selKey;
    const tab = app.tab;
    void JSON.stringify(getSlice(key)); // track draft content
    if (!editing && key && tab === "code") {
      text = JSON.stringify($state.snapshot(getSlice(key)), null, 2);
      bad = false;
    }
  });

  let t = null;
  function oninput() {
    editing = true;
    clearTimeout(t);
    t = setTimeout(() => {
      try {
        const val = JSON.parse(text);
        bad = false;
        setSlice(app.selKey, val);
        schedulePreview();
      } catch (e) {
        bad = true;
        setStatus("JSON not valid yet: " + e.message, "err");
      }
      editing = false;
    }, 350);
  }
</script>

<div class="flex h-full flex-col gap-2">
  <div class="flex items-center gap-2">
    <span class="text-[11px] text-dim">standard Harmonium runtime JSON — this is exactly what the visual editor edits</span>
    <span class="flex-1"></span>
    <button onclick={copy}
      class="cursor-pointer rounded-[8px] border-0 bg-tile-hi px-2.5 py-1 text-xs text-ink hover:bg-hover">⧉ Copy</button>
  </div>
<textarea
  id="json"
  bind:value={text}
  {oninput}
  spellcheck="false"
  class={"h-full w-full resize-none rounded-[12px] border bg-field p-3 font-mono text-[12.5px] leading-[1.5] text-ink outline-none " +
    (bad ? "bad border-danger" : "border-line")}
></textarea>
</div>
