<script>
  import { app, boot, revert, save, saveAndReload, connectToken, schedulePreview,
    switchWorkspace, exportConfig, exportAllConfigs, importConfig, clearCurrent,
    undoToast, dismissToast, pairs, approvePair, denyPair, version } from "./lib/state.svelte.js";
  import Button from "./lib/components/Button.svelte";
  import NavPane from "./lib/NavPane.svelte";
  import CenterPane from "./lib/CenterPane.svelte";
  import PreviewPane from "./lib/PreviewPane.svelte";

  let tok = $state("");

  /* Studio chrome theme (the preview keeps the engine's own theme) */
  let theme = $state(localStorage.getItem("hakr_studio_theme") || "light");
  $effect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hakr_studio_theme", theme);
  });

  /* any draft mutation (visual OR code) re-renders the preview and
     flips the unsaved flag (v0.53: the scratch workspace is GONE —
     Suresh: "no point to it"; sandboxing is what drafts + workspace
     duplication are for) */
  $effect(() => {
    if (app.draft) {
      app.unsaved = JSON.stringify(app.draft) !== JSON.stringify(app.saved);
      schedulePreview(false);
    }
  });
  let fileIn;
  let moreOpen = $state(false);
  let expOpen = $state(false);

  boot();
</script>

<!-- the LEAVE GUARD (v0.83.6): closing the tab with a dirty draft
     asks first. Browser-truth caveat: the native dialog fires for
     top-level closes/navigations; switching HA sidebar panels swaps
     the iframe without one — the glowing Save button is the guard
     there. -->
<svelte:window onclick={(e) => {
  if (moreOpen && !e.target.closest("#moreMenu,#moreBtn")) moreOpen = false;
  if (expOpen && !e.target.closest("#expMenu,#exportBtn")) expOpen = false; }}
  onbeforeunload={(e) => { if (app.unsaved) { e.preventDefault();
    e.returnValue = "You have unsaved changes."; return "You have unsaved changes."; } }} />

<div class="flex h-full flex-col">
  <header class="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
    <span class="h-5 w-5 shrink-0 rounded-[5px] bg-accent"></span>
    <h1 class="m-0 text-sm font-[600] whitespace-nowrap">Harmonium <span class="text-dim">Studio</span>{#if version.integration}<span
      class="pl-1.5 text-[10px] font-normal text-faint"
      title={"integration v" + version.integration + (version.engine ? " · deployed engine " + version.engine : "")}>v{version.integration}</span>{/if}</h1>
    <!-- workspace pills: segmented, sunk track (handoff §6.1) -->
    <div class="flex shrink-0 rounded-[7px] bg-sunk p-[3px]" role="tablist"
      title="Workspaces — each one is a remote's whole world, all deployed at once. Manage on System → Workspaces.">
      {#each app.wsOrder.filter((w) => app.workspaces[w]) as id (id)}
        <button id={id === "main" ? "wsLive" : "ws_" + id}
          class={"cursor-pointer rounded-[5px] border-0 px-3 py-[6px] text-xs font-medium " +
            (app.workspace === id ? "bg-accent font-semibold text-accent-ink" : "bg-transparent text-dim hover:text-ink")}
          onclick={() => switchWorkspace(id)}>{app.workspaces[id].name}</button>
      {/each}
    </div>
    <!-- the CURRENT workspace's ADDRESS: a mono chip -->
    <a href={"/local/harmonium/" +
        (app.workspace !== "main" ? encodeURIComponent(app.workspace) + "/" : "") + "index.html"}
      target="_blank" rel="noopener"
      class="shrink-0 rounded-[6px] bg-field px-2.5 py-[5px] font-mono text-[11px] text-accent-text no-underline hover:underline"
      title="Open the running app in a new browser tab"
    >/local/harmonium/{app.workspace !== "main" ? app.workspace + "/" : ""}index.html ↗</a>
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <span class={"h-1.5 w-1.5 shrink-0 rounded-full " +
        (app.status.cls === "err" ? "bg-danger" : "bg-ok")}></span>
      <div id="status"
        class={"min-w-0 truncate text-xs " +
          (app.status.cls === "err" ? "err text-danger" : app.status.cls === "ok" ? "ok text-dim" : "text-dim")}
      >{app.status.msg}</div>
    </div>
    <!-- EXPORT is a two-door dropdown (v0.83.2 — Suresh asked twice
         whether Export took everything; the answer belongs in the
         control, not the docs): this workspace's draft, or every
         workspace bundled. -->
    <div class="relative shrink-0">
      <Button size="sm" variant="ghost" id="exportBtn" onclick={() => (expOpen = !expOpen)}
        title="Download config as JSON — this workspace or all of them">Export ▾</Button>
      {#if expOpen}
        <div id="expMenu"
          class="absolute right-0 z-20 mt-1 w-[232px] rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float)]">
          <button
            class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[9px] text-left font-[inherit] text-xs font-medium text-ink hover:bg-sunk"
            onclick={() => { expOpen = false; exportConfig(); }}
            title="This workspace's draft as JSON (full fidelity)">This workspace ({app.workspaces[app.workspace]?.name || app.workspace})</button>
          <button
            class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[9px] text-left font-[inherit] text-xs font-medium text-ink hover:bg-sunk"
            onclick={() => { expOpen = false; exportAllConfigs(); }}
            title="Every workspace's current config, one JSON bundle — the whole-house backup">All workspaces</button>
        </div>
      {/if}
    </div>
    <Button size="sm" variant="ghost" onclick={() => fileIn.click()}
      title="Load a config JSON into this workspace's draft">Import</Button>
    <input bind:this={fileIn} type="file" accept=".json,application/json" class="hidden"
      onchange={(e) => { if (e.target.files[0]) importConfig(e.target.files[0]); e.target.value = ""; }} />
    <span class="h-5 w-px shrink-0 bg-line"></span>
    <Button id="themeBtn" size="icon" variant="ghost" class="h-[30px] w-[30px] border-0"
      title={theme === "light" ? "Switch to dark" : "Switch to light"}
      onclick={() => (theme = theme === "light" ? "dark" : "light")}
    >{theme === "light" ? "☾" : "☀"}</Button>
    <Button size="sm" onclick={revert} title="Reload the saved config, discarding draft edits">Revert</Button>
    <!-- UNSAVED reads LOUD (v0.83.6 — Suresh: "I often forget I need
         to save because the dot next to Save and Deploy is easy to
         miss"): dirty = a ring + glow on the button and a pulsing
         dot; clean = the plain primary button. -->
    <Button id="saveBtn" variant="primary" disabled={app.sandbox} onclick={save}
      class={app.unsaved ? "ring-2 ring-accent/70 [box-shadow:0_0_14px_rgba(255,179,0,.45)]" : ""}
      title={app.sandbox ? "Sandbox mode — install the Harmonium integration to save"
        : app.unsaved ? "You have UNSAVED changes — validate, store, and deploy to the remotes"
        : "Validate, store, and deploy to the remotes"}
    >{#if app.unsaved}<span class="mr-1 inline-block animate-pulse">●</span>{/if}Save &amp; Deploy</Button>
    <div class="relative shrink-0">
      <Button id="moreBtn" size="icon" class="h-[34px] w-[34px]" aria-label="More actions"
        title="More actions" onclick={() => (moreOpen = !moreOpen)}>···</Button>
      {#if moreOpen}
        <div id="moreMenu"
          class="absolute right-0 z-20 mt-1 w-[232px] rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float)]">
          <button id="pushBtn" disabled={app.sandbox}
            class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[9px] text-left font-[inherit] text-xs font-medium text-ink hover:bg-sunk disabled:cursor-default disabled:text-faint"
            onclick={() => { moreOpen = false; saveAndReload(); }}
            title="Save, then clear cache + reload the Astrion">Save + Reload Astrion</button>
          <div class="mx-1.5 my-1 h-px bg-line"></div>
          <button
            class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[9px] text-left font-[inherit] text-xs font-medium text-ink hover:bg-sunk"
            onclick={() => { moreOpen = false; clearCurrent(); }}
            title="Reset this workspace's draft to a clean start (keeps remotes/keymaps/theme; nothing saved until you deploy)">Clear to a fresh start…</button>
        </div>
      {/if}
    </div>
  </header>

  <!-- PAIRING BANNER (v0.81 — beta-gaps §1): a remote is showing this
       code on its screen RIGHT NOW. Compare, then approve — Approve
       mints a named long-lived token on THIS user's account (revocable
       in the HA profile) and hands it to the remote, once. -->
  {#if version.latest}
    <!-- the HACS update strip (v0.82): GitHub's latest release beats
         the installed manifest — one line, one link, no nagging -->
    <div class="flex items-center gap-2 border-b border-line bg-sunk px-4 py-2 text-[12.5px]">
      <span class="font-semibold text-ink">Harmonium v{version.latest} is available</span>
      <span class="text-dim">— update in HACS, then restart Home Assistant.</span>
      {#if version.url}<a href={version.url} target="_blank" rel="noreferrer"
        class="text-accent hover:underline">release notes</a>{/if}
      <span class="flex-1"></span>
      <button onclick={() => (version.latest = "")}
        class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-dim hover:text-ink">dismiss</button>
    </div>
  {/if}
  {#if pairs.err}
    <div class="border-b border-danger/40 bg-danger/10 px-4 py-2 text-[12.5px] font-medium text-danger">
      {pairs.err}
    </div>
  {/if}
  {#each pairs.pending as p (p.session)}
    <div class="flex items-center gap-3 border-b border-accent/40 bg-accent-wash px-4 py-2.5">
      <span class="text-[13px] font-semibold text-accent-text">Remote asks to pair</span>
      <span class="rounded-[8px] border border-accent/50 bg-surface px-3 py-1 font-mono text-[18px] font-bold tracking-[.08em] text-accent-text">{p.code}</span>
      <span class="min-w-0 flex-1 truncate text-[12px] text-dim">
        {p.name ? "“" + p.name + "” · " : ""}does the code match the remote's screen?
        Expires in {Math.max(0, 300 - p.age)}s.</span>
      <button onclick={() => approvePair(p)} disabled={pairs.busy === p.session}
        class="cursor-pointer rounded-[8px] border-0 bg-accent px-4 py-1.5 text-[12px] font-bold text-accent-ink hover:brightness-95 disabled:opacity-50">
        {pairs.busy === p.session ? "Pairing…" : "Approve"}</button>
      <button onclick={() => denyPair(p)}
        class="cursor-pointer rounded-[8px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-danger hover:bg-sunk">Deny</button>
    </div>
  {/each}

  <div class="flex min-h-0 flex-1">
    <NavPane />
    <CenterPane />
    <!-- the MAP is the overview — it earns the preview's width (mock
         3a shows no phone there); the iframe stays MOUNTED so the
         engine keeps its state, it just doesn't take space -->
    <div class={app.selKey === "map" ? "hidden" : "contents"}>
      <PreviewPane />
    </div>
  </div>
</div>

<div id="auth"
  class={"fixed inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-bg/95 " + (app.authOpen ? "" : "hidden")}>
  <h2 class="m-0 text-lg font-semibold">Connect the Studio</h2>
  <p class="m-1 max-w-[480px] text-center text-dim">
    The Studio talks to Home Assistant with a long-lived access token
    (Profile → Security). Stored only in this browser — shared with the
    embedded remote preview.
  </p>
  <input id="tokIn" bind:value={tok} placeholder="Long-lived access token" autocomplete="off"
    class="w-[420px] max-w-[90vw] rounded-[10px] border border-[#2c333d] bg-tile p-3 font-[inherit] text-ink outline-none" />
  <Button id="tokBtn" variant="primary" onclick={() => tok.trim() && connectToken(tok)}>Connect</Button>
  <p class="text-danger">{app.authErr}</p>
</div>

<!-- UNDO TOAST (redesign §7.1): 10 seconds of regret for any Remove -->
{#if app.toast}
  <div id="undoToast"
    class="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[9px] border border-line-strong bg-surface px-4 py-2.5 [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]">
    <span class="text-xs text-ink">{app.toast.msg}</span>
    <button id="undoBtn"
      class="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-accent hover:underline"
      onclick={undoToast}>Undo</button>
    <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-ink"
      title="Dismiss" onclick={dismissToast}>✕</button>
  </div>
{/if}
