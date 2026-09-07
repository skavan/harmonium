<script>
  /* SETUP — the cast: who's in this activity and how each member
     presents. Owns the unified cast picker, group cards, the ⚙
     presentation panels, setup snippets, and the ＋ control-page mint.
     Split out of ActivityCard.svelte (v0.83.11); the shared context
     arrives as `card` — see ActivityCard's card object. */
  import { app, selectSlice, isControllerScreen, beginPageDraft, saveSnippet, snippetsOf, setStatus, seedDeviceFromEntity, platformOf, isCastGroup, SHOWS_KINDS, showsRole, openDeviceEditor, schedulePreview } from "../../state.svelte.js";
  import PresPanel from "./PresPanel.svelte";
  import CastPicker from "./CastPicker.svelte";
  import { ROLES } from "./lib.js";
  import Field from "../Field.svelte";
  import Input from "../Input.svelte";
  import Select from "../Select.svelte";
  import IconPicker from "../IconPicker.svelte";

  let { card } = $props();
  const a = $derived(card.a);
  const id = $derived(card.id);
  const cast = $derived(card.cast);
  const castRaw = $derived(card.castRaw);
  const groups = $derived(card.groups);
  const wiring = $derived(card.wiring);
  const devLib = $derived(card.devLib);
  const navCtrl = $derived(card.navCtrl);
  const { recompile, regenDevices, deviceList, setRole, groupOf, slugify, roomLabel } = card;

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
  const navPages = $derived(screenIds
    .filter((sid) => !isControllerScreen(app.draft.screens[sid]) && !app.draft.screens[sid].drawer)
    .map((sid) => ({ value: sid, label: scrName(sid) })));
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
    schedulePreview();
  }
  const rolesOf = (ent) =>
    Object.entries(a.context || {}).filter(([, v]) => v === ent).map(([k]) => k);
  /* ---- PRESENTATION, PER MEMBER (v0.76 — Suresh: "That tile should
     have a config icon… display name, display icon, display mode, a
     click-to") — `a.present`, a map keyed by device id (cast members)
     or entity id (loose entities). The engine folds it into the tiles
     it generates (generators.js presApply / looseShowTile); the group
     page reads member `shows` first, group `shows` as the default. */
  let openPres = $state(null);
  let presHad = {};   /* which blankable fields were STORED at open? */
  function editPres(key) {
    if (openPres === key) { closePres(key); return; }
    if (openPres) closePres(openPres);
    if (!a.present) a.present = {};
    const p = a.present[key] || (a.present[key] = {});
    presHad = { name: "name" in p, sub: "sub" in p };
    if (p.sub == null) p.sub = "";
    /* the two bind:value fields MUST exist before the panel renders:
       Svelte 5 throws props_invalid_value when a two-way binding hands
       undefined to a $bindable with a default — measured: the panel
       died halfway and the broken render ate the ★ (v0.76.2). The
       close-sweep deletes them again when they stay empty. */
    if (p.name == null) p.name = "";
    if (p.icon == null) p.icon = "";
    openPres = key;
  }
  function closePres(key) {
    const p = a.present?.[key];
    if (p) {
      /* THE INTENTIONAL BLANK (v0.77.1 — Suresh: "let me blank them
         via ⚙"): an empty name is DELETED only when none was stored
         at open (the untouched backfill); actively clearing a saved
         name keeps "" — which the engine renders as no label at all. */
      for (const k of Object.keys(p))
        if (!p[k] && !((k === "name" || k === "sub") && presHad[k])) delete p[k];
      if (!Object.keys(p).length) delete a.present[key];
      if (a.present && !Object.keys(a.present).length) delete a.present;
    }
    openPres = null;
    recompile();
  }
  function dropPres(key) {
    if (a.present) { delete a.present[key];
      if (!Object.keys(a.present).length) delete a.present; }
    if (openPres === key) openPres = null;
  }
  /* the adoption itself, shared by BOTH doors into the cast block
     (v0.75.3 — "Didn't work for the existing activity": the Onkyo went
     in as a LOOSE entity, and addExtraEnt regenerated a.devices
     without ever running the adoption — same erasure, other door). */
  function adoptWired(newDevId) {
    const covered = new Set();
    for (const c of newDevId ? [...cast, newDevId] : cast) {
      if (devLib[c])
        for (const e of Object.values(devLib[c].roles || {})) covered.add(e);
      /* a loose ENTITY cast member covers itself (one ordered cast —
         feedback-3 round 3) */
      else if (typeof c === "string" && c.includes(".")) covered.add(c);
    }
    const ctxRaw = [];
    for (const r of ROLES) {
      const v = a.context?.[r];
      if (typeof v === "string" && v.includes(".")) ctxRaw.push(v);
    }
    for (const ent of [...(Array.isArray(a.devices) ? a.devices : []), ...ctxRaw])
      if (!covered.has(ent) && !(a.cast || []).includes(ent)) {
        if (!a.cast) a.cast = [];
        a.cast.push(ent);
      }
  }
  function addCast(devId) {
    if (!devId || !devLib[devId]) return;
    if (!a.cast) a.cast = [];
    if (a.cast.includes(devId)) {
      /* the refusal SPEAKS (2026-08-31 — Suresh hit the silent
         return): the cast is one row per member by design (present
         is keyed by id); a second control of the same device lives
         as a page tile, whose Draws-as is free */
      setStatus("'" + (devLib[devId].name || devId) + "' is already in the "
        + "cast — one row per member. For a second control of the same "
        + "device, add a tile to the page (its Draws-as is independent).",
        "err");
      return;
    }
    /* ADOPT THE WIRED-BUT-UNCAST (v0.75.1, hardened v0.75.2 — Suresh:
       "adding a device (onkyo receiver) REPLACES media_player.
       ma_sonos_basement!", then "Same problem!"). An activity that
       predates the cast model drives its devices only through
       wiring/$context — and regenDevices() rebuilds a.devices from
       cast + extras ALONE, so the first cast member used to erase
       them. v0.75.1 adopted the incumbents on the first cast, but
       read them via deviceList(), which short-circuits on ANY truthy
       devices array — including the wrecked [] or newcomer-only list
       a previous regen left behind, so remove-and-retry still lost
       the house. Now: read the CONTEXT directly (the ground truth of
       what the activity drives), union the existing devices list, and
       run on EVERY cast add — anything no cast bundle accounts for
       becomes a loose entity (visible, curatable, promotable). Modern
       activities no-op here: their context entities all come from
       cast bundles, and removeCast unwires roles before this could
       ever resurrect them. */
    adoptWired(devId);
    a.cast.push(devId);
    /* prefill: unclaimed roles only — first come, first served; the
       Roles tab is where exceptions get decided */
    if (!a.wiring) a.wiring = {};
    for (const role of ROLES)
      if (!a.wiring[role] && devLib[devId].roles?.[role]) a.wiring[role] = devId;
    regenDevices();
    recompile();
  }
  function removeCast(devId) {
    a.cast = (a.cast || []).filter((c) => c !== devId);
    for (const g of groups)                 /* leave no dangling member */
      if ((g.members || []).includes(devId))
        g.members = g.members.filter((m) => m !== devId);
    for (const [role, t] of Object.entries(a.wiring || {}))
      if (t === devId) delete a.wiring[role];
    if (a.inputs) delete a.inputs[devId];
    dropPres(devId);              /* presentation dies with the casting */
    regenDevices();
    recompile();
  }
  /* ---- GROUPS (v0.60 — Suresh: "Group is a per activity decision.
     Here's a group (Nav)"). A group is a nav card on the controller
     and a generated page behind it; `shows` decides what its children
     render as. It is the SAME mechanism as Devices > Add Nav Card —
     the only new idea is that the children can be the control itself
     rather than a launcher. ---- */
  function addGroup() {
    if (!a.cast) a.cast = [];
    let gid = "group", n = 2;
    while (groups.some((g) => g.group === gid)) gid = "group_" + n++;
    /* no `shows` seed (feedback-3 round 2 — the Members-draw-as
       select is retired): each member's own ⚙ decides; a legacy
       g.shows is still honored as the members' default */
    a.cast.push({ group: gid, name: "Group", icon: "material:widgets",
      members: [] });
    openGroup = gid;
    recompile();
  }
  function removeGroup(gid) {
    /* the members stay cast — only the view goes away */
    a.cast = (a.cast || []).filter((m) => !(isCastGroup(m) && m.group === gid));
    recompile();
  }
  function renameGroup(g, name) {
    g.name = name;
    /* the id follows the name until the group has members, so a fresh
       group reads well in the config; after that it is load-bearing
       (a nav card may target "group:<id>") and stays put */
    if (!(g.members || []).length) {
      const slug = (name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (slug && !groups.some((x) => x !== g && x.group === slug)) {
        if (openGroup === g.group) openGroup = slug;
        g.group = slug;
      }
    }
    recompile();
  }
  /* move a device into a group (or out of every group when gid is "") */
  function setDeviceGroup(devId, gid) {
    for (const g of groups)
      if ((g.members || []).includes(devId))
        g.members = g.members.filter((m) => m !== devId);
    if (gid) {
      const g = groups.find((x) => x.group === gid);
      if (g) g.members = [...(g.members || []), devId];
    }
    recompile();
  }
  /* what a member will actually DRAW as — the honest answer, because
     a missing claim falls back to the launcher rather than vanishing */
  function showsFallback(devId, shows) {
    const role = showsRole(shows);
    if (!role) return null;
    return devLib[devId]?.roles?.[role] ? null : role;
  }
  /* THE DRAWS-AS TAG (2026-09-05, his alternate ruling on feedback-3
     #1: "honoring the existing settings of each device. So it draws
     the same way if its inside or outside a group… We could put a
     little tag in the Group rows"). The engine has always resolved a
     group member's render as: its own ⚙ pick first, the group's
     Members-draw-as second, launcher last — so nothing moves; the
     tag just SAYS the resolved answer, with the variant when one is
     set. */
  function drawsTag(key, g) {
    const p = a.present?.[key];
    const t = p?.type || p?.shows || g?.shows || "device";
    const kind = SHOWS_KINDS.find((k) => k.value === t);
    const label = t === "device" ? "launcher" : (kind?.label || t);
    const v = p?.variant || p?.style;
    return v ? label + " · " + v : label;
  }
  /* ORDER ARROWS INSIDE A GROUP (feedback-3 #3: "the rows in the
     group need arrows") — g.members order IS the group page's order */
  function moveMember(g, mid, dir) {
    const l = g.members || [];
    const i = l.indexOf(mid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    recompile();
  }
  let openGroup = $state(null);   /* group row expanded for editing */
  /* SAY WHY THE CARD ISN'T DRAWING (2026-09-05 groups round — Suresh:
     "If I add a Group - but Controller Group is not available,
     nothing, obviously, happens. I should have some indicator - so I
     go and turn it on"). Two silent ways a group has nowhere to
     draw: the Controller tab's Cast-group cards band is switched
     off, or the activity's Navigate-to page simply has no groups
     band. Both get an honest line on the group card. */
  const groupsBandOff = $derived(a?.surface?.groups === false);
  function turnGroupsBandOn() {
    if (a.surface) {
      delete a.surface.groups;
      if (!Object.keys(a.surface).length) delete a.surface;
    }
    schedulePreview();
  }
  const targetHasGroupsBand = (g) => {
    const ref = a?.screen || "";
    let tiles = null;
    if (ref.startsWith("controller:")) {
      const c = app.draft?.controllers?.[ref.slice(11)];
      if (c) tiles = [...(c.tiles || []),
        ...(c.sections || []).flatMap((s) => s.tiles || [])];
    } else if (ref && app.draft?.screens?.[ref]) {
      const sc = app.draft.screens[ref];
      tiles = [...(sc.tiles || []),
        ...(sc.sections || []).flatMap((s) => s.tiles || [])];
    }
    if (!tiles) return true;   /* no target yet — nothing to warn about */
    /* a demoted card (where: "devices") draws through the devices
       generator; the default draws through the groups band */
    return (g?.where === "devices")
      ? tiles.some((t) => t?.type === "devices")
      : tiles.some((t) => t?.type === "groups");
  };

  /* THE RETURN TRIP (v0.61 — Suresh: "We need a *prominent* return to
     Bar>Activity Name … then it will feel like a shortcut. Hopefully
     it will go to the open activity on the bar page!"). Named for the
     room AND the activity, and it re-opens this exact card. */
  const castBack = () => {
    const k = app.selKey || "";
    const sid = k.startsWith("view.") ? k.slice(5)
      : k.startsWith("screens.") ? k.slice(8) : null;
    const room = sid ? (app.draft?.screens?.[sid]?.name || sid) : null;
    return { key: k, activityId: id,
      label: (room ? room + " · " : "") + (a?.name || id) };
  };
  const toDevice = (devId) => openDeviceEditor(devId, castBack());
  /* THE FACE (v0.78 review: "When I added a second device, it was
     promoted - The Onkyo is a device, not the primary"). Two star
     definitions had crept in: cast[0] (the old cast order) and the
     media_player wiring holder (the loose-row rule). Unified: the ★
     is whoever HOLDS media_player — device id or entity — with
     cast[0] only as the fallback when the role is unwired. */
  const faceOf = () =>
    (a?.wiring?.media_player) || (a?.context?.media_player) || null;
  function castPrimary(devId) {
    a.cast = [devId, ...(a.cast || []).filter((c) => c !== devId)];
    /* leading the cast now also means holding the face, when the
       device can claim it */
    if (devLib[devId]?.roles?.media_player) {
      if (!a.wiring) a.wiring = {};
      a.wiring.media_player = devId;
    }
    regenDevices();
    recompile();
  }
  /* the DOMAIN stands in for claims on a loose entity (v0.78 review:
     "If I choose a media player… should we guess at the roles?").
     Same doctrine as addCast's prefill: UNWIRED roles only. */
  const DOMAIN_GUESS = {
    media_player: ["media_player", "power", "volume", "source_select"],
    remote: ["dpad"],
  };
  function guessRoles(ent) {
    if (!a.wiring) a.wiring = {};
    for (const role of DOMAIN_GUESS[ent.split(".")[0]] || [])
      if (!a.wiring[role]) a.wiring[role] = ent;
    /* SEARCH only when the platform can actually answer (v0.78.1 —
       Suresh: "should we fill in search role too?"): a Music
       Assistant player searches its whole library; a native Sonos
       wired here answers an EMPTY list (measured, v0.65). The
       registry knows which is which. */
    if (ent.startsWith("media_player.") && !a.wiring.search &&
        platformOf(ent) === "music_assistant")
      a.wiring.search = ent;
  }
  function addExtraEnt(ent) {
    ent = (ent || "").trim();
    if (!ent) return;
    adoptWired(null);          /* v0.75.3: this door erases too — see above */
    if (!a.cast) a.cast = [];
    if (a.cast.includes(ent)) {
      setStatus("'" + ent + "' is already in the cast — one row per "
        + "member. For a second control of the same entity, add a tile "
        + "to the page (its Draws-as is independent).", "err");
      return;
    }
    /* one ordered cast (feedback-3 round 3): a loose entity is a
       first-class member — it lands where it lands and moves with
       the same arrows as everything else */
    a.cast.push(ent);
    guessRoles(ent);           /* v0.78: unwired roles fill from the domain */
    regenDevices();
    recompile();
  }
  function removeExtraEnt(ent) {
    a.cast = (a.cast || []).filter((x) => x !== ent);
    a.extra_devices = (a.extra_devices || []).filter((x) => x !== ent);
    if (!a.extra_devices.length) delete a.extra_devices;
    /* leave no dangling member (2026-09-05 groups round — the same
       sweep removeCast has always done: a loose entity removed here
       used to STAY in g.members, and re-adding it later met a stale
       membership that made the group ticks lie) */
    for (const g of groups)
      if ((g.members || []).includes(ent))
        g.members = g.members.filter((m) => m !== ent);
    dropPres(ent);
    regenDevices();
    recompile();
  }
  /* LEGACY DIRECT ENTITIES (v0.53 — Suresh: "the cast has vanished
     even though it's a green dot AND rows are filled in"): yaml-era
     activities wire entities straight into $context with no cast /
     extra_devices arrays. The DOT derived from context (deviceList)
     but the cast block only rendered the arrays — so the entities
     were invisible. Surface them as direct rows; ✕ unwires the
     roles that point at the entity. */
  const legacyEnts = $derived(
    a && !(a.cast || []).length && !(a.devices || []).length
      ? deviceList().filter((e) => !(a.extra_devices || []).includes(e))
      : []);
  function removeLegacyEnt(ent) {
    for (const [role, v] of Object.entries(a.context || {}))
      if (v === ent) delete a.context[role];
    schedulePreview();
  }
  /* PROMOTE A DIRECT ENTITY (v0.48.2 — Suresh: "If I select a loose
     device, I should probably have a promote icon"): mint a pre-wired
     device FROM the entity (integration siblings + claims, same
     seeder as the picker's ⊞), swap it into the cast in place of the
     bare entity — no library round-trip; tune traits there any time. */
  function promoteExtra(ent) {
    if (!app.draft.devices) app.draft.devices = {};
    const lib = app.draft.devices;
    const { stem, dev } = seedDeviceFromEntity(ent);
    let id = stem, n = 2;
    while (lib[id]) id = stem + "_" + n++;
    lib[id] = dev;
    /* the minted device takes the entity's SLOT in the one ordered
       cast (feedback-3 round 3) — the row keeps its place */
    const i = (a.cast || []).indexOf(ent);
    a.cast = (a.cast || []).filter((x) => x !== ent);
    a.extra_devices = (a.extra_devices || []).filter((x) => x !== ent);
    if (!a.extra_devices.length) delete a.extra_devices;
    addCast(id);
    if (i >= 0 && a.cast.includes(id)) {
      a.cast = a.cast.filter((x) => x !== id);
      a.cast.splice(i, 0, id);
    }
    setStatus("⊞ " + (dev.name || id) + " pre-wired and cast — " + ent +
      " now rides its bundle", "ok");
  }
  /* ---- SNIPPETS: ⤴ exports this block (with metadata), ⤵ inserts a
     compatible one (Suresh's spec — same pair on Setup and State) ---- */
  function exportSetup() {
    saveSnippet("setup", (a.name || id) + " setup", {
      /* deep — the cast now holds group OBJECTS (v0.60), and a
         snippet that shares them would edit the activity it came from */
      cast: JSON.parse(JSON.stringify($state.snapshot(a.cast || []))),
      wiring: $state.snapshot(a.wiring || {}),
      ...(a.extra_devices ? { extra_devices: [...a.extra_devices] } : {}),
      ...(a.present ? { present: $state.snapshot(a.present) } : {}),
      ...(a.device_options ? { device_options: $state.snapshot(a.device_options) } : {}),
    });
  }
  function importSetup(sid) {
    const sn = snippetsOf("setup").find(([k]) => k === sid)?.[1];
    if (!sn) return;
    /* legacy snippets carried {devices, roles} or extra_devices —
       both translate into the ONE ordered cast on the fly */
    if (sn.data.cast || sn.data.wiring) {
      a.cast = JSON.parse(JSON.stringify(sn.data.cast || []));
      a.wiring = JSON.parse(JSON.stringify(sn.data.wiring || {}));
      for (const ent of sn.data.extra_devices || [])
        if (!a.cast.includes(ent)) a.cast.push(ent);
      if (sn.data.present) a.present = JSON.parse(JSON.stringify(sn.data.present));
      else delete a.present;
    } else {
      a.cast = JSON.parse(JSON.stringify(sn.data.devices || []));
      a.wiring = JSON.parse(JSON.stringify(sn.data.roles || {}));
    }
    delete a.extra_devices;
    if (sn.data.device_options)
      a.device_options = JSON.parse(JSON.stringify(sn.data.device_options));
    regenDevices();
    recompile();
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
  /* the tab UNMOUNTS on switch now (the split's one new lifecycle) —
     leaving must sweep exactly like closing the ⚙ panel, or the
     editPres backfill (name:"", sub:"") would persist as intentional
     blanks and the tile would render with no label at all */
  $effect(() => () => { if (openPres) closePres(openPres); });

</script>

      <div class="space-y-3">
        <!-- items-START (v0.48 alignment round): the two fields top-align
             on their labels so the controls sit level — items-end let a
             one-sided hint shove its neighbour upward -->
        <div class="flex flex-wrap items-start gap-3">
          <div class="w-[240px]"><Field label="What are we building?" hint="shapes suggestions — never a cage">
            <Select value={a.kind ?? ""} allowEmpty
              options={[
                { value: "watch", label: "Watch (TV / movie)" },
                { value: "listen", label: "Listen (music)" },
                { value: "play", label: "Play (game)" },
                { value: "custom", label: "Custom" },
              ]}
              onchange={(e) => { if (e.target.value) a.kind = e.target.value; else delete a.kind; }} />
          </Field></div>
          <div class="min-w-[260px] flex-1"><Field label="Navigate to (after start)" hint={a.screen ? "" : "＋ mints its control page — keys wired, cast pre-populated"}>
            <div class="flex items-center gap-1.5">
              <select
                value={a.screen ?? ""}
                onchange={(e) => (a.screen = e.target.value || undefined)}
                class="h-[38px] w-full cursor-pointer rounded-[4px] border border-line-strong bg-field px-[11px] font-[inherit] text-[13px] text-ink outline-none focus:border-accent"
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
                  class="h-[38px] shrink-0 cursor-pointer rounded-[4px] border border-dashed border-line-strong bg-transparent px-2.5 text-sm leading-[1.2] text-dim hover:border-accent/60 hover:text-accent"
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
          </Field></div>
        </div>
        {#if navCtrl}
          <p class="m-0 text-xs text-dim">
            Band switches, presets and the custom-copy door live on the
            <b>Controller</b> tab.
          </p>
        {:else}
          <p class="m-0 text-xs text-dim">
            {a.screen
              ? "This activity lands on a page of its own (" + a.screen + ") — controllers are the shared stock surfaces."
              : "No controller yet — pick a Navigate-to above, or ＋ mint a control page."}
          </p>
        {/if}
      <!-- THE CAST (v0.47: Setup + Devices are ONE tab — Suresh:
           "It defaults to devices and then I tab (back) to setup") -->
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
          <span class="min-w-0 flex-1 truncate text-[11px] font-bold tracking-[.07em] text-dim uppercase">The cast — what's involved</span>
          <!-- v0.60: a group is a per-ACTIVITY decision, so it is minted
               here and nowhere else -->
          <button class="flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface px-2 text-[11px] font-medium text-ink-2 hover:bg-sunk"
            title="Tuck some of the cast behind one nav card — a group is a view, not a device"
            onclick={addGroup}>⊞ Add group</button>
          <!-- ONE SNIPPET GRAMMAR (v0.79.2 — Suresh: "Everywhere we
               have snippets, we are using different language"):
               ⤴ Export snippet / ⤵ Import snippet…, same icons and
               words on Setup, State, and both Presets doors. -->
          <button class="flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface px-2 text-[11px] font-medium text-ink-2 hover:bg-sunk"
            title="Export this cast + wiring to Snippets as a reusable set" onclick={exportSetup}>{@render uploadIcon()} Export snippet</button>
          <div class={"relative flex h-[26px] shrink-0 items-center gap-1.5 rounded-[6px] border border-line-strong px-2 text-[11px] font-medium " +
            (snippetsOf("setup").length ? "bg-surface text-ink-2 hover:bg-sunk" : "bg-raised text-faint")}>
            {@render downloadIcon()} Import snippet…
            <select value="" disabled={!snippetsOf("setup").length}
              title={snippetsOf("setup").length
                ? "Replay a saved cast + wiring into this activity"
                : "No setup snippets yet — Export snippet captures this block"}
              onchange={(e) => { if (e.target.value) importSetup(e.target.value); e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none disabled:cursor-default">
              <option value=""></option>
              {#each snippetsOf("setup") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
        </div>
        <p class="mt-0 mb-2 text-[11px] text-dim">
          Cast <b>devices</b> from the library — each brings its member
          entities and claims. First in the cast is <b>primary</b> (the
          activity's face). The <b>Roles</b> tab decides who actually does
          what; checkboxes curate the controller's Devices list.
          A <b>group</b> tucks some of them behind one nav card on the
          controller — where they're drawn, never what they are.
          The panel's stacking — Now Playing, Volume, the group
          cards… — is the <b>Controller</b> tab's ↑↓ order; inside a
          group, member rows set the group page's order.
        </p>
        <!-- ONE ROW SHAPE, two homes (v0.60): a cast device renders the
             same whether it stands on the controller or sits inside a
             group. The row is a DOORWAY — its name opens the device in
             the library, which is the "jumping around" Suresh called
             out. `g` is the group it lives in, or null. -->
        <!-- ONE PANEL SHAPE for every member (v0.76): name · icon ·
             draws-as · tap. Opened by the row's ⚙; empties are swept
             on close so an untouched panel writes nothing. -->
        {#snippet castRow(devId, g)}
          {@const d = devLib[devId]}
          {@const miss = g ? showsFallback(devId, g.shows) : null}
          <div class={"rounded-[8px] px-2.5 py-2 " +
            (g ? "bg-bg" : (faceOf() === devId || (!faceOf() && cast[0] === devId)) ? "border border-note-line bg-note-bg" : "bg-inset")}>
            <div class="flex flex-wrap items-center gap-2">
              <button class="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-[inherit] text-[13px] font-semibold text-ink hover:text-accent hover:underline"
                title={"Open " + (d?.name || devId) + " in the pre-wired device library"}
                onclick={() => toDevice(devId)}>{d?.name || devId}</button>
              <span class="truncate font-mono text-[10.5px] text-faint">{devId}</span>
              {#each Object.entries(wiring).filter(([, t]) => t === devId) as [role] (role)}
                <span class="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink">{role}</span>
              {/each}
              <!-- the device's VOICE, worn on the row (2026-09-04 —
                   Suresh: "We could show the selected dialect on the
                   tile"): quiet chip, only where a dialect is set -->
              {#if d?.dialect}
                <span class="rounded-full border border-line bg-sunk px-2 py-0.5 text-[10px] text-dim"
                  title="this device's dialect — set in its ⚙ or the Devices editor">{app.draft?.dialects?.[d.dialect]?.name || d.dialect}</span>
              {/if}
              {#if g}
                <!-- the draws-as TAG (feedback-3 alternate ruling):
                     grouped rows SAY what they draw — settings honored
                     from the row's own ⚙, nothing moves -->
                <span class="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-dim"
                  title="how this member draws on the group's page — its own ⚙ pick first, the group's Members-draw-as second">{drawsTag(devId, g)}</span>
              {/if}
              {#if !d}<span class="text-[11px] text-danger">not in the library</span>{/if}
              <span class="ml-auto flex shrink-0 items-center gap-2.5">
                {#if groups.length}
                  <!-- WHERE THIS DEVICE'S CONTROL IS DRAWN. Not what it
                       is, not what it does — only where it appears. -->
                  <select value={g?.group || ""}
                    title="Which group draws this device's control — the cast, the roles and the entities are unaffected"
                    onchange={(e) => setDeviceGroup(devId, e.target.value)}
                    class="h-[24px] max-w-[150px] cursor-pointer rounded-[5px] border border-line bg-field px-1.5 font-[inherit] text-[10.5px] text-dim outline-none hover:text-ink focus:border-accent">
                    <option value="">on the controller</option>
                    {#each groups as gg (gg.group)}
                      <option value={gg.group}>in {gg.name || gg.group}</option>
                    {/each}
                  </select>
                {/if}
                <!-- primary is about the ACTIVITY's face, so it is only
                     offered where the cast actually stands -->
                {#if faceOf() === devId || (!faceOf() && cast[0] === devId)}
                  <span class="text-[11px] font-medium text-accent-text" title="Holds the media_player role — the activity's face">★ primary</span>
                {:else if !g && devLib[devId]?.roles?.media_player}
                  <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-dim hover:text-accent"
                    title="Make this the primary device — leads the cast and takes the media_player role" onclick={() => castPrimary(devId)}>☆ make primary</button>
                {:else if !g}
                  <span class="text-[11px] text-faint opacity-60"
                    title="Can't lead — no media_player claim; it's a device, not the face">☆</span>
                {/if}
                <!-- CAST ORDER (2026-08-31 — Suresh: "We need to be
                     able to order the elements in the cast"): the
                     cast's order IS the Devices band's order
                     (regenDevices rebuilds a.devices from it) -->
                {#if !g}
                {/if}
                <button class={"cursor-pointer border-0 bg-transparent p-1 " +
                    (a.present?.[devId] && openPres !== devId ? "text-accent" : "text-dim hover:text-accent")}
                  title="Presentation — display name, icon, what it draws as, what a tap does"
                  onclick={() => editPres(devId)}>⚙</button>
                <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                  title="Remove from cast — roles it held unwire" onclick={() => removeCast(devId)}>✕</button>
              </span>
            </div>
            <PresPanel {card} key={devId} isEnt={false} inGroup={!!g} open={openPres === devId} onclose={closePres} />
            {#if miss}
              <!-- honest, not hidden: the engine falls back to a
                   launcher rather than dropping the tile -->
              <p class="mt-1 mb-0 text-[10.5px] text-dim italic">
                no <span class="font-mono">{miss}</span> claim — draws as a
                launcher into its own controller.
                <button class="cursor-pointer border-0 bg-transparent p-0 text-[10.5px] text-accent hover:underline"
                  onclick={() => toDevice(devId)}>add the claim →</button>
              </p>
            {/if}
            {#if d && Object.keys(d.roles || {}).length && !Object.values(wiring).includes(devId)}
              <!-- UNDERSTUDY, SAID OUT LOUD (v0.75 — Suresh: "Roles seem
                   to be wrong. Even though the pre-wired set has the other
                   roles defined"): addCast wires first-come-first-served,
                   so a later cast member with the same claims holds
                   nothing HERE — by design, but silently it reads as a
                   bug. Say it, and point at the lever. -->
              <p class="mt-1 mb-0 text-[10.5px] text-dim italic">
                understudy — an earlier cast member claimed its roles first.
                Reassign any of them on the <b>Roles</b> tab.
              </p>
            {/if}
            <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
              <!-- SAME WORDS IN BOTH HOMES (v0.75 — Suresh: "We are
                   inconsistent on where and how we show 'on controller'
                   between pre-wired and loose devices"): these checkboxes
                   always MEANT "on controller"; now they say so, in the
                   loose rows' own voice. -->
              {#if [...new Set(Object.values(d?.roles || {}))].length}
                <span class="text-[10px] text-dim">on controller:</span>
              {/if}
              {#each [...new Set(Object.values(d?.roles || {}))] as ent (ent)}
                <label class="inline-flex cursor-pointer items-center gap-1.5"
                  title={tileOn(ent) ? "Shown in the controller's Devices list — untick to hide (roles stay wired)" : "Hidden from the controller's Devices list"}>
                  <input type="checkbox" checked={tileOn(ent)} onchange={() => toggleTile(ent)} class="h-3 w-3" />
                  <span class="font-mono text-[10.5px] text-dim">{ent}</span>
                </label>
              {/each}
            </div>
          </div>
        {/snippet}
        <!-- a LOOSE ENTITY row (v0.48; a first-class CAST member since
             feedback-3 round 3 — one ordered list, same arrows) -->
        {#snippet looseRow(ent)}
            <!-- quiet rows (v0.48.1 — "too many things competing for
                 eye"): bg punched down to the page, hairline border -->
            <div class="rounded-[8px] border border-line bg-bg px-2 py-1.5">
              <!-- flex-WRAP (v0.76.4 — Suresh: "screen is corrupted at
                   smaller widths"): the name was the only shrinkable
                   thing in a no-wrap row, so chips squeezed it to
                   nothing and pushed the ★ out of the box. Now the
                   controls flow to a second line (his blessing: "OK to
                   create an extra line") and the name keeps a floor. -->
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="min-w-[140px] flex-1 truncate font-mono text-[11.5px] text-ink" title={ent}>{ent}</span>
                <!-- SAY THE ROLES IT HOLDS (v0.76.1 — Suresh: "keeps the
                     existing entity but demotes it and throws away the
                     roles!"). It never lost them — the wiring is intact
                     underneath — but only the LEGACY row template drew
                     the chips, so an adopted entity looked stripped the
                     moment it moved into this shape. Same chips, same
                     voice, every home. -->
                {#each rolesOf(ent) as role (role)}
                  <span class="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink">{role}</span>
                {/each}
                <button class="shrink-0 cursor-pointer rounded-[6px] border border-dashed border-line-strong bg-transparent px-1.5 py-0.5 text-[10px] text-dim hover:border-accent/60 hover:text-accent"
                  title="Promote to a pre-wired device — mints it from this entity (integration siblings + claims) and swaps it into the cast"
                  onclick={() => promoteExtra(ent)}>⊞ pre-wire</button>
                <label class="inline-flex shrink-0 cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={tileOn(ent)} onchange={() => toggleTile(ent)} class="h-3 w-3" />
                  <span class="text-[10px] text-dim">on controller</span>
                </label>
                <!-- PRIMARY LIVES HERE TOO (v0.76.3 — Suresh: "if we're
                     building a music controller, then a media player
                     needs to [be] primary… it should have a star").
                     For loose entities the media_player WIRING is what
                     primary means: the holder wears ★; any other
                     media_player offers ☆ (rewires the role); other
                     domains show a quiet disabled ☆. -->
                {#if (wiring.media_player || a.context?.media_player) === ent}
                  <span class="shrink-0 text-[11px] font-medium text-accent-text"
                    title="Holds the media_player role — the activity plays through this">★ primary</span>
                {:else if ent.startsWith("media_player.")}
                  <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[11px] text-dim hover:text-accent"
                    title="Make this the media player — rewires the media_player role here"
                    onclick={() => setRole("media_player", ent)}>☆ make primary</button>
                {:else}
                  <span class="shrink-0 text-[11px] text-faint opacity-60"
                    title="Only a media player can lead this activity">☆</span>
                {/if}
                <button class={"shrink-0 cursor-pointer border-0 bg-transparent p-1 " +
                    (a.present?.[ent] && openPres !== ent ? "text-accent" : "text-dim hover:text-accent")}
                  title="Presentation — display name, icon, what it draws as, what a tap does"
                  onclick={() => editPres(ent)}>⚙</button>
                <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                  aria-label="Remove entity" onclick={() => removeExtraEnt(ent)}>✕</button>
              </div>
              <PresPanel {card} key={ent} isEnt={true} inGroup={false} open={openPres === ent} onclose={closePres} />
            </div>
        {/snippet}
        <!-- a GROUP card — rendered IN PLACE in the cast walk; the
             panel's stacking is the Controller tab's ↑↓ order
             (round 8: one order lever) -->
        {#snippet groupCard(g)}
            {#if true}
              {@const kind = SHOWS_KINDS.find((k) => k.value === (g.shows || "device"))}
              <div class="rounded-[8px] border border-line-strong bg-inset px-2.5 py-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[13px]" aria-hidden="true">⊞</span>
                  <button class="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-[inherit] text-[13px] font-semibold text-ink hover:text-accent"
                    title={openGroup === g.group ? "Collapse" : "Name, icon and what its children show"}
                    onclick={() => (openGroup = openGroup === g.group ? null : g.group)}>{g.name || g.group}</button>
                  <span class="truncate font-mono text-[10.5px] text-faint">group:{g.group}</span>
                  {#if g.shows && g.shows !== "device"}
                    <span class="rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-dim"
                      title={(kind?.hint || "") + " — legacy group default; each row's ⚙ overrides"}>default: {kind?.label || g.shows}</span>
                  {/if}
                  <span class="text-[10.5px] text-dim">{(g.members || []).length} of the cast</span>
                  <span class="ml-auto flex shrink-0 items-center gap-2.5">
                    <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-dim hover:text-accent"
                      onclick={() => (openGroup = openGroup === g.group ? null : g.group)}>{openGroup === g.group ? "done" : "edit"}</button>
                    <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                      title="Remove the group — its members stay cast and return to the controller"
                      onclick={() => removeGroup(g.group)}>✕</button>
                  </span>
                </div>
                {#if groupsBandOff && (g.where ?? "controls") === "controls"}
                  <p class="mt-1.5 mb-0 rounded-[6px] border border-note-line bg-note-bg px-2 py-1 text-[11px] text-ink-2">
                    This group's card won't appear — the <b>Cast-group
                    cards</b> band is switched off on the Controller tab.
                    <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-medium text-accent hover:underline"
                      onclick={turnGroupsBandOn}>Turn it on</button>
                  </p>
                {:else if !targetHasGroupsBand(g)}
                  <p class="mt-1.5 mb-0 rounded-[6px] border border-note-line bg-note-bg px-2 py-1 text-[11px] text-ink-2">
                    This group's card has nowhere to draw — the page this
                    activity lands on has no
                    {(g.where ?? "controls") === "devices" ? "Devices" : "Cast-group cards"}
                    band. Stock controllers carry both; on a custom page,
                    add a <span class="font-mono">{(g.where ?? "controls") === "devices" ? "devices" : "groups"}</span>
                    tile{(g.where ?? "controls") === "devices" ? "" : ", or set Where to “Devices section”"}.
                  </p>
                {/if}
                {#if openGroup === g.group}
                  <!-- items-START (feedback-3 #1: "Its all misaligned")
                       — items-end let the hinted fields shove the
                       hint-less Name/Icon labels off the shared top
                       line; now every label sits level and the hints
                       hang below their own field -->
                  <div class="mt-2 flex flex-wrap items-start gap-3 border-t border-line pt-2">
                    <div class="min-w-[160px] flex-[2]">
                      <Field label="Name">
                        <Input value={g.name || ""} onchange={(e) => renameGroup(g, e.target.value)} />
                      </Field>
                    </div>
                    <div class="w-[220px] min-w-[180px] flex-1">
                      <Field label="Icon">
                        <IconPicker bind:value={g.icon} onchange={recompile} />
                      </Field>
                    </div>
                    <div class="w-[190px] min-w-[160px] flex-1">
                      <Field label="Where" hint="which band draws the nav card">
                        <Select value={g.where ?? "controls"}
                          options={[{ value: "controls", label: "With the controls" },
                            { value: "devices", label: "Devices section" }]}
                          onchange={(e) => { const v = e.target.value;
                            if (v === "devices") g.where = "devices";
                            else delete g.where;
                            recompile(); }} />
                      </Field>
                    </div>
                    <!-- "Members draw as" RETIRED AGAIN (feedback-3
                         round 2 — Suresh, after the per-row tags + ⚙
                         landed: "We no longer need this drop down do
                         we? Its confusing!"): each member's own ⚙ is
                         the one place; a legacy g.shows still reads
                         as the members' default and shows on the
                         header chip. Its slot went to the card's
                         STATUS LINE ("would be cool if we could do:
                         {count} controls, {active} active or blank!"):
                         g.sub — tokens substitute live, ∅ writes ""
                         (no line at all), empty deletes (auto). -->
                    <div class="w-[220px] min-w-[180px] flex-1">
                      <Field label="Status line" hint={"{count} and {active} substitute live · blank = auto"}>
                        <div class="flex items-center gap-1">
                          <Input value={g.sub ?? ""}
                            placeholder={g.sub === "" ? "no line" : "auto — 3 entities · 2 active"}
                            onchange={(e) => { const v = e.target.value;
                              if (v) g.sub = v;
                              else if (g.sub !== "") delete g.sub;
                              recompile(); }} />
                          <button class={"h-[38px] w-[34px] shrink-0 cursor-pointer rounded-[6px] border font-[inherit] text-[13px] " +
                              (g.sub === "" ? "border-accent bg-accent/15 text-accent-text"
                                : "border-line-strong bg-surface text-dim hover:text-ink")}
                            title={g.sub === "" ? "No line (active) — click for auto" : "No status line at all"}
                            onclick={() => { if (g.sub === "") delete g.sub;
                              else g.sub = "";
                              recompile(); }}>∅</button>
                        </div>
                      </Field>
                    </div>
                  </div>
                  <p class="mt-2 mb-1 text-[11px] text-dim">
                    A group is a <b>nav card</b> on the controller and a page
                    behind it — the same thing as Devices ▸ Add Nav Card. What
                    changes is the children: a control that fits in a tile is
                    drawn there; anything bigger becomes a launcher into that
                    device's own controller. What each member draws as is
                    set on its own row's ⚙.
                    {#if !(g.members || []).length}<b> Tick the devices it holds.</b>{/if}
                  </p>
                  <div class="flex flex-wrap gap-x-4 gap-y-1">
                    <!-- DEDUPED (2026-09-05 groups round — the fence's
                         each_key_duplicate: a loose entity ticked into a
                         group joins `cast` through the group's members
                         while STAYING in extra_devices, so this list held
                         it twice and the keyed each crashed the whole
                         card — the silent wreck behind "It shows
                         independtly - and the group stays hidden") -->
                    {#each [...new Set([...cast, ...(a.extra_devices || [])])] as cid (cid)}
                      {@const other = groupOf(cid)}
                      {@const mine = other?.group === g.group}
                      <label class={"inline-flex items-center gap-1.5 " +
                        (other && !mine ? "cursor-not-allowed opacity-45" : "cursor-pointer")}
                        title={other && !mine ? "already in " + (other.name || other.group) : ""}>
                        <input type="checkbox" checked={mine} disabled={!!other && !mine} class="h-3 w-3"
                          onchange={() => setDeviceGroup(cid, mine ? "" : g.group)} />
                        <span class="text-[11.5px] text-ink-2">{devLib[cid]?.name ||
                          app.entities.find((x) => x.entity_id === cid)?.name || cid}</span>
                      </label>
                    {:else}
                      <span class="text-[11px] text-dim italic">nothing cast yet — add devices below, then tick them here</span>
                    {/each}
                  </div>
                {/if}
                {#if (g.members || []).length}
                  <div class="mt-2 space-y-1.5 border-l-2 border-line pl-2.5">
                    {#each g.members as mid (mid)}
                      {#if devLib[mid]}
                        <div class="flex items-start gap-1">
                          <div class="min-w-0 flex-1">{@render castRow(mid, g)}</div>
                          <!-- feedback-3 #3: order within the group IS
                               the group page's order -->
                          <span class="flex shrink-0 items-center gap-0.5 pt-2">
                            <button class="cursor-pointer border-0 bg-transparent p-0.5 text-dim hover:text-ink disabled:opacity-30"
                              disabled={(g.members || []).indexOf(mid) <= 0}
                              title="Move up — the group page draws members in this order"
                              onclick={() => moveMember(g, mid, -1)}>▲</button>
                            <button class="cursor-pointer border-0 bg-transparent p-0.5 text-dim hover:text-ink disabled:opacity-30"
                              disabled={(g.members || []).indexOf(mid) >= (g.members || []).length - 1}
                              title="Move down"
                              onclick={() => moveMember(g, mid, 1)}>▼</button>
                          </span>
                        </div>
                      {:else}
                        <!-- a LOOSE entity member: same voice as the
                             ungrouped loose rows — the draws-as TAG says
                             the resolved render (its own ⚙ first, the
                             group default second), the ⚙ opens the same
                             panel, and ▲▼ order the group page -->
                        <div class="rounded-[8px] border border-line bg-bg px-2 py-1.5">
                          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span class="min-w-[140px] flex-1 truncate font-mono text-[11.5px] text-ink" title={mid}>{mid}</span>
                            <span class="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-dim"
                              title="how this member draws on the group's page — its own ⚙ pick first, the group's Members-draw-as second">{drawsTag(mid, g)}</span>
                            <button class="cursor-pointer border-0 bg-transparent p-0.5 text-dim hover:text-ink disabled:opacity-30"
                              disabled={(g.members || []).indexOf(mid) <= 0}
                              title="Move up — the group page draws members in this order"
                              onclick={() => moveMember(g, mid, -1)}>▲</button>
                            <button class="cursor-pointer border-0 bg-transparent p-0.5 text-dim hover:text-ink disabled:opacity-30"
                              disabled={(g.members || []).indexOf(mid) >= (g.members || []).length - 1}
                              title="Move down"
                              onclick={() => moveMember(g, mid, 1)}>▼</button>
                            <button class={"shrink-0 cursor-pointer border-0 bg-transparent p-1 " +
                                (a.present?.[mid] && openPres !== mid ? "text-accent" : "text-dim hover:text-accent")}
                              title="Presentation — display name, icon, what it draws as, what a tap does"
                              onclick={() => editPres(mid)}>⚙</button>
                            <button class="cursor-pointer border-0 bg-transparent p-1 text-[11px] text-dim hover:text-danger"
                              title="Take it out of the group — it returns to the cast rows"
                              onclick={() => setDeviceGroup(mid, "")}>✕</button>
                          </div>
                          <PresPanel {card} key={mid} isEnt={true} inGroup={true} open={openPres === mid} onclose={closePres} />
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
        {/snippet}
        <div class="space-y-2">
          <!-- the cast in ITS OWN ORDER: ungrouped devices where they
               stand, each group where it stands, members nested -->
          <!-- ONE ORDERED CAST (feedback-3 round 3): devices, loose
               entities and group cards all render HERE, in a.cast
               order — the tab's order is the controller's order,
               and every ▲▼ moves within the same list -->
          {#each castRaw as member (typeof member === "string" ? "m:" + member : "g:" + member.group)}
            {#if typeof member === "string"}
              {#if !groupOf(member)}
                {#if member.includes(".")}{@render looseRow(member)}
                {:else}{@render castRow(member, null)}{/if}
              {/if}
            {:else}
              {@render groupCard(member)}
            {/if}
          {/each}
          {#if !castRaw.length && !legacyEnts.length}
            <p class="m-0 text-xs text-dim">
              No devices cast yet — search below. Devices you pick are
              added to your library automatically.
            </p>
          {/if}
          <!-- LEGACY rows (v0.53): entities wired straight into roles
               by yaml-era activities — visible again, promotable -->
          {#each legacyEnts as ent (ent)}
            <div class="flex items-center gap-2 rounded-[8px] border border-line bg-bg px-2 py-1.5">
              <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink" title={ent}>{ent}</span>
              {#each rolesOf(ent) as role (role)}
                <span class="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink">{role}</span>
              {/each}
              <button class="shrink-0 cursor-pointer rounded-[6px] border border-dashed border-line-strong bg-transparent px-1.5 py-0.5 text-[10px] text-dim hover:border-accent/60 hover:text-accent"
                title="Promote to a pre-wired device — mints it from this entity (integration siblings + claims) and swaps it into the cast"
                onclick={() => promoteExtra(ent)}>⊞ pre-wire</button>
              <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                title="Unwire — clears every role pointing at this entity"
                aria-label="Remove entity" onclick={() => removeLegacyEnt(ent)}>✕</button>
            </div>
          {/each}
          <CastPicker {card} {addCast} {addExtraEnt} />
          <div class="flex items-center">
            <span class="flex-1 text-[10.5px] text-dim italic">⊞ devices bundle their integration siblings — tune traits any time in</span>
            <button class="cursor-pointer border-0 bg-transparent p-0 pl-1 text-[10.5px] text-accent hover:underline"
              onclick={() => selectSlice("devices")}>the pre-wired device library →</button>
          </div>
        </div>
      </div>
      </div>
