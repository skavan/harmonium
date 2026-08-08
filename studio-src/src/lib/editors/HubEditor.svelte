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
  import NoteStrip from "../components/NoteStrip.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import ActivityCard from "../components/ActivityCard.svelte";
  import SectionFold from "../components/SectionFold.svelte";
  import SectionHeader from "../components/SectionHeader.svelte";
  import Segmented from "../components/Segmented.svelte";
  import SourceChip from "../components/SourceChip.svelte";
  import NumberField from "../components/NumberField.svelte";
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
  /* returning from a ＋-minted action draft — or from the pre-wired
     device library (v0.61) — re-opens the exact card AND scrolls to
     it: on a room with five activities, landing "somewhere on the
     page" is not landing where you left */
  let actEls = $state({});
  $effect(() => {
    if (app.focusActivity && d?.activities?.[app.focusActivity]) {
      const want = app.focusActivity;
      lastAdded = want;
      actsOpen = true;
      app.focusActivity = null;
      requestAnimationFrame(() =>
        actEls[want]?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
  });
  /* the page id AUTO-FOLLOWS the name (slug) until hand-pinned —
     same rule as activity ids; renameScreen walks every ref */
  const pslug = (s) =>
    (s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let pageAutoBefore = false;
  /* auto includes any page still wearing the starter id "home" —
     RETROACTIVE (v0.43.9b): workspaces born before the fix already
     renamed the NAME, so gating on name==="New Room" left them
     stranded; a page whose id is literally "home" follows the name,
     full stop (a hand-typed id is never "home" by accident) */
  const pageIsAuto = () => /^new_view/.test(screenId) || screenId === pslug(scr?.name) ||
    screenId === "home";
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
  /* PAGE SETTINGS PANEL (redesign §6.4): Layout · Keys · Advanced */
  let pgOpen = $state(false);
  let pgTab = $state("layout");
  const keysCount = () =>
    Object.keys(scr?.buttons || {}).length +
    (scr?.power ? 1 : 0) + (scr?.parent ? 1 : 0) + (scr?.drawer ? 1 : 0);
  let lastAdded = $state(null);
  let secOpen = $state({});

  /* canonical anatomy: every hub has the same folds. Sections carry
     ROLES (activities/presets/devices/custom); older drafts without
     roles are inferred here the same way the compiler does. */
  const roleOf = (s) => {
    if (s.role) return s.role;
    const types = new Set((s.tiles || []).map((t) => t.type));
    if (types.has("activity") || types.has("activities")) return "activities";
    /* "presets" — the v0.64 GENERATOR — was missing here, so a hub
       section built from it fell through to "devices" and appeared
       under the wrong fold with an empty Presets fold above it
       (Suresh, with a screenshot: "isn't this what this section is
       for?"). An explicit `role` always wins; this is the guess for
       sections that carry none. */
    if (types.has("preset") || types.has("presets") ||
        types.has("presets_from")) return "presets";
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
    /* a DOORWAY: a card that opens another page — the Devices zone
       holds devices and doorways to more devices (paradigm §5) */
    tiles.push({ type: "nav", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New nav", icon: "material:layers" });
  }
  function newPresetTile(tiles) {
    /* a PRESET: one-touch shortcut — pick what it does on its card */
    tiles.push({ type: "preset", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New preset", icon: "material:play_circle", action: {} });
  }

  /* ---- BLESSED SECTIONS (redesign R2): the liturgy Hero →
     Activities → Presets → Devices, each with a switch. Off ≠ empty:
     enabled:false keeps items but stops rendering on the remote. ---- */
  const secEnabled = (s) => !!s && s.enabled !== false;
  function toggleRoleSec(role, label) {
    const rs = roleSection(role);
    if (!rs) {                       // switching ON creates the section
      if (role === "activities") ensureActivitiesGenerator();
      else addRoleSection(role, label);
      return;
    }
    if (rs.s.enabled === false) delete rs.s.enabled;
    else rs.s.enabled = false;
  }
  function toggleHero() {
    if (!scr.banner) {
      scr.banner = { image: "", image_opacity: 0.5, height: "230px",
        min_height: "150px", show_time: true };
      return;
    }
    if (scr.banner.enabled === false) delete scr.banner.enabled;
    else scr.banner.enabled = false;
  }
  const secSummary = (s) =>
    ((s?.columns ?? scr?.grid?.columns ?? 2)) + " cols" +
    (s?.columns ? "" : " · from page");
  let secSet = $state({});            // which settings strips are open
  /* ACCORDION (v0.43.6): editor-only folds per section — never
     written to config; reverting the treatment = SectionHeader's
     note + these wrappers become inert */
  let secFold = $state({});
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
    <NoteStrip dismissKey="hub">
      <b>A page is one screen on the remote.</b> It holds activities
      (what you're doing), presets and devices; keys pressed here follow
      the key bindings below.
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

    <!-- PAGE SETTINGS PANEL (redesign §6.4): sizing, keys and the
         config-level knobs behind ONE button — the liturgy sections
         below stay the page's whole story -->
    <div class="flex items-center gap-2">
      <button class={"cursor-pointer rounded-[6px] border px-2.5 py-[7px] text-[11px] font-medium transition-colors " +
          (pgOpen ? "border-accent/60 bg-accent-wash text-accent-text"
            : "border-line-strong bg-surface text-ink-2 hover:bg-sunk")}
        onclick={() => (pgOpen = !pgOpen)}>Page settings</button>
      {#if !pgOpen}
        <span class="text-[11px] text-dim">
          {(scr.grid?.columns ?? 2) + " cols"} · {keysCount()} keys bound
        </span>
      {/if}
    </div>
    {#if pgOpen}
      <div class="space-y-3 rounded-[10px] border border-accent/50 bg-surface p-3 [box-shadow:0_3px_10px_rgba(168,111,0,.11)]">
        <div class="flex items-end gap-1 border-b border-line px-1">
          {#each [
            { k: "layout", label: "Layout" },
            { k: "keys", label: "Keys", n: keysCount() },
          ] as t (t.k)}
            <button class={"cursor-pointer border-0 bg-transparent px-2.5 py-[9px] text-xs transition-colors " +
                (pgTab === t.k
                  ? "font-semibold text-accent-text [box-shadow:inset_0_-2px_0_var(--color-accent)]"
                  : "font-medium text-dim hover:text-ink")}
              onclick={() => (pgTab = t.k)}>{t.label}{#if t.n}<span class="pl-1 text-[11px] font-normal text-faint">{t.n}</span>{/if}</button>
          {/each}
          <span class="flex-1"></span>
          <button class={"cursor-pointer rounded-t-[6px] border border-b-0 border-line bg-glass px-2.5 py-[8px] text-xs " +
              (pgTab === "advanced" ? "font-semibold text-accent-text" : "font-medium text-dim hover:text-ink")}
            onclick={() => (pgTab = "advanced")}>
            <span class="mr-1 inline-block h-[9px] w-[9px] rounded-[2px] border border-current align-[-1px]"></span>Advanced</button>
        </div>

        {#if pgTab === "layout"}
          <div class="flex flex-wrap items-start gap-6">
            <Field label="Grid columns" hint="">
              <div class="flex items-center gap-2">
                <Segmented value={scr.grid?.columns ?? 2} options={[1, 2, 3, 4]}
                  onchange={(v) => { scr.grid = { ...(scr.grid || {}), columns: v }; edit(); }} />
                <SourceChip source={scr.grid?.columns ? "here" : "workspace"}
                  onreset={() => { if (scr.grid) { delete scr.grid.columns;
                    if (!Object.keys(scr.grid).length) delete scr.grid; } edit(); }} />
              </div>
            </Field>
            <Field label="Tile height" hint="workspace-wide (theme)">
              <div class="flex items-center gap-2">
                <NumberField min={44} max={400} placeholder="84"
                  value={parseInt(d.theme?.["tile-h"]) || ""}
                  onchange={(v) => { d.theme = d.theme || {};
                    if (v) d.theme["tile-h"] = v + "px"; else delete d.theme["tile-h"]; edit(); }} />
                <SourceChip source={d.theme?.["tile-h"] ? "here" : "theme"}
                  onreset={() => { delete d.theme["tile-h"]; edit(); }} />
              </div>
            </Field>
            <Field label="Gap" hint="workspace-wide (theme)">
              <div class="flex items-center gap-2">
                <NumberField min={0} max={40} placeholder="10"
                  value={parseInt(d.theme?.["grid-gap"]) || ""}
                  onchange={(v) => { d.theme = d.theme || {};
                    if (v !== "" && v !== undefined) d.theme["grid-gap"] = v + "px";
                    else delete d.theme["grid-gap"]; edit(); }} />
                <SourceChip source={d.theme?.["grid-gap"] ? "here" : "theme"}
                  onreset={() => { delete d.theme["grid-gap"]; edit(); }} />
              </div>
            </Field>
          </div>
          <p class="m-0 border-t border-line pt-2 text-[11px] text-dim">
            Values fall through Theme → Page → Section → Item. Grid columns
            set here override the default for THIS page (sections can
            override again below); tile height and gap live on the theme,
            so they reach every page in this workspace.
          </p>
        {/if}

        {#if pgTab === "keys"}
    <div class="rounded-[9px] border border-line bg-tile p-3">
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Key mappings — what the physical keys mean here</div>
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
        {/if}

        {#if pgTab === "advanced"}
          <div class="space-y-3 rounded-[9px] border border-line bg-glass p-3">
            {#if isOwnerRoom}
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
            {:else}
              <p class="m-0 text-xs text-dim">
                Config-level knobs (boot view, paging order, routing) live
                on the owner page's Page settings.
              </p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- HERO — any hub can have one; its settings ARE its body, so
         the chevron and the Section settings button share one state -->
    <SectionHeader title="Hero" count={scr.banner && scr.banner.enabled !== false ? 1 : 0}
      enabled={!!scr.banner && scr.banner.enabled !== false} onToggle={toggleHero}
      bind:settingsOpen={() => secSet.hero ?? false, (v) => (secSet.hero = v)}
      bind:collapsed={() => !(secSet.hero ?? false), (v) => (secSet.hero = !v)}>
      {#if scr.banner}
      <div class={"space-y-3 rounded-[9px] border border-line bg-surface p-3 " + (scr.banner.enabled === false ? "opacity-50" : "")}>
        <div class="flex flex-wrap items-center gap-6">
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
          <Field label="Home chip goes to" hint={screenIds.length ? "blank = up the Home ladder" : ""}>
            {#if screenIds.length}
              <Select bind:value={scr.banner.rooms_screen} options={screenIds} allowEmpty />
            {:else}
              <p class="m-0 pt-2 text-xs text-dim">this is the only page — the chip has nowhere to go yet</p>
            {/if}
          </Field>
        </div>
      </div>
      {:else}
        <p class="m-0 text-xs text-dim">No hero — this page renders a plain title bar. Switch Hero on to add one.</p>
      {/if}
    </SectionHeader>

    {#snippet secSettings(sec)}
      {#if sec}
        <div class="grid grid-cols-3 items-start gap-3 rounded-[9px] border border-line bg-surface p-3">
          <Field label="Heading" hint="shown on the page above this section; blank = none">
            <Input value={sec.title ?? ""} onchange={(e) => { if (e.target.value.trim()) sec.title = e.target.value.trim(); else delete sec.title; }} />
          </Field>
          <Field label="Jump label" hint="hero chip + CH ▲▼ stop; blank = skipped">
            <Input value={sec.hero_label ?? ""} onchange={(e) => { if (e.target.value.trim()) sec.hero_label = e.target.value.trim(); else delete sec.hero_label; }} />
          </Field>
          <Field label="Grid columns" hint="inherit uses the page's grid">
            <Segmented value={sec.columns ?? 0}
              options={[{ value: 0, label: "inherit" }, 1, 2, 3, 4]}
              onchange={(v) => { if (v) sec.columns = v; else delete sec.columns; }} />
          </Field>
        </div>
      {/if}
    {/snippet}

    <!-- ACTIVITIES — every hub can own them; off until it does -->
    <SectionHeader title="Activities" count={owned.length}
      enabled={roleSection("activities") ? secEnabled(roleSection("activities").s) : owned.length > 0}
      onToggle={() => toggleRoleSec("activities", "Activities")}
      gridSummary={roleSection("activities") ? secSummary(roleSection("activities").s) : ""}
      bind:settingsOpen={() => secSet.acts ?? false, (v) => (secSet.acts = v)}
      addLabel="＋ Add activity" onAdd={addActivity}
      bind:collapsed={() => secFold.acts ?? false, (v) => (secFold.acts = v)}>
      {#if secSet.acts}{@render secSettings(roleSection("activities")?.s)}{/if}
      <div class={"space-y-3 " + (roleSection("activities") && !secEnabled(roleSection("activities").s) ? "opacity-50" : "")}>
        {#each owned as id, i (id)}
          <div bind:this={actEls[id]}>
            <ActivityCard {id} open={id === lastAdded}
              onrename={(nid) => (lastAdded = nid)}
              onup={i > 0 ? () => moveActivity(id, -1) : null}
              ondown={i < owned.length - 1 ? () => moveActivity(id, 1) : null} />
          </div>
        {:else}
          <p class="m-0 text-xs text-dim">No activities yet — an activity is something you do here (Watch TV, Listen to Music). ＋ Add activity starts one.</p>
        {/each}
      </div>
    </SectionHeader>

    <!-- PRESETS — blessed section -->
    <SectionHeader title="Presets" count={roleSection("presets")?.s.tiles?.length ?? 0}
      enabled={roleSection("presets") ? secEnabled(roleSection("presets").s) : false}
      onToggle={() => toggleRoleSec("presets", "Presets")}
      gridSummary={roleSection("presets") ? secSummary(roleSection("presets").s) : ""}
      bind:settingsOpen={() => secSet.presets ?? false, (v) => (secSet.presets = v)}
      addLabel="＋ Add preset"
      onAdd={() => { if (!roleSection("presets")) addRoleSection("presets", "Presets"); newPresetTile(roleSection("presets").s.tiles); }}
      bind:collapsed={() => secFold.presets ?? false, (v) => (secFold.presets = v)}>
      {#if secSet.presets}{@render secSettings(roleSection("presets")?.s)}{/if}
      {#if roleSection("presets")}
        {@const rs = roleSection("presets")}
        <div class={"space-y-2 " + (secEnabled(rs.s) ? "" : "opacity-50")}>
          {#each rs.s.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={rs.s.tiles} index={ti} />
          {:else}
            <p class="m-0 text-xs text-dim">No presets yet — a preset is a one-touch shortcut (Netflix, a playlist, lights at 30%).</p>
          {/each}
        </div>
      {:else}
        <p class="m-0 text-xs text-dim">No presets yet — a preset is a one-touch shortcut (Netflix, a playlist, lights at 30%). ＋ Add preset starts the list.</p>
      {/if}
    </SectionHeader>

    <!-- DEVICES — blessed section (devices + doorways to more devices) -->
    <SectionHeader title="Devices" count={roleSection("devices")?.s.tiles?.length ?? 0}
      enabled={roleSection("devices") ? secEnabled(roleSection("devices").s) : false}
      onToggle={() => toggleRoleSec("devices", "Devices")}
      gridSummary={roleSection("devices") ? secSummary(roleSection("devices").s) : ""}
      bind:settingsOpen={() => secSet.devices ?? false, (v) => (secSet.devices = v)}
      addLabel="＋ Add device"
      onAdd={() => { if (!roleSection("devices")) addRoleSection("devices", "Devices"); newTile(roleSection("devices").s.tiles); }}
      add2Label="＋ Add nav"
      onAdd2={() => { if (!roleSection("devices")) addRoleSection("devices", "Devices"); newNavTile(roleSection("devices").s.tiles); }}
      bind:collapsed={() => secFold.devices ?? false, (v) => (secFold.devices = v)}>
      {#if secSet.devices}{@render secSettings(roleSection("devices")?.s)}{/if}
      {#if roleSection("devices")}
        {@const ds = roleSection("devices")}
        <div class={"space-y-2 " + (secEnabled(ds.s) ? "" : "opacity-50")}>
          {#each ds.s.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={ds.s.tiles} index={ti} />
          {:else}
            <p class="m-0 text-xs text-dim">No devices yet — a device card controls one thing you own; a nav card opens another page (or another workspace).</p>
          {/each}
        </div>
      {:else}
        <p class="m-0 text-xs text-dim">No devices yet — a device card controls one thing you own; a nav card opens another page (or another workspace).</p>
      {/if}
    </SectionHeader>

    <!-- CUSTOM SECTIONS — the generalized machinery, kept visible when
         they exist; CREATING one lives behind Advanced mode -->
    {#each customSections as { s, i } (i)}
      <SectionHeader title={s.hero_label || s.title || "Section " + (i + 1)}
        count={s.tiles?.length ?? 0}
        enabled={secEnabled(s)}
        onToggle={() => { if (s.enabled === false) delete s.enabled; else s.enabled = false; }}
        gridSummary={secSummary(s)}
        bind:settingsOpen={() => secSet["c" + i] ?? false, (v) => (secSet["c" + i] = v)}
        addLabel="＋ Add device" onAdd={() => newTile(s.tiles)}
        add2Label="＋ Add nav" onAdd2={() => newNavTile(s.tiles)}
        bind:collapsed={() => secFold["c" + i] ?? false, (v) => (secFold["c" + i] = v)}>
        {#if secSet["c" + i]}
          {@render secSettings(s)}
          {#if !(s.tiles || []).length}
            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
              onclick={() => scr.sections.splice(i, 1)}>Delete this empty section</button>
          {/if}
        {/if}
        <div class={"space-y-2 " + (secEnabled(s) ? "" : "opacity-50")}>
          {#each s.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={s.tiles} index={ti} />
          {/each}
        </div>
      </SectionHeader>
    {/each}
    {#if scr.tiles}
      <SectionHeader title="Ungrouped" count={scr.tiles.length}
        bind:settingsOpen={() => secSet.flat ?? false, (v) => (secSet.flat = v)}
        addLabel="＋ Add device" onAdd={() => newTile(scr.tiles)}
        add2Label="＋ Add nav" onAdd2={() => newNavTile(scr.tiles)}
        bind:collapsed={() => secFold.flat ?? false, (v) => (secFold.flat = v)}>
        <div class="space-y-2">
          {#each scr.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={scr.tiles} index={ti} />
          {/each}
        </div>
      </SectionHeader>
    {/if}
    {#if app.advanced}
      <Button size="sm" onclick={addSection}>＋ Add custom section</Button>
    {/if}

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

    <div class="border-t border-line pt-3">
      <Button size="sm" variant="danger"
        onclick={() => { const r = deleteScreen(screenId);
          if (r !== true) setStatus("can't delete: " + r.join(" · "), "err"); }}>
        Delete this page</Button>
      <span class="ml-2 text-[11px] text-dim">refuses while anything still points here</span>
    </div>
  </div>
{/if}
