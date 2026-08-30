<script>
  /* One activity, full harmonia-style card. The card owns the shared
     spine — identity strip, tab bar + completion dots, the cast/wiring
     derivations, preview impersonation, delete/rename — and each tab
     is its own component under ./activity/, receiving the `card`
     context object below (v0.83.11 split; behavior unchanged). */
  import { app, actDirty, showUndo, previewActivity, previewGoto, recompileContext, schedulePreview, isCastGroup } from "../state.svelte.js";
  import { ROLES } from "./activity/lib.js";
  import Field from "./Field.svelte";
  import Input from "./Input.svelte";
  import IconPicker from "./IconPicker.svelte";
  import JsonArea from "./JsonArea.svelte";
  import Button from "./Button.svelte";
  import CardRow from "./CardRow.svelte";
  import SetupTab from "./activity/SetupTab.svelte";
  import RolesTab from "./activity/RolesTab.svelte";
  import InputsTab from "./activity/InputsTab.svelte";
  import ActionsTab from "./activity/ActionsTab.svelte";
  import ControllerTab from "./activity/ControllerTab.svelte";
  import StateTab from "./activity/StateTab.svelte";

  let { id, open = false, onup = null, ondown = null, onrename = null } = $props();
  const acts = $derived(app.draft?.activities);
  const a = $derived(acts?.[id]);
  /* controller ACCORDION: what does Navigate-to point at? */
  const navCtrl = $derived.by(() => {
    const ref = a?.screen || "";
    if (!ref.startsWith("controller:")) return null;
    const cid = ref.slice(11);
    const c = app.draft?.controllers?.[cid];
    if (!c) return null;
    return { cid, c, isStock: !c.variant_of };
  });
  /* ============ THE TABBED BUILDER (v0.45 — the Device Round) ============
     Harmony-wizard answers as ADDRESSABLE TABS, not a step-by-step flow
     (Suresh: the audience is HA-comfortable — "tabs with a lit up dot
     when done"). Setup · Devices · Roles · Inputs · Actions · State, each
     dot lighting when its facet is complete. Devices are LIBRARY BUNDLES
     (first-class); Roles are the plain-language role questions; wiring
     compiles to context via recompileContext on every edit. */
  const devLib = $derived(app.draft?.devices || {});
  /* THE CAST IS MIXED (v0.60): device ids AND group objects. `cast`
     keeps its old meaning — the device ids — so everything downstream
     (jobs, inputs, actions, state, the dot) is untouched by groups.
     A group is a VIEW over some of those devices; membership never
     removes a device from the cast, it only says where its control
     gets drawn (Suresh: "A grouped device keeps its other jobs"). */
  const castRaw = $derived(Array.isArray(a?.cast) ? a.cast : []);
  const groups = $derived(castRaw.filter(isCastGroup));
  /* the device ids, in cast order, INCLUDING ones only named by a
     group — a grouped device is still cast, so it still answers the
     Roles tab and still contributes its entities */
  const cast = $derived([
    ...castRaw.filter((m) => typeof m === "string"),
    ...groups.flatMap((g) => (g.members || [])
      .filter((m) => typeof m === "string" && !castRaw.includes(m))),
  ]);
  const groupOf = (devId) =>
    groups.find((g) => (g.members || []).includes(devId)) || null;
  const wiring = $derived(a?.wiring || {});
  const deviceList = () => {
    /* length-checked (v0.75.2): a devices array left EMPTY by an old
       regen must fall through to the context derivation, or the
       activity's real entities become unrenderable */
    if ((a.devices || []).length) return a.devices;
    /* derive from existing $context (legacy activities) */
    const seen = [];
    for (const r of ROLES) {
      const v = a.context?.[r];
      if (typeof v === "string" && v.includes(".") && !seen.includes(v)) seen.push(v);
    }
    return seen;
  };
  const recompile = () => { recompileContext(a, devLib); schedulePreview(); };
  /* the entity cast (engine's a.devices) regenerates from bundles +
     manual extras whenever the device cast changes */
  function regenDevices() {
    const ents = [];
    for (const devId of cast)
      for (const ent of Object.values(devLib[devId]?.roles || {}))
        if (!ents.includes(ent)) ents.push(ent);
    for (const ent of a.extra_devices || []) if (!ents.includes(ent)) ents.push(ent);
    a.devices = ents;
  }
  function setRole(role, target) {
    if (!a.wiring) a.wiring = {};
    if (target) a.wiring[role] = target;
    else delete a.wiring[role];
    recompile();
  }
  /* CONSUMES: which $context roles the Navigate-to surface references —
     the controller's contract, rendered at wiring time */
  const consumedRoles = $derived.by(() => {
    const ref = a?.screen || "";
    const surf = ref.startsWith("controller:")
      ? app.draft?.controllers?.[ref.slice(11)]
      : ref ? app.draft?.screens?.[ref] : null;
    if (!surf) return [];
    const s = JSON.stringify(surf);
    const out = ROLES.filter((r) => s.includes("$context." + r));
    /* GENERATORS consume implicitly: a keys tile expands the dialect's
       catalog over the commands channel — no literal string to find */
    if (s.includes('"type":"keys"') && !out.includes("commands")) out.push("commands");
    return out;
  });
  /* INPUT TARGETS (v0.47 — Suresh: "two actually do!"): every cast
     device with an input-capable claim PLUS directly-cast media_player
     entities. The LIVE source_list is a convenience, not a gate — a
     device that's OFF often hides its list, and the question must
     still be answerable (typed source). Keys: device id for cast
     devices, entity id for a direct entity. */
  /* WHICH entity answers a device's input question. Priority: the
     source_select claim, the media_player claim — and, NEW
     (v0.83.7, .88 status review: "Why is the soundbar not showing
     in the input sources?"), ANY claimed media_player entity. A
     soundbar cast only for volume_level still points that claim at
     a media_player with a real source list (HDMI/optical/BT) — the
     old filter read the role KEYS and never saw it. */
  const inputEnt = (c) => {
    const r = devLib[c]?.roles || {};
    return r.source_select || r.media_player ||
      Object.values(r).find((e) =>
        typeof e === "string" && e.startsWith("media_player."));
  };
  const inputTargets = $derived.by(() => [
    ...cast
      .filter((c) => inputEnt(c))
      .map((c) => ({ key: c, name: devLib[c]?.name || c, ent: inputEnt(c) })),
    ...(a?.extra_devices || [])
      .filter((e) => e.startsWith("media_player."))
      .map((e) => ({ key: e, name: e, ent: e })),
  ]);
  const inputAnswer = (devId) =>
    !a.inputs || !(devId in a.inputs) ? "__unset"
      : a.inputs[devId] === null ? "__ignore" : a.inputs[devId];
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
  /* ---- the completion DOTS: a facet is lit when answered ---- */
  const dotSetup = $derived(!!a?.screen);
  const dotDevices = $derived(cast.length > 0 || deviceList().length > 0);
  const dotRoles = $derived(!!a?.context?.media_player &&
    (!consumedRoles.length || consumedRoles.filter((r) => r !== "commands")
      .every((r) => !!a?.context?.[r])));
  /* v0.53 (Suresh: "inputs does not [dot] if only one is filled in…
     it's a valid setting"): dots are TRI-STATE — true (all answered,
     full green), "part" (some answered, lighter green), false
     (hollow). */
  const inputsAnswered = $derived(
    inputTargets.filter((t) => inputAnswer(t.key) !== "__unset").length);
  const dotInputs = $derived(!inputTargets.length ? true
    : inputsAnswered === inputTargets.length ? true
    : inputsAnswered ? "part" : false);
  const dotActions = $derived(!!a?.start);
  /* PRESETS BELONG TO THE ACTIVITY (v0.64 — Suresh: "these presets
     shouldn't be hardcoded in the stock controller … what if I wanted
     a preset to play CoffeeHouse Radio?"). The controller carries a
     `presets` generator and names none of them; this tab is where
     they live. Same shape as a page's Presets section, so TileRow
     edits them unchanged. */
  const presetCount = () => (a?.presets || []).length;
  let tab = $state("setup");
  /* while THIS card is open, the preview impersonates this activity
     and sits on its landing surface — what you edit is what you see.
     pvView (v0.48 — Suresh: "I can't get to the page view") lets you
     flip the preview to the ROOM PAGE without closing the card;
     controller stays the default every time a card opens. */
  let pvView = $state("controller");
  $effect(() => { if (!open) pvView = "controller"; });
  $effect(() => {
    if (open && a) {
      previewActivity(id);
      const target = pvView === "page" ? a.room_view : a.screen;
      if (target) previewGoto(target);
      return () => previewActivity(null);
    }
  });
  /* ---- REMOVE with confirm + undo (redesign §7.1) ---- */
  let confirmDel = $state(false);
  const refsOf = () => {
    const out = [];
    for (const [sid, scr] of Object.entries(app.draft?.screens || {})) {
      const groups = [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])];
      for (const g of groups)
        for (const t of g) {
          if (t.activity === id)
            out.push((t.type || "tile") + " “" + (t.label || t.id) + "” on " + (scr.name || sid));
          else if (t.when?.activity === id || t.when?.not_activity === id)
            out.push("visibility rule on “" + (t.label || t.id) + "” (" + (scr.name || sid) + ")");
        }
    }
    for (const [qid, seq] of Object.entries(app.draft?.sequences || {}))
      if (JSON.stringify(seq).includes('"' + id + '"'))
        out.push("action “" + qid + "”");
    return out;
  };
  function requestDelete() {
    open = true;
    confirmDel = true;
  }
  function doDelete() {
    const snap = JSON.parse(JSON.stringify($state.snapshot(a)));
    delete acts[id];
    confirmDel = false;
    showUndo("Removed activity " + (snap.name || id), () => { acts[id] = snap; });
  }
  const stateCount = () => {
    const on = a?.state?.on;
    if (!on) return 0;
    if (Array.isArray(on)) return on.length;
    return (on.all?.length ?? on.any?.length ?? on.any_state?.length ?? 0);
  };
  function renameActivity(oldId, newId) {
    newId = (newId || "").trim();
    if (!newId || newId === oldId || acts[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(acts)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.activities = rebuilt;
    /* keep every reference honest: tile refs, when: visibility,
       and Set-activity-state steps inside sequences (any nesting) */
    /* `when.activity` / `when.not_activity` are SCALAR OR LIST — the
       engine normalises with arr() (context.js §when). A strict ===
       missed the list form entirely, so renaming an activity named in
       a multi-activity `when:` left a stale id behind and the tile
       quietly stopped showing. Handle both shapes. */
    const swap = (v) => (Array.isArray(v)
      ? v.map((x) => (x === oldId ? newId : x))
      : v === oldId ? newId : v);
    for (const scr of Object.values(app.draft.screens || {})) {
      const groups = [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])];
      for (const g of groups)
        for (const t of g) {
          if (t.activity === oldId) t.activity = newId;
          if (t.when?.activity !== undefined) t.when.activity = swap(t.when.activity);
          if (t.when?.not_activity !== undefined) t.when.not_activity = swap(t.when.not_activity);
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
     not its page key — a room called Porch on page "home" still
     yields porch_* ids */
  const roomLabel = () =>
    app.draft?.screens?.[a.room_view]?.name || a.room_view || "";
  const autoIdFor = (name) => slugify(roomLabel() + " " + (name || ""));
  const AUTO_RE = /^new_activity(_\d+)?$/;
  let autoBefore = false;
  const idIsAuto = () => AUTO_RE.test(id) || id === autoIdFor(a.name);
  /* THE CARD CONTEXT — the one prop every tab receives. Getters keep
     the parent's $derived spine live in the children; the functions
     are the cross-tab verbs. Everything tab-exclusive lives in the
     tab itself. */
  const card = {
    get id() { return id; },
    get a() { return a; },
    get cast() { return cast; },
    get castRaw() { return castRaw; },
    get groups() { return groups; },
    get wiring() { return wiring; },
    get devLib() { return devLib; },
    get navCtrl() { return navCtrl; },
    get consumedRoles() { return consumedRoles; },
    get inputTargets() { return inputTargets; },
    groupOf, deviceList, recompile, regenDevices, setRole,
    inputEnt, inputAnswer, slugify, roomLabel,
  };
</script>


{#if a}
  <CardRow title={a.name || id} subtitle={id} accent={a.color || "#666"} bind:open
    edited={actDirty(id, a)}
    {onup} {ondown} ondelete={requestDelete}>
    <div class="space-y-4">
      {#if confirmDel}
        <!-- CONFIRM (redesign §7.1): removal names its references -->
        <div class="space-y-2 rounded-[9px] border border-danger/50 bg-danger/10 p-3">
          <p class="m-0 text-xs text-ink">
            Remove <b>{a.name || id}</b>?
            {#if refsOf().length}
              It's still referenced by: {refsOf().join(" · ")}. Those
              references stay behind and go stale.
            {:else}
              Nothing else references it.
            {/if}
          </p>
          <div class="flex gap-2">
            <Button size="sm" onclick={() => (confirmDel = false)}>Cancel</Button>
            <Button size="sm" variant="danger" onclick={doDelete}>Remove activity</Button>
          </div>
        </div>
      {/if}
      <!-- IDENTITY STRIP (grammar): present on every tab -->
      <div class="flex flex-wrap items-end gap-3 rounded-[8px] bg-surface/60 p-1 *:min-w-0">
        <div class="min-w-[200px] flex-[2]"><Field label="Display name" hint="">
          <Input value={a.name} title="Tiles showing this activity follow along"
            onfocus={() => (autoBefore = idIsAuto())}
            oninput={(e) => { syncTiles("label", a.name, e.target.value); a.name = e.target.value; }}
            onchange={() => { if (autoBefore) renameActivity(id, autoIdFor(a.name)); }} />
        </Field>
        </div><div class="w-[230px] min-w-[180px] flex-1"><Field label="Icon" hint="">
          <IconPicker value={a.icon}
            onchange={(e) => { syncTiles("icon", a.icon, e.target.value); a.icon = e.target.value; }} />
        </Field></div>
        <div class="w-[44px] shrink-0"><Field label="Accent" hint="">
          <input type="color" bind:value={a.color}
            class="h-[38px] w-[44px] cursor-pointer rounded-[4px] border border-line-strong bg-transparent p-1" />
        </Field>
        </div><div class="w-[170px] min-w-[130px] flex-1"><Field label="Activity id" hint="">
          <input value={id} spellcheck="false"
            title={idIsAuto() ? "Auto-fills from the name — edit to pin it" : "Renames the key everywhere in this config"}
            onchange={(e) => renameActivity(id, e.target.value)}
            class="h-[38px] w-full rounded-[4px] border border-line-strong bg-field px-[11px] font-mono text-[12px] text-ink outline-none focus:border-accent" />
        </Field></div>
      </div>

      <!-- TAB BAR (grammar): Advanced last, right-aligned, glass -->
      <div class="flex items-end gap-1 border-b border-line px-1">
        {#each [
          { k: "setup", label: "Setup", dot: dotSetup && dotDevices,
            n: cast.length || deviceList().length || null },
          { k: "roles", label: "Roles", dot: dotRoles },
          { k: "inputs", label: "Inputs", dot: dotInputs },
          { k: "actions", label: "Actions", dot: dotActions },
          { k: "controller", label: "Controller",
            dot: !!(a?.surface && Object.keys(a.surface).length) || presetCount() > 0,
            n: presetCount() || null },
          { k: "state", label: "State", dot: stateCount() > 0, n: stateCount() },
        ] as t (t.k)}
          <!-- FIRST-CLASS TABS (v0.48; v0.48.1 — Suresh: "the active
               tab gets a font size bump and a background of
               --color-tile"): one thing draws the eye — the active
               tab's lifted tile; idle tabs stay quiet ink -->
          <button class={"cursor-pointer border-0 px-3.5 py-[11px] transition-colors " +
              (tab === t.k
                ? "rounded-t-[8px] bg-tile text-[14.5px] font-bold text-accent-text [box-shadow:inset_0_-3px_0_var(--color-accent)]"
                : "bg-transparent text-[13.5px] font-semibold text-ink-2 hover:text-ink hover:[box-shadow:inset_0_-3px_0_var(--color-line-strong)]")}
            onclick={() => (tab = t.k)}>
            <!-- v0.53 tri-state dot: full green = done · lighter
                 green = partly answered (a valid setting) · hollow
                 = untouched -->
            {#if t.dot !== undefined}<span
              class={"mr-1.5 inline-block h-[8px] w-[8px] rounded-full align-[0.5px] " +
                (t.dot === true ? "bg-ok"
                  : t.dot === "part" ? "bg-ok/45"
                  : "border border-line-strong bg-transparent")}
              title={t.dot === true ? "Done"
                : t.dot === "part" ? "Partly answered — that can be a valid setting"
                : "Not answered yet"}></span>{/if}{t.label}{#if t.n}<span class="pl-1 text-[11.5px] font-normal text-faint">{t.n}</span>{/if}</button>
        {/each}
        <span class="flex-1"></span>
        {#if a.screen && a.room_view}
          <span class="mr-2 flex items-center gap-1 self-center rounded-[7px] border border-line bg-inset p-[3px] text-[10.5px]"
            title="What the preview shows while this card is open">
            <span class="pl-1 text-faint">Preview</span>
            <button class={"cursor-pointer rounded-[5px] border-0 px-1.5 py-0.5 " +
                (pvView === "controller" ? "bg-surface font-semibold text-ink [box-shadow:0_1px_2px_rgba(0,0,0,.25)]" : "bg-transparent text-dim hover:text-ink")}
              onclick={() => (pvView = "controller")}>Controller</button>
            <button class={"cursor-pointer rounded-[5px] border-0 px-1.5 py-0.5 " +
                (pvView === "page" ? "bg-surface font-semibold text-ink [box-shadow:0_1px_2px_rgba(0,0,0,.25)]" : "bg-transparent text-dim hover:text-ink")}
              onclick={() => (pvView = "page")}>Room page</button>
          </span>
        {/if}
        <button class={"cursor-pointer rounded-t-[6px] border border-b-0 border-line bg-glass px-2.5 py-[8px] text-xs " +
            (tab === "advanced" ? "font-semibold text-accent-text" : "font-medium text-dim hover:text-ink")}
          onclick={() => (tab = tab === "advanced" ? "setup" : "advanced")}>
          <span class={"mr-1 inline-block h-[9px] w-[9px] rounded-[2px] border border-current align-[-1px]" + (tab === "advanced" ? " bg-current" : "")}></span>Advanced</button>
      </div>

      {#if tab === "setup"}<SetupTab {card} />{/if}
      {#if tab === "roles"}<RolesTab {card} />{/if}
      {#if tab === "inputs"}<InputsTab {card} />{/if}
      {#if tab === "actions"}<ActionsTab {card} />{/if}
      {#if tab === "controller"}<ControllerTab {card} />{/if}
      {#if tab === "state"}<StateTab {card} />{/if}

      {#if tab === "advanced"}
      <div class="space-y-2 rounded-[9px] border border-line bg-glass p-3">
        <p class="m-0 text-[11px] text-dim">
          The machine view — everything this activity is, as it lives in
          the config. Edits here are applied verbatim.
        </p>
        <JsonArea value={$state.snapshot(a)} onchange={(v) => (acts[id] = v)} rows={14} />
      </div>
      {/if}
    </div>
  </CardRow>
{/if}
