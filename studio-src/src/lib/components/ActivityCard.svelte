<script>
  /* One activity, full harmonia-style card: identity, Setup ($context
     devices), State rules, navigation + confirm, controls JSON escape
     hatch. Lives in the OWNING room's editor. */
  import { app, selectSlice, beginSeqDraft, beginPageDraft, isControllerScreen, instantiateController, revertToStock, saveSnippet, snippetsOf, presetSnippetTile, showUndo, actDirty, recompileContext, setStatus, schedulePreview, seedDeviceFromEntity, impliedGroups, platformOf, previewActivity, previewGoto, ROLE_KEYS, isCastGroup, SHOWS_KINDS, showsRole, openDeviceEditor } from "../state.svelte.js";
  import Field from "./Field.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";
  import Switch from "./Switch.svelte";
  import Chips from "./Chips.svelte";
  import CardRow from "./CardRow.svelte";
  import TileRow from "./TileRow.svelte";
  import EntityPicker from "./EntityPicker.svelte";
  import IconPicker from "./IconPicker.svelte";
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
  /* THE CONTROLLER TAB (v0.83.7 — Suresh: "Should we have a
     controller tab, where we turn knobs and settings for a given
     controller?"). Per-activity band switches on the SHARED surface,
     stored on a.surface (surface.devices pioneered the shape in
     v0.48). Absent = Auto = today's behavior; false = off. The rows
     are derived from what the target controller ACTUALLY renders. */
  const BAND_DEFS = [
    { key: "np", label: "Now Playing", types: ["media"],
      hint: "art, title, play state" },
    { key: "transport", label: "Transport", types: ["transport"],
      hint: "play / pause / skip" },
    { key: "modes", label: "Modes", types: ["mediabtns"],
      hint: "shuffle / repeat / queue" },
    { key: "volume", label: "Volume band", types: ["volume", "volumes"],
      hint: "the cast's volume controls" },
    { key: "speakers", label: "Speakers (grouping)", types: ["speakers"],
      hint: "Auto = appears when this activity has 2+ players" },
    { key: "groups", label: "Cast-group cards", types: ["groups"],
      hint: "the nav cards for groups made with ⊞ Add group in the cast" },
    { key: "sources", label: "Source picker", types: ["sources"],
      hint: "the input list" },
    { key: "presets", label: "Presets band", types: ["presets"],
      hint: "the shortcuts below — hiding the band keeps them saved" },
    { key: "devices", label: "Devices section", types: ["devices"],
      hint: "the cast lists itself at the bottom of the controller" },
  ];
  const ctrlTileTypes = $derived.by(() => {
    const c = navCtrl?.c;
    const tt = new Set();
    if (c) [...(c.tiles || []), ...((c.sections || []).flatMap((x) => x.tiles || []))]
      .forEach((x) => { if (x && x.type) tt.add(x.type); });
    return tt;
  });
  const bandsRaw = $derived(BAND_DEFS.filter((b) => b.types.some((x) => ctrlTileTypes.has(x))));
  /* rows display in the activity's own order (v0.83.7 — "move up
     and move down"); unlisted bands trail in natural order */
  const bands = $derived.by(() => {
    const order = a?.surface?.band_order;
    if (!Array.isArray(order) || !order.length) return bandsRaw;
    return [...bandsRaw].sort((x, y) => {
      const rx = order.indexOf(x.key), ry = order.indexOf(y.key);
      return (rx < 0 ? 900 : rx) - (ry < 0 ? 900 : ry);
    });
  });
  function moveBand(key, dir) {
    const cur = bands.map((b) => b.key);
    const i = cur.indexOf(key), j = i + dir;
    if (j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    a.surface = { ...(a.surface || {}), band_order: cur };
    schedulePreview();
  }
  const bandOn = (k) => a.surface?.[k] !== false;
  function setBand(k, v) {
    if (v) {
      if (a.surface) {
        delete a.surface[k];
        if (!Object.keys(a.surface).length) delete a.surface;
      }
    } else a.surface = { ...(a.surface || {}), [k]: false };
    schedulePreview();
  }
  function setSurfKey(key, v) {
    if (v) a.surface = { ...(a.surface || {}), [key]: v };
    else if (a.surface) {
      delete a.surface[key];
      if (!Object.keys(a.surface).length) delete a.surface;
    }
    schedulePreview();
  }
  /* Speaker Groups (v0.83.7): which players the Speakers band offers,
     and how the card presents — see Model → Speaker Groups */
  const setSpeakersGroup = (v) => setSurfKey("speakers_group", v);
  const setSpeakersMode = (v) => setSurfKey("speakers_mode", v);
  /* BAND LABEL SLOTS (v0.83.7 — "would be cool is a label slot, so we
     can override labels ... No text means no label!"): overrides the
     band's tile label on the remote, for THIS activity. Absent =
     default; "" = no label at all. Only single-tile bands take one —
     per-item bands (the volumes cast, presets, devices) keep their
     own names. */
  const LABELABLE = new Set(["np", "transport", "modes", "volume", "sources", "speakers", "presets", "devices"]);
  /* the placeholder tells the truth (v0.83.7 — "Volume Band. label is
     Blank but actually its ..."): what the band ACTUALLY says today,
     so the empty slot reads as "currently: X", not as "no label" */
  function defaultBandLabel(key) {
    const c = navCtrl?.c;
    const allTiles = c ? [...(c.tiles || []),
      ...((c.sections || []).flatMap((x) => x.tiles || []))] : [];
    const byType = (ty) => allTiles.find((x) => x.type === ty);
    if (key === "np") return byType("media")?.label ?? "Now Playing";
    if (key === "transport") return byType("transport")?.label ?? "(hidden)";
    if (key === "modes") return byType("mediabtns")?.label ?? "(hidden)";
    if (key === "sources") return byType("sources")?.label ?? "Inputs";
    if (key === "volume") {
      const wired = a?.context?.volume;
      const dev = Object.entries(app.draft?.devices || {}).find(
        ([, d]) => Object.values(d.roles || {}).includes(wired) && d.roles?.volume === wired);
      if (dev) return dev[1].name || dev[0];
      /* LOOSE wiring (tidy-ups: 'We show "Volume" ... It's MA
         Basement'): the wired entity's own name is the truth */
      const rec = app.entities.find((x) => x.entity_id === wired);
      if (rec?.name) return rec.name;
      if (typeof wired === "string" && wired.includes("."))
        return wired.split(".").pop().replace(/_/g, " ");
      return byType("volume")?.label ?? "Volume";
    }
    if (key === "speakers") {
      const gid = a?.surface?.speakers_group;
      return gid ? (app.draft?.speaker_groups?.[gid]?.name || gid) : "Speakers";
    }
    if (key === "presets" || key === "devices") {
      const sec = (c?.sections || []).find((x) =>
        (x.tiles || []).some((tt) => tt.type === key));
      return sec?.title ?? (key === "presets" ? "Presets" : "Devices");
    }
    return "";
  }
  const bandLabel = (k) => a.surface?.band_labels?.[k];
  function setBandLabel(k, v) {
    a.surface = { ...(a.surface || {}),
      band_labels: { ...(a.surface?.band_labels || {}), [k]: v } };
    schedulePreview();
  }
  function clearBandLabel(k) {
    if (!a.surface?.band_labels) return;
    delete a.surface.band_labels[k];
    if (!Object.keys(a.surface.band_labels).length) delete a.surface.band_labels;
    if (!Object.keys(a.surface).length) delete a.surface;
    schedulePreview();
  }
  const setNpStyle = (v) => setSurfKey("np_style", v);
  function setVolStyle(v) {
    if (v) a.surface = { ...(a.surface || {}), volume_style: v };
    else if (a.surface) {
      delete a.surface.volume_style;
      if (!Object.keys(a.surface).length) delete a.surface;
    }
    schedulePreview();
  }
  function toggleDevices(v) {
    if (v) {
      if (a.surface) {
        delete a.surface.devices;
        if (!Object.keys(a.surface).length) delete a.surface;
      }
    } else a.surface = { ...(a.surface || {}), devices: false };
    schedulePreview();   // v0.48.1: the switch looked dead without this
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
    source_select: ["media_player"],
    commands: ["media_player", "remote"],
    search: ["media_player"],
  };
  /* ---- Setup v2: DEVICES are the nouns, ROLES are the wiring ----
     The device list is the activity's cast (first = ★ primary, the
     activity's face). Role chips wire logical buttons/paths to a
     device; they compile to the same $context map the engine reads. */
  const ROLES = ["media_player", "dpad", "power", "volume", "volume_level",
    "source_select",    /* source_select (v0.36): who owns inputs — wiring
                           it makes the controller's Source tile appear */
    "commands",         /* commands (v0.44 as `system`, renamed v0.45.1 —
                           Suresh): the COMMAND channel — the ADB entity
                           on Google TV / Fire TV. Launches and system
                           keycodes route here; $context.commands-bound
                           tiles hide when it's unwired. */
    "search"];          /* search (v0.69): who answers a library
                           search. Usually the Music Assistant twin of
                           the speaker that plays — MA searches, the
                           native player often cannot, and NEITHER can
                           be told apart by supported_features. */

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
  /* ROLES tab copy (Suresh's ruling, v0.45.1): control name leads,
     mono role key beside it, effect line as the tooltip/hint — no
     baby english; the audience speaks HA. */
  const ROLE_CONTROLS = {
    media_player: "Now Playing",
    dpad: "Navigation",
    power: "Power button",
    volume: "Volume keys",
    volume_level: "Volume readout",
    source_select: "Source picker",
    commands: "Commands",
    search: "Search",
  };
  const ROLE_EFFECTS = {
    media_player: "the media tile, transport, play/pause state",
    dpad: "arrows · select · back · home — physical remote keys pass through here",
    power: "DEVICE power — the physical power tap and $context.power tiles toggle this; the on-screen ⏻ ends/starts the ACTIVITY itself (v0.48.1) and needs no wiring",
    volume: "volume up/down (hardware + on-screen) send here",
    volume_level: "where the slider reads truth, when it differs from who takes volume keys",
    source_select: "whose input list the Source tile offers — setting every device's input at start lives in Inputs",
    commands: "app launches + system keycodes (ADB on Android platforms)",
    search: "who answers when you search the library — usually this speaker's Music Assistant twin; unwired means the library page simply offers no search",
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
  /* the INTELLIGENT list: only render modes this member can honour —
     a claimed role for devices, the entity's own domain for loose
     entities. Launcher is always offered. */
  function presShows(key, isEnt) {
    if (!isEnt) {
      const roles = devLib[key]?.roles || {};
      return SHOWS_KINDS.filter((k) => !k.role || roles[k.role]);
    }
    const dom = key.split(".")[0];
    return SHOWS_KINDS.filter((k) => !k.role || dom === "media_player" ||
      (k.value === "power" &&
        ["switch", "light", "fan", "input_boolean"].includes(dom)));
  }
  /* the Volume style select shows only where a volume control can
     exist: a device claiming roles.volume, or a media_player entity */
  const canVolume = (key, isEnt) =>
    isEnt ? key.startsWith("media_player.") : !!devLib[key]?.roles?.volume;
  const STYLE_OPTS = [
    { value: "", label: "Theme default" },
    { value: "compact", label: "Compact" },
    { value: "slider", label: "Slider — the fat one" },
    { value: "stepper", label: "Stepper − / +" },
  ];
  /* the STATUS LINE's raw material (v0.79 review: "A text box with a
     drop down of available attributes"): the member's live attribute
     names, offered as {token} inserts — the engine substitutes them
     per state diff (render.js subTextOf). */
  function presEntity(key, isEnt) {
    if (isEnt) return key;
    return Object.values(devLib[key]?.roles || {})[0] || null;
  }
  function presAttrs(key, isEnt) {
    const ent = presEntity(key, isEnt);
    const e = ent && app.entities.find((x) => x.entity_id === ent);
    /* e.attrs — attribute NAMES captured by loadEntities (v0.79.1:
       the old read of e.attributes found a field that never existed,
       so the picker offered nothing but "state") */
    return ["state", ...(e?.attrs || [])];
  }
  const TAP_OPTS = [
    { value: "", label: "Smart default" },
    { value: "open", label: "Its controller page" },
    { value: "none", label: "Nothing — a pure readout" },
  ];
  /* the adoption itself, shared by BOTH doors into the cast block
     (v0.75.3 — "Didn't work for the existing activity": the Onkyo went
     in as a LOOSE entity, and addExtraEnt regenerated a.devices
     without ever running the adoption — same erasure, other door). */
  function adoptWired(newDevId) {
    const covered = new Set();
    for (const c of newDevId ? [...cast, newDevId] : cast)
      for (const e of Object.values(devLib[c]?.roles || {})) covered.add(e);
    const ctxRaw = [];
    for (const r of ROLES) {
      const v = a.context?.[r];
      if (typeof v === "string" && v.includes(".")) ctxRaw.push(v);
    }
    for (const ent of [...(Array.isArray(a.devices) ? a.devices : []), ...ctxRaw])
      if (!covered.has(ent) && !(a.extra_devices || []).includes(ent)) {
        if (!a.extra_devices) a.extra_devices = [];
        a.extra_devices.push(ent);
      }
  }
  function addCast(devId) {
    if (!devId || !devLib[devId]) return;
    if (!a.cast) a.cast = [];
    if (a.cast.includes(devId)) return;
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
    a.cast.push({ group: gid, name: "Group", icon: "material:widgets",
      shows: "device", members: [] });
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
  let openGroup = $state(null);   /* group row expanded for editing */

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
    if (!a.extra_devices) a.extra_devices = [];
    if (!a.extra_devices.includes(ent)) a.extra_devices.push(ent);
    guessRoles(ent);           /* v0.78: unwired roles fill from the domain */
    regenDevices();
    recompile();
  }
  function removeExtraEnt(ent) {
    a.extra_devices = (a.extra_devices || []).filter((x) => x !== ent);
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
  /* ---- UNIFIED CAST PICKER (v0.45.2 — Suresh: the library is a
     byproduct, not a prerequisite). ONE box: library devices, then
     IMPLIED devices (⊞ stem-grouped entity clusters, minted into the
     library silently on pick), then raw entities (cast directly). ---- */
  let castQ = $state("");
  let castOpen = $state(false);
  let castEl = $state(null);
  let castRect = $state(null);   /* FIXED dropdown — no ancestor can clip */
  const placeCast = () => { castRect = castEl?.getBoundingClientRect() || null; };
  $effect(() => {
    if (!castOpen) return;
    const glue = () => placeCast();
    window.addEventListener("scroll", glue, true);   /* capture: any scroller */
    window.addEventListener("resize", glue);
    return () => {
      window.removeEventListener("scroll", glue, true);
      window.removeEventListener("resize", glue);
    };
  });
  const castHit = (txt) => !castQ.trim() ||
    txt.toLowerCase().includes(castQ.trim().toLowerCase());
  const pickLib = $derived(Object.entries(devLib)
    .filter(([k]) => !cast.includes(k))
    .filter(([k, d]) => castHit((d.name || "") + " " + k))
    .slice(0, 8));
  const pickImplied = $derived(impliedGroups()
    .filter((g) => !devLib[g.stem])
    .filter((g) => castHit(g.stem + " " + g.ents.join(" ")))
    .slice(0, 8));
  const pickEnts = $derived(app.entities
    .filter((e) => castHit(e.entity_id + " " + (e.name || "")))
    .filter((e) => !(a.extra_devices || []).includes(e.entity_id))
    .slice(0, 12));
  function castLibDevice(devId) {
    addCast(devId);
    castQ = ""; castOpen = false;
  }
  function castImplied(g) {
    if (!app.draft.devices) app.draft.devices = {};
    const lib = app.draft.devices;
    const { stem, dev } = seedDeviceFromEntity(g.ents[0]);
    let id = stem, n = 2;
    while (lib[id]) id = stem + "_" + n++;
    lib[id] = dev;
    addCast(id);
    setStatus("⊞ " + (dev.name || id) + " added to your library and cast", "ok");
    castQ = ""; castOpen = false;
  }
  function castDirect(ent) {
    addExtraEnt(ent);
    castQ = ""; castOpen = false;
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
    a.extra_devices = (a.extra_devices || []).filter((x) => x !== ent);
    addCast(id);
    setStatus("⊞ " + (dev.name || id) + " pre-wired and cast — " + ent +
      " now rides its bundle", "ok");
  }
  /* ROLES: candidates = cast devices that already CLAIM this role; a
     raw entity stays possible (the escape hatch is part of the
     grammar) */
  const roleCandidates = (role) => cast.filter((c) => devLib[c]?.roles?.[role]);
  /* LOOSE ENTITIES ARE CANDIDATES TOO (v0.78 review: "shouldn't this
     drop down show the cast, followed by 'another entity'?"). Domain-
     filtered per role; entities a cast device already claims for this
     role are left to the device's own option. */
  const looseCandidates = (role) => {
    const claimed = cast.map((c) => devLib[c]?.roles?.[role]).filter(Boolean);
    return [...new Set([...(a.extra_devices || []), ...deviceList()])]
      .filter((ent) => typeof ent === "string" && ent.includes(".") &&
        (SLOT_DOMAINS[role] || []).includes(ent.split(".")[0]) &&
        !claimed.includes(ent));
  };
  /* ...but a cast device that hasn't claimed the role was simply
     INVISIBLE here (v0.62 — Suresh: "In the drop down for Power Button,
     only get nobody or 'an entity directly' … Volume Readout doesn't
     list Bar Sonos"). The doctrine is right — a device declares what it
     can do — but the dropdown enforced it by HIDING the answer instead
     of offering to write it down. So the rest of the cast appears too,
     each shown with the entity it WOULD use: its own bundle, first
     entity whose domain this role accepts. Picking one mints the claim
     on the device (permanent — every future cast of it fills this role
     by itself) and wires it, in one gesture. */
  function claimableEntity(devId, role) {
    const d = devLib[devId];
    if (!d || d.roles?.[role]) return null;
    const doms = SLOT_DOMAINS[role] || [];
    for (const k of ROLE_KEYS) {
      const e = d.roles?.[k];
      if (e && doms.includes(String(e).split(".")[0])) return e;
    }
    return null;
  }
  const roleClaimable = (role) => cast
    .filter((c) => !devLib[c]?.roles?.[role])
    .map((c) => ({ id: c, ent: claimableEntity(c, role) }))
    .filter((x) => x.ent);
  function claimAndWire(role, devId) {
    const ent = claimableEntity(devId, role);
    const d = devLib[devId];
    if (!ent || !d) return;
    if (!d.roles) d.roles = {};
    d.roles[role] = ent;
    setRole(role, devId);
    setStatus("↥ " + (d.name || devId) + " now claims " + role + " → " + ent +
      " — saved to the device, so every future cast fills it by itself", "ok");
  }
  /* an entity wired in from OUTSIDE joins the cast as a loose row —
     hidden from the controller by default (v0.78 review: "should it
     be added to the cast (with default NOT on controller?)"). */
  function adoptOutside(ent) {
    if (!ent.includes(".")) return;                     /* device ids pass */
    const covered = cast.some((c) =>
      Object.values(devLib[c]?.roles || {}).includes(ent));
    if (covered || (a.extra_devices || []).includes(ent)) return;
    if (!a.extra_devices) a.extra_devices = [];
    a.extra_devices.push(ent);
    if (!a.device_options) a.device_options = {};
    a.device_options[ent] = { ...(a.device_options[ent] || {}), tile: false };
    regenDevices();
  }
  function setRole(role, target) {
    if (!a.wiring) a.wiring = {};
    if (target) a.wiring[role] = target;
    else delete a.wiring[role];
    recompile();
  }
  let customRole = $state(null);   /* role currently picking a raw entity */
  /* PROMOTE A CLAIM (v0.48.1 — Suresh: "I figured out the adb device
     carried the volume level... Should I have the option of updating
     the Pre-Wired Device?"): when a role is wired to a RAW entity that
     belongs to a cast device's bundle, offer to save the wiring into
     the device's claims — the library learns, every future cast of it
     fills this role by itself. */
  const claimTargets = (role, ent) =>
    typeof ent === "string" && ent.includes(".")
      ? (a.cast || []).filter((k) => {
          const d = devLib[k];
          return d && !(d.roles || {})[role] &&
            Object.values(d.roles || {}).includes(ent);
        })
      : [];
  function promoteClaim(role, ent, devId) {
    const d = devLib[devId];
    if (!d) return;
    d.roles = { ...(d.roles || {}), [role]: ent };
    setRole(role, devId);          /* wiring now rides the device claim */
    setStatus("claim saved — " + (d.name || devId) + " now pre-wires " + role);
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
  const sourcesOf = (ent) =>
    app.entities.find((x) => x.entity_id === ent)?.source_list || [];
  let typingSrc = $state(null);   /* key currently typing a source */
  function setInput(devId, v) {
    if (!a.inputs) a.inputs = {};
    if (v === "__unset") { delete a.inputs[devId]; if (!Object.keys(a.inputs).length) delete a.inputs; }
    else a.inputs[devId] = v === "__ignore" ? null : v;
  }
  const inputAnswer = (devId) =>
    !a.inputs || !(devId in a.inputs) ? "__unset"
      : a.inputs[devId] === null ? "__ignore" : a.inputs[devId];

  /* ---- GENERATION (docs/wizard.md — the prime directive: NEVER guess
     power). Start Actions follow the proven firetv_on shape; drafts are
     ordinary editable sequences; an edited sequence is NEVER silently
     overwritten (a _v2 is minted beside it); power-off is strictly
     opt-in per device and never_off devices are untouchable. ---- */
  function buildStartActions() {
    const steps = [{ alias: "Set activity state",
      action: "harmonium.set_activity", data: { activity: id } }];
    for (const devId of cast) {
      const d = devLib[devId];
      const t = d?.traits || {};
      if (!t.wake) continue;
      steps.push({ alias: "Wake " + (d.name || devId) + " if asleep (best effort)",
        action: "homeassistant.turn_on", continue_on_error: true,
        target: { entity_id: t.wake } });
      if (t.cold_start?.length || t.wait_timeout_s || t.settle_s) {
        const then = [
          ...(t.cold_start || []).map((s) => JSON.parse(JSON.stringify(s))),
          ...(t.wait_timeout_s ? [{
            alias: "Wait for " + (d.name || devId) + " to report on (up to " + t.wait_timeout_s + "s)",
            wait_for_trigger: [{ trigger: "state", entity_id: t.wait_on || t.wake, to: "on" }],
            timeout: { seconds: t.wait_timeout_s }, continue_on_timeout: true }] : []),
          ...(t.settle_s ? [{
            alias: "Let " + (d.name || devId) + " finish waking",
            delay: { seconds: t.settle_s } }] : []),
        ];
        if (then.length)
          steps.push({ alias: "Cold start only: bring up " + (d.name || devId),
            if: [{ condition: "state", entity_id: t.wake, state: "off" }], then });
      }
    }
    for (const [devId, src] of Object.entries(a.inputs || {})) {
      if (src == null) continue;                     /* none / ignore */
      /* same entity the Inputs tab asked about (v0.83.7) */
      const ent = inputEnt(devId) ||
        (devId.includes(".") ? devId : null);        /* direct entity key */
      if (!ent) continue;
      steps.push({
        alias: "Switch " + (devLib[devId]?.name || devId) + " to " + src + " ONLY if needed",
        if: [{ condition: "not", conditions: [{ condition: "state",
          entity_id: ent, attribute: "source", state: src }] }],
        then: [{ alias: "Set input to " + src + " (best effort)",
          action: "media_player.select_source", continue_on_error: true,
          data: { source: src }, target: { entity_id: ent } }] });
    }
    return steps;
  }
  function buildStopActions() {
    /* THE STOP ENDS THIS ACTIVITY, NOT THE ROOM (v0.83.7 — Suresh:
       "a room can run MORE than one activity at a time. Listen to
       Music and Watch TV. If I long press Watch TV, I want Watch TV
       turned off. Not the whole room."). The room's select is the
       FOCUS — who owns the controller, the keys, the context — and
       it holds one activity; device truth (state rules / implied
       state) is what makes several activities read as running at
       once. So a generated Stop: turns off ITS checked devices, and
       clears the room's routing ONLY if this activity still holds
       it — if Music took the room meanwhile, ending Watch TV leaves
       Music's routing alone. (The original bug here was worse: a
       bare set_activity off is ALL-OFF, every room in the
       workspace.) The select id is the minted pattern —
       workspace-prefixed except main; duplication retargets it. */
    const selEnt = "select.harmonium_" +
      (app.workspace === "main" ? "" : app.workspace + "_") +
      (a.room_view || "") + "_activity";
    const steps = [{
      alias: "Clear the room's routing — ONLY if this activity still owns it",
      if: [{ condition: "state", entity_id: selEnt, state: id }],
      then: [{ action: "harmonium.set_activity",
        data: { activity: "off",
          ...(a.room_view ? { room: a.room_view } : {}) } }] }];
    for (const devId of a.stop_off || []) {
      const d = devLib[devId];
      if (!d || d.traits?.never_off) continue;       /* the untouchables */
      const ent = d.roles?.power || d.roles?.media_player;
      if (!ent) continue;
      steps.push({ alias: "Turn " + (d.name || devId) + " off (best effort)",
        action: "homeassistant.turn_off", continue_on_error: true,
        target: { entity_id: ent } });
    }
    return steps;
  }
  function writeGenerated(kind, steps) {
    if (!app.draft.sequences) app.draft.sequences = {};
    const seqs = app.draft.sequences;
    const sig = JSON.stringify(steps);
    const ref = a[kind] || "";
    let sid = ref.startsWith("sequence:") ? ref.slice(9) : null;
    if (sid && seqs[sid]) {
      const cur = seqs[sid];
      const untouched = cur.generated_sig &&
        JSON.stringify(cur.actions) === cur.generated_sig;
      if (!untouched) {
        /* NEVER overwrite an edited (or hand-written) sequence —
           mint a sibling and leave the original alone */
        let v = sid.replace(/_v\d+$/, ""), n = 2;
        while (seqs[v + "_v" + n]) n++;
        sid = v + "_v" + n;
      }
    } else {
      const base = slugify(roomLabel() + " " + (a.name || id) + " " + kind) || id + "_" + kind;
      sid = base;
      let n = 2;
      while (seqs[sid]) sid = base + "_" + n++;
    }
    seqs[sid] = {
      name: (a.name || id) + " — " + (kind === "start" ? "Start" : "Stop") + " (generated)",
      room: a.room_view || undefined,
      actions: steps,
      generated_sig: sig,
    };
    a[kind] = "sequence:" + sid;
    setStatus("generated " + sid + " — an ordinary editable Action, yours now", "ok");
    schedulePreview();
  }
  function toggleStopOff(devId) {
    if (!a.stop_off) a.stop_off = [];
    if (a.stop_off.includes(devId)) a.stop_off = a.stop_off.filter((x) => x !== devId);
    else a.stop_off.push(devId);
    if (!a.stop_off.length) delete a.stop_off;
  }
  /* STATE from the answers: display on + source in [input] — exactly
     the hand-built watch_firetv detection shape */
  const stateDisplay = $derived.by(() => {
    const devId = typeof wiring.source_select === "string" && devLib[wiring.source_select]
      ? wiring.source_select : null;
    if (!devId) return null;
    const src = (a.inputs || {})[devId];
    if (!src) return null;
    return { devId, ent: devLib[devId].roles.source_select, src };
  });
  /* PRIMARY-DEVICE STATE (v0.47.7 — Suresh: "State comes from the
     primary cast member"): the primary device's media_player claim in
     any on-ish state = the activity is ON. One click, editable after.
     NOT the default — the Fire TV is never off, which is why
     watch_firetv derives from the display + input instead. */
  const primaryMp = $derived(
    devLib[cast[0]]?.roles?.media_player ||
    (typeof a?.context?.media_player === "string" ? a.context.media_player : null));
  /* IMPLIED STATE witness (v0.48.1, mirrors the engine): with NO
     authored rule, truth derives live from the primary device's
     media_player — unless that device is never_off (Fire TV). */
  const impliedWitness = $derived.by(() => {
    const d = devLib[cast[0]];
    return d && !d.traits?.never_off ? d.roles?.media_player || null : null;
  });
  function generatePrimaryState() {
    if (!primaryMp) return;
    a.state = {
      entities: [primaryMp],
      on: { any_state: ["on", "playing", "paused", "buffering", "idle"] },
    };
    schedulePreview();
  }
  function generateState() {
    if (!stateDisplay) return;
    const mp = a.context?.media_player;
    a.state = {
      entities: [...new Set([mp, stateDisplay.ent].filter(Boolean))],
      on: { all: [
        { entity: stateDisplay.ent, state: "on" },
        { entity: stateDisplay.ent, attribute: "source", in: [stateDisplay.src] },
      ] },
    };
    schedulePreview();
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
  function addPreset() {
    if (!a.presets) a.presets = [];
    a.presets.push({ type: "preset", id: "p_" + Math.random().toString(36).slice(2, 6),
      label: "New preset", icon: "material:play_circle", action: {} });
    recompile();
  }

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
    /* legacy snippets carried {devices, roles} — translate on the fly */
    if (sn.data.cast || sn.data.wiring) {
      a.cast = JSON.parse(JSON.stringify(sn.data.cast || []));
      a.wiring = JSON.parse(JSON.stringify(sn.data.wiring || {}));
      if (sn.data.extra_devices) a.extra_devices = [...sn.data.extra_devices];
      if (sn.data.present) a.present = JSON.parse(JSON.stringify(sn.data.present));
      else delete a.present;
    } else {
      a.extra_devices = JSON.parse(JSON.stringify(sn.data.devices || []));
      a.wiring = JSON.parse(JSON.stringify(sn.data.roles || {}));
      a.cast = [];
    }
    if (sn.data.device_options)
      a.device_options = JSON.parse(JSON.stringify(sn.data.device_options));
    regenDevices();
    recompile();
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
          onclick={() => (tab = "advanced")}>
          <span class="mr-1 inline-block h-[9px] w-[9px] rounded-[2px] border border-current align-[-1px]"></span>Advanced</button>
      </div>

      {#if tab === "setup"}
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
        </p>
        <!-- ONE ROW SHAPE, two homes (v0.60): a cast device renders the
             same whether it stands on the controller or sits inside a
             group. The row is a DOORWAY — its name opens the device in
             the library, which is the "jumping around" Suresh called
             out. `g` is the group it lives in, or null. -->
        <!-- ONE PANEL SHAPE for every member (v0.76): name · icon ·
             draws-as · tap. Opened by the row's ⚙; empties are swept
             on close so an untouched panel writes nothing. -->
        {#snippet presPanel(key, isEnt, inGroup)}
          {#if openPres === key && a.present?.[key]}
            <!-- ONE GRID, ONE BASELINE (v0.76.3 — Suresh: "the config
                 layout is a bit messed up"): every control is 38px on
                 the same row, labels above, explanations in tooltips —
                 the stacked hints were what pushed fields off-line. -->
            <!-- wrap-friendly (v0.76.4): uniform 38px blocks that FLOW
                 at narrow widths instead of a fixed grid that clips —
                 alignment holds because the hints live in tooltips -->
            <div class="mt-2 flex flex-wrap items-start gap-3 rounded-[8px] border border-line bg-bg px-2.5 py-2">
              <div class="min-w-[150px] flex-[1.2]">
                <Field label="Display name">
                  <Input bind:value={a.present[key].name}
                    title="blank = its own name · clearing a SAVED name shows no label at all"
                    placeholder={isEnt ? key.split(".").pop() : (devLib[key]?.name || key)} />
                </Field>
              </div>
              <!-- BRACES IN TOOLTIPS ARE CODE (v0.79.1 — Suresh:
                   "Settings cog has stopped working"): a bare {curly}
                   inside a quoted attribute is a Svelte INTERPOLATION —
                   "curly is not defined" threw on ⚙ click and ate the
                   whole panel. Compile passed (unknown ids are globals);
                   only the runtime probe caught it. Tooltip text that
                   mentions tokens must be a string EXPRESSION: title={"…"}. -->
              <div class="min-w-[200px] flex-[1.4]">
                <Field label="Status line">
                  <div class="flex gap-1">
                    <Input bind:value={a.present[key].sub}
                      title={"the tile's second line — blank = the widget's smart summary · clearing a SAVED line shows none · {curly} tokens read the entity live"}
                      placeholder="auto" />
                    <!-- a quiet ＋ button, not a visible select (v0.79.2
                         — Suresh: "the + dropdown looks wonky. Do we
                         need the down chevron?"): appearance-none kills
                         the native chevron; the ＋ centres alone -->
                    <select value="" title={"insert a live attribute — {token}s follow the entity"}
                      onchange={(e) => { const v = e.target.value;
                        if (v) a.present[key].sub = (a.present[key].sub || "") + "{" + v + "}";
                        e.target.value = ""; }}
                      class="h-[38px] w-[30px] shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-field text-center text-[15px] text-dim outline-none hover:text-ink">
                      <option value="">＋</option>
                      {#each presAttrs(key, isEnt) as at (at)}
                        <option value={at}>{at}</option>
                      {/each}
                    </select>
                  </div>
                </Field>
              </div>
              <div class="min-w-[200px] flex-[1.3]">
                <Field label="Display icon">
                  <IconPicker bind:value={a.present[key].icon} onchange={recompile} />
                </Field>
              </div>
              <div class="min-w-[150px] flex-1">
                <Field label="Draws as">
                  <Select value={a.present[key].shows ?? "device"}
                    title={SHOWS_KINDS.find((k) => k.value === (a.present[key].shows || "device"))?.hint || ""}
                    options={presShows(key, isEnt).map((k) => ({ value: k.value, label: k.label }))}
                    onchange={(e) => { const v = e.target.value;
                      if (v === "device") delete a.present[key].shows;
                      else a.present[key].shows = v; }} />
                </Field>
              </div>
              <div class="min-w-[150px] flex-1">
                <Field label="Tap">
                  <Select value={a.present[key].tap ?? ""}
                    title="what pressing the tile does"
                    options={TAP_OPTS}
                    onchange={(e) => { const v = e.target.value;
                      if (v) a.present[key].tap = v;
                      else delete a.present[key].tap; }} />
                </Field>
              </div>
              {#if canVolume(key, isEnt)}
                <!-- HOW ITS VOLUME DRAWS (v0.77.1): rides the ladder
                     present.style → device_options.volume_style →
                     global.style.volume — the volume band, group pages
                     and inline volume controls all read it -->
                <div class="min-w-[150px] flex-1">
                  <Field label="Volume style">
                    <Select value={a.present[key].style ?? ""}
                      title="how this member's volume control draws — band, group page and inline alike"
                      options={STYLE_OPTS}
                      onchange={(e) => { const v = e.target.value;
                        if (v) a.present[key].style = v;
                        else delete a.present[key].style; }} />
                  </Field>
                </div>
              {/if}
              {#if !inGroup}
                <!-- WHERE IT LIVES (v0.77 — Suresh: "be consistent or
                     give optionality!"): Devices section is the
                     members' home; "controls" promotes the tile up
                     beside the group cards. A grouped member has no
                     say — its group decides where it's drawn. -->
                <div class="min-w-[150px] flex-1">
                  <Field label="Where">
                    <Select value={a.present[key].where ?? ""}
                      title="which band of the controller draws this tile"
                      options={[{ value: "", label: "Devices section" },
                        { value: "controls", label: "With the controls" }]}
                      onchange={(e) => { const v = e.target.value;
                        if (v) a.present[key].where = v;
                        else delete a.present[key].where; }} />
                  </Field>
                </div>
              {/if}
              <div class="pt-[27px]">
                <button class="h-[38px] cursor-pointer border-0 bg-transparent p-0 px-1 text-[11px] font-semibold text-accent hover:underline"
                  onclick={() => closePres(key)}>done</button>
              </div>
            </div>
          {/if}
        {/snippet}
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
                <button class={"cursor-pointer border-0 bg-transparent p-1 " +
                    (a.present?.[devId] && openPres !== devId ? "text-accent" : "text-dim hover:text-accent")}
                  title="Presentation — display name, icon, what it draws as, what a tap does"
                  onclick={() => editPres(devId)}>⚙</button>
                <button class="cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                  title="Remove from cast — roles it held unwire" onclick={() => removeCast(devId)}>✕</button>
              </span>
            </div>
            {@render presPanel(devId, false, !!g)}
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
        <div class="space-y-2">
          <!-- the cast in ITS OWN ORDER: ungrouped devices where they
               stand, each group where it stands, members nested -->
          {#each castRaw as member (typeof member === "string" ? "d:" + member : "g:" + member.group)}
            {#if typeof member === "string"}
              {#if !groupOf(member)}{@render castRow(member, null)}{/if}
            {/if}
          {/each}
          {#if !cast.length && !(a.extra_devices || []).length && !legacyEnts.length}
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
          <!-- entities cast DIRECTLY (no pre-wiring, no "loose" — v0.48:
               a pre-wired device is a convenience, not a requirement) -->
          {#each (a.extra_devices || []).filter((e) => !groupOf(e)) as ent (ent)}
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
              {@render presPanel(ent, true, false)}
            </div>
          {/each}
          <!-- GROUP CARDS render BELOW the cast rows (v0.83.7 tidy-ups:
               "I dont think it should sit above the primary role
               devices") — curation after the raw cast -->
          {#each groups as g (g.group)}
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
                {#if openGroup === g.group}
                  <div class="mt-2 flex flex-wrap items-end gap-3 border-t border-line pt-2">
                    <div class="min-w-[160px] flex-[2]">
                      <Field label="Name">
                        <Input value={g.name || ""} onchange={(e) => renameGroup(g, e.target.value)} />
                      </Field>
                    </div>
                    <div class="w-[180px] min-w-[140px] flex-1">
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
                    <!-- "Children show" RETIRED (v0.76 — Suresh: "move
                         the Children Show out. And put the device options
                         in the device rows"): what each member draws as is
                         its own row's ⚙ now. A legacy g.shows survives as
                         the members' default (the engine reads member
                         first, group second) but is no longer authored. -->
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
                    {#each [...cast, ...(a.extra_devices || [])] as cid (cid)}
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
                      {#if devLib[mid]}{@render castRow(mid, g)}
                      {:else}
                        <!-- a LOOSE entity member -->
                        <div class="flex items-center gap-2 rounded-[8px] border border-line bg-bg px-2 py-1.5">
                          <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink" title={mid}>{mid}</span>
                          <button class="cursor-pointer border-0 bg-transparent p-1 text-[11px] text-dim hover:text-danger"
                            title="Take it out of the group — it returns to the cast rows"
                            onclick={() => setDeviceGroup(mid, "")}>✕</button>
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
          <!-- THE UNIFIED PICKER (v0.48: BELOW the whole cast — new
               members append at the end, so the input sits where they
               land): type anything — a defined device, an implied ⊞
               bundle (minted on pick), or a raw entity -->
          <div class="relative">
            <input bind:value={castQ} bind:this={castEl} spellcheck="false"
              placeholder="cast a device — or type any entity…"
              onfocus={() => { placeCast(); castOpen = true; }}
              oninput={() => { placeCast(); castOpen = true; }}
              onblur={() => setTimeout(() => (castOpen = false), 200)}
              class="h-[38px] w-full rounded-[4px] border border-line-strong bg-field px-[11px] font-[inherit] text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent" />
            {#if castOpen && castRect && (pickLib.length || pickImplied.length || pickEnts.length)}
              <div class="fixed z-50 max-h-[320px] overflow-y-auto rounded-[9px] border border-line-strong bg-surface p-[5px] [box-shadow:var(--shadow-float,0_12px_28px_rgba(0,0,0,.3))]"
                style="left:{castRect.left}px; top:{castRect.bottom + 4}px; width:{castRect.width}px">
                {#each pickLib as [k, d] (k)}
                  <button class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[7px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
                    onmousedown={(e) => { e.preventDefault(); castLibDevice(k); }}>
                    <span class="font-semibold">⊞ {d.name || k}</span>
                    <span class="pl-1.5 text-[10.5px] text-dim">{Object.values(d.roles || {}).filter(Boolean).length} claims · in your library</span>
                  </button>
                {/each}
                {#each pickImplied as g (g.stem)}
                  <button class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[7px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
                    onmousedown={(e) => { e.preventDefault(); castImplied(g); }}>
                    <span class="font-semibold">⊞ {g.stem.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                    <span class="pl-1.5 text-[10.5px] text-dim">{g.ents.map((e) => e.split(".")[0]).join(" + ")} · will join your library</span>
                  </button>
                {/each}
                {#each pickEnts as e (e.entity_id)}
                  <button class="block w-full cursor-pointer rounded-[6px] border-0 bg-transparent px-2.5 py-[7px] text-left font-[inherit] text-xs text-ink hover:bg-sunk"
                    onmousedown={(ev) => { ev.preventDefault(); castDirect(e.entity_id); }}>
                    <span class="font-mono text-[11.5px]">{e.entity_id}</span>
                    <span class="pl-1.5 text-[10.5px] text-dim">{e.name && e.name !== e.entity_id ? e.name + " · " : ""}cast this entity</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="flex items-center">
            <span class="flex-1 text-[10.5px] text-dim italic">⊞ devices bundle their integration siblings — tune traits any time in</span>
            <button class="cursor-pointer border-0 bg-transparent p-0 pl-1 text-[10.5px] text-accent hover:underline"
              onclick={() => selectSlice("devices")}>the pre-wired device library →</button>
          </div>
        </div>
      </div>
      </div>
      {/if}

      {#if tab === "roles"}
      <!-- ROLES — where each control on the remote routes (v0.45.1:
           control name + mono role key + effect tooltip; singular by
           nature — a button press has ONE destination. Plural lives
           where it belongs: Inputs (per-device) and Actions. -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Roles — which device fills each role in this activity</span>
        <span class="pl-2 text-[10.5px] text-dim italic">one device per role</span>
        {#if a.screen && consumedRoles.length}
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-semibold tracking-[.08em] text-dim uppercase">This controller consumes</span>
            {#each consumedRoles as r (r)}
              <span class={"rounded-full px-2 py-0.5 text-[10px] font-medium " +
                  (a.context?.[r] ? "bg-ok/15 text-ok" : "border border-line-strong text-dim")}
                title={a.context?.[r] ? r + " → " + a.context[r] : r + " is unwired — its tiles hide on the remote"}>
                {a.context?.[r] ? "●" : "○"} {r}</span>
            {/each}
          </div>
          <p class="mt-1 mb-1 text-[11px] text-dim italic">hollow = unwired — those tiles simply won't exist on the remote (sometimes that's the point)</p>
        {/if}
        <div class="mt-2 space-y-1.5">
          {#each ROLES as role (role)}
            {@const cands = roleCandidates(role)}
            {@const cur = wiring[role]}
            {@const isEnt = typeof cur === "string" && cur.includes(".")}
            {@const offStage = a.screen && consumedRoles.length && !consumedRoles.includes(role)}
            <div class={"flex flex-wrap items-center gap-2.5" + (offStage ? " opacity-55" : "")}
              title={ROLE_EFFECTS[role] + (offStage ? " — not used by this controller (kept: it applies if you switch controllers)" : "")}>
              <span class="flex w-[210px] shrink-0 items-baseline gap-1.5">
                <span class="text-[12.5px] text-ink-2">{ROLE_CONTROLS[role]}</span>
                <span class="font-mono text-[10px] text-faint">{role}</span>
              </span>
              <select value={customRole === role ? "__custom" : (cur ?? "")}
                onchange={(e) => { const v = e.target.value;
                  if (v === "__custom") customRole = role;
                  else if (v.startsWith("__claim:")) { customRole = null; claimAndWire(role, v.slice(8)); }
                  else { customRole = null; setRole(role, v || null); } }}
                class="h-[32px] w-[320px] cursor-pointer rounded-[6px] border border-line-strong bg-field px-2 text-[12px] text-ink outline-none focus:border-accent">
                <option value="">— nobody (unwired) —</option>
                {#each cands as c (c)}
                  <option value={c}>{devLib[c]?.name || c} · {devLib[c].roles[role]}{role === "commands" &&
                    app.draft?.dialects?.[devLib[c]?.dialect]?.channels?.commands &&
                    platformOf(devLib[c].roles[role]) === app.draft.dialects[devLib[c].dialect].channels.commands.integration
                      ? " — " + (app.draft.dialects[devLib[c].dialect].channels.commands.label || "channel") + " ✓" : ""}</option>
                {/each}
                {#each looseCandidates(role) as ent (ent)}
                  <option value={ent}>{ent} · cast entity</option>
                {/each}
                {#if isEnt && !cands.includes(cur) && !looseCandidates(role).includes(cur)}
                  <option value={cur}>{cur}</option>
                {/if}
                <!-- the rest of the cast: able, just not yet declared -->
                {#each roleClaimable(role) as x (x.id)}
                  <option value={"__claim:" + x.id}>＋ {devLib[x.id]?.name || x.id} · {x.ent} — add the claim</option>
                {/each}
                <option value="__custom">an entity directly…</option>
              </select>
              {#if customRole === role}
                <div class="min-w-[220px] flex-1">
                  <EntityPicker value="" domains={SLOT_DOMAINS[role]}
                    placeholder="entity for this role…"
                    onchange={(e) => { const v = (e?.target?.value || "").trim();
                      if (v) { setRole(role, v); adoptOutside(v); }
                      customRole = null; }} />
                </div>
              {:else if consumedRoles.includes(role) && !a.context?.[role]}
                <span class="text-[10.5px] text-dim italic">consumed — unwired hides its tiles</span>
              {/if}
              {#each claimTargets(role, cur) as devId (devId)}
                <button class="cursor-pointer rounded-[6px] border border-dashed border-line-strong bg-transparent px-2 py-0.5 text-[10.5px] text-dim hover:border-accent/60 hover:text-accent"
                  title={"This entity is in " + (devLib[devId]?.name || devId) + "'s bundle — save the wiring as a claim so every future cast fills this role by itself"}
                  onclick={() => promoteClaim(role, cur, devId)}>↥ save claim to {devLib[devId]?.name || devId}</button>
              {/each}
            </div>
          {/each}
          <div class="flex items-center gap-2.5 pt-1.5">
            <span class="flex w-[210px] shrink-0 items-baseline gap-1.5"
              title="the platform's vocabulary — keys, launches, channels; usually inherited from the media_player device's bundle">
              <span class="text-[12.5px] text-ink-2">Dialect</span>
              <span class="font-mono text-[10px] text-faint">dialect</span>
            </span>
            <Select value={a.overrides?.dialect ?? ""} allowEmpty class="max-w-64"
              options={Object.entries(app.draft?.dialects || {})
                .map(([cid, c]) => ({ value: cid, label: c.name || cid }))}
              onchange={(e) => {
                if (e.target.value) a.overrides = { ...(a.overrides || {}), dialect: e.target.value };
                else if (a.overrides) { delete a.overrides.dialect;
                  if (!Object.keys(a.overrides).length) delete a.overrides; }
                if (a.wiring || a.cast) recompile();
                else { a.context = a.context || {};
                  if (e.target.value) a.context.dialect = e.target.value;
                  else delete a.context.dialect; } }} />
            <span class="text-[11px] text-dim">
              {a.overrides?.dialect ? "pinned"
                : a.context?.dialect
                  ? "from " + (devLib[wiring.media_player]?.name || "the device") + " — " + a.context.dialect
                  : "blank = the surface default"}
            </span>
          </div>
        </div>
      </div>
      {/if}

      {#if tab === "inputs"}
      <!-- INPUTS — Harmony Q5/Q6: what should each device be set to? -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Inputs — what should each device be set to?</span>
        {#if !inputTargets.length}
          <p class="mt-2 mb-0 text-xs text-dim">Nothing in the cast can switch inputs — nothing to answer here.</p>
        {:else}
          <p class="mt-1 mb-2 text-[11px] text-dim">
            Feeds the generated Start Action (switched only when not already
            there) and State detection. “Leave it alone” is always honored;
            a powered-off device hides its live list — type the source then.
          </p>
          <div class="space-y-1.5">
            {#each inputTargets as t (t.key)}
              {@const opts = sourcesOf(t.ent)}
              {@const cur = inputAnswer(t.key)}
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="w-[210px] shrink-0 truncate font-[inherit] text-[12.5px] text-ink-2" title={t.ent}>{t.name}</span>
                <select value={typingSrc === t.key ? "__type" : cur}
                  onchange={(e) => { const v = e.target.value;
                    if (v === "__type") typingSrc = t.key;
                    else { typingSrc = null; setInput(t.key, v); } }}
                  class="h-[32px] w-[320px] cursor-pointer rounded-[6px] border border-line-strong bg-field px-2 text-[12px] text-ink outline-none focus:border-accent">
                  <option value="__unset">— not answered —</option>
                  <option value="__ignore">Leave it alone (none / ignore)</option>
                  {#each opts as src (src)}<option value={src}>{src}</option>{/each}
                  {#if cur !== "__unset" && cur !== "__ignore" && !opts.includes(cur)}
                    <option value={cur}>{cur}</option>
                  {/if}
                  <option value="__type">type a source…{opts.length ? "" : " (device off — list hidden)"}</option>
                </select>
                {#if typingSrc === t.key}
                  <input placeholder="exact source name…" spellcheck="false"
                    onchange={(e) => { const v = e.target.value.trim();
                      if (v) setInput(t.key, v); typingSrc = null; }}
                    class="h-[32px] w-[220px] rounded-[6px] border border-line-strong bg-field px-2 font-mono text-[12px] text-ink outline-none focus:border-accent" />
                {:else if cur === "__unset"}
                  <span class="text-[10.5px] text-dim italic">unanswered — the dot stays hollow</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {/if}

      {#if tab === "actions"}
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <Field label="Start action" hint="an Action (sequence), or a plain HA script — ＋ drafts one">
            <ActionPicker bind:value={a.start} oncreate={() => createSeq("start")}
              createTitle={"Create sequence “" + (a.name || id) + " — Start”"} /></Field>
          <Field label="Stop action" hint="blank = the page's hold-Power action ends it">
            <ActionPicker bind:value={a.stop} oncreate={() => createSeq("stop")}
              createTitle={"Create sequence “" + (a.name || id) + " — Stop”"} /></Field>
        </div>
        <!-- GENERATION (docs/wizard.md): drafts you own — power never guessed -->
        <div class="rounded-[10px] border border-line bg-tile p-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Generate from the answers</span>
            <Button size="sm" onclick={() => writeGenerated("start", buildStartActions())}
              title="Set state → best-effort wakes → cold-start blocks → input switches (from Devices + Inputs)">⚙ Start Action</Button>
            <Button size="sm" onclick={() => writeGenerated("stop", buildStopActions())}
              title="Clears the activity state; turns off ONLY what's checked below">⚙ Stop Action</Button>
          </div>
          <p class="mt-1 mb-2 text-[11px] text-dim">
            The draft is an ordinary editable Action. Regenerating updates it
            in place only while untouched — once you've edited it, a
            <span class="font-mono">_v2</span> is minted beside it, never over it.
          </p>
          <p class="mt-0 mb-1 text-[10px] font-semibold tracking-[.08em] text-dim uppercase">When this activity ends, turn off…</p>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            {#each cast as devId (devId)}
              {@const d = devLib[devId]}
              {#if d?.traits?.never_off}
                <span class="inline-flex items-center gap-1.5 text-[12px] text-faint"
                  title="Marked never-off in the device library — a generated Stop will never touch it">🔒 {d.name || devId}<span class="text-[10px] italic">never off</span></span>
              {:else}
                <label class="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
                  <input type="checkbox" checked={(a.stop_off || []).includes(devId)}
                    onchange={() => toggleStopOff(devId)} class="h-3 w-3" />
                  {d?.name || devId}
                </label>
              {/if}
            {:else}
              <span class="text-[11px] text-dim italic">cast devices appear here</span>
            {/each}
          </div>
          <p class="mt-1.5 mb-0 text-[10.5px] text-dim italic">
            nothing checked = the generated Stop only clears the activity
            state — power is never guessed (the Harmony lesson)
          </p>
        </div>
        <Switch label="Confirm before ending (press twice)"
          bind:checked={() => a.confirm_end ?? false, (v) => (a.confirm_end = v)} />
      </div>
      {/if}

      {#if tab === "controller"}
      <div class="space-y-3">
        <!-- THE CONTROLLER TAB (v0.83.7). The Harmony question the
             card never asked: WHAT DOES THE SCREEN SHOW while this
             runs? The strip (moved from Setup), one switch per band
             the surface renders, and the activity's presets — the
             surface stays shared; the preferences travel with the
             activity. -->
        {#if navCtrl}
          <div class="rounded-[10px] border border-line bg-tile px-3 py-2.5">
            {#if navCtrl.isStock}
              <div class="flex flex-wrap items-center gap-4">
                <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Controller · stock</span>
                <span class="text-xs text-ink">{navCtrl.c.name}</span>
                <button
                  class="cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2.5 py-1 text-xs text-dim hover:border-accent/60 hover:text-accent"
                  title="Copy the stock surface as this activity's own editable controller — for STRUCTURAL changes; the switches below don't need one"
                  onclick={() => { const iid = instantiateController(navCtrl.cid, id); if (iid) selectSlice("controller." + iid); }}
                >⧉ Create custom copy</button>
              </div>
              <p class="mt-1 mb-0 text-[11px] text-dim">
                A shared stock surface — editing the controller itself changes
                every activity that uses it. The switches below are <b>this
                activity's alone</b>: they hide or show bands without touching
                the surface. Absent switch = Auto = the band's own rules.
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
          <div class="rounded-[10px] border border-line bg-tile p-3">
            <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">What this screen shows — for this activity</span>
            <div class="mt-2 space-y-1.5">
              {#each bands as bd (bd.key)}
                <div class="flex flex-wrap items-center gap-2.5" title={bd.hint}>
                  <span class="flex w-[24px] shrink-0 flex-col leading-none">
                    <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-faint hover:text-ink"
                      aria-label={"Move " + bd.label + " up"} onclick={() => moveBand(bd.key, -1)}>↑</button>
                    <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-faint hover:text-ink"
                      aria-label={"Move " + bd.label + " down"} onclick={() => moveBand(bd.key, 1)}>↓</button>
                  </span>
                  <span class="w-[186px] shrink-0 text-[12.5px] text-ink-2">{bd.label}</span>
                  <!-- COLUMN DISCIPLINE (v0.83.7 — "Lets have all the
                       labels align and the other stuff follow"): the
                       switch and the label slot live in fixed-width
                       columns, so every row's controls line up -->
                  <span class="flex w-[88px] shrink-0 items-center">
                    <Switch checked={bandOn(bd.key)}
                      label={bandOn(bd.key) ? "Auto" : "Off"}
                      onCheckedChange={(v) => setBand(bd.key, v)} />
                  </span>
                  {#if LABELABLE.has(bd.key)}
                    <span class="flex w-[158px] shrink-0 items-center gap-1">
                      <input class="h-[28px] w-[136px] rounded-[8px] border border-line bg-sunk px-2 text-[12px] text-ink placeholder:text-faint"
                        placeholder={defaultBandLabel(bd.key)}
                        title={"overrides this band's label on the remote, for this activity — empty text = NO label · ↺ restores the default"}
                        value={bandLabel(bd.key) ?? ""}
                        oninput={(e) => setBandLabel(bd.key, e.target.value)} />
                      {#if bandLabel(bd.key) !== undefined}
                        <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-ink"
                          title="Restore the default label"
                          onclick={() => clearBandLabel(bd.key)}>↺</button>
                      {/if}
                    </span>
                  {:else}
                    <span class="w-[158px] shrink-0"></span>
                  {/if}
                  {#if bd.key === "volume" && bandOn("volume")}
                    <Select value={a.surface?.volume_style ?? ""} class="max-w-44"
                      title="this activity's default volume treatment — per-tile and per-member settings still win"
                      options={[
                        { value: "", label: "Theme default" },
                        { value: "compact", label: "Compact" },
                        { value: "slider", label: "Slider — the fat one" },
                        { value: "stepper", label: "Stepper − / +" },
                      ]}
                      onchange={(e) => setVolStyle(e.target.value)} />
                  {/if}
                  {#if bd.key === "groups"}
                    <span class="text-[11px] text-dim italic">
                      {groups.length
                        ? groups.map((g) => g.name || g.group).join(" · ")
                        : "none yet — ⊞ Add group in the cast"}
                    </span>
                  {/if}
                  {#if bd.key === "speakers" && bandOn("speakers")}
                    <Select value={a.surface?.speakers_group ?? ""} class="max-w-44"
                      title="which players the card offers — the cast's, or a named Speaker Group (Model → Speaker Groups)"
                      options={[
                        { value: "", label: "This activity's cast" },
                        ...Object.entries(app.draft?.speaker_groups || {}).map(
                          ([gid, g]) => ({ value: gid, label: g.name || gid })),
                        { value: "__new", label: "＋ Create group…" },
                      ]}
                      onchange={(e) => {
                        /* the door to Model → Speaker Groups (v0.83.7 —
                           "add an create group option that takes us to
                           groups...like we do with actions and stuff") */
                        if (e.target.value === "__new") {
                          e.target.value = a.surface?.speakers_group ?? "";
                          selectSlice("spkgroups");
                          return;
                        }
                        setSpeakersGroup(e.target.value);
                      }} />
                    <Select value={a.surface?.speakers_mode ?? ""} class="max-w-36"
                      title="launcher = a slim count tile opening the group's page (per-player sliders); inline = the full card right on the controller"
                      options={[
                        { value: "", label: a.surface?.speakers_group ? "Launcher (auto)" : "Inline (auto)" },
                        { value: "launcher", label: "Launcher tile" },
                        { value: "inline", label: "Inline card" },
                      ]}
                      onchange={(e) => setSpeakersMode(e.target.value)} />
                  {/if}
                  {#if bd.key === "np" && bandOn("np")}
                    <Select value={a.surface?.np_style ?? ""} class="max-w-36"
                      title="how Now Playing draws for this activity — standard card, slim one-liner, or the artwork hero"
                      options={[
                        { value: "", label: "Auto" },
                        { value: "plain", label: "Standard card" },
                        { value: "slim", label: "Slim row" },
                        { value: "art", label: "Art hero — side panel" },
                        { value: "wash", label: "Art wash — full-bleed" },
                      ]}
                      onchange={(e) => setNpStyle(e.target.value)} />
                  {/if}

                </div>
              {/each}
            </div>
            <p class="mt-2 mb-0 text-[10.5px] text-dim italic">
              Auto = the band's own rules (a band with nothing to show hides
              itself anyway). Off = never, for this activity. Other activities
              on the same surface keep their own answers.
            </p>
          </div>
        {:else}
          <p class="m-0 text-xs text-dim">
            No controller yet — pick a <b>Navigate to</b> on the Setup tab, or
            ＋ mint a control page there. The switches for its bands appear
            here once it exists.
          </p>
        {/if}
        <!-- PRESETS — one-touch shortcuts that belong to THIS activity
           (v0.64). The controller carries a `presets` generator and
           names none of them, so a shared surface stays shared while
           every room's shortcuts are its own. -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        <div class="mb-1 flex items-center gap-1.5">
          <span class="min-w-0 flex-1 truncate text-[11px] font-bold tracking-[.07em] text-dim uppercase">Presets — one-touch shortcuts for this activity</span>
          <!-- ⤵ IMPORT A PRESET SNIPPET (v0.79.1; wording unified
               v0.79.2): the standard grammar — export lives on any
               preset row's ⋮ → Export snippet; the twin import door
               is the page's Presets fold. -->
          {#snippet downloadIcon3()}
            <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
            </svg>
          {/snippet}
          <div class={"relative flex h-[26px] shrink-0 items-center gap-1.5 rounded-[6px] border border-line-strong px-2 text-[11px] font-medium " +
              (snippetsOf("preset").length ? "bg-surface text-ink-2 hover:bg-sunk" : "bg-raised text-faint")}>
            {@render downloadIcon3()} Import snippet…
            <select value="" disabled={!snippetsOf("preset").length}
              title={snippetsOf("preset").length
                ? "Import a saved preset snippet"
                : "No preset snippets yet — Export snippet on a preset row's ⋮ menu captures one"}
              onchange={(e) => { const t = presetSnippetTile(e.target.value);
                if (t) { if (!a.presets) a.presets = []; a.presets.push(t); recompile(); }
                e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none disabled:cursor-default">
              <option value=""></option>
              {#each snippetsOf("preset") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
          <Button size="sm" onclick={addPreset}>＋ Add preset</Button>
        </div>
        <p class="mt-0 mb-2 text-[11px] text-dim">
          A preset does one thing in one tap — play a favourite, bond a
          speaker, set a scene. They render wherever this activity's
          controller carries a <span class="font-mono">presets</span> tile,
          and nowhere else: the surface is shared, the shortcuts are yours.
          An action can be a service call or one of your
          <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent hover:underline"
            onclick={() => selectSlice("sequences")}>Actions →</button>
        </p>
        <div class="space-y-2">
          {#each a.presets || [] as tile, ti (ti)}
            <TileRow {tile} tiles={a.presets} index={ti} castEnts={deviceList()} />
          {:else}
            <p class="m-0 text-xs text-dim">
              No presets yet. Here they'd be things like “Coffee House”
              (play a Sonos favourite) or “Add the Pool” (run one of your
              Actions).
            </p>
          {/each}
        </div>
      </div>
      
      </div>
      {/if}

      {#if tab === "state"}
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
              { value: "none", label: impliedWitness
                  ? "Implied — primary device's player (default)"
                  : "From activity select (default)" },
              { value: "all", label: "Device rules — ALL must match" },
              { value: "any", label: "Device rules — ANY may match" },
              { value: "any_state", label: "Primary entity in any of…" },
            ]} /></div>
          {#if stateDisplay}
            <Button size="sm" onclick={generateState}
              title={"From the answers: " + stateDisplay.ent + " on + source = " + stateDisplay.src}>⚙ From inputs</Button>
          {/if}
          {#if primaryMp}
            <Button size="sm" onclick={generatePrimaryState}
              title={"ON while " + primaryMp + " is on/playing/paused/idle — right for devices that genuinely power off (the projector); wrong for never-off streamers (the Fire TV)"}>⚙ From primary device</Button>
          {/if}
          <span class="min-w-0 flex-1"></span>
          {#if a.state}
            <button class="flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface px-2 text-[11px] font-medium text-ink-2 hover:bg-sunk"
              title="Export these state rules to Snippets" onclick={exportState}>{@render uploadIcon2()} Export snippet</button>
          {/if}
          <div class={"relative flex h-[26px] shrink-0 items-center gap-1.5 rounded-[6px] border border-line-strong px-2 text-[11px] font-medium " +
            (snippetsOf("state").length ? "bg-surface text-ink-2 hover:bg-sunk" : "bg-raised text-faint")}>
            {@render downloadIcon2()} Import snippet…
            <select value="" disabled={!snippetsOf("state").length}
              title={snippetsOf("state").length
                ? "Import from Snippets"
                : "No state snippets yet — Export snippet captures these rules"}
              onchange={(e) => { if (e.target.value) importState(e.target.value); e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none disabled:cursor-default">
              <option value=""></option>
              {#each snippetsOf("state") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
        </div>
        {#if !a.state && impliedWitness}
          <p class="mt-1 mb-0 text-[11px] text-dim">
            No rule authored — the remote implies ON while
            <span class="font-mono text-[10.5px]">{impliedWitness}</span> is
            on/playing/paused/idle (a manually powered-off device can't strand
            an ON tile). Pick a mode above to override.
          </p>
        {/if}
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
      {/if}

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
