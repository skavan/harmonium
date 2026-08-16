<script>
  /* IMPORT DESTINATION DIALOG (v0.83.8 follow-up — Suresh: "When I
     import a workspace it overrites main. It should give the
     choice."). Mounted fresh per app.importAsk, so its state always
     starts from the file just parsed. Single configs pick a landing
     (draft / replace / new — the stamp, when the export carried one,
     preselects sensibly); whole-house bundles tick workspaces. */
  import { app, resolveImport, cancelImport } from "../state.svelte.js";
  const ask = app.importAsk;
  const others = app.wsOrder.filter((w) => app.workspaces[w]);
  let dest = $state("draft");
  let ws = $state("");
  let name = $state("");
  let ticks = $state({});
  if (ask.kind === "single") {
    name = ask.stamp?.name || "";
    /* a stamp naming a DIFFERENT existing workspace preselects it —
       "this file is deck" probably means "put it back in deck" */
    if (ask.stamp?.id && ask.stamp.id !== app.workspace && app.workspaces[ask.stamp.id]) {
      dest = "replace"; ws = ask.stamp.id;
    } else ws = others.find((w) => w !== app.workspace) || "";
  } else {
    for (const id of ask.order) ticks[id] = true;
  }
  let busy = $state(false);
  async function go() {
    busy = true;
    await resolveImport({ dest, ws, name, ticks });
    busy = false;
  }
</script>

<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
  <div id="impDlg" class="w-[440px] max-w-[92vw] rounded-[12px] border border-line-strong bg-surface p-4 [box-shadow:var(--shadow-float)]">
    <div class="mb-1 text-[14px] font-semibold text-ink">Import config</div>
    <div class="mb-3 text-[11.5px] text-dim">
      {ask.fname}{#if ask.kind === "single" && ask.stamp}
        · exported from <b>{ask.stamp.name || ask.stamp.id}</b>{/if}
      {#if ask.kind === "single" && !ask.stamp}
        · no workspace stamp (older export){/if}
    </div>

    {#if ask.kind === "single"}
      <label class="mb-2 flex cursor-pointer items-start gap-2 text-[12px] text-ink">
        <input type="radio" bind:group={dest} value="draft" class="mt-0.5" />
        <span>Into <b>{app.workspaces[app.workspace]?.name || app.workspace}</b>'s
          draft — review it, then Save &amp; Deploy to keep</span>
      </label>
      <label class={"mb-2 flex cursor-pointer items-start gap-2 text-[12px] " +
        (others.length ? "text-ink" : "pointer-events-none opacity-40")}>
        <input type="radio" bind:group={dest} value="replace" class="mt-0.5"
          disabled={!others.length || app.sandbox} />
        <span class="flex flex-wrap items-center gap-1.5">Replace a workspace
          <select bind:value={ws} onfocus={() => (dest = "replace")}
            class="cursor-pointer rounded-[6px] border border-line bg-field px-1.5 py-0.5 font-[inherit] text-[12px] text-ink outline-none">
            {#each others as w (w)}
              <option value={w}>{app.workspaces[w]?.name || w}{w === app.workspace ? " (current)" : ""}</option>
            {/each}
          </select>
          <span class="text-[10.5px] text-danger">stored + deployed immediately</span></span>
      </label>
      <label class={"mb-2 flex cursor-pointer items-start gap-2 text-[12px] text-ink " +
        (app.sandbox ? "pointer-events-none opacity-40" : "")}>
        <input type="radio" bind:group={dest} value="new" class="mt-0.5" disabled={app.sandbox} />
        <span class="flex flex-wrap items-center gap-1.5">As a new workspace named
          <input bind:value={name} placeholder="e.g. Deck" onfocus={() => (dest = "new")}
            class="h-7 w-[140px] rounded-[6px] border border-line bg-field px-2 font-[inherit] text-[12px] text-ink outline-none" /></span>
      </label>
    {:else}
      <p class="mt-0 mb-2 text-[12px] text-ink">
        A whole-house export — tick what to import. An existing
        workspace is <b>replaced</b> (stored + deployed); a missing
        one is created.
      </p>
      {#each ask.order as id (id)}
        <label class="mb-1.5 flex cursor-pointer items-center gap-2 text-[12px] text-ink">
          <input type="checkbox" bind:checked={ticks[id]} />
          <span class="min-w-0 flex-1 truncate">{ask.workspaces[id]?.name || id}
            <span class="text-dim">({id})</span></span>
          <span class={"shrink-0 text-[10.5px] " +
            (app.workspaces[id] ? "text-danger" : "text-ok")}>
            {app.workspaces[id] ? "replaces existing" : "new"}</span>
        </label>
      {/each}
    {/if}

    <div class="mt-3 flex items-center justify-end gap-2">
      <button onclick={cancelImport}
        class="cursor-pointer rounded-[7px] border border-line-strong bg-transparent px-3 py-1.5 font-[inherit] text-[12px] text-ink-2 hover:bg-sunk">Cancel</button>
      <button id="impGo" onclick={go} disabled={busy}
        class="cursor-pointer rounded-[7px] border-0 bg-accent px-3.5 py-1.5 font-[inherit] text-[12px] font-bold text-accent-ink disabled:opacity-50">
        {busy ? "importing…" : "Import"}</button>
    </div>
  </div>
</div>
