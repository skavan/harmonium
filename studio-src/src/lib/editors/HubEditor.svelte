<script>
  /* THE HUB EDITOR — one editor for every hub. The hub IS the page:
     identity/structure, hero, tile sections — and when the hub is a
     room (owner of activities), its activities, room functions, and
     the config-level Advanced knobs appear too. Comfort and Music
     Library are the same editor with those bits absent (and they can
     be turned on). Apps is a hub too — a drawer whose content is the
     generated registry grid. */
  import { app, ownedActivities, roomIds, schedulePreview, renameScreen, deleteScreen, setStatus, subordinateScreens, isControllerScreen, confirmPageDraft, discardPageDraft, stampHost } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import ActivityCard from "../components/ActivityCard.svelte";
  import SectionFold from "../components/SectionFold.svelte";
  import TileRow from "../components/TileRow.svelte";
  import Button from "../components/Button.svelte";

  let { screenId } = $props();
  const d = $derived(app.draft);
  const scr = $derived(d?.screens?.[screenId]);
  const screenIds = $derived(Object.keys(d?.screens || {}).filter((s) => s !== screenId));
  /* owner room = it appears in roomIds (the rooms-overview hub is a
     room-scope hub but owns no activities) */
  const isOwnerRoom = $derived(roomIds().includes(screenId));
  const owned = $derived(ownedActivities(screenId));
  const edit = () => schedulePreview();
  const KEYS = ["up", "down", "left", "right", "select", "back", "home", "power",
    "menu", "vol_up", "vol_down", "mute", "ch_up", "ch_down"];

  let heroOpen = $state(false);
  let actsOpen = $state(true);
  /* returning from a ＋-minted action draft re-opens the exact card */
  $effect(() => {
    if (app.focusActivity && d?.activities?.[app.focusActivity]) {
      lastAdded = app.focusActivity;
      actsOpen = true;
      app.focusActivity = null;
    }
  });
  /* the page id AUTO-FOLLOWS the name (slug) until hand-pinned —
     same rule as activity ids; renameScreen walks every ref */
  const pslug = (s) =>
    (s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let pageAutoBefore = false;
  const pageIsAuto = () => /^new_view/.test(screenId) || screenId === pslug(scr?.name);
  function autoRenamePage() {
    if (!pageAutoBefore) return;
    let nid = pslug(scr.name);
    if (!nid || nid === screenId) return;
    if (d.screens[nid]) {
      let n = 2;
      while (d.screens[nid + "_" + n]) n++;
      nid = nid + "_" + n;
    }
    renameScreen(screenId, nid);
  }
  /* Power is a per-page SETTING (v0.26), default Auto: a page that
     hosts activities ends the running one (tap = confirm, hold =
     immediate, idle = nothing); a plain page switches its devices;
     controllers pass Power to the device. */
  const hosts = $derived(!!scr?.room || owned.length > 0);
  /* Home-key destinations: VIEWS only — never controllers, drawers,
     or subordinate pages (Home goes UP, not sideways) */
  const homeTargets = $derived.by(() => {
    const sub = subordinateScreens();
    return Object.keys(d?.screens || {})
      .filter((sid) => sid !== screenId && !isControllerScreen(d.screens[sid]) &&
        !d.screens[sid].drawer && !sub.has(sid))
      .map((sid) => ({ value: sid, label: d.screens[sid].name || sid }));
  });
  const isCtrlPage = $derived(scr?.type === "controller" || scr?.class === "activity");
  const powerAutoLabel = $derived(hosts
    ? "Auto — ends the running activity (tap confirms · hold is immediate · idle does nothing)"
    : "Auto — switches this page's devices off/on (confirm)");
  /* ---- KEY BINDINGS (v0.28): screen.buttons rendered honestly.
     One action grammar: {sequence} | {navigate} | {service,…}. The
     "All Off" of old is just an Action a power_hold binding points
     at — nothing special left. */
  const BIND_KEYS = [
    ["power_hold", "Power (hold)"], ["menu_hold", "Menu (hold)"],
    ["vol_up", "Vol +"], ["vol_down", "Vol −"],
    ["ch_up", "CH +"], ["ch_down", "CH −"], ["mute", "Mute"],
  ];
  const keyLabel = (k) => BIND_KEYS.find(([id]) => id === k)?.[1] || k;
  const bindings = $derived(Object.entries(scr?.buttons || {}));
  const seqOptions = $derived(Object.entries(d?.sequences || {})
    .map(([sid, s]) => ({ value: sid, label: s.name || sid })));
  const navOptions = $derived(Object.entries(d?.screens || {})
    .filter(([sid]) => sid !== screenId)
    .map(([sid, sc]) => ({ value: sid, label: sc.name || sid })));
  const bindKind = (b) => b?.sequence != null ? "sequence"
    : b?.navigate != null ? "navigate" : "service";
  function addBinding() {
    if (!scr.buttons) scr.buttons = {};
    const free = BIND_KEYS.find(([k]) => !(k in scr.buttons));
    if (!free) return;
    scr.buttons[free[0]] = { sequence: seqOptions[0]?.value || "" };
    edit();
  }
  function moveBinding(oldK, newK) {
    if (!newK || newK === oldK || scr.buttons[newK]) return false;
    const rebuilt = {};
    for (const [k, v] of Object.entries(scr.buttons)) rebuilt[k === oldK ? newK : k] = v;
    scr.buttons = rebuilt;
    edit();
    return true;
  }
  function setBindKind(k, kind) {
    if (kind === "sequence") scr.buttons[k] = { sequence: seqOptions[0]?.value || "" };
    else if (kind === "navigate") scr.buttons[k] = { navigate: navOptions[0]?.value || "" };
    edit();
  }
  function dropBinding(k) {
    delete scr.buttons[k];
    if (!Object.keys(scr.buttons).length) delete scr.buttons;
    edit();
  }
  let ctOpen = $state(false);
  let advOpen = $state(false);
  let lastAdded = $state(null);
  let secOpen = $state({});

  /* canonical anatomy: every hub has the same folds. Sections carry
     ROLES (activities/presets/devices/custom); older drafts without
     roles are inferred here the same way the compiler does. */
  const roleOf = (s) => {
    if (s.role) return s.role;
    const types = new Set((s.tiles || []).map((t) => t.type));
    if (types.has("activity") || types.has("activities")) return "activities";
    if (types.has("preset") || types.has("presets_from")) return "presets";
    if (types.has("apps")) return "custom";
    return types.size ? "devices" : "custom";
  };
  const indexed = $derived((scr?.sections || []).map((s, i) => ({ s, i })));
  const roleSection = (role) => indexed.find(({ s }) => roleOf(s) === role) || null;
  const customSections = $derived(indexed.filter(({ s, i }) => {
    const r = roleOf(s);
    if (r === "activities") return false;
    if (r === "presets" || r === "devices") return roleSection(r)?.i !== i;
    return true;
  }));
  function addRoleSection(role, label) {
    if (!scr.sections) scr.sections = [];
    scr.sections.push({ role, hero_label: label, tiles: [] });
  }
  function addSection() {
    if (!scr.sections) scr.sections = [];
    scr.sections.push({ role: "custom", hero_label: "New group", tiles: [] });
    secOpen[scr.sections.length - 1] = true;
  }
  function newTile(tiles) {
    /* a device STARTS with a name and an entity — everything else
       (renderer, icon, verbs, page) infers from the entity.
       span 2 (full width) is the default — most devices want it */
    tiles.push({ type: "device", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New device", icon: "material:devices", entity: "", span: 2 });
  }
  function newNavTile(tiles) {
    /* the OTHER archetype: a nav card — opens another page (style
       resolves auto; its concertina links or ＋-mints the page) */
    tiles.push({ type: "nav", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New nav card", icon: "material:layers" });
  }
  /* an in-flight ＋-minted PAGE draft (this page IS the draft) */
  const pageDraft = $derived(app.pending?.kind === "page" && app.pending.sid === screenId
    ? app.pending : null);
  const draftFrom = $derived.by(() => {
    if (!pageDraft) return "";
    if (pageDraft.activityId)
      return d?.activities?.[pageDraft.activityId]?.name || pageDraft.activityId;
    if (pageDraft.ownerScreen)
      return d?.screens?.[pageDraft.ownerScreen]?.name ||
        d?.controllers?.[pageDraft.ownerScreen]?.name || pageDraft.ownerScreen;
    return "";
  });

  function ensureActivitiesGenerator() {
    if (!scr.sections) scr.sections = [];
    let sec = indexed.find(({ s }) => roleOf(s) === "activities")?.s;
    if (!sec) {
      sec = { role: "activities", hero_label: "Activities", tiles: [] };
      scr.sections.unshift(sec);
    }
    const hasGen = (sec.tiles || []).some(
      (t) => t.type === "activities" && (t.room || null) === screenId);
    const hasRefs = (sec.tiles || []).some((t) => t.type === "activity");
    if (!hasGen && !hasRefs)
      sec.tiles.push({ id: "acts", type: "activities", room: screenId });
  }
  function addActivity() {
    /* the first activity makes this page a HOST — sticky (the minted
       select lives as long as the page; no toggle, no ceremony) */
    stampHost(scr);
    ensureActivitiesGenerator();
    let id = "new_activity", n = 2;
    while (d.activities[id]) id = "new_activity_" + n++;
    d.activities[id] = {
      name: "New Activity", icon: "material:play_circle", color: "#e89b17",
      start: "", context: {}, screen: "", confirm_end: true,
      room_view: screenId,
    };
    lastAdded = id;
    actsOpen = true;
  }
  function moveActivity(id, dir) {
    const keys = Object.keys(d.activities);
    const mine = keys.filter((k) => owned.includes(k));
    const mi = mine.indexOf(id);
    const swapWith = mine[mi + dir];
    if (!swapWith) return;
    const i = keys.indexOf(id), j = keys.indexOf(swapWith);
    [keys[i], keys[j]] = [keys[j], keys[i]];
    const rebuilt = {};
    for (const k of keys) rebuilt[k] = d.activities[k];
    d.activities = rebuilt;
  }
</script>

{#if scr}
  <div class="space-y-4">
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
    <div class="grid grid-cols-2 gap-4">
      <Field label="Name" hint={pageIsAuto() ? "the page id follows along (slug)" : ""}>
        <Input value={scr.name}
          onfocus={() => (pageAutoBefore = pageIsAuto())}
          oninput={(e) => { scr.name = e.target.value;
            if (isOwnerRoom || screenId === d.home_screen) d.global.room = e.target.value;
            edit(); }}
          onchange={autoRenamePage} />
      </Field>
      <Field label="Page id"
        hint="the page's key — the minted select.harmonium_<id>_activity follows it; renames refs everywhere">
        <input value={screenId} spellcheck="false"
          onchange={(e) => { if (!renameScreen(screenId, e.target.value)) e.target.value = screenId; }}
          class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
      </Field>
      {#if isOwnerRoom}
        <div class="flex items-end gap-6 pb-1.5">
          <Switch bind:checked={d.global.confirm_switch} label="Confirm activity switch" onCheckedChange={edit} />
          <Switch bind:checked={d.global.debug} label="Key debug" onCheckedChange={edit} />
        </div>
      {/if}
    </div>

    <!-- KEY MAPPINGS — what the physical keys mean HERE (key-centric,
         per Suresh's doc; Parent is presented as the Home key) -->
    <div class="rounded-[12px] border border-line bg-tile p-3">
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Key mappings</div>
      <div class="grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-2">
        <span class="text-xs font-bold text-dim">Home</span>
        <div class="flex items-center gap-2">
          <span class="font-mono text-[11px] text-dim">page:</span>
          <Select bind:value={scr.parent} options={homeTargets} allowEmpty class="max-w-56" />
          <span class="text-[11px] text-dim">also nests this view under it</span>
        </div>
        <span class="text-xs font-bold text-dim">Back</span>
        <span class="text-xs text-dim">UI back — unwinds history (chevron in the status bar)</span>
        <span class="text-xs font-bold text-dim">Power</span>
        {#if isCtrlPage}
          <span class="text-xs text-dim">passes to the device (control target)</span>
        {:else}
          <Select value={scr.power ?? ""}
            onchange={(e) => { if (e.target.value) scr.power = e.target.value; else delete scr.power; edit(); }}
            options={[
              { value: "", label: powerAutoLabel },
              { value: "activity", label: "End the running activity" },
              { value: "devices", label: "Switch this page's devices off/on" },
            ]} class="max-w-md" />
        {/if}
</div>
      {#if !isCtrlPage}
        <!-- KEY BINDINGS — their own block: key → action, one line each -->
        <div class="mt-3 border-t border-line pt-2.5">
          <div class="mb-2 text-[10px] font-bold tracking-[.08em] text-dim/80 uppercase">Key bindings</div>
          <div class="space-y-2">
            {#each bindings as [bk, b] (bk)}
              <div class="flex items-center gap-2">
                <select value={bk} title="Which key this binding claims"
                  onchange={(e) => { if (!moveBinding(bk, e.target.value)) e.target.value = bk; }}
                  class="w-36 shrink-0 cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2 py-1.5 text-xs font-bold text-ink outline-none focus:border-accent/60">
                  {#each BIND_KEYS as [k, lbl] (k)}
                    <option value={k} disabled={k !== bk && !!scr.buttons?.[k]}>{lbl}</option>
                  {/each}
                </select>
                {#if bindKind(b) === "service"}
                  <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-dim"
                    title="A raw service binding — edit in the Code tab">{b.service} → {b.entity || b.target || "—"}</span>
                {:else}
                  <div class="w-36 shrink-0">
                    <Select value={bindKind(b)} onchange={(e) => setBindKind(bk, e.target.value)}
                      options={[{ value: "sequence", label: "Run action" }, { value: "navigate", label: "Go to page" }]} />
                  </div>
                  <div class="max-w-72 min-w-0 flex-1">
                    {#if bindKind(b) === "sequence"}
                      <Select bind:value={b.sequence} options={seqOptions} onchange={edit} />
                    {:else}
                      <Select bind:value={b.navigate} options={navOptions} onchange={edit} />
                    {/if}
                  </div>
                {/if}
                <button class="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                  title="Remove this binding" onclick={() => dropBinding(bk)}>✕</button>
              </div>
            {/each}
            {#if !scr.buttons?.power_hold}
              <div class="flex items-center gap-2 text-[11px] text-dim">
                <span class="w-36 shrink-0 text-xs font-bold text-dim/60">Power (hold)</span>
                <span>default: ends the running activity immediately — bind an action to make it this page's All Off</span>
              </div>
            {/if}
            {#if BIND_KEYS.some(([k]) => !(scr.buttons || {})[k])}
              <button class="cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2.5 py-1 text-xs text-dim hover:border-accent/60 hover:text-accent"
                onclick={addBinding}>＋ Add key binding</button>
            {/if}
          </div>
        </div>
      {/if}
      <div class="mt-3 space-y-1.5 border-t border-line pt-2.5">
        <div class="flex flex-wrap items-center gap-2">
          <Switch checked={!!scr.drawer} label="Drawer"
            onCheckedChange={(v) => { if (v) scr.drawer = true; else delete scr.drawer; }} />
          <span class="text-[11px] text-dim">opens as a picker — pops back to where you came from after one tap (Apps, libraries)</span>
        </div>
      </div>
    </div>

    <!-- HERO — any hub can have one -->
    <SectionFold label="Hero card" badge={scr.banner ? "" : "off — add one"} bind:open={heroOpen}>
      {#if scr.banner}
        <div class="flex flex-wrap items-center gap-6">
          <Switch checked={scr.banner.enabled !== false} label="Hero enabled"
            onCheckedChange={(v) => { if (v) delete scr.banner.enabled; else scr.banner.enabled = false; }} />
          <Switch checked={scr.banner.tabs !== false} label="Section tabs"
            onCheckedChange={(v) => { if (v) delete scr.banner.tabs; else scr.banner.tabs = false; }} />
          <Switch bind:checked={scr.banner.show_time} label="Show clock" />
          <Switch checked={scr.banner.fit !== false} label="Self-fitting height"
            onCheckedChange={(v) => { if (v) delete scr.banner.fit; else scr.banner.fit = false; edit(); }} />
        </div>
        <p class="m-0 text-[11px] text-dim">
          Self-fitting: the hero treats Height as a ceiling and shrinks
          (never below the floor) so a whole number of tiles fits above
          the fold — that's why height edits seem to move in tile-sized
          steps, and why each device lands slightly differently. Switch
          it off for the exact height, always (a tile may then be cut at
          the fold until you scroll).
        </p>
        <div class="grid grid-cols-2 gap-3">
          <Field label="Title override" hint="blank = the hub's name">
            <Input bind:value={scr.banner.title} placeholder={scr.name || screenId} />
          </Field>
          <Field label="Image" hint="path under /local/ (HA www/)">
            <Input bind:value={scr.banner.image} placeholder="/local/images/Porch_Render.jpg" class="font-mono text-[12.5px]" />
          </Field>
          <Field label="Image opacity">
            <Input type="number" min="0" max="1" step="0.05" bind:value={scr.banner.image_opacity} />
          </Field>
          <Field label="Height" hint={scr.banner.fit === false ? "exact" : "ceiling — self-fit may shrink it"}>
            <Input bind:value={scr.banner.height} placeholder="230px" /></Field>
          <Field label="Height floor" hint={scr.banner.fit === false ? "unused while self-fit is off" : "self-fit never shrinks below this"}>
            <Input bind:value={scr.banner.min_height} placeholder="150px" /></Field>
          <Field label="Home chip goes to">
            <Select bind:value={scr.banner.rooms_screen} options={screenIds} allowEmpty />
          </Field>
        </div>
      {:else}
        <div class="flex items-center gap-3">
          <p class="m-0 text-xs text-dim">No hero — this hub renders a plain title bar.</p>
          <Button size="sm" onclick={() => (scr.banner = { image: "", image_opacity: 0.5, height: "230px", min_height: "150px", show_time: true })}>Add hero</Button>
        </div>
      {/if}
    </SectionFold>

    <!-- ACTIVITIES — every hub can own them; off until it does -->
    {#if true}
      <SectionFold label="Activities" badge={owned.length ? owned.length + " owned by this hub" : "off — add one to switch on"} bind:open={actsOpen}>
        {#each owned as id, i (id)}
          <ActivityCard {id} open={id === lastAdded}
            onrename={(nid) => (lastAdded = nid)}
            onup={i > 0 ? () => moveActivity(id, -1) : null}
            ondown={i < owned.length - 1 ? () => moveActivity(id, 1) : null} />
        {:else}
          <p class="m-0 text-xs text-dim">No activities yet.</p>
        {/each}
        <Button onclick={addActivity}>＋ Add activity</Button>
      </SectionFold>

    {/if}

    <!-- PRESETS — canonical fold, off until added -->
    {#if roleSection("presets")}
      {@const rs = roleSection("presets")}
      <SectionFold label="Presets" badge={(rs.s.tiles?.length ?? 0) + " tiles"}
        bind:open={() => secOpen["presets"] ?? false, (v) => (secOpen["presets"] = v)}>
        {#each rs.s.tiles as tile, ti (ti)}
          <TileRow {tile} ownerScreen={screenId} tiles={rs.s.tiles} index={ti} />
        {/each}
        <Button size="sm" onclick={() => newTile(rs.s.tiles)}>＋ Add preset</Button>
        {#if !(rs.s.tiles || []).length}
          <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
            onclick={() => scr.sections.splice(rs.i, 1)}>remove section</button>
        {/if}
      </SectionFold>
    {:else}
      <SectionFold label="Presets" badge="off — switch on"
        bind:open={() => secOpen["presets"] ?? false, (v) => (secOpen["presets"] = v)}>
        <Button size="sm" onclick={() => addRoleSection("presets", "Presets")}>Switch on presets</Button>
      </SectionFold>
    {/if}

    <!-- DEVICES — canonical fold, off until added -->
    {#if roleSection("devices")}
      {@const ds = roleSection("devices")}
      <SectionFold label="Devices" badge={(ds.s.tiles?.length ?? 0) + " tiles"}
        bind:open={() => secOpen["devices"] ?? false, (v) => (secOpen["devices"] = v)}>
        {#each ds.s.tiles as tile, ti (ti)}
          <TileRow {tile} ownerScreen={screenId} tiles={ds.s.tiles} index={ti} />
        {/each}
        <div class="flex gap-2">
          <Button size="sm" onclick={() => newTile(ds.s.tiles)}>＋ Add device</Button>
          <Button size="sm" onclick={() => newNavTile(ds.s.tiles)}>＋ Add nav card</Button>
        </div>
        {#if !(ds.s.tiles || []).length}
          <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
            onclick={() => scr.sections.splice(ds.i, 1)}>remove section</button>
        {/if}
      </SectionFold>
    {:else}
      <SectionFold label="Devices" badge="off — switch on"
        bind:open={() => secOpen["devices"] ?? false, (v) => (secOpen["devices"] = v)}>
        <Button size="sm" onclick={() => addRoleSection("devices", "Devices")}>Switch on devices</Button>
      </SectionFold>
    {/if}

    <!-- CUSTOM GROUPS -->
    {#each customSections as { s, i } (i)}
      <SectionFold label={s.hero_label || "Group " + (i + 1)}
        badge={(s.tiles?.length ?? 0) + " tiles"}
        bind:open={() => secOpen[i] ?? false, (v) => (secOpen[i] = v)}>
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-dim">Group label</span>
          <input bind:value={s.hero_label} placeholder="(no header)"
            class="w-44 rounded-[8px] border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent/60" />
          {#if !(s.tiles || []).length}
            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
              onclick={() => scr.sections.splice(i, 1)}>delete empty group</button>
          {/if}
        </div>
        {#each s.tiles as tile, ti (ti)}
          <TileRow {tile} ownerScreen={screenId} tiles={s.tiles} index={ti} />
        {/each}
        <div class="flex gap-2">
          <Button size="sm" onclick={() => newTile(s.tiles)}>＋ Add device</Button>
          <Button size="sm" onclick={() => newNavTile(s.tiles)}>＋ Add nav card</Button>
        </div>
      </SectionFold>
    {/each}
    {#if scr.tiles}
      <SectionFold label="Tiles (legacy flat list)" badge={scr.tiles.length + " tiles"}
        bind:open={() => secOpen.flat ?? true, (v) => (secOpen.flat = v)}>
        {#each scr.tiles as tile, ti (ti)}
          <TileRow {tile} ownerScreen={screenId} tiles={scr.tiles} index={ti} />
        {/each}
        <div class="flex gap-2">
          <Button size="sm" onclick={() => newTile(scr.tiles)}>＋ Add device</Button>
          <Button size="sm" onclick={() => newNavTile(scr.tiles)}>＋ Add nav card</Button>
        </div>
      </SectionFold>
    {/if}
    <Button size="sm" onclick={addSection}>＋ Add custom group</Button>

    <!-- CONTROL TARGET (drawers pass keys through, e.g. Apps' power) -->
    <SectionFold label="Control target" badge={scr.control_target ? "keys pass to a device here" : "off — keys drive the app"} bind:open={ctOpen}>
      {#if scr.control_target}
        <div class="grid grid-cols-2 gap-3">
          <Field label="Label"><Input bind:value={scr.control_target.label} class="font-mono text-[12.5px]" /></Field>
          <Field label="Navigation (D-pad)"><Input bind:value={scr.control_target.navigation} placeholder="$context.dpad" class="font-mono text-[12.5px]" /></Field>
          <Field label="Power"><Input bind:value={scr.control_target.power} placeholder="$context.power" class="font-mono text-[12.5px]" /></Field>
          <Field label="Volume"><Input bind:value={scr.control_target.volume} placeholder="$context.volume" class="font-mono text-[12.5px]" /></Field>
        </div>
        <Field label="Keys passed to the device" hint="everything else stays with the app">
          <Chips suggestions={KEYS} placeholder="add key…"
            bind:items={() => scr.control_target.pass_through ?? [],
              (v) => (scr.control_target.pass_through = v)} />
        </Field>
        <Button size="sm" variant="danger" onclick={() => delete scr.control_target}>Remove control target</Button>
      {:else}
        <Button size="sm" onclick={() => (scr.control_target = { label: "$activity.name", navigation: "$context.dpad", power: "$context.power", volume: "$context.volume", pass_through: [] })}>Add control target</Button>
      {/if}
    </SectionFold>

    <!-- ADVANCED — config-level knobs, on the owner page's hub -->
    {#if isOwnerRoom}
      <SectionFold label="Advanced" badge="boot · hub · paging · routing" bind:open={advOpen}>
        <div class="grid grid-cols-2 gap-3">
          <Field label="Boot view" hint="where a remote lands on startup and Home — normally this page">
            <Select bind:value={d.home_screen} options={Object.keys(d.screens)} onchange={edit} />
          </Field>
          <Field label="Home hub" hint="top of the Home ladder (the overview of all pages)">
            <Select bind:value={d.global.main_home} options={Object.keys(d.screens)} allowEmpty onchange={edit} />
          </Field>
        </div>
        <Field label="View paging order" hint="what the CH◀▶ / page keys flip through, left to right — NOT tile or activity order">
          <Chips bind:items={d.screen_order} suggestions={Object.keys(d.screens)} placeholder="add view…" />
        </Field>
        <Field label="Activity state select"
          hint="The routing cache. The integration MINTS select.harmonium_<page>_activity per activity-owning page — point here at the minted one (input_select still accepted for legacy configs).">
          <EntityPicker bind:value={d.global.activity_select} domains={["select", "input_select"]} onchange={edit} />
        </Field>
        <Field label="Page-wide buttons" hint="vol/menu logical-key bindings — edit in the Code tab">
          <div class="rounded-[8px] border border-line bg-field p-2 font-mono text-[11px] text-dim">
            {Object.keys(d.global.buttons || {}).join(" · ") || "none"}
          </div>
        </Field>
      </SectionFold>
    {/if}
    <div class="border-t border-line pt-3">
      <Button size="sm" variant="danger"
        onclick={() => { const r = deleteScreen(screenId);
          if (r !== true) setStatus("can't delete: " + r.join(" · "), "err"); }}>
        Delete this page</Button>
      <span class="ml-2 text-[11px] text-dim">refuses while anything still points here</span>
    </div>
  </div>
{/if}
