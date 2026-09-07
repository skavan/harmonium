<script>
  /* THE BLUE ⓘ (2026-09-04 — Suresh: "many options are hidden behind
     a 'it draws itself from the page's context. Its knobs live under
     Advanced.' Everywhere we do that we should have a blue info icon
     that pops up a description with an example (or two), that could
     be copy and pasted."). A deliberately BLUE affordance — learning,
     not action, so it never competes with the amber accent. Click
     toggles an inline panel: the description, then example blocks
     with one-tap Copy — paste-ready for the Advanced tab or the Code
     view. Reusable anywhere the Studio defers to "it just draws
     itself". */
  let { title = "", text = "", examples = [] } = $props();
  let open = $state(false);
  let copied = $state(-1);
  /* execCommand FIRST (the v0.85.7 clipboard doctrine — HubEditor's
     copyLink: navigator.clipboard exists only in secure contexts and
     the Studio lives on http://<ha-ip>:8123, so the textarea path is
     the primary one, the clipboard API the https backup) */
  function copy(json, i) {
    const s = typeof json === "string" ? json : JSON.stringify(json, null, 1);
    let ok = false;
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(s).catch(() => {});
    copied = i;
    setTimeout(() => (copied = -1), 1500);
  }
  const pretty = (json) =>
    typeof json === "string" ? json : JSON.stringify(json, null, 1);
</script>

<button class="inline-flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 align-[-3px] text-[#4da3ff] hover:text-[#7dbcff]"
  title={open ? "hide the explanation" : "what is this? — description + copy-paste examples"}
  onclick={() => (open = !open)}>
  <span class="material-symbols-outlined text-[17px] leading-none">info</span>
</button>

{#if open}
  <div class="col-span-2 mt-1 space-y-2 rounded-[10px] border border-[#4da3ff]/40 bg-[#4da3ff]/[.06] p-3">
    {#if title}<p class="m-0 text-xs font-semibold text-ink">{title}</p>{/if}
    {#if text}<p class="m-0 text-xs leading-relaxed text-ink-2">{text}</p>{/if}
    {#each examples as ex, i (i)}
      <div class="overflow-hidden rounded-[8px] border border-line bg-sunk/60">
        <div class="flex items-center gap-2 border-b border-line px-2 py-1">
          <span class="min-w-0 flex-1 truncate text-[10.5px] text-dim">{ex.label || "example"}</span>
          <button class="shrink-0 cursor-pointer rounded border border-line bg-transparent px-1.5 py-0.5 text-[10.5px] text-accent-text hover:bg-glass"
            onclick={() => copy(ex.json, i)}>{copied === i ? "copied ✓" : "copy"}</button>
        </div>
        <pre class="m-0 overflow-x-auto p-2 font-mono text-[11px] leading-snug text-ink">{pretty(ex.json)}</pre>
      </div>
    {/each}
  </div>
{/if}
