<script>
  /* WORKSPACES (v0.34) — one workspace per remote's world, all live at
     once. Main is repo-built (config.json); every other workspace
     deploys to config.<ws>.json. Point a remote at one with a one-time
     #ws=<id> in its URL (sticky, like #device=). Scratch stays the
     browser-local sandbox — publish it here to make it real. */
  import { app, switchWorkspace, createWorkspace, renameWorkspace,
    deleteWorkspace } from "../state.svelte.js";
  import Button from "../components/Button.svelte";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";

  let newName = $state("");
  let newSource = $state("blank");
  let confirmDel = $state(null);   // ws id pending 2nd delete press

  const sources = $derived([
    { value: "blank", label: "Blank starter (keeps stock libraries)" },
    { value: "duplicate", label: "Duplicate '" + (app.workspaces[app.workspace]?.name || app.workspace) + "' (last saved copy)" },
    { value: "draft", label: "Copy of the current draft (incl. unsaved edits)" },
  ]);

  async function create() {
    if (!newName.trim()) return;
    await createWorkspace(newName.trim(), newSource);
    newName = "";
  }
  function del(id) {
    if (confirmDel !== id) { confirmDel = id; setTimeout(() => { if (confirmDel === id) confirmDel = null; }, 4000); return; }
    confirmDel = null;
    deleteWorkspace(id);
  }
</script>

<div class="space-y-4">
  <p class="m-0 text-xs text-dim">
    A workspace is a complete world — screens, activities, building
    blocks, theme — published on the server, and <b>every workspace is
    an address</b>: <b>Main</b> lives at <code>/local/harmonium/index.html</code>
    (built from the repo), every other workspace at
    <code>/local/harmonium/&lt;id&gt;/index.html</code>. All of them are live at
    once; a remote shows whichever address it loads, so two remotes can
    share one workspace or each have their own.
  </p>
  <p class="m-0 text-xs text-dim">
    To put a device on a workspace, just point it at the workspace's
    URL (for a kiosk, set it as the Fully start URL) — the path decides
    on every boot, nothing is stored on the device. The old
    <code>#ws=&lt;id&gt;</code> one-time pin still works if you prefer
    device-side stickiness; <code>#device=</code> provisioning is
    unchanged.
  </p>

  <div class="space-y-2">
    {#each app.wsOrder.filter((w) => app.workspaces[w]) as id (id)}
      <div class={"flex items-center gap-2 rounded-[12px] border bg-tile px-3 py-2 " +
        (app.workspace === id ? "border-accent/70" : "border-line")}>
        <div class="min-w-0 flex-1">
          <input
            class="w-full border-0 bg-transparent p-0 font-[inherit] font-semibold text-ink outline-none"
            value={app.workspaces[id].name}
            title="Rename (display name only — the id and file stay put)"
            onchange={(e) => renameWorkspace(id, e.target.value)}
            disabled={app.sandbox} />
          <div class="truncate font-mono text-[11px] text-dim">
            <a class="text-accent no-underline hover:underline"
              href={app.workspaces[id].path || "/local/harmonium/" + id + "/index.html"}
              target="_blank" rel="noopener"
              title="The workspace's address — a remote pointed here shows this workspace">
              {app.workspaces[id].path || "/local/harmonium/" + id + "/index.html"}</a>
            · {app.workspaces[id].file}
            {#if id === "main"}· repo-built{/if}
            {#if app.workspace === id}· <span class="text-accent">editing now</span>{/if}
          </div>
        </div>
        {#if app.workspace !== id}
          <Button size="sm" onclick={() => switchWorkspace(id)}>Open</Button>
        {/if}
        {#if id !== "main"}
          <Button size="sm" variant="danger" onclick={() => del(id)}
            title="Delete this workspace and its deployed file — remotes pointed at it fall back to main">
            {confirmDel === id ? "Sure?" : "✕"}</Button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="rounded-[12px] border border-line bg-tile px-3 py-3">
    <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">New workspace</div>
    <div class="flex flex-wrap items-end gap-2">
      <div class="w-44"><Field label="Name">
        <Input bind:value={newName} placeholder="Bedroom"
          onkeydown={(e) => e.key === "Enter" && create()} />
      </Field></div>
      <div class="min-w-64 flex-1"><Field label="Start from">
        <Select bind:value={newSource} options={sources} />
      </Field></div>
      <Button variant="primary" size="sm" disabled={app.sandbox || !newName.trim()}
        onclick={create}>＋ Create &amp; deploy</Button>
    </div>
    <p class="mb-0 mt-2 text-[11px] text-dim">
      Created workspaces deploy immediately — their address
      (<code>/local/harmonium/&lt;id&gt;/index.html</code>) goes live and their
      routing selects
      (<code>select.harmonium_&lt;id&gt;_&lt;room&gt;_activity</code>)
      mint on the spot. No restart needed.
    </p>
  </div>
</div>
