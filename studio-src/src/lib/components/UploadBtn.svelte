<script>
  /* 📤 UPLOAD (v0.83.8 — beta-gaps P1 #7: "a drag-and-drop /
     file-picker upload … so a stranger never needs filesystem access
     to finish a good-looking page"). One small button that is also a
     drop target: pick or drop a picture, it POSTs to the integration,
     and the returned /local/… path is handed to the field via
     onDone. Name collisions ask before overwriting. */
  import { uploadImage, setStatus } from "../state.svelte.js";
  let { kind = "image", onDone, label = "Upload…" } = $props();
  let busy = $state(false);
  let over = $state(false);
  let fileEl = $state(null);

  async function send(file) {
    if (!file || busy) return;
    if (!/^image\//.test(file.type)) {
      setStatus("that's not an image file", "err");
      return;
    }
    busy = true;
    try {
      let r = await uploadImage(file, kind);
      if (r.exists) {
        if (!confirm(`"${file.name}" already exists on the box — replace it?`))
          { busy = false; return; }
        r = await uploadImage(file, kind, true);
      }
      setStatus("uploaded → " + r.path, "ok");
      onDone?.(r.path);
    } catch (e) {
      setStatus("upload failed: " + (e?.message || e), "err");
    }
    busy = false;
  }
</script>

<input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
  bind:this={fileEl} class="hidden"
  onchange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
<button type="button" disabled={busy}
  onclick={() => fileEl?.click()}
  ondragover={(e) => { e.preventDefault(); over = true; }}
  ondragleave={() => (over = false)}
  ondrop={(e) => { e.preventDefault(); over = false;
    send(e.dataTransfer?.files?.[0]); }}
  title={"Upload a picture to the box (or drop one here) — it saves under " +
    (kind === "skin" ? "/local/harmonium/skins/" : "/local/images/") + " and fills the field"}
  class={"flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[6px] border px-2 text-[11px] disabled:opacity-50 " +
    (over ? "border-accent bg-accent/15 text-ink"
      : "border-dashed border-line-strong bg-transparent text-dim hover:text-ink")}>
  {busy ? "…" : "📤 " + label}
</button>
