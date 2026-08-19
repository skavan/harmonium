/* ================================================================
   STOCK LIBRARY + CONFIG HEALING — the pure half of the Studio's
   state layer (split out of state.svelte.js, 2026-08-17 cleanup).

   Everything in this module is a plain function or constant over a
   config object: the stock controller shapes (with their `gen`
   migration counters — bump the gen when you change a shape, the
   healer does the rest), the starter config a fresh install mints,
   and the normalize* chain every config passes through on its way
   into the editor ("one config door, one normalizer", v0.75).

   Nothing here touches reactive app state — the functions that need
   the current workspace take it as a parameter, and state.svelte.js
   wraps them with the live values.
   ================================================================ */

/* the GUARANTEED stock: a house-neutral Media Player controller —
   pure $context (zero entity ids), the v0.20.1 mint anatomy. Present
   in every workspace so Navigate-to always offers a controller. */
export const GENERIC_MEDIA_CONTROLLER = {
  name: "Media Player",
  gen: 2,   /* gen 2 (v0.83.8): the Apps section went 2-up */
  class: "activity", view_kind: "controller", type: "controller",
  control_target: {
    label: "$activity.name", navigation: "$context.dpad",
    power: "$context.power", volume: "$context.volume",
    pass_through: ["up", "down", "left", "right", "select", "back", "home", "power"],
  },
  dpad_passthrough: "$context.dpad",
  sections: [
    { tiles: [
      { id: "t_np", type: "media", entity: "$context.media_player",
        icon: "material:smart_display", label: "Now Playing", span: 2 },
      { id: "t_tr", type: "transport", entity: "$context.media_player",
        label: "Transport", span: 2 },
      { id: "t_btns", type: "buttons", entity: "$context.dpad",
        label: "On-screen device buttons", span: 2, only: "physical_dpad",
        buttons: ["back", "home"] },
      { id: "t_pad", type: "dpad", entity: "$context.dpad",
        icon: "material:gamepad", label: "Remote", span: 2, unless: "physical_dpad" },
      { id: "t_vol", type: "volume", entity: "$context.volume",
        level_entity: "$context.volume_level",
        icon: "material:volume_up", label: "Volume", span: 2 },
      /* CAST GROUPS (v0.60): one nav card per group in the running
         activity. Names no group, so the shared surface stays generic
         — a room with no groups renders nothing here. */
      { id: "t_grp", type: "groups" },
      /* SOURCE tile (v0.36): role-governed — appears iff the activity
         wires source_select (hide-unwired otherwise) */
      { id: "t_src", type: "sources", entity: "$context.source_select",
        icon: "material:input", label: "Source", span: 2 },
    ] },
    /* v0.46: ONE player — dialects supply the differences. Both
       sections self-hide when the active dialect declares nothing. */
    { columns: 2, title: "Device keys", hero_label: "Device keys", role: "keys",
      tiles: [{ id: "keys", type: "keys" }] },
    /* 2-up since v0.83.8 (Suresh: "lets make this grid 2 x 2 (bigger
       tiles, text)") — the engine sizes app tiles up via cls "app" */
    { columns: 2, title: "Apps", hero_label: "Apps", role: "apps",
      tiles: [{ id: "apps", type: "apps" }] },
    { columns: 1, title: "Devices", hero_label: "Devices", role: "devices",
      tiles: [{ id: "cast", type: "devices" }] },
  ],
};
/* the DOMAIN stocks — the built-in detail surfaces as editable
   library entries ($device = the addressed entity); mirrors the
   compiler's DOMAIN_STOCKS exactly */

export const DOMAIN_STOCKS = {
  climate: { name: "Climate", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "temperature", entity: "$device", icon: "material:thermostat", label: "", span: 2 },
    { id: "dm", type: "chips", kind: "hvac_mode", entity: "$device", icon: "material:hvac", label: "", span: 2 },
    { id: "df", type: "chips", kind: "fan_mode", entity: "$device", icon: "material:mode_fan", label: "", span: 2 },
    { id: "dpr", type: "chips", kind: "preset", entity: "$device", icon: "material:tune", label: "", span: 2 } ] },
  light: { name: "Light", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "brightness", entity: "$device", icon: "material:light_mode", label: "", span: 2 },
    { id: "de", type: "chips", kind: "effect", entity: "$device", icon: "material:auto_awesome", label: "", span: 2 } ] },
  cover: { name: "Cover", gen: 1, tiles: [
    { id: "dc", type: "coverbtns", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "position", entity: "$device", icon: "material:height", label: "", span: 2 } ] },
  fan: { name: "Fan", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "percentage", entity: "$device", icon: "material:mode_fan", label: "", span: 2 },
    { id: "dpr", type: "chips", kind: "preset", entity: "$device", icon: "material:tune", label: "", span: 2 } ] },
  switch: { name: "Switch", gen: 1, tiles: [
    { id: "dp", type: "power", entity: "$device", label: "", span: 2 } ] },
};
/* the APPS DRAWER is a library citizen (v0.47.4): pure, ships in
   every workspace so the player's apps button never dead-ends —
   mirrors the compiler's views/apps.yaml output exactly */

export const STOCK_APPS_DRAWER = {
  name: "Apps",
  /* gen 2 (v0.83.8 — Suresh: "lets make this grid 2 x 2"): two
     columns; the engine's cls "app" stamp does the bigger-tile half */
  gen: 2, class: "group", view_kind: "library", type: "library",
  parent: "controller:tv",
  control_target: { label: "$activity.name", navigation: "$context.dpad",
    power: "$context.power", volume: "$context.volume", pass_through: ["power"] },
  drawer: true,
  grid: { columns: 2 },
  sections: [{ tiles: [{ id: "apps_grid", type: "apps" }], hero_label: "Apps" }],
};

/* the MUSIC LIBRARY drawer — same library citizenship (v0.47.5),
   mirrors the compiler's views/music_library.yaml output exactly */

export const STOCK_MUSIC_LIBRARY =
  {
    "name": "Music Library",
    "gen": 1,
    "class": "group",
    "view_kind": "library",
    "type": "library",
    "font_scope": "music",
    "parent": "controller:music",
    "drawer": true,
    "grid": { "columns": 3 },
    /* v0.49 (Suresh: "We mustn't be hardcoded to ma"): ONE browse
       tile — the standard media_player/browse_media contract serves
       whatever library the CAST PLAYER has (Sonos, MA, Plex, …);
       playback is the standard media_player.play_media. Categories
       are the tree's top level. Pull-Music-Here stays as an MA
       nicety. */
    "sections": [
      {
        "tiles": [
          { "id": "lib", "type": "browse" }
        ],
        "hero_label": "Library"
      }
    ]
  };

/* the MUSIC controller, AT LAST A NAMED STOCK (v0.71.1). This shape
   matured in Jamaica's config — volumes / groups / presets / devices
   generators, the accented library trail, the 760px cap — and never
   made it back into the stock library, so CT's flat Porch-v2 copy
   could not heal and a cast addition rendered nothing ("it works in
   Jamaica!"). No `parent`: that is a per-house content-graph edge,
   preserved by the gen healer. */

export const STOCK_MUSIC = {
  name: "Music Media Player",
  /* gen 3 (2026-08-19 — Suresh: "ChUp, ChDn, navigate the LCD.
     Always. Hold+ChUp, Hold+ChDn on music controller does RWD/FWD"):
     ch_up/ch_down track-skip bindings GONE — short CH falls to the
     engine's focus-walk default like every other screen; the HOLDS
     take the transport job as ±15s seek (track skip stays on the
     on-screen transport row).
     gen 2 (v0.83.7): the SPEAKERS grouping card joined the band —
     renders only when the running activity casts 2+ players, so the
     shared surface stays quiet for single-speaker rooms */
  gen: 3,
  class: "activity", view_kind: "controller", type: "controller",
  buttons: {
    menu_hold: { navigate: "music_library" },
    left_hold: { seek: -15, entity: "$context.media_player" },
    right_hold: { seek: 15, entity: "$context.media_player" },
    ch_up_hold: { seek: 15, entity: "$context.media_player" },
    ch_down_hold: { seek: -15, entity: "$context.media_player" },
  },
  control_target: { label: "$activity.name",
    power: "$context.power", volume: "$context.volume" },
  font_scope: "music",
  sections: [
    { tiles: [
      { id: "m_np", type: "media", art: true, entity: "$context.media_player",
        icon: "material:music_note", label: "Now Playing", span: 2,
        trailing: { icon: "material:library_music",
          action: { navigate: "music_library" }, emphasis: "accent" } },
      { id: "m_tr", type: "transport", entity: "$context.media_player",
        label: "Transport", span: 2 },
      { id: "m_cmd", type: "mediabtns", entity: "$context.media_player",
        label: "Modes", span: 2 },
      { id: "vol", type: "volumes" },
      { id: "spk", type: "speakers" },
      { id: "grp", type: "groups" },
      { id: "m_src", type: "sources", entity: "$context.source_select",
        icon: "material:input", label: "Source", span: 2 },
    ] },
    { columns: 2, title: "Presets", hero_label: "Presets", role: "presets",
      tiles: [{ id: "acts_presets", type: "presets" }] },
    { columns: 1, title: "Devices",
      tiles: [{ id: "cast", type: "devices" }] },
  ],
  grid: { max_width: 760 },
};

/* STOCK GENERATIONS (v0.71.1 — Suresh: "We should probably add a
   version number in the json?"). Every stock shape carries `gen`, an
   integer BUMPED WHENEVER THE SHAPE CHANGES. The healer then needs no
   shape-sniffing (the pile above grew one hand-written sniffer per
   change and missed `music` entirely): a non-variant copy whose gen
   is missing or behind is replaced by the current stock, keeping its
   `parent` — the per-house content-graph edge. Custom copies
   (variant_of) are yours and are never touched — the same doctrine
   every healer above already follows. */

export function healStockGen(cfg) {
  const heal = (cid, stock, extra) => {
    const c = cfg.controllers[cid];
    if (!c || c.variant_of) return;
    if ((c.gen || 0) >= (stock.gen || 0)) return;
    const fresh = JSON.parse(JSON.stringify(stock));
    if (c.parent) fresh.parent = c.parent;
    Object.assign(fresh, extra || {});
    cfg.controllers[cid] = fresh;
  };
  heal("apps", STOCK_APPS_DRAWER);
  heal("music_library", STOCK_MUSIC_LIBRARY);
  heal("music", STOCK_MUSIC);
  heal("media", GENERIC_MEDIA_CONTROLLER);
  for (const [dom, stock] of Object.entries(DOMAIN_STOCKS))
    heal(dom, stock, { domain: dom, class: "activity",
      view_kind: "controller", type: "controller" });
}

/* every config gets the generic media stock + the domain stocks */

export function ensureStockControllers(cfg) {
  if (!cfg.controllers) cfg.controllers = {};
  /* v0.47.4: plant the apps drawer where it's missing (workspaces
     created before it joined the library — the deck bug) */
  if (!cfg.controllers.apps && !(cfg.screens || {}).apps)
    cfg.controllers.apps = JSON.parse(JSON.stringify(STOCK_APPS_DRAWER));
  if (!cfg.controllers.music_library && !(cfg.screens || {}).music_library)
    cfg.controllers.music_library = JSON.parse(JSON.stringify(STOCK_MUSIC_LIBRARY));
  /* v0.49 MIGRATION: a stock music_library still on the retired
     MA-sensor shape (sensor.harmonium_music_*) upgrades to the
     standard browse tree; custom copies (variant_of) are yours. */
  {
    const ml = cfg.controllers.music_library;
    if (ml && !ml.variant_of &&
        JSON.stringify(ml).includes("sensor.harmonium_music_"))
      cfg.controllers.music_library = JSON.parse(JSON.stringify(STOCK_MUSIC_LIBRARY));
  }
  /* v0.51 (Suresh: "we ditch Pull Music — too confusing"): remove the
     Pull-Music-Here tile from stock browse-era copies */
  {
    const ml = cfg.controllers.music_library;
    if (ml && !ml.variant_of && JSON.stringify(ml).includes('"browse"'))
      (ml.sections || []).forEach(sec => {
        sec.tiles = (sec.tiles || []).filter(x => x.id !== "mq_pull");
      });
  }
  /* v0.50.2: the browse-era stock dropped its 118px banner (the bands
     want the pixels — Suresh: "the title Music Library is redundant");
     heal stock copies still carrying it */
  {
    const ml = cfg.controllers.music_library;
    if (ml && !ml.variant_of && ml.banner &&
        JSON.stringify(ml).includes('"browse"'))
      delete ml.banner;
  }
  /* v0.52.1 (Suresh: "Primary and Secondary font for the music
     player separately"): stock music surfaces copied before the
     font_scope key existed gain it, so the theme's music faces
     reach every workspace. Custom copies (variant_of) are yours. */
  for (const cid of ["music", "music_library"]) {
    const c = cfg.controllers[cid];
    if (c && !c.variant_of && !c.font_scope) c.font_scope = "music";
  }
  const hasMedia = Object.values(cfg.controllers).some(
    (c) => !c.variant_of && !c.domain);
  if (!hasMedia)
    cfg.controllers.media = JSON.parse(JSON.stringify(GENERIC_MEDIA_CONTROLLER));
  for (const [dom, stock] of Object.entries(DOMAIN_STOCKS))
    if (!cfg.controllers[dom])
      cfg.controllers[dom] = { ...JSON.parse(JSON.stringify(stock)),
        domain: dom, class: "activity", view_kind: "controller", type: "controller" };
  /* PURITY HEALER (v0.48.2 — Suresh's deck music page still bound to
     the BASEMENT Sonos): stock media surfaces are pure $context by
     doctrine (v0.46.1/v0.47.5) — activities supply everything. A
     workspace copied before purification still carries a baked
     context that silently aims every action at the wrong room; strip
     it. Custom copies (variant_of) keep theirs — they're yours. */
  for (const cid of ["tv", "music", "apps", "music_library", "media"]) {
    const c = cfg.controllers[cid];
    if (c && !c.variant_of && !c.domain && c.context) delete c.context;
  }
  healStockGen(cfg);
  return cfg;
}

/* a minimal starter: keeps hardware/system (remotes, keymaps, theme,
   input policy) and wipes the content — build from a clean slate */

export function starterConfig(base, ws) {
  const cur = base || {};
  const live = cur;
  const cfg = ensureStockControllers({
    version: 2,
    entity_options: cur.entity_options || {},
    theme: cur.theme || {},
    remotes: cur.remotes || { default: { capabilities: ["touch", "pointer"] } },
    devices: cur.devices || {},
    keymap: cur.keymap || {},
    home_screen: "home",
    screen_order: ["home"],
    global: { room: "New Room", confirm_switch: true, debug: false,
      /* minted select id is workspace-prefixed (main bare) */
      activity_select: "select.harmonium_" +
        (ws === "main" || !ws ? "" : ws + "_") + "home_activity" },
    /* the STOCK library rides along — it's system, not content. But a
       controller's `parent` is a CONTENT-graph edge (it points at a
       page of the old workspace) — strip it, or a blank starter fails
       validation with "unknown parent" (Suresh, first live create) */
    controllers: Object.fromEntries(Object.entries(live.controllers || {})
      .filter(([, c]) => !c.variant_of)
      .map(([k, v]) => {
        const c = JSON.parse(JSON.stringify(v));
        delete c.parent;
        return [k, c];
      })),
    input: cur.input || {},
    activities: {},
    sequences: {},
    /* the app MASTER LIST + DIALECTS are stock (system, not
       content) — like the controller library, they come from LIVE */
    apps: JSON.parse(JSON.stringify(live.apps || cur.apps || {})),
    dialects: JSON.parse(JSON.stringify(live.dialects || cur.app_classes || {})),
    screens: {
      home: { name: "New Room", class: "room", type: "hub", room: true,
        banner: { image: "", image_opacity: 0.5, height: "230px", min_height: "150px", show_time: true },
        view_kind: "room hub", grid: { columns: 1 },   // room-hub doctrine: one column; sections override
        sections: [{ role: "activities", hero_label: "Activities",
          tiles: [{ id: "acts", type: "activities", room: "home" }] }] },
    },
  });
  /* VIRGIN SWEEP (v0.83.9, the .88 fresh-install test): from an EMPTY
     draft the stock drawers above are PLANTED, not copied — and a
     planted drawer carries its stock parent (controller:tv /
     controller:music) pointing at controllers this config doesn't
     have. The integration's _validate rejects dangling parents, so
     the very first Save & Deploy would 422. Drop any parent whose
     target isn't in THIS config. */
  const navigable = new Set([
    ...Object.keys(cfg.screens || {}),
    ...Object.keys(cfg.controllers || {}).map((c) => "controller:" + c),
  ]);
  for (const c of Object.values(cfg.controllers || {}))
    if (c.parent && !navigable.has(c.parent)) delete c.parent;
  return cfg;
}

/* NAV UNIFICATION (v0.25): group / room / plain-nav tiles are ONE
   type — `nav` with a style. The compiler hard-migrates yaml; this
   heals configs stored before the migration (live store, old scratch,
   imports) so the engine never needs legacy aliases. */

export function normalizeNavTiles(cfg) {
  const MAP = { group: "summary", room: "image", nav: "plain" };
  const surfaces = [...Object.values(cfg?.screens || {}), ...Object.values(cfg?.controllers || {})];
  for (const scr of surfaces)
    for (const g of [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])])
      for (const t of g)
        if (MAP[t.type]) {
          if (!t.style) t.style = MAP[t.type];
          t.type = "nav";
        }
  return cfg;
}

/* HOSTING IS INFERRED (v0.26): a page that owns activities IS a place
   where things run. The `room` marker is the STICKY record of that —
   stamped when the first activity arrives, never removed until the
   page is deleted (its minted select must not flap under automations).
   No user-facing toggle. */

export function stampHost(scr) {
  if (!scr || scr.room || (scr.type || "hub") === "controller") return;
  scr.room = true;
  scr.class = "room";
  scr.view_kind = "room hub";
}

export function normalizeHosts(cfg) {
  for (const act of Object.values(cfg?.activities || {}))
    if (act?.room_view && cfg.screens?.[act.room_view]) stampHost(cfg.screens[act.room_view]);
  return cfg;
}

/* ALL OFF DISSOLVES (v0.28): the special "off" activity is legacy —
   it becomes its owner page's hold-Power binding (just an Action).
   The select's "off" option is minted regardless. */

export function normalizeOffActivity(cfg) {
  const off = cfg?.activities?.off;
  if (!off) return cfg;
  const owner = cfg.screens?.[off.room_view];
  const start = off.start || "";
  if (owner && start.startsWith("sequence:")) {
    if (!owner.buttons) owner.buttons = {};
    if (!owner.buttons.power_hold)
      owner.buttons.power_hold = { sequence: start.slice(9) };
  }
  delete cfg.activities.off;
  return cfg;
}

/* APP CLASSES (v0.30): heal configs from the entity-keyed era — build
   a single "tv" class from the master list's default source names so
   the drawer keeps rendering; identity stays in the master list. */

export function normalizeApps(cfg) {
  if (!cfg) return cfg;
  if (!cfg.dialects) cfg.dialects = {};
  const hasLegacy = Object.values(cfg.apps || {}).some((a) => a && (a.source || a.launch));
  if (!Object.keys(cfg.dialects).length && hasLegacy) {
    const entries = {};
    for (const [aid, a] of Object.entries(cfg.apps || {}))
      if (a && a.source) entries[aid] = { source: a.source };
    if (Object.keys(entries).length)
      cfg.dialects.tv = { name: "TV", apps: entries };
  }
  return cfg;
}

/* DEVICE BUNDLES (v0.45 — the Device Round).
   Top-level `devices` is the first-class device LIBRARY now; hardware
   profiles renamed to `remotes`. Activities may carry cast (device
   ids) + wiring (role → device id | raw entity); the engine still
   reads the compiled context — compileContext is the JS twin of
   build_config.py's compile_activity_devices (keep in sync). Studio
   stores explicit per-activity exceptions in `overrides` (role pins,
   dialect picks, custom keys) and derives context = compiled ∪
   overrides on every wiring edit. */

export const ROLE_KEYS = ["media_player", "dpad", "power", "volume",
  "volume_level", "source_select", "commands",
  /* search (v0.69): WHICH entity answers a library search. A fact
     about the device — a Sonos speaker's searchable index lives on
     its Music Assistant twin — so it is claimed once in the library
     rather than pinned inside a stock controller. */
  "search"];

/* ---- CAST GROUPS (v0.60) ------------------------------------------
   `cast` is a mixed array: device ids (strings) and GROUP objects
     { group, name, icon, shows, members[], target?, style? }
   A group is a VIEW — it says where some of the cast's controls are
   drawn, never what the cast is. Members stay first-class cast
   members (so they keep their jobs, their entities and their row);
   the group only moves their control behind a nav card. Everything
   here is the Studio's twin of context.js's castGroups/
   groupedDeviceIds — keep the two in sync. */

export const isCastGroup = (m) => !!m && typeof m === "object" && !!m.group;
/* what a group's children can be DRAWN as. `device` is the default and
   the universal fallback: a control that fits in a tile is drawn, and
   anything needing more room becomes a launcher into that device's own
   controller (Suresh: "we'd want the parent tile that launched its
   child controller"). Role column = the claim the child binds to;
   null = none needed. Mirrors SHOWS_ROLE in core/context.js. */

export const SHOWS_KINDS = [
  { value: "device", label: "Launcher tile", role: null,
    hint: "opens the device's own controller — always available" },
  /* ONE volume entry (v0.83.7 — Suresh: "we have Volume Control and
     Volume Stepper in DRAWS AS. And we have Volume Style with
     overlapping choices"): Draws-as picks the CONTROL, the Volume
     style select beside it picks the SHAPE. The legacy "stepper"
     value is swept to volume + style: stepper on load. */
  { value: "volume", label: "Volume control", role: "volume",
    hint: "level + − / + — the Volume style select picks its shape" },
  { value: "power", label: "Power button", role: "power",
    hint: "toggles the device itself" },
  { value: "media", label: "Now Playing", role: "media_player",
    hint: "art, title, state" },
  { value: "transport", label: "Transport", role: "media_player",
    hint: "play / pause / skip" },
  { value: "sources", label: "Source picker", role: "source_select",
    hint: "the device's input list" },
];

export function compileContext(a, devices) {
  const ctx = {};
  for (const [role, target] of Object.entries(a?.wiring || {})) {
    const dev = devices?.[target];
    if (dev) {
      const ent = dev.roles?.[role];
      if (!ent) continue;               /* claimless wiring — UI warns */
      ctx[role] = ent;
      if (role === "dpad" && dev.traits?.dpad_commands)
        ctx.dpad_commands = JSON.parse(JSON.stringify(dev.traits.dpad_commands));
      if (role === "media_player" && (dev.dialect || dev.app_class) && !ctx.dialect)
        ctx.dialect = dev.dialect || dev.app_class;
    } else if (typeof target === "string" && target.includes(".")) {
      ctx[role] = target;               /* raw-entity escape hatch */
    }
  }
  return ctx;
}

export function recompileContext(a, devices) {
  if (!a || (!a.wiring && !a.cast)) return;
  a.context = { ...compileContext(a, devices), ...(a.overrides || {}) };
}

/* Heal pre-v0.45 configs: (1) move hardware profiles devices→remotes,
   (2) lift each activity's context into cast/wiring by matching
   entities against the library's role claims — unmatched entities stay
   as raw-entity wiring; anything the compile can't reproduce becomes
   an explicit override. Runs before rebaseline, so it never dirties. */

export function normalizeDevices(cfg) {
  if (!cfg) return cfg;
  /* v0.46 (the Dialect Round): app_classes → dialects; the per-item
     key app_class → dialect (activities' context/overrides, device
     bundles, view contexts, apps tiles' `class` attr); retired
     controller:googletv folds into controller:tv (one player —
     dialects supply the differences). */
  if (cfg.app_classes) {
    /* another healer may have minted an empty dialects {} first —
       merge, existing dialects entries winning */
    cfg.dialects = { ...cfg.app_classes, ...(cfg.dialects || {}) };
    delete cfg.app_classes;
  }
  const dialectKey = (o) => {
    if (o && typeof o === "object" && "app_class" in o && !("dialect" in o)) {
      o.dialect = o.app_class;
      delete o.app_class;
    }
  };
  for (const a of Object.values(cfg.activities || {})) {
    dialectKey(a?.context);
    dialectKey(a?.overrides);
    if (a?.screen === "controller:googletv") a.screen = "controller:tv";
  }
  for (const d of Object.values(cfg.devices || {})) dialectKey(d);
  for (const scr of Object.values({ ...(cfg.screens || {}), ...(cfg.controllers || {}) })) {
    dialectKey(scr?.context);
    for (const g of [scr?.tiles || [], ...((scr?.sections || []).map((x) => x.tiles || []))])
      for (const t of g)
        if (t?.type === "apps" && t.class && !t.dialect) { t.dialect = t.class; delete t.class; }
  }
  if (cfg.controllers?.googletv) delete cfg.controllers.googletv;
  /* v0.45.1 (Suresh): the command-channel role renamed system→commands.
     Heal every store-side carrier: device claims, activity context /
     wiring / overrides, and $context.system strings baked into screens
     and controllers (exact-value swap — never a substring replace). */
  const renameKey = (o) => {
    if (o && typeof o === "object" && "system" in o && !("commands" in o)) {
      o.commands = o.system;
      delete o.system;
    }
  };
  for (const d of Object.values(cfg.devices || {})) renameKey(d.roles);
  for (const a of Object.values(cfg.activities || {})) {
    renameKey(a?.context);
    renameKey(a?.wiring);
    renameKey(a?.overrides);
  }
  const swapCtx = (node) => {
    if (Array.isArray(node)) { node.forEach(swapCtx); return; }
    if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node)) {
        if (v === "$context.system") node[k] = "$context.commands";
        else swapCtx(v);
      }
  };
  swapCtx(cfg.screens || {});
  swapCtx(cfg.controllers || {});
  const looksRemote = (v) => v && typeof v === "object" &&
    ("capabilities" in v || "keymap" in v || "fully" in v);
  if (!cfg.remotes && cfg.devices &&
      Object.values(cfg.devices).some(looksRemote)) {
    cfg.remotes = cfg.devices;
    cfg.devices = {};
  }
  if (!cfg.remotes) cfg.remotes = { default: { capabilities: ["touch", "pointer"] } };
  if (!cfg.devices || Object.values(cfg.devices).some(looksRemote)) cfg.devices = {};
  const lib = cfg.devices;
  for (const a of Object.values(cfg.activities || {})) {
    if (!a || a.wiring || a.cast) continue;
    const ctx = a.context || {};
    const wiring = {}, cast = [];
    for (const role of ROLE_KEYS) {
      const ent = ctx[role];
      if (typeof ent !== "string" || !ent) continue;
      const devId = Object.keys(lib).find((d) => lib[d]?.roles?.[role] === ent);
      wiring[role] = devId || ent;
      if (devId && !cast.includes(devId)) cast.push(devId);
    }
    if (!Object.keys(wiring).length) continue;   /* context-free activity */
    a.wiring = wiring;
    a.cast = cast;
    const derived = compileContext(a, lib);
    const overrides = {};
    for (const [k, v] of Object.entries(ctx))
      if (JSON.stringify(derived[k]) !== JSON.stringify(v)) overrides[k] = v;
    if (Object.keys(overrides).length) a.overrides = overrides;
    a.context = { ...derived, ...overrides };
  }
  return cfg;
}

/* THE SELECT MUST NAME A CURRENT ROOM (v0.47.2): configs renamed
   before the renameScreen fix carry an activity_select minted for a
   room id that no longer exists — re-mint it when the repair is
   unambiguous (exactly one room hub). */

export function normalizeSelect(cfg, ws) {
  if (!cfg) return cfg;
  const sel = cfg.global?.activity_select;
  if (typeof sel !== "string" || !sel.endsWith("_activity")) return cfg;
  const rooms = Object.entries(cfg.screens || {})
    .filter(([, scr]) => scr?.room).map(([id]) => id);
  if (!rooms.length) return cfg;
  if (rooms.some((r) => sel.endsWith("_" + r + "_activity"))) return cfg;  /* healthy */
  if (rooms.length !== 1) return cfg;          /* ambiguous — leave it */
  cfg.global.activity_select = "select.harmonium_" +
    (ws === "main" || !ws ? "" : ws + "_") + rooms[0] + "_activity";
  return cfg;
}

/* SECTION LITURGY HEAL (v0.79.1 — Suresh: "On my Main Porch Presets
   are after activities… In my Scratch Porch Page they appear under
   Devices?"): the HubEditor DISPLAYS Hero → Activities → Presets →
   Devices whatever the array says, but the ENGINE renders the array
   as written — and addRoleSection used to push() a new role section
   to the end, so a Presets fold toggled on after Devices rendered
   below it, a lie the editor then hid (there is no way to even SEE
   the true order in the Studio). The role trio is re-seated in
   liturgy order within the exact index slots it already occupies;
   custom sections never move. Role inference mirrors HubEditor's
   roleOf. Safe on hand-written configs: a config already in liturgy
   order (every config the Studio has ever displayed truthfully) is
   untouched byte-for-byte. */

export function normalizeSectionOrder(cfg) {
  const LITURGY = { activities: 0, presets: 1, devices: 2 };
  const roleOf = (s) => {
    if (s.role) return s.role;
    const types = new Set((s.tiles || []).map((t) => t.type));
    if (types.has("activity") || types.has("activities")) return "activities";
    if (types.has("preset") || types.has("presets") ||
        types.has("presets_from")) return "presets";
    if (types.has("apps")) return "custom";
    return types.size ? "devices" : "custom";
  };
  for (const scr of Object.values(cfg.screens || {})) {
    if (!Array.isArray(scr?.sections)) continue;
    const slots = [];                       /* indices held by the trio */
    for (let i = 0; i < scr.sections.length; i++)
      if (LITURGY[roleOf(scr.sections[i])] != null) slots.push(i);
    if (slots.length < 2) continue;
    const trio = slots.map((i) => scr.sections[i])
      .sort((a, b) => LITURGY[roleOf(a)] - LITURGY[roleOf(b)]);  /* stable */
    slots.forEach((i, n) => { scr.sections[i] = trio[n]; });
  }
  return cfg;
}

/* v0.83.7 — the Draws-as unification: shows "stepper" was a second
   volume entry overlapping the Volume style select; it becomes
   volume + style: stepper (the engine keeps honouring the legacy
   value on already-deployed configs). */

export function normalizePresentShows(cfg) {
  for (const a of Object.values(cfg?.activities || {})) {
    for (const p of Object.values(a?.present || {})) {
      if (p && p.shows === "stepper") {
        p.shows = "volume";
        if (!p.style) p.style = "stepper";
      }
    }
  }
}

export function normalizeConfig(cfg, ws) {
  ensureStockControllers(cfg);
  normalizePresentShows(cfg);
  normalizeNavTiles(cfg);
  normalizeHosts(cfg);
  normalizeOffActivity(cfg);
  normalizeApps(cfg);
  normalizeDevices(cfg);
  normalizeSelect(cfg, ws);
  normalizeSectionOrder(cfg);
  return cfg;
}
