<script>
  /* One view (screen): identity, key policy hooks, and the tile lists —
     sectioned views get one card group per section. */
  import { app } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import NoteStrip from "../components/NoteStrip.svelte";
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
  /* THE STOCK LOCK (v0.84.5 — Suresh: "stock things should be locked;
     if users want to edit it should be on local copies"). ANY stock
     controller — named (tv/music/…) or a domain stock (climate/light/…)
     — is read-only: its shape is heal-volatile, so an in-place edit
     would be silently reverted on the next update. The body goes inert;
     the door forward is a fork that is yours — ⧉ Duplicate to edit for
     a named stock, or a per-device copy for a domain stock. The domain
     stock's Per-device options (entity_options — invert & friends) are
     NOT heal-volatile, so they stay live BELOW the lock boundary. */
  const locked = $derived(isLib && !isCustomCopy);
  const copyEntity = $derived(isCustomCopy ? app.draft?.controllers?.[screenId]?.entity : null);
  /* v0.85.7: an update found this stock surface edited in place (the
     pre-lock era allowed it) and PRESERVED the edit as the user's own
     copy instead of overwriting it. */
  const forkedByUpdate = $derived(isCustomCopy ? app.draft?.controllers?.[screenId]?.forked_by_update : null);
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
       (renderer, icon, verbs, page) infers from the entity.
       span 2 (full width) is the default — most devices want it */
    tiles.push({ type: "device", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New device", icon: "material:devices", entity: "", span: 2 });
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
  /* LAYOUT (v0.75 — Suresh: "We should have a setting somewhere for
     grid size and tile mode size"): grid.* edited surgically — the
     keys you don't touch survive, empties are deleted, and an empty
     grid block leaves the config entirely. */
  function setGridNum(key, val) {
    const n = Number(val);
    if (!scr.grid) scr.grid = {};
    if (n > 0) scr.grid[key] = n; else delete scr.grid[key];
    if (!Object.keys(scr.grid).length) delete scr.grid;
  }
  function setGridStr(key, val) {
    if (!scr.grid) scr.grid = {};
    if (val) scr.grid[key] = val; else delete scr.grid[key];
    if (!Object.keys(scr.grid).length) delete scr.grid;
  }
</script>

{#if scr}
  <div class="space-y-5">
    <NoteStrip dismissKey="view">
      <b>A controller is a shared control surface.</b> Activities pass
      their devices and roles into it — editing it changes every
      activity that lands here.
    </NoteStrip>
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
        (isCustomCopy || locked ? "border-line bg-tile" : "border-accent/50 bg-accent/10")}>
        {#if forkedByUpdate}
          <span class="text-xs text-ink"><b>Your edited copy, preserved.</b>
            You changed this built-in before it was locked, so an update kept
            your version instead of overwriting it. It's yours now — editable,
            and updates won't touch it. The built-in has moved on
            {#if forkedByUpdate.stock_gen}(now at gen {forkedByUpdate.stock_gen}){/if};
            reset any time to adopt it.</span>
          <Button size="sm" onclick={() => resetControllerToStock(screenId)}
            title="Discard this copy and return to the locked, always-current built-in">↺ Reset to built-in</Button>
        {:else if isCustomCopy}
          <span class="text-xs text-ink"><b>Custom copy</b> of {stockName}{copyEntity ? " — for " : " — yours alone."}{#if copyEntity}<b class="font-mono text-[11.5px]">{copyEntity}</b>{/if}</span>
          <Button size="sm" onclick={() => resetControllerToStock(screenId)}
            title="Replace this copy's content with the current stock surface">↺ Reset to stock</Button>
        {:else if domainStock}
          <span class="text-xs text-ink">🔒 <b>Stock {app.draft.controllers[screenId].name} — locked.</b>
            Shared by every {domainStock} device, and updates keep it current. Pick a device
            for an editable copy (per-device options stay live below):</span>
          <div class="w-64"><EntityPicker bind:value={customFor} domains={[domainStock]} placeholder={domainStock + " entity…"} /></div>
          <Button size="sm" disabled={!customFor}
            onclick={() => { instantiateDeviceController(domainStock, customFor); customFor = ""; }}
          >⧉ Custom copy for device</Button>
        {:else}
          <span class="text-xs text-ink">🔒 <b>Stock controller — locked.</b>
            It's shared{#each usedBy as u, i (u.aid)}{i === 0 ? " by " : " · "}<b>{u.name}</b>{/each}{usedBy.length ? "" : " by every activity that lands here"},
            and updates keep it current — so edits here would be reverted. To change it, edit a copy.</span>
          <Button size="sm" onclick={() => duplicateController(screenId)}
            title="Make an editable copy of this surface — the stock stays locked">⧉ Duplicate to edit</Button>
          {#if usedBy.length === 1}
            <span class="w-full text-[11px] text-dim">Just for <b>{usedBy[0].name}</b>? Customize it from that activity's card instead — that copies it for that one activity.</span>
          {/if}
        {/if}
      </div>
    {/if}
    <!-- LOCK BOUNDARY (v0.84.5): a locked stock surface goes inert —
         the shape below is heal-volatile, so it's look-don't-touch
         until Duplicate-to-edit forks a copy. -->
    <div class="space-y-5" inert={locked}
      class:opacity-50={locked} class:pointer-events-none={locked} class:select-none={locked}>
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
      <Field label="Home key" hint="where the Home key goes; also nests this page under it">
        <Select bind:value={scr.parent} options={homeTargets} allowEmpty />
      </Field>
      <div class="flex items-end pb-1.5">
        <Switch
          checked={!!scr.drawer}
          label="Drawer (pops back after a pick)"
          onCheckedChange={(v) => { if (v) scr.drawer = true; else delete scr.drawer; }}
        />
      </div>
    </div>

    <!-- LAYOUT (v0.75): how many tiles across, and how tall they run.
         Blank = inherit — the theme's global knobs and the engine's
         defaults. Card/Row height land as grid.tile_h / grid.row_h,
         which the engine pins per-screen (render.js v0.75). -->
    <div class="rounded-[12px] border border-line bg-tile p-3">
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Layout — grid &amp; tile size</div>
      <div class="grid grid-cols-5 gap-3">
        <Field label="Columns" hint="a tile-size statement — wide panels fit more of them">
          <Input type="number" min="1" max="12" value={scr.grid?.columns ?? ""}
            placeholder="2" oninput={(e) => setGridNum("columns", e.target.value)} />
        </Field>
        <Field label="Tile style" hint="rows = dense list">
          <Select value={scr.grid?.tile_style ?? ""} allowEmpty
            options={[{ value: "card", label: "Cards" }, { value: "row", label: "Rows" }]}
            onchange={(e) => setGridStr("tile_style", e.target.value)} />
        </Field>
        <Field label="Card height px" hint="blank = theme tile height">
          <Input type="number" min="40" max="400" value={scr.grid?.tile_h ?? ""}
            placeholder="84" oninput={(e) => setGridNum("tile_h", e.target.value)} />
        </Field>
        <Field label="Row height px" hint="blank = theme (tile height − 6)">
          <Input type="number" min="32" max="400" value={scr.grid?.row_h ?? ""}
            placeholder="78" oninput={(e) => setGridNum("row_h", e.target.value)} />
        </Field>
        <Field label="Max width px" hint="wide panels: cap the content and centre it">
          <Input type="number" min="320" max="4000" value={scr.grid?.max_width ?? ""}
            placeholder="full" oninput={(e) => setGridNum("max_width", e.target.value)} />
        </Field>
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
    <div class="border-t border-line pt-3">
      <Button size="sm" variant="danger" onclick={delPage}>Delete this page</Button>
      <span class="ml-2 text-[11px] text-dim">refuses while anything still points here</span>
    </div>
    </div><!-- /lock boundary -->
    <!-- OUTSIDE the lock: a domain stock's per-device options edit
         entity_options (invert & friends), not the heal-volatile shape,
         so they stay live even while the stock layout is locked. -->
    {#if domainStock}
      <SectionFold label="Per-device options" badge="invert & friends — applies everywhere, not just this page" bind:open={optionsOpen}>
        <BuiltinEditor domain={domainStock} embedded />
      </SectionFold>
    {/if}
  </div>
{/if}
