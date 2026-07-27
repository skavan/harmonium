<script>
  /* One activity, full harmonia-style card: identity, Setup ($context
     devices), State rules, navigation + confirm, controls JSON escape
     hatch. Lives in the OWNING room's editor. */
  import { app, selectSlice, beginSeqDraft, beginPageDraft, isControllerScreen, instantiateController, revertToStock, saveSnippet, snippetsOf } from "../state.svelte.js";
  import Field from "./Field.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";
  import Switch from "./Switch.svelte";
  import Chips from "./Chips.svelte";
  import CardRow from "./CardRow.svelte";
  import EntityPicker from "./EntityPicker.svelte";
  import ActionPicker from "./ActionPicker.svelte";
  import JsonArea from "./JsonArea.svelte";
  import Button from "./Button.svelte";

  let { id, open = false, onup = null, ondown = null, onrename = null } = $props();
  const acts = $derived(app.draft?.activities);
  const a = $derived(acts?.[id]);
  const screenIds = $derived(Object.keys(app.draft?.screens || {}));
  /* Navigate-to targets: CONTROLLERS lead (that's where activities
     land), then plain pages/views; drawers excluded (they're pickers,
     not destinations) */
  const scrName = (sid) => app.draft?.screens?.[sid]?.name || sid;
  const navControllers = $derived([
    /* the LIBRARY leads (shared control surfaces) */
    ...Object.entries(app.draft?.controllers || {}).map(([cid, c]) =>
      ({ value: "controller:" + cid, label: c.name || cid })),
    /* legacy controller screens (custom pages) follow */
    ...screenIds
      .filter((sid) => isControllerScreen(app.draft.screens[sid]) && !app.draft.screens[sid].drawer)
      .map((sid) => ({ value: sid, label: scrName(sid) })),
  ]);
  /* controller ACCORDION: what does Navigate-to point at? */
  const navCtrl = $derived.by(() => {
    const ref = a?.screen || "";
    if (!ref.startsWith("controller:")) return null;
    const cid = ref.slice(11);
    const c = app.draft?.controllers?.[cid];
    if (!c) return null;
    return { cid, c, isStock: !c.variant_of };
  });
  const devicesOn = () => a.surface?.devices !== false;
  function toggleDevices(v) {
    if (v) {
      if (a.surface) {
        delete a.surface.devices;
        if (!Object.keys(a.surface).length) delete a.surface;
      }
    } else a.surface = { ...(a.surface || {}), devices: false };
  }
  const navPages = $derived(screenIds
    .filter((sid) => !isControllerScreen(app.draft.screens[sid]) && !app.draft.screens[sid].drawer)
    .map((sid) => ({ value: sid, label: scrName(sid) })));
  const entityIds = $derived(app.entities.map((e) => e.entity_id));
  const CTX_SLOTS = ["media_player", "dpad", "power", "volume", "volume_level"];
  /* smart pickers: each slot only offers COMPATIBLE domains */
  const SLOT_DOMAINS = {
    media_player: ["media_player"],
    dpad: ["remote", "media_player"],
    power: ["media_player", "switch", "remote"],
    volume: ["media_player"],
    volume_level: ["media_player"],
  };
  /* ---- Setup v2: DEVICES are the nouns, ROLES are the wiring ----
     The device list is the activity's cast (first = ★ primary, the
     activity's face). Role chips wire logical buttons/paths to a
     device; they compile to the same $context map the engine reads. */
  const ROLES = ["media_player", "dpad", "power", "volume", "volume_level",
    "source_select"];   /* source_select (v0.36): who owns inputs — wiring
                           it makes the controller's Source tile appear */

  /* CAST CURATION (v0.36): per-device "shows in Devices section"
     toggle — device_options[ent].tile = false hides the tile, the
     device stays wired to its roles. Default ON. */
  const tileOn = (ent) => !(a.device_options?.[ent]?.tile === false);
  function toggleTile(ent) {
    if (tileOn(ent)) {
      if (!a.device_options) a.device_options = {};
      a.device_options[ent] = { ...(a.device_options[ent] || {}), tile: false };
    } else {
      delete a.device_options[ent].tile;
      if (!Object.keys(a.device_options[ent]).length) delete a.device_options[ent];
      if (!Object.keys(a.device_options).length) delete a.device_options;
    }
  }
  const deviceList = () => {
    if (a.devices) return a.devices;
    /* derive from existing $context (legacy activities) */
    const seen = [];
    for (const r of ROLES) {
      const v = a.context?.[r];
      if (typeof v === "string" && v.includes(".") && !seen.includes(v)) seen.push(v);
    }
    return seen;
  };
  function ensureDevices() { if (!a.devices) a.devices = deviceList(); }
  const rolesOf = (ent) =>
    Object.entries(a.context || {}).filter(([, v]) => v === ent).map(([k]) => k);
  function toggleRole(ent, role) {
    ensureDevices();
    a.context = a.context || {};
    if (a.context[role] === ent) delete a.context[role];
    else a.context[role] = ent;
  }
  let newDev = $state("");
  function addDevice(ent) {
    ent = (ent || "").trim();
    if (!ent) return;
    ensureDevices();
    if (!a.devices.includes(ent)) a.devices.push(ent);
    /* auto-suggest roles by domain */
    a.context = a.context || {};
    const dom = ent.split(".")[0];
    if (dom === "remote" && !a.context.dpad) a.context.dpad = ent;
    if (dom === "media_player") {
      for (const r of ["media_player", "power", "volume"])
        if (!a.context[r]) a.context[r] = ent;
    }
    newDev = "";
  }
  function removeDevice(ent) {
    ensureDevices();
    a.devices = a.devices.filter((x) => x !== ent);
    for (const [k, v] of Object.entries(a.context || {}))
      if (v === ent) delete a.context[k];
  }
  function setPrimary(ent) {
    ensureDevices();
    a.devices = [ent, ...a.devices.filter((x) => x !== ent)];
  }

  /* keep tiles that show this activity in sync when its face changes
     (compiled tiles carry baked copies of name/icon) */
  function syncTiles(field, oldVal, newVal) {
    for (const scr of Object.values(app.draft.screens || {})) {
      const groups = [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])];
      for (const g of groups)
        for (const t of g)
          if (t.activity === id && t[field] === oldVal) t[field] = newVal;
    }
  }
  let rawOpen = $state(false);

  /* ---- SNIPPETS: ⤴ exports this block (with metadata), ⤵ inserts a
     compatible one (Suresh's spec — same pair on Setup and State) ---- */
  function exportSetup() {
    const roles = {};
    for (const r of ROLES) if (a.context?.[r]) roles[r] = a.context[r];
    saveSnippet("setup", (a.name || id) + " setup",
      { devices: [...deviceList()], roles,
        ...(a.device_options ? { device_options: $state.snapshot(a.device_options) } : {}) });
  }
  function importSetup(sid) {
    const sn = snippetsOf("setup").find(([k]) => k === sid)?.[1];
    if (!sn) return;
    a.devices = JSON.parse(JSON.stringify(sn.data.devices || []));
    a.context = { ...(a.context || {}), ...JSON.parse(JSON.stringify(sn.data.roles || {})) };
    if (sn.data.device_options)
      a.device_options = JSON.parse(JSON.stringify(sn.data.device_options));
  }
  function exportState() {
    if (!a.state) return;
    saveSnippet("state", (a.name || id) + " state", $state.snapshot(a.state));
  }
  function importState(sid) {
    const sn = snippetsOf("state").find(([k]) => k === sid)?.[1];
    if (sn) a.state = JSON.parse(JSON.stringify(sn.data));
  }

  /* ---- state-rule helpers ---- */
  const mode = (x) => !x.state ? "none"
    : x.state.on?.any_state ? "any_state"
    : x.state.on?.any ? "any" : "all";
  function setMode(x, m) {
    if (m === "none") { delete x.state; return; }
    const prev = x.state?.on || {};
    const conds = prev.all || prev.any || [];
    x.state = x.state || { entities: [] };
    if (m === "any_state") x.state.on = { any_state: prev.any_state || ["playing", "paused"] };
    else x.state.on = { [m]: conds.length ? conds : [{ entity: "", state: "on" }] };
  }
  const conds = (x) => x.state?.on?.all || x.state?.on?.any || [];
  const op = (c) => "state" in c ? "state" : "equals" in c ? "equals" : "in" in c ? "in" : "not_in";
  function setOp(c, o) {
    if (op(c) === o) return;
    delete c.state; delete c.equals; delete c.in; delete c.not_in;
    c[o] = (o === "in" || o === "not_in") ? [] : (o === "state" ? "on" : "");
  }
  function renameActivity(oldId, newId) {
    newId = (newId || "").trim();
    if (!newId || newId === oldId || acts[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(acts)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.activities = rebuilt;
    /* keep every reference honest: tile refs, when: visibility,
       and Set-activity-state steps inside sequences (any nesting) */
    for (const scr of Object.values(app.draft.screens || {})) {
      const groups = [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])];
      for (const g of groups)
        for (const t of g) {
          if (t.activity === oldId) t.activity = newId;
          if (t.when?.activity === oldId) t.when.activity = newId;
          if (t.when?.not_activity === oldId) t.when.not_activity = newId;
        }
    }
    walkSetActivity(app.draft.sequences || {}, oldId, newId);
    onrename?.(newId);
  }
  function walkSetActivity(node, oldId, newId) {
    if (Array.isArray(node)) { for (const x of node) walkSetActivity(x, oldId, newId); return; }
    if (node && typeof node === "object") {
      if (node.action === "harmonium.set_activity" && node.data?.activity === oldId)
        node.data.activity = newId;
      for (const v of Object.values(node)) walkSetActivity(v, oldId, newId);
    }
  }

  /* ---- id AUTO-FILLS from the display name (until hand-edited) ----
     "Watch Smart TV" in the porch → porch_watch_smart_tv. The id only
     follows the name while it still IS the auto id (or the new_activity
     placeholder); the rename happens on blur so typing keeps focus. */
  const slugify = (s) =>
    (s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  /* prefix = the owner room's display NAME (what the user reads),
     not its page key — a scratch room called Porch on page "home"
     still yields porch_* ids */
  const roomLabel = () =>
    app.draft?.screens?.[a.room_view]?.name || a.room_view || "";
  const autoIdFor = (name) => slugify(roomLabel() + " " + (name || ""));
  const AUTO_RE = /^new_activity(_\d+)?$/;
  let autoBefore = false;
  const idIsAuto = () => AUTO_RE.test(id) || id === autoIdFor(a.name);

  /* ---- ＋ create a Start/Stop action right here ----
     Mints an auto-named DRAFT action, seeded with the doctrine's
     first step (Set activity state — "off" for stops), filed under
     the owner room — then opens the Actions editor in draft mode.
     NOTHING is linked until Confirm there; Discard deletes it and
     returns here untouched. */
  function createSeq(kind) {
    if (!app.draft.sequences) app.draft.sequences = {};
    const seqs = app.draft.sequences;
    const base = slugify(roomLabel() + " " + (a.name || id) + " " + kind) || id + "_" + kind;
    let sid = base, n = 2;
    while (seqs[sid]) sid = base + "_" + n++;
    seqs[sid] = {
      name: (a.name || id) + " — " + (kind === "start" ? "Start" : "Stop"),
      room: a.room_view || undefined,
      actions: [{
        alias: "Set activity state",
        action: "harmonium.set_activity",
        data: { activity: kind === "start" ? id : "off" },
      }],
    };
    beginSeqDraft(sid, kind, id);
  }

  /* ---- ＋ create the CONTROL PAGE ----
     Mints the activity's controller view with the SAME anatomy as the
     hand-built Watch TV page — a control surface first, nouns below:
       · Now Playing + Transport   (iff a media_player role)
       · device buttons + Remote   (iff a dpad role; buttons on
         physical-dpad hardware, on-screen pad elsewhere)
       · Volume slider             (iff a volume role; truth from
         volume_level when wired — the ARC split)
       · Devices — the CAST GENERATOR (in sync with Setup; ⛓ Unlink
         bakes it when art direction calls)
     Everything binds $context, so the roles keep routing it. */
  function createPage() {
    const d = app.draft;
    const base = slugify(roomLabel() + " " + (a.name || id)) || id + "_page";
    let sid = base, n = 2;
    while (d.screens[sid]) sid = base + "_" + n++;
    const ctx = a.context || {};
    const controls = [];
    if (ctx.media_player) {
      controls.push({ id: "t_np", type: "media", entity: "$context.media_player",
        icon: "material:smart_display", label: "Now Playing", span: 2 });
      controls.push({ id: "t_tr", type: "transport", entity: "$context.media_player",
        label: "Transport", span: 2 });
    }
    if (ctx.dpad) {
      controls.push({ id: "t_btns", type: "buttons", entity: "$context.dpad",
        label: "On-screen device buttons", span: 2, only: "physical_dpad",
        buttons: ["back", "home"] });
      controls.push({ id: "t_pad", type: "dpad", entity: "$context.dpad",
        icon: "material:gamepad", label: "Remote", span: 2, unless: "physical_dpad" });
    }
    if (ctx.volume)
      controls.push({ id: "t_vol", type: "volume", entity: "$context.volume",
        ...(ctx.volume_level ? { level_entity: "$context.volume_level" } : {}),
        icon: "material:volume_up", label: "Volume", span: 2 });
    const sections = [];
    if (controls.length) sections.push({ role: "custom", tiles: controls });
    sections.push({ role: "devices", hero_label: "Devices", title: "Devices",
      columns: 1, tiles: [{ id: "cast", type: "devices", activity: id }] });
    const screen = {
      name: a.name || sid,
      type: "controller", class: "activity", view_kind: "controller",
      parent: a.room_view || undefined,
      control_target: {
        label: "$activity.name",
        navigation: ctx.dpad ? "$context.dpad" : "",
        power: "$context.power", volume: "$context.volume",
        pass_through: ctx.dpad
          ? ["up", "down", "left", "right", "select", "back", "home", "power"]
          : [],
      },
      sections,
    };
    /* mirror the compiler's derivation so physical D-pad drives the
       device on Studio-minted pages too */
    if (ctx.dpad) screen.dpad_passthrough = "$context.dpad";
    d.screens[sid] = screen;
    const prev = a.screen;
    a.screen = sid;
    /* same contract as ＋-minted actions: jump in as a DRAFT — Keep
       or Discard (which unwinds the link) from the banner there */
    beginPageDraft(sid, { activityId: id, prevScreen: prev });
  }
</script>

{#if a}
  <CardRow title={a.name || id} subtitle={id} accent={a.color || "#666"} bind:open
    {onup} {ondown} ondelete={() => delete acts[id]}>
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <Field label="Display name" hint="tiles showing this activity follow along">
          <Input value={a.name}
            onfocus={() => (autoBefore = idIsAuto())}
            oninput={(e) => { syncTiles("label", a.name, e.target.value); a.name = e.target.value; }}
            onchange={() => { if (autoBefore) renameActivity(id, autoIdFor(a.name)); }} />
        </Field>
        <Field label="Activity id"
          hint={idIsAuto() ? "auto-fills from the name — edit to pin it" : "renames the key everywhere in this config"}>
          <input value={id} spellcheck="false"
            onchange={(e) => renameActivity(id, e.target.value)}
            class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
        </Field>
        <Field label="Icon">
          <Input value={a.icon} class="font-mono text-[12.5px]"
            oninput={(e) => { syncTiles("icon", a.icon, e.target.value); a.icon = e.target.value; }} />
        </Field>
        <Field label="Accent color">
          <div class="flex items-center gap-2">
            <input type="color" bind:value={a.color}
              class="h-8 w-12 cursor-pointer rounded border border-line bg-transparent p-0.5" />
            <Input bind:value={a.color} class="font-mono text-[12.5px]" />
          </div>
        </Field>
      </div>

      <!-- SETUP v2: devices (nouns) + role chips (wiring) — FIRST,
           so the cast exists before actions and rules reference it -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        {#snippet uploadIcon()}
          <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 15V4m0 0L8 8m4-4 4 4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        {/snippet}
        {#snippet downloadIcon()}
          <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        {/snippet}
        <div class="mb-1 flex items-center gap-1.5">
          <span class="min-w-0 flex-1 truncate text-[11px] font-bold tracking-[.07em] text-dim uppercase">Setup — devices &amp; roles</span>
          <button class="flex h-6 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-transparent p-0 text-dim hover:text-accent"
            title="Save this block to Snippets" onclick={exportSetup}>{@render uploadIcon()}</button>
          <div class={"relative flex h-6 w-7 shrink-0 items-center justify-center rounded border border-line text-dim " +
            (snippetsOf("setup").length ? "hover:text-accent" : "opacity-45")}>
            {@render downloadIcon()}
            <select value="" disabled={!snippetsOf("setup").length}
              title={snippetsOf("setup").length
                ? "Insert from Snippets"
                : "No setup snippets saved yet — the upload icon saves this block as one"}
              onchange={(e) => { if (e.target.value) importSetup(e.target.value); e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none disabled:cursor-default">
              <option value=""></option>
              {#each snippetsOf("setup") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
        </div>
        <p class="mt-0 mb-2 text-[11px] text-dim">
          Devices are what this activity involves (★ = primary, its face).
          Role chips wire the remote: which device the buttons and volume
          drive. Sequences are free to touch anything — this list just
          feeds suggestions.
        </p>
        <div class="space-y-2">
          {#each deviceList() as ent (ent)}
            <div class="flex flex-wrap items-center gap-2 rounded-[8px] bg-inset px-2 py-1.5">
              <button
                class={"cursor-pointer border-0 bg-transparent p-0 text-[15px] " +
                  (deviceList()[0] === ent ? "text-accent" : "text-dim hover:text-ink")}
                title={deviceList()[0] === ent ? "Primary — the activity's face" : "Make primary"}
                onclick={() => setPrimary(ent)}>{deviceList()[0] === ent ? "★" : "☆"}</button>
              <button
                class={"cursor-pointer border-0 bg-transparent p-0 text-[13px] " +
                  (tileOn(ent) ? "text-accent" : "text-dim/50 hover:text-ink")}
                title={tileOn(ent)
                  ? "Shown in the controller's Devices section — click to hide (roles stay wired)"
                  : "Hidden from the Devices section — click to show"}
                onclick={() => toggleTile(ent)}>{tileOn(ent) ? "👁" : "🚫"}</button>
              <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink" title={ent}>{ent}</span>
              {#each rolesOf(ent) as role (role)}
                <button
                  class="cursor-pointer rounded-full border-0 bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink"
                  title="Remove role" onclick={() => toggleRole(ent, role)}>{role} ✕</button>
              {/each}
              {#if ROLES.some((r) => a.context?.[r] !== ent)}
                <select
                  value=""
                  onchange={(e) => { if (e.target.value) toggleRole(ent, e.target.value); e.target.value = ""; }}
                  class="cursor-pointer rounded-full border border-line bg-transparent px-1.5 py-0.5 text-[10px] text-dim outline-none"
                  title="Assign a role to this device">
                  <option value="">+ role</option>
                  {#each ROLES.filter((r) => a.context?.[r] !== ent) as r (r)}
                    <option value={r}>{r}{a.context?.[r] ? " (from " + a.context[r].split(".").pop() + ")" : ""}</option>
                  {/each}
                </select>
              {/if}
              <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                title="Remove device" onclick={() => removeDevice(ent)}>✕</button>
            </div>
          {:else}
            <p class="m-0 text-xs text-dim">No devices yet — add the things this activity involves.</p>
          {/each}
          <div class="flex items-center gap-2">
            <div class="flex-1"><EntityPicker bind:value={newDev} placeholder="add a device…" /></div>
            <Button size="sm" onclick={() => addDevice(newDev)}>＋ Add device</Button>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-28 shrink-0 text-xs font-bold text-dim">App class</span>
            <Select value={a.context?.app_class ?? ""} allowEmpty class="max-w-56"
              options={Object.entries(app.draft?.app_classes || {})
                .map(([cid, c]) => ({ value: cid, label: c.name || cid }))}
              onchange={(e) => { a.context = a.context || {};
                if (e.target.value) a.context.app_class = e.target.value;
                else delete a.context.app_class; }} />
            <span class="text-[11px] text-dim">which Apps dialect this activity speaks (blank = the surface default)</span>
          </div>
          {#each Object.keys(a.context || {}).filter((k) => !ROLES.includes(k) && k !== "app_class" && !deviceList().includes(a.context[k])) as slot (slot)}
            <div class="flex items-center gap-2 px-1">
              <span class="w-28 shrink-0 truncate font-mono text-[11.5px] text-accent" title={slot}>{slot}</span>
              <span class="flex-1 truncate font-mono text-[11.5px] text-dim">
                {typeof a.context[slot] === "string" ? a.context[slot] : "(map — edit in Code tab)"}
              </span>
              <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                onclick={() => delete a.context[slot]}>✕</button>
            </div>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <Field label="Start action" hint="an Action (sequence), or a plain HA script — ＋ drafts one">
          <ActionPicker bind:value={a.start} oncreate={() => createSeq("start")}
            createTitle={"Create sequence “" + (a.name || id) + " — Start”"} /></Field>
        <Field label="Stop action" hint="blank = the page's hold-Power action ends it">
          <ActionPicker bind:value={a.stop} oncreate={() => createSeq("stop")}
            createTitle={"Create sequence “" + (a.name || id) + " — Stop”"} /></Field>
        <Field label="Navigate to (after start)" hint={a.screen ? "" : "＋ mints its control page — keys wired, cast pre-populated"}>
          <div class="flex items-center gap-1.5">
            <select
              value={a.screen ?? ""}
              onchange={(e) => (a.screen = e.target.value || undefined)}
              class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none focus:border-accent/60"
            >
              <option value="">—</option>
              {#if navControllers.length}
                <optgroup label="Controllers">
                  {#each navControllers as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                </optgroup>
              {/if}
              {#if navPages.length}
                <optgroup label="Pages & views">
                  {#each navPages as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                </optgroup>
              {/if}
            </select>
            {#if !a.screen}
              <button
                class="shrink-0 cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2 py-1 text-sm leading-[1.2] text-dim hover:border-accent/60 hover:text-accent"
                title={"Create control page “" + (a.name || id) + "” — Now Playing + cast"}
                onclick={createPage}>＋</button>
            {:else}
              <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                title="Open this page" onclick={() => selectSlice(
                  a.screen.startsWith("controller:")
                    ? "controller." + a.screen.slice(11)
                    : "screens." + a.screen)}>edit →</button>
            {/if}
          </div>
        </Field>

      </div>

      {#if navCtrl}
        <div class="rounded-[10px] border border-line bg-tile px-3 py-2.5">
          {#if navCtrl.isStock}
            <div class="flex flex-wrap items-center gap-4">
              <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Controller · stock</span>
              <Switch checked={devicesOn()} label="Auto-populate devices (this activity's cast)"
                onCheckedChange={toggleDevices} />
              <button
                class="cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2.5 py-1 text-xs text-dim hover:border-accent/60 hover:text-accent"
                title="Copy the stock surface as this activity's own editable controller"
                onclick={() => { const iid = instantiateController(navCtrl.cid, id); if (iid) selectSlice("controller." + iid); }}
              >⧉ Create custom copy</button>
            </div>
            <p class="mt-1 mb-0 text-[11px] text-dim">
              Shared stock surface — editing it changes every activity that uses it.
              A custom copy is yours alone.
            </p>
          {:else}
            <div class="flex flex-wrap items-center gap-4">
              <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Controller · custom copy</span>
              <span class="text-xs text-ink">{navCtrl.c.name}</span>
              <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                onclick={() => selectSlice("controller." + navCtrl.cid)}>edit →</button>
              <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-danger hover:underline"
                title="Point this activity back at the stock controller (removes the copy if nothing else uses it)"
                onclick={() => revertToStock(id)}>↺ use stock</button>
            </div>
          {/if}
        </div>
      {/if}

      <Switch label="Confirm before ending (press twice)"
        bind:checked={() => a.confirm_end ?? false, (v) => (a.confirm_end = v)} />

      <!-- STATE rules -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        {#snippet uploadIcon2()}
          <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 15V4m0 0L8 8m4-4 4 4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        {/snippet}
        {#snippet downloadIcon2()}
          <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        {/snippet}
        <div class="mb-2 flex items-center gap-1.5">
          <span class="shrink-0 text-[11px] font-bold tracking-[.07em] text-dim uppercase">State — when is this activity ON?</span>
          <div class="w-72 shrink-0"><Select value={mode(a)} onchange={(e) => setMode(a, e.target.value)}
            options={[
              { value: "none", label: "From activity select (default)" },
              { value: "all", label: "Device rules — ALL must match" },
              { value: "any", label: "Device rules — ANY may match" },
              { value: "any_state", label: "Primary entity in any of…" },
            ]} /></div>
          <span class="min-w-0 flex-1"></span>
          {#if a.state}
            <button class="flex h-6 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-transparent p-0 text-dim hover:text-accent"
              title="Save these state rules to Snippets" onclick={exportState}>{@render uploadIcon2()}</button>
          {/if}
          <div class={"relative flex h-6 w-7 shrink-0 items-center justify-center rounded border border-line text-dim " +
            (snippetsOf("state").length ? "hover:text-accent" : "opacity-45")}>
            {@render downloadIcon2()}
            <select value="" disabled={!snippetsOf("state").length}
              title={snippetsOf("state").length
                ? "Insert from Snippets"
                : "No state snippets saved yet — the upload icon saves these rules as one"}
              onchange={(e) => { if (e.target.value) importState(e.target.value); e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none disabled:cursor-default">
              <option value=""></option>
              {#each snippetsOf("state") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
        </div>
        {#if a.state}
          <Field label="Watched entities" class="mb-3">
            <Chips bind:items={a.state.entities}
              suggestions={[...deviceList(), ...entityIds.filter((e) => !deviceList().includes(e))]}
              placeholder="add entity…" />
          </Field>
          {#if mode(a) === "any_state"}
            <Field label="States that mean ON">
              <Chips bind:items={a.state.on.any_state} suggestions={["playing", "paused", "buffering", "on", "idle"]} />
            </Field>
          {:else}
            <div class="space-y-2">
              {#each conds(a) as c, i (i)}
                <div class="grid grid-cols-[1fr_120px_110px_1fr_28px] items-center gap-2">
                  <EntityPicker bind:value={c.entity} preferred={deviceList()} />
                  <input bind:value={c.attribute} placeholder="attribute?" spellcheck="false"
                    class="rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
                  <Select value={op(c)} onchange={(e) => setOp(c, e.target.value)}
                    options={[
                      { value: "state", label: "state is" },
                      { value: "equals", label: "equals" },
                      { value: "in", label: "in" },
                      { value: "not_in", label: "not in" },
                    ]} />
                  {#if op(c) === "in" || op(c) === "not_in"}
                    <Chips bind:items={c[op(c)]} placeholder="value…" />
                  {:else}
                    <Input bind:value={c[op(c)]} class="font-mono text-[12.5px]" />
                  {/if}
                  <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                    onclick={() => conds(a).splice(i, 1)}>✕</button>
                </div>
              {/each}
              <Button size="sm" onclick={() => conds(a).push({ entity: "", state: "on" })}>＋ Add condition</Button>
            </div>
          {/if}
        {:else}
          <p class="m-0 text-xs text-dim">Truth comes from the page's activity select. Add device rules to derive it from real device state (harmonia-style).</p>
        {/if}
      </div>

      <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
        onclick={() => (rawOpen = !rawOpen)}>
        {rawOpen ? "Hide" : "Show"} controls &amp; extras (JSON)</button>
      {#if rawOpen}
        <JsonArea value={$state.snapshot(a)} onchange={(v) => (acts[id] = v)} rows={12} />
      {/if}
    </div>
  </CardRow>
{/if}
