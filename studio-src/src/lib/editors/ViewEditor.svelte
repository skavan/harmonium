<script>
  /* One view (screen): identity, key policy hooks, and the tile lists —
     sectioned views get one card group per section. */
  import { app } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import TileRow from "../components/TileRow.svelte";
  import Button from "../components/Button.svelte";
  import { selectSlice, renameScreen, deleteScreen, setStatus, subordinateScreens,
    isControllerScreen, renameController, deleteController, duplicateController,
    resetControllerToStock, instantiateDeviceController,
    confirmPageDraft, discardPageDraft } from "../state.svelte.js";
  import EntityPicker from "../components/EntityPicker.svelte";
  import BuiltinEditor from "./BuiltinEditor.svelte";
  import SectionFold from "../components/SectionFold.svelte";

  let { screenId, kind = "screen" } = $props();
  const isLib = $derived(kind === "controller");
  const isCustomCopy = $derived(isLib && !!app.draft?.controllers?.[screenId]?.variant_of);
  const domainStock = $derived(isLib && !isCustomCopy ? app.draft?.controllers?.[screenId]?.domain : null);
  const copyEntity = $derived(isCustomCopy ? app.draft?.controllers?.[screenId]?.entity : null);
  let customFor = $state("");
  let optionsOpen = $state(false);
  const stockName = $derived(isCustomCopy
    ? (app.draft.controllers[app.draft.controllers[screenId].variant_of]?.name ||
       app.draft.controllers[screenId].variant_of) : "");
  const usedBy = $derived(!isLib ? [] :
    Object.entries(app.draft?.activities || {})
      .filter(([, a]) => a.screen === "controller:" + screenId)
      .map(([aid, a]) => ({ aid, name: a.name || aid, room: a.room_view })));
  const backKey = $derived(
    app.prevKey && app.prevKey !== app.selKey &&
    (app.prevKey.startsWith("view.") || app.prevKey.startsWith("screens.")) ? app.prevKey : null);
  const backLabel = $derived.by(() => {
    if (!backKey) return "";
    const sid = backKey.startsWith("view.") ? backKey.slice(5) : backKey.slice(8);
    return app.draft?.screens?.[sid]?.name || sid;
  });
  const scr = $derived(isLib
    ? app.draft?.controllers?.[screenId]
    : app.draft?.screens?.[screenId]);
  function delPage() {
    const r = isLib ? deleteController(screenId) : deleteScreen(screenId);
    if (r !== true) setStatus("can't delete: " + r.join(" · "), "err");
  }
  function renamePage(e) {
    const ok = isLib ? renameController(screenId, e.target.value)
      : renameScreen(screenId, e.target.value);
    if (!ok) e.target.value = screenId;
  }
  /* this controller's drawers (Apps under TV Media Player, Library
     under MA Media Player) — features of the controller */
  const parentRef = $derived(isLib ? "controller:" + screenId : screenId);
  const drawers = $derived(Object.keys(app.draft?.screens || {})
    .filter((s) => app.draft.screens[s].parent === parentRef && app.draft.screens[s].drawer));
  let drawerOpen = $state({});
  const screenIds = $derived(Object.keys(app.draft?.screens || {}).filter((s) => s !== screenId));
  /* Home-key destinations: views only (Home goes UP) */
  const homeTargets = $derived.by(() => {
    const d = app.draft, sub = subordinateScreens();
    return Object.keys(d?.screens || {})
      .filter((sid) => sid !== screenId && !isControllerScreen(d.screens[sid]) &&
        !d.screens[sid].drawer && !sub.has(sid))
      .map((sid) => ({ value: sid, label: d.screens[sid].name || sid }));
  });
  const KEYS = ["up", "down", "left", "right", "select", "back", "home", "power",
    "menu", "vol_up", "vol_down", "mute", "ch_up", "ch_down"];

  function newTile(tiles) {
    /* a device STARTS with a name and an entity — everything else
       (renderer, icon, verbs, page) infers from the entity */
    tiles.push({ type: "device", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New device", icon: "material:devices", entity: "" });
  }
  function newNavTile(tiles) {
    /* the OTHER archetype: a nav card — opens another page */
    tiles.push({ type: "nav", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New nav card", icon: "material:layers" });
  }
  /* an in-flight ＋-minted PAGE draft (this page IS the draft) */
  const pageDraft = $derived(!isLib && app.pending?.kind === "page" &&
    app.pending.sid === screenId ? app.pending : null);
  const draftFrom = $derived.by(() => {
    if (!pageDraft) return "";
    if (pageDraft.activityId)
      return app.draft?.activities?.[pageDraft.activityId]?.name || pageDraft.activityId;
    if (pageDraft.ownerScreen)
      return app.draft?.screens?.[pageDraft.ownerScreen]?.name ||
        app.draft?.controllers?.[pageDraft.ownerScreen]?.name || pageDraft.ownerScreen;
    return "";
  });
  /* the physical-key policy consumes the derived class */
  function reclass() {
    scr.class = (scr.type || "hub") === "controller" ? "activity" : (scr.room ? "room" : "group");
    scr.view_kind = scr.type === "controller" ? "controller" : (scr.room ? "room hub" : "hub");
  }
  function addControlTarget() {
    scr.control_target = { label: "$activity.name", navigation: "$context.dpad",
      power: "$context.power", volume: "$context.volume", pass_through: [] };
  }
</script>

{#if scr}
  <div class="space-y-5">
    {#if pageDraft}
      <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-accent/50 bg-accent/10 px-3 py-2">
        <span class="text-sm text-ink">
          Drafting the page <b>{scr.name || screenId}</b>{#if draftFrom}
            &nbsp;for <b>{draftFrom}</b>{/if} — it's already live in the
          preview; <i>Discard removes it and unlinks</i>.
        </span>
        <Button size="sm" onclick={confirmPageDraft}>✓ Keep this page</Button>
        <Button size="sm" variant="danger" onclick={discardPageDraft}>✕ Discard</Button>
      </div>
    {/if}
    {#if backKey}
      <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
        onclick={() => selectSlice(backKey)}>← back to {backLabel}</button>
    {/if}
    {#if isLib}
      <div class={"flex flex-wrap items-center gap-3 rounded-[10px] border px-3 py-2 " +
        (isCustomCopy ? "border-line bg-tile" : "border-accent/50 bg-accent/10")}>
        {#if isCustomCopy}
          <span class="text-xs text-ink"><b>Custom copy</b> of {stockName}{copyEntity ? " — for " : " — yours alone."}{#if copyEntity}<b class="font-mono text-[11.5px]">{copyEntity}</b>{/if}</span>
          <Button size="sm" onclick={() => resetControllerToStock(screenId)}
            title="Replace this copy's content with the current stock surface">↺ Reset to stock</Button>
        {:else if domainStock}
          <span class="text-xs text-ink"><b>Stock {app.draft.controllers[screenId].name}</b> —
            every {domainStock} device's page. Edits here reach them ALL; pick a device
            for a private copy:</span>
          <div class="w-64"><EntityPicker bind:value={customFor} domains={[domainStock]} placeholder={domainStock + " entity…"} /></div>
          <Button size="sm" disabled={!customFor}
            onclick={() => { instantiateDeviceController(domainStock, customFor); customFor = ""; }}
          >⧉ Custom copy for device</Button>
        {:else}
          <span class="text-xs text-ink"><b>Stock controller</b> — shared: edits here reach
            {usedBy.length ? "" : " every future user"}
            {#each usedBy as u, i (u.aid)}{i > 0 ? " · " : " "}<b>{u.name}</b>{/each}.
          </span>
        {/if}
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-4">
      <Field label="View name"><Input bind:value={scr.name} /></Field>
      <Field label={isLib ? "Controller id" : "Page id"}
        hint={domainStock ? "fixed — this id IS the domain routing key"
          : isLib ? "addressed as controller:<id> — renames refs everywhere" : "the page's key — renames refs everywhere"}>
        <input value={screenId} spellcheck="false" disabled={!!domainStock}
          onchange={renamePage}
          class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60 disabled:opacity-50" />
      </Field>
      {#if isLib}
        <div class="flex items-end pb-1">
          <Button size="sm" onclick={() => duplicateController(screenId)}
            title="Copy this control surface as a new library variant">⧉ Duplicate variant</Button>
        </div>
      {:else}
        <Field label="Type" hint="hub = launcher page · controller = a control surface bound to its context">
          <Select
            value={scr.type || (scr.class === "activity" || scr.class === "detail" ? "controller" : "hub")}
            onchange={(e) => { scr.type = e.target.value; reclass(); }}
            options={[{ value: "hub", label: "Hub" }, { value: "controller", label: "Controller" }]} />
        </Field>
      {/if}
      <div class="flex items-end pb-1.5">
        <Switch
          checked={!!scr.room}
          label="Room view (owns activities · room-scope keys)"
          onCheckedChange={(v) => { if (v) scr.room = true; else delete scr.room; reclass(); }}
        />
      </div>
      <Field label="Home key" hint="where the Home key goes; also nests this page under it">
        <Select bind:value={scr.parent} options={homeTargets} allowEmpty />
      </Field>
      <Field label="Grid columns" hint="page default — blank = 2; sections can override">
        <Input type="number" min="1" max="4" value={scr.grid?.columns ?? ""} placeholder="2"
          onchange={(e) => { const v = +e.target.value;
            if (v >= 1) scr.grid = { ...(scr.grid || {}), columns: v };
            else if (scr.grid) { delete scr.grid.columns; if (!Object.keys(scr.grid).length) delete scr.grid; } }} />
      </Field>
      <div class="flex items-end pb-1.5">
        <Switch
          checked={!!scr.drawer}
          label="Drawer (pops back after a pick)"
          onCheckedChange={(v) => { if (v) scr.drawer = true; else delete scr.drawer; }}
        />
      </div>
    </div>

    <!-- control target -->
    <div class="rounded-[12px] border border-line bg-tile p-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Control target — what physical keys drive here</span>
        {#if scr.control_target}
          <Button size="sm" variant="danger" onclick={() => delete scr.control_target}>Remove</Button>
        {:else}
          <Button size="sm" onclick={addControlTarget}>Add control target</Button>
        {/if}
      </div>
      {#if scr.control_target}
        <div class="grid grid-cols-2 gap-3">
          <Field label="Label"><Input bind:value={scr.control_target.label} class="font-mono text-[12.5px]" /></Field>
          <Field label="Navigation (D-pad)"><Input bind:value={scr.control_target.navigation} placeholder="$context.dpad" class="font-mono text-[12.5px]" /></Field>
          <Field label="Power"><Input bind:value={scr.control_target.power} placeholder="$context.power" class="font-mono text-[12.5px]" /></Field>
          <Field label="Volume"><Input bind:value={scr.control_target.volume} placeholder="$context.volume" class="font-mono text-[12.5px]" /></Field>
        </div>
        <div class="mt-3">
          <Field label="Keys passed to the device" hint="everything else stays with the app">
            <Chips suggestions={KEYS} placeholder="add key…"
            bind:items={() => scr.control_target.pass_through ?? [],
              (v) => (scr.control_target.pass_through = v)} />
          </Field>
        </div>
      {:else}
        <p class="m-0 text-xs text-dim">No control target — physical keys drive the app on this view.</p>
      {/if}
    </div>

    <!-- tiles -->
    {#if scr.sections}
      {#each scr.sections as section, si (si)}
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Section</span>
            <input
              bind:value={section.hero_label}
              placeholder="(no header)"
              class="w-44 rounded-[8px] border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent/60"
            />
            <span class="text-[11px] text-dim">Columns</span>
            <input type="number" min="1" max="4" value={section.columns ?? ""} placeholder="page"
              onchange={(e) => { const v = +e.target.value;
                if (v >= 1) section.columns = v; else delete section.columns; }}
              class="w-16 rounded-[8px] border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent/60" />
            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
              title="Removes the whole section — its tiles go with it"
              onclick={() => scr.sections.splice(si, 1)}>
              delete section{(section.tiles || []).length ? " & " + section.tiles.length + " tiles" : ""}</button>
          </div>
          {#each section.tiles as tile, i (i)}
            <TileRow {tile} ownerScreen={screenId} tiles={section.tiles} index={i} />
          {/each}
          <div class="flex gap-2">
            <Button size="sm" onclick={() => newTile(section.tiles)}>＋ Add device</Button>
            <Button size="sm" onclick={() => newNavTile(section.tiles)}>＋ Add nav card</Button>
          </div>
        </div>
      {/each}
    {:else if scr.tiles}
      <div class="space-y-2">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Tiles</span>
        {#each scr.tiles as tile, i (i)}
          <TileRow {tile} ownerScreen={screenId} tiles={scr.tiles} index={i} />
        {/each}
        <div class="flex gap-2">
          <Button size="sm" onclick={() => newTile(scr.tiles)}>＋ Add device</Button>
          <Button size="sm" onclick={() => newNavTile(scr.tiles)}>＋ Add nav card</Button>
        </div>
      </div>
    {/if}
    <!-- LIBRARIES — this controller's pickers (simple pages, own editor) -->
    {#if drawers.length}
      <div class="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-tile p-3">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Libraries</span>
        {#each drawers as did (did)}
          <button class="cursor-pointer rounded-full border-0 bg-tile-hi px-3 py-1 text-xs text-ink hover:bg-hover"
            onclick={() => selectSlice("screens." + did)}>⌞ {app.draft.screens[did].name || did} →</button>
        {/each}
      </div>
    {/if}
    {#if domainStock}
      <SectionFold label="Per-device options" badge="invert & friends — applies everywhere, not just this page" bind:open={optionsOpen}>
        <BuiltinEditor domain={domainStock} embedded />
      </SectionFold>
    {/if}
    <div class="border-t border-line pt-3">
      <Button size="sm" variant="danger" onclick={delPage}>Delete this page</Button>
      <span class="ml-2 text-[11px] text-dim">refuses while anything still points here</span>
    </div>
  </div>
{/if}
