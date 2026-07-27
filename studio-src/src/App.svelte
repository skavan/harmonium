<script>
  import { app, boot, revert, save, saveAndReload, connectToken, schedulePreview,
    switchWorkspace, exportConfig, importConfig, clearCurrent } from "./lib/state.svelte.js";
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
     flips the unsaved flag; the scratch workspace autosaves to this
     browser so nothing is ever lost */
  $effect(() => {
    if (app.draft) {
      const cur = JSON.stringify(app.draft);
      app.unsaved = cur !== JSON.stringify(app.saved);
      if (app.workspace === "scratch") localStorage.setItem("hakr_scratch", cur);
      schedulePreview(false);
    }
  });
  let fileIn;

  boot();
</script>

<div class="flex h-full flex-col">
  <header class="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
    <h1 class="m-0 text-base font-[650]">Harmonium <span class="text-accent">Studio</span></h1>
    <div class="flex overflow-hidden rounded-[9px] border border-line" role="tablist"
      title="Workspaces — each one is a remote's whole world, all deployed at once. Scratch = a safe sandbox kept in this browser. Manage on System → Workspaces.">
      {#each app.wsOrder.filter((w) => app.workspaces[w]) as id (id)}
        <button id={id === "main" ? "wsLive" : "ws_" + id}
          class={"cursor-pointer border-0 px-3 py-1 text-xs font-semibold " +
            (app.workspace === id ? "bg-accent text-accent-ink" : "bg-tile text-dim hover:text-ink")}
          onclick={() => switchWorkspace(id)}>{app.workspaces[id].name}</button>
      {/each}
      <button id="wsScratch" class={"cursor-pointer border-0 px-3 py-1 text-xs font-semibold " +
          (app.workspace === "scratch" ? "bg-accent text-accent-ink" : "bg-tile text-dim hover:text-ink")}
        onclick={() => switchWorkspace("scratch")}>Scratch</button>
    </div>
    <!-- the CURRENT workspace's ADDRESS (v0.38): each workspace is a
         path under /local/harmonium/ — self-describing, nothing
         pinned (scratch never deploys — its link opens Main) -->
    <a href={"/local/harmonium/" +
        (app.workspace !== "main" && app.workspace !== "scratch"
          ? encodeURIComponent(app.workspace) + "/" : "index.html")}
      target="_blank" rel="noopener"
      class="shrink-0 font-mono text-[11px] text-accent no-underline hover:underline"
      title={"Open the running app in a new browser tab" +
        (app.workspace === "scratch" ? " (scratch never deploys — this opens Main)" : "")}
    >/local/harmonium/{app.workspace !== "main" && app.workspace !== "scratch" ? app.workspace + "/" : ""} ↗</a>
    <div id="status"
      class={"min-w-0 flex-1 truncate text-xs " +
        (app.status.cls === "err" ? "err text-danger" : app.status.cls === "ok" ? "ok text-ok" : "text-dim")}
    >{app.status.msg}</div>
    <Button id="themeBtn" size="icon" variant="ghost"
      title={theme === "light" ? "Switch to dark" : "Switch to light"}
      onclick={() => (theme = theme === "light" ? "dark" : "light")}
    >{theme === "light" ? "☾" : "☀"}</Button>
    <Button size="sm" variant="ghost" id="exportBtn" onclick={exportConfig}
      title="Download this workspace's draft as JSON (full fidelity)">⤓ Export</Button>
    <Button size="sm" variant="ghost" onclick={() => fileIn.click()}
      title="Load a config JSON into this workspace's draft">⤒ Import</Button>
    <input bind:this={fileIn} type="file" accept=".json,application/json" class="hidden"
      onchange={(e) => { if (e.target.files[0]) importConfig(e.target.files[0]); e.target.value = ""; }} />
    <Button size="sm" variant="ghost" onclick={clearCurrent}
      title="Reset this workspace's draft to a clean start (keeps remotes/keymaps/theme; nothing saved until you deploy)">✦ Clear</Button>
    <Button onclick={revert} title="Reload the saved config, discarding draft edits">Revert</Button>
    <Button id="saveBtn" variant="primary" disabled={app.sandbox} onclick={save}
      title={app.sandbox ? "Sandbox mode — install the Harmonium integration to save" : "Validate, store, and deploy to the remotes"}
    >{app.unsaved ? "● " : ""}Save &amp; Deploy</Button>
    <Button id="pushBtn" disabled={app.sandbox} onclick={saveAndReload}
      title={app.sandbox ? "Sandbox mode — install the Harmonium integration to save" : "Save, then clear cache + reload the Astrion"}
    >Save + Reload Astrion</Button>
  </header>

  <div class="flex min-h-0 flex-1">
    <NavPane />
    <CenterPane />
    <PreviewPane />
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
