<script>
  /* One view (screen): identity, key policy hooks, and the tile lists —
     sectioned views get one card group per section. */
  import { app } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import InfoPop from "../components/InfoPop.svelte";
  import NoteStrip from "../components/NoteStrip.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import TileRow from "../components/TileRow.svelte";
  import Button from "../components/Button.svelte";
  import { selectSlice, renameScreen, deleteScreen, setStatus, subordinateScreens,
    isControllerScreen, renameController, deleteController, duplicateController,
    resetControllerToStock, instantiateDeviceController, entitiesFor,
    confirmPageDraft, discardPageDraft,
    previewActivity, previewGoto, previewDevice } from "../state.svelte.js";
  import EntityPicker from "../components/EntityPicker.svelte";
  import BuiltinEditor from "./BuiltinEditor.svelte";
  import SectionFold from "../components/SectionFold.svelte";
  import { KIND_SURFACES, controllerRoot, fillControlTargetDefaults, tunerOn, setTuner } from "../stocklib.js";

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
  /* A DEVICE PAGE'S CONTROL TARGET COMES FROM THE DEVICE (2026-09-06
     — Suresh's mental model, agreed: "when I pick a cast or device,
     I am saying show me what this controller would look like with
     that as an input" — and the input decides the keys too). The
     engine derives a device page's control target from the device it
     is shown for: Navigation = its D-pad role, Power/Volume = its
     roles; a device with no D-pad leaves the keys with the app. The
     panel used to read only the AUTHORED field and say "keys drive
     the app" while the preview showed BACK | HOME — the inversion he
     spotted. Now it says where the target really comes from, and
     reads the device being previewed. */
  const isDevicePage = $derived(isLib && !!app.draft?.controllers?.[screenId]?.domain);
  const pvKeys = $derived.by(() => {
    const e = app.pvEntity;
    if (!isDevicePage || !e) return null;
    for (const [did, d] of Object.entries(app.draft?.devices || {})) {
      const r = d?.roles || {};
      if (!Object.values(r).includes(e)) continue;
      return { name: d.name || did, dpad: r.dpad || null,
        power: r.power || null, volume: r.volume || null, loose: false };
    }
    return { name: e, dpad: null, power: null, volume: null, loose: true };
  });
  /* v0.85.7: an update found this stock surface edited in place (the
     pre-lock era allowed it) and PRESERVED the edit as the user's own
     copy instead of overwriting it. */
  const forkedByUpdate = $derived(isCustomCopy ? app.draft?.controllers?.[screenId]?.forked_by_update : null);
  let customFor = $state("");
  let optionsOpen = $state(false);
  /* PREVIEW-AS (2026-09-04 — Suresh, first controller variant: "The
     preview should show what I'm doing shouldn't it? Maybe at the top
     I set a device to use for preview purposes"). A controller only
     renders through a context, so the editor offers one: a per-device
     copy previews its own entity's page directly; a shared controller
     previews AS a chosen activity (the existing impersonation),
     defaulting to whoever already uses it. Ephemeral — never written
     to the config. */
  let pvAs = $state("");
  /* ROOM-PREFIXED labels (2026-09-05 — Suresh: "we should prefix the
     activity with the room — i.e. Porch-Listen to Music as I have
     more than one activity called Listen to Music") */
  const roomPrefix = (rv) => {
    const n = rv && (app.draft?.screens?.[rv]?.name || rv);
    return n ? n + " · " : "";
  };
  /* GROUPED (2026-09-06, the Lands-on triage's #3 — same logic,
     preview side): the activities already landing here lead, then
     the ones whose SHAPE suits this surface (kind → KIND_SURFACES
     against the controller's root), then everything else. All of
     them selectable — the engine impersonates any activity. */
  const pvOptions = $derived.by(() => {
    const rootId = controllerRoot(app.draft?.controllers || {}, screenId);
    const rest = Object.entries(app.draft?.activities || {})
      .filter(([aid]) => !usedBy.some((u) => u.aid === aid));
    const suits = ([, a2]) => !!rootId && KIND_SURFACES[a2?.kind] === rootId;
    const mk = (group) => ([aid, a2]) => ({ value: aid,
      label: roomPrefix(a2.room_view) + (a2.name || aid), group });
    return [
      ...usedBy.map((u) => ({ value: u.aid,
        label: roomPrefix(u.room) + u.name, group: "Uses this controller" })),
      ...rest.filter(suits).map(mk("Same shape")),
      ...rest.filter((e) => !suits(e)).map(mk("Other activities")),
    ];
  });
  function previewAs(aid) {
    pvAs = aid || "";
    /* roles-only: while DESIGNING the controller, the cast narrows
       to role-fillers — the per-activity riders are noise here
       (2026-09-05, feedback-1: "restrict the preview cast to the
       ones with controller roles") */
    /* an explicit pick — forces through the preview padlock, the way
       previewGoto always has (the lock guards against passive jumps,
       not against the person asking) */
    previewActivity(pvAs || null, true, true, true);   /* bare: the controller's own settings */
    if (pvAs) previewGoto("controller:" + screenId, true);
  }
  /* BARE FOR THE WHOLE VISIT (the ruling, 2026-09-07): an activity
     controller's editor renders the controller — with no pick the
     presumed owner's overrides must not leak either. Mount sends
     bare; unmount clears the pick and the flag. */
  $effect(() => {
    if (isLib && !isDevicePage) previewActivity(pvAs || null, !!pvAs, true, true);
    return () => { if (isLib && !isDevicePage) previewActivity(null, false, true, false); };
  });
  /* PREVIEW A DEVICE (2026-09-04 — Suresh: "When I try and clone the
     stock, preview as an activity should change to preview as a
     device"). A DOMAIN stock isn't parameterized by an activity at
     all — it renders per device — so its preview pick is a device
     entity: choose one and the preview opens that device's page,
     which is exactly the surface this stock (or its copies) draws. */
  let pvDev = $state("");
  /* PRE-WIRED DEVICES LEAD (2026-09-04, his side-by-side: the stock
     "looked wrong" because the preview's obvious pick was the wall
     panel's own Fully media_player — Idle, sourceless, unowned, so
     the chips self-hid and no strip came up. The page was right; the
     specimen was junk. Entities claimed by pre-wired devices are the
     ones a person means, so they sort first and say so.) */
  /* copies preview-a-device too (round 3 — Suresh: "Once I choose a
     PREVIEW entity, I can't change it. It shouldn't be locked to a
     device/entity"): the pick applies to the stock AND to per-device
     copies, so you can see any device through the surface at hand */
  const pvDomain = $derived(domainStock ||
    (isCustomCopy ? app.draft?.controllers?.[screenId]?.domain : null) || null);
  /* the COMBOBOX won (2026-09-05, his side-by-side: "img1 is a better
     picker than image 2"): device picks ride the EntityPicker —
     typeahead, mono ids, the pre-wired chip on claimed entities —
     with the pre-wired devices pinned on top. */
  const wiredEnts = $derived.by(() => {
    if (!pvDomain) return [];
    const out = [];
    for (const d of Object.values(app.draft?.devices || {}))
      for (const e of Object.values(d.roles || {}))
        if (typeof e === "string" && e.split(".")[0] === pvDomain &&
            !out.includes(e)) out.push(e);
    return out;
  });
  /* an UNBOUND template (a stock-editor copy — no entity) renders
     through a LENT device: the device impersonation binds its
     $device tiles while previewing (2026-09-05, feedback-1) */
  const isTemplate = $derived(isCustomCopy && !!app.draft?.controllers?.[screenId]?.domain && !copyEntity);
  function previewDev(eid) {
    pvDev = eid || "";
    if (!pvDev) return;
    app.pvEntity = pvDev;   /* the live pick — token rows read it */
    if (isTemplate) {
      previewDevice(pvDev, true);   /* explicit pick — see previewAs */
      previewGoto("controller:" + screenId, true);
    } else {
      previewGoto("detail:" + pvDev, true);
    }
  }
  $effect(() => () => { if (isTemplate && pvDev) previewDevice(null, true);
    app.pvEntity = null; });
  /* adopt the seed the stock banner handed over (feedback-2 #4) */
  $effect(() => {
    if (isTemplate && app.pvSeed && !pvDev) {
      const seed = app.pvSeed;
      app.pvSeed = null;
      previewDev(seed);
    }
  });
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
    <!-- PREVIEW stays a row only on CUSTOM COPIES; the stocks carry
         their pick inside the lock banner now (2026-09-05, feedback-1
         #2: "This interface is clunky … Why do we need the Preview
         Panel at all") -->
    {#if isLib && isCustomCopy}
      <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-tile px-3 py-2">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Preview</span>
        {#if copyEntity}
          <Button size="sm" onclick={() => { pvDev = ""; app.pvEntity = copyEntity;
              previewGoto("detail:" + copyEntity, true); }}
            title="Open this copy's own device page in the preview">⟶ Show {copyEntity}</Button>
          <div class="w-[280px]">
            <EntityPicker value={pvDev} domains={[pvDomain]}
              preferred={wiredEnts} prefLabel="Pre-wired devices"
              placeholder="or preview another device — type to search"
              onchange={(e) => previewDev(e.target.value)} />
          </div>
        {:else if isTemplate}
          <!-- a template has no device of its own — the preview LENDS
               it one and renders THIS surface bound to it -->
          <div class="w-[300px]">
            <EntityPicker value={pvDev} domains={[pvDomain]}
              preferred={wiredEnts} prefLabel="Pre-wired devices"
              placeholder="preview with a device — type to search"
              onchange={(e) => previewDev(e.target.value)} />
          </div>
          <span class="text-[11px] text-dim">renders this template as that device's page</span>
        {:else}
          <div class="w-[280px]">
            <Select value={pvAs} allowEmpty blankLabel="— preview as an activity… —"
              options={pvOptions} onchange={(e) => previewAs(e.target.value)} />
          </div>
          <span class="text-[11px] text-dim">the preview renders this surface AS that activity — its cast, its dialect, its apps</span>
        {/if}
      </div>
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
          <!-- ONE banner, his sketch (2026-09-05, feedback-1 #2):
               "Pick a device to preview or create a custom … using
               that device as a preview" — the dropdown previews as
               you pick, and the copy is a TEMPLATE any compatible
               device can adopt from its card, never bound to the
               picked device. -->
          <span class="text-xs text-ink">🔒 <b>Stock {app.draft.controllers[screenId].name} — locked.</b>
            Used by default by every {domainStock.replace(/_/g, " ")} device, and updates keep
            it current. Pick a device to preview, or create a custom copy —
            a template any compatible device can adopt from its card
            (per-device options stay live below):</span>
          <div class="w-[300px] min-w-[220px] rounded-[9px] ring-1 ring-accent/60">
            <EntityPicker bind:value={customFor} domains={[domainStock]}
              preferred={wiredEnts} prefLabel="Pre-wired devices"
              placeholder={"pick a " + domainStock.replace(/_/g, " ") + " — type to search"}
              onchange={(e) => { if (e.target.value) {
                app.pvEntity = e.target.value;
                previewGoto("detail:" + e.target.value, true); } }} />
          </div>
          <Button size="sm"
            title="A new editable template copied from this stock — assign it to devices from their cards"
            onclick={() => {
              /* the picked device RIDES INTO the new template's editor
                 (2026-09-05, feedback-2 #4: "it blanks my Preview
                 Selection … I cant see what I chose") — the seed lands
                 in app.pvSeed and the template editor adopts it as its
                 live, changeable preview pick */
              app.pvSeed = customFor || null;
              instantiateDeviceController(domainStock, null, true);
              customFor = "";
            }}>⧉ Create custom copy</Button>
        {:else}
          <!-- same merge for NAMED stocks (feedback-1, Activity #1):
               the preview pick lives in the banner, one surface -->
          <span class="text-xs text-ink">🔒 <b>Stock controller — locked.</b>
            It's shared{#each usedBy as u, i (u.aid)}{i === 0 ? " by " : " · "}<b>{u.name}</b>{/each}{usedBy.length ? "" : " by every activity that lands here"},
            and updates keep it current — so edits here would be reverted. Pick an
            activity to preview, or create a custom copy to edit:</span>
          <div class="w-[280px] min-w-[200px]">
            <Select value={pvAs} allowEmpty blankLabel="— preview as an activity… —"
              options={pvOptions} onchange={(e) => previewAs(e.target.value)} />
          </div>
          <Button size="sm" onclick={() => duplicateController(screenId)}
            title="Make an editable copy of this surface — the stock stays locked">⧉ Create custom copy</Button>
          {#if usedBy.length === 1}
            <span class="w-full text-[11px] text-dim">Just for <b>{usedBy[0].name}</b>? Customize it from that activity's card instead — that copies it for that one activity.</span>
          {/if}
        {/if}
      </div>
    {/if}
    <!-- LOCK BOUNDARY (v0.84.5): a locked stock surface goes inert —
         the shape below is heal-volatile, so it's look-don't-touch
         until Duplicate-to-edit forks a copy. -->
    <!-- WHICH KIND OF CONTROLLER (2026-09-06 — Suresh: "if the
         controller is a $device controller, we should clear flag
         that... [on] the controller edit page"). Two kinds, said out
         loud, above the lock boundary so it never dims. -->
    {#if isLib}
      <div class="flex flex-wrap items-center gap-2" data-ctrl-kind={isDevicePage ? "device" : "activity"}>
        {#if isDevicePage}
          <span class="rounded-[6px] bg-sunk px-2 py-[3px] font-mono text-[11px] text-ink">$device</span>
          <span class="text-xs text-dim"><b class="text-ink">Device page</b> — draws one device; every tile points at <span class="font-mono">$device</span>. A device adopts it from its card in Pre-wired Devices.</span>
        {:else}
          <span class="rounded-[6px] bg-sunk px-2 py-[3px] font-mono text-[11px] text-ink">$context</span>
          <span class="text-xs text-dim"><b class="text-ink">Activity surface</b> — draws the running activity; tiles point at <span class="font-mono">$context.&lt;role&gt;</span>, filled by the activity's cast.</span>
        {/if}
      </div>
    {/if}
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
          <!-- NOT on a domain stock (2026-09-04): its routing key is
               the domain + a per-device entity — an unbound duplicate
               of it is unreachable by anything, a trap. The per-device
               copy in the banner is the only honest fork. -->
          {#if !domainStock}
            <Button size="sm" onclick={() => duplicateController(screenId)}
              title="Copy this control surface as a new library variant">⧉ Duplicate variant</Button>
          {/if}
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
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Control target — what physical keys drive
          <!-- the blue ⓘ (2026-09-04 — his ruling, and this exact
               panel confused him: "Navigation has a $context.dpad in
               it. I think thats a suggestion and the field is unset,
               but it confused me") -->
          <InfoPop title="Control target"
            text="Which entity the physical keys drive while standing on this view, and which keys pass through to it. Blank fields keep today's behavior: a blank Navigation means the pad walks the app's tiles; blank Power keeps the power key's normal meaning; blank Volume rides the activity's wiring. $context.* refs resolve from whatever activity or device supplies the page."
            examples={[
              { label: "a TV surface — full passthrough",
                json: { label: "$activity.name", navigation: "$context.dpad",
                  power: "$context.power", volume: "$context.volume",
                  pass_through: ["up", "down", "left", "right", "select", "back", "home", "power"] } },
              { label: "power-only (a drawer that must never steal the pad)",
                json: { label: "$activity.name", power: "$context.power",
                  volume: "$context.volume", pass_through: ["power"] } },
            ]} />
        </span>
        {#if scr.control_target}
          <span class="flex items-center gap-2">
            <!-- his ask #2: the TV-surface shape in one tap — fills
                 blanks, unions the standard keys, clobbers nothing -->
            <Button size="sm" onclick={() => fillControlTargetDefaults(scr.control_target)}
              title="Blank fields take the $ tokens; up / down / left / right / select / back / home / power join the passed keys. Anything already set is kept.">Fill in defaults</Button>
            <Button size="sm" variant="danger" onclick={() => delete scr.control_target}>Remove</Button>
          </span>
        {:else}
          <Button size="sm" onclick={addControlTarget}>Add control target</Button>
        {/if}
      </div>
      {#if scr.control_target}
        <!-- placeholders SAY WHAT BLANK DOES (2026-09-04 — a token in
             the placeholder read as a set value); the token examples
             moved to the hints and the ⓘ -->
        <div class="grid grid-cols-2 gap-3">
          <Field label="Label" hint="the name the BACK/HOME strip shows while keys are passed — $activity.name = the running activity">
            <Input bind:value={scr.control_target.label} class="font-mono text-[12.5px]" /></Field>
          <Field label="Navigation (D-pad)" hint="e.g. $context.dpad — where passed-through arrows/OK go">
            <Input bind:value={scr.control_target.navigation} placeholder="blank — the pad walks the app" class="font-mono text-[12.5px]" /></Field>
          <Field label="Power" hint="e.g. $context.power">
            <Input bind:value={scr.control_target.power} placeholder="blank — power keeps its normal meaning" class="font-mono text-[12.5px]" /></Field>
          <Field label="Volume" hint="e.g. $context.volume">
            <Input bind:value={scr.control_target.volume} placeholder="blank — rides the activity's wiring" class="font-mono text-[12.5px]" /></Field>
        </div>
        <div class="mt-3">
          <Field label="Additional physical keys passed to the device" hint="everything else stays with the app">
            <Chips suggestions={KEYS} placeholder="add key…"
            bind:items={() => scr.control_target.pass_through ?? [],
              (v) => (scr.control_target.pass_through = v)} />
          </Field>
        </div>
        <!-- THE TUNER, OUT LOUD (the 2026-09-05 forum promise — "we
             actually use those for navigating the tv"): channel
             up/down's destination was invisible logic (the tuner
             flag); now it's a switch. ON = CH goes to the device (a
             cable box, a TV tuner) even without ch chips; OFF = CH
             walks the panel unless the chips above pass it. -->
        <div class="mt-2">
          <!-- ONE SPELLING (2026-09-06 — Suresh: "shouldn't we add
               PgUp and PgDn to the physical keys... list (and remove
               them when toggled off)"): the switch IS the ch_up /
               ch_down chips — reads them, writes them; the legacy
               `tuner` flag heals into chips on load -->
          <Switch
            checked={tunerOn(scr.control_target)}
            label="TV tuner — channel up/down go to the device (adds ch_up / ch_down to the keys above)"
            onCheckedChange={(v) => setTuner(scr.control_target, v)}
          />
        </div>
      {:else if isDevicePage}
        <p class="m-0 text-xs text-dim">
          <b>From the device.</b> A device page's control target comes from
          the device it's shown for: Navigation is its D-pad role, Power and
          Volume its power and volume roles. A device with no D-pad leaves the
          physical keys with the app. It's set per device in
          <b>Pre-wired Devices</b>, not here.
        </p>
        {#if pvKeys}
          <p class="mt-1.5 mb-0 text-xs text-ink" data-pvkeys>
            Previewing <b>{pvKeys.name}</b>:
            {#if pvKeys.dpad}
              physical keys drive the device — Navigation
              <span class="font-mono text-[11.5px]">{pvKeys.dpad}</span>{#if pvKeys.power},
              Power <span class="font-mono text-[11.5px]">{pvKeys.power}</span>{/if}{#if pvKeys.volume},
              Volume <span class="font-mono text-[11.5px]">{pvKeys.volume}</span>{/if}
              (the BACK | HOME strip).
            {:else if pvKeys.loose}
              a loose entity, not a pre-wired device — physical keys stay with the app.
            {:else}
              no D-pad role — physical keys stay with the app.
            {/if}
          </p>
        {/if}
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
