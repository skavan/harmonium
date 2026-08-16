<script>
  import { app, hasVisual, roomIds, selectSlice } from "./state.svelte.js";
  const upTarget = $derived.by(() => {
    if (!app.selKey?.startsWith("screens.")) return null;
    const p = app.draft?.screens?.[app.selKey.slice(8)]?.parent;
    if (!p) return null;
    return { key: roomIds().includes(p) ? "view." + p : "screens." + p,
      label: app.draft.screens[p]?.name || p };
  });
  import CodeEditor from "./editors/CodeEditor.svelte";
  import HubEditor from "./editors/HubEditor.svelte";
  import ViewEditor from "./editors/ViewEditor.svelte";
  import ActivitiesIndex from "./editors/ActivitiesIndex.svelte";
  import SequencesEditor from "./editors/SequencesEditor.svelte";
  import AppsEditor from "./editors/AppsEditor.svelte";
  import DevicesEditor from "./editors/DevicesEditor.svelte";
  import LibraryEditor from "./editors/LibraryEditor.svelte";
  import BuiltinEditor from "./editors/BuiltinEditor.svelte";
  import ThemeEditor from "./editors/ThemeEditor.svelte";
  import SnippetsEditor from "./editors/SnippetsEditor.svelte";
  import WorkspacesEditor from "./editors/WorkspacesEditor.svelte";
  import SpeakerGroupsEditor from "./editors/SpeakerGroupsEditor.svelte";
  import WorkspaceMap from "./editors/WorkspaceMap.svelte";
</script>

<div class="flex min-w-0 flex-1 flex-col">
  <div class="flex items-center gap-3 px-3.5 pt-2.5">
    {#if upTarget}
      <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
        onclick={() => selectSlice(upTarget.key)}>↑ {upTarget.label}</button>
    {/if}
    <span class="font-semibold">{({ devices: "Pre-wired Devices", remotes: "Remotes & keymaps",
      sequences: "Actions", spkgroups: "Speaker Groups" })[app.selKey] || app.selKey || "—"}</span>
    <div class="flex overflow-hidden rounded-[9px] border border-line" role="tablist">
      <button id="tabVisual" role="tab" aria-selected={app.tab === "visual"}
        class={"cursor-pointer border-0 px-3 py-1 text-xs font-semibold " +
          (app.tab === "visual" ? "bg-accent text-accent-ink" : "bg-tile text-dim hover:text-ink")}
        onclick={() => (app.tab = "visual")}>Visual</button>
      <button id="tabCode" role="tab" aria-selected={app.tab === "code"}
        class={"cursor-pointer border-0 px-3 py-1 text-xs font-semibold " +
          (app.tab === "code" ? "bg-accent text-accent-ink" : "bg-tile text-dim hover:text-ink")}
        onclick={() => (app.tab = "code")}>Code</button>
    </div>
    <span class="flex-1 truncate text-xs text-dim">
      {app.tab === "code"
        ? "valid JSON re-renders the preview as you type"
        : "every change re-renders the preview · Code tab is the escape hatch"}
    </span>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto p-3.5">
    {#if !app.draft}
      <p class="text-dim">…</p>
    {:else if app.tab === "code"}
      <div class="h-full"><CodeEditor /></div>
    {:else if app.selKey?.startsWith("view.")}
      <HubEditor screenId={app.selKey.slice(5)} />
    {:else if app.selKey === "activities"}
      <ActivitiesIndex />
    {:else if app.selKey === "sequences"}
      <SequencesEditor />
    {:else if app.selKey === "apps"}
      <AppsEditor />
    {:else if app.selKey === "devices"}
      <DevicesEditor />
    {:else if app.selKey === "spkgroups"}
      <SpeakerGroupsEditor />
    {:else if app.selKey === "theme"}
      <ThemeEditor />
    {:else if app.selKey === "snippets"}
      <SnippetsEditor />
    {:else if app.selKey === "map"}
      <WorkspaceMap />
    {:else if app.selKey === "workspaces"}
      <WorkspacesEditor />
    {:else if app.selKey?.startsWith("controller.")}
      <ViewEditor screenId={app.selKey.slice(11)} kind="controller" />
    {:else if app.selKey?.startsWith("screens.")}
      {@const sid = app.selKey.slice(8)}
      {@const scr2 = app.draft.screens[sid]}
      {@const t = scr2?.type === "library" || (scr2?.drawer && scr2?.type !== "controller")
        ? "library"
        : scr2?.type || (["activity", "detail"].includes(scr2?.class) ? "controller" : "hub")}
      {#if t === "library"}
        <LibraryEditor screenId={sid} />
      {:else if t === "hub"}
        <HubEditor screenId={sid} />
      {:else}
        <ViewEditor screenId={sid} />
      {/if}
    {:else if !hasVisual(app.selKey)}
      <p class="text-dim">No visual editor for this slice yet — use the <b>Code</b> tab.</p>
    {/if}
  </div>

  {#if app.problems.length}
    <div id="problems" class="mx-3.5 mb-3 max-h-[110px] overflow-y-auto rounded-[10px] bg-danger/12 px-3 py-2 text-xs whitespace-pre-wrap text-danger">
      {app.problems.map((p) => "· " + p).join("\n")}
    </div>
  {/if}
</div>
