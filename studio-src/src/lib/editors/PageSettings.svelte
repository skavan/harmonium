<script>
  /* PAGE SETTINGS (redesign §6.4) — Layout · Keys · Advanced behind
     the one button. Everything derives from screenId; the panel's
     open/closed state stays with HubEditor (the button + summary
     line live there). Split out of HubEditor.svelte (v0.83.11
     round 2). */
  import { app, ownedActivities, roomIds, schedulePreview, subordinateScreens, isControllerScreen } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import Segmented from "../components/Segmented.svelte";
  import SourceChip from "../components/SourceChip.svelte";
  import NumberField from "../components/NumberField.svelte";

  let { screenId, keysCount } = $props();
  const d = $derived(app.draft);
  const scr = $derived(d?.screens?.[screenId]);
  const isOwnerRoom = $derived(roomIds().includes(screenId));
  const owned = $derived(ownedActivities(screenId));
  const edit = () => schedulePreview();
  let pgTab = $state("layout");

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
  const BIND_FIXED = [
    ["power_hold", "Power (hold)"], ["menu_hold", "Menu (hold)"],
    ["vol_up", "Vol +"], ["vol_down", "Vol −"],
    ["ch_up", "CH +"], ["ch_down", "CH −"],
    /* v0.83.11: hold-CH defaults to stepping the panel's focus (his
       Watch Fire TV fix) — offered here because a page may want the
       hold for something else, and the binding wins over the default */
    ["ch_up_hold", "CH + (hold)"], ["ch_down_hold", "CH − (hold)"],
    ["mute", "Mute"],
  ];
  /* …PLUS every CUSTOM logical button any remote profile emits
     (v0.83.11 — Suresh: "Page Settings>>>Keys doesn't offer those
     buttons"). The open vocabulary (v0.54) made unknown names
     first-class the moment a key emits them — the Astrion's glyph
     row (light/cover/music/climate) being the flagship — so the
     dropdown now offers them point-and-click. Engine-owned names
     (navigation, the fixed list's bases) stay curated out. */
  const ENGINE_OWNED = new Set(["up", "down", "left", "right", "select",
    "back", "home", "power", "menu", "info", "mute",
    "vol_up", "vol_down", "ch_up", "ch_down"]);
  const BIND_KEYS = $derived.by(() => {
    const custom = new Set();
    for (const r of Object.values(d?.remotes || {}))
      for (const v of Object.values(r?.keymap || {})) {
        if (typeof v !== "string") continue;
        const base = v.endsWith("_hold") ? v.slice(0, -5) : v;
        if (!ENGINE_OWNED.has(base)) custom.add(v);
      }
    return [...BIND_FIXED, ...[...custom].sort().map((k) =>
      [k, k[0].toUpperCase() + k.slice(1).replace(/_/g, " ")])];
  });
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
</script>

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
            <!-- THE BINDING LADDER (v0.83.11 — Suresh: "if I set these
                 on a parent page (i.e. Porch), they apply to porch and
                 all its child controllers"): buttons_inherit offers
                 this page's bindings to everything under it — child
                 pages via their parent chain, and the controllers its
                 activities land on. A child's own binding still wins. -->
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <Switch checked={!!scr.buttons_inherit}
                label="Apply to children"
                onCheckedChange={(v) => { if (v) scr.buttons_inherit = true;
                  else delete scr.buttons_inherit; edit(); }} />
              <span class="text-[11px] text-dim">
                these bindings also cover child pages and this room's
                controllers — a child's own binding wins
              </span>
            </div>
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
