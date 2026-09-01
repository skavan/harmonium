/* ================================================================
   Device detail screens — VIRTUAL screens, generated per domain.
   navigate("detail:<entity_id>") composes generic primitives
   (power / stepper / chips). Chip options and stepper values come
   from the entity's own attributes, so no config is needed and the
   choices are always what the device actually supports.
   ================================================================ */

/* stepper bindings: one adjustable range per kind */
const STEP_KINDS = {
  temperature: {
    get: e => st(e).a.temperature, fmt: v => (v != null ? v : "–") + "°", step: 1,
    stepAttr: "target_temp_step", minAttr: "min_temp", maxAttr: "max_temp",
    set: (e, v) => callService("climate", "set_temperature", { temperature: v }, e)
  },
  brightness: {
    get: e => st(e).s === "on" ? Math.round((st(e).a.brightness || 0) / 2.55) : 0,
    fmt: v => (v != null ? v : 0) + "%", step: 10, min: 0, max: 100, slider: "h",
    set: (e, v) => callService("light", "turn_on", { brightness_pct: v }, e)
  },
  volume: {
    get: e => Math.round((st(e).a.volume_level || 0) * 100),
    fmt: v => (v != null ? v : 0) + "%", step: 3, min: 0, max: 100, slider: "h",
    set: (e, v) => callService("media_player", "volume_set", { volume_level: v / 100 }, e)
  },
  percentage: {
    get: e => { const p = st(e).a.percentage; return p != null ? p : 0; },
    fmt: v => (v != null ? v : 0) + "%", step: 10, min: 0, max: 100, slider: "h",
    stepAttr: "percentage_step",
    set: (e, v) => callService("fan", "set_percentage", { percentage: v }, e)
  },
  position: {
    /* invert_position: display = deployment (100 - HA position), so a
       retracted projector screen reads 0%. get/set both invert, so
       slider, −/+, and VOL stay coherent; cover SERVICES never invert. */
    get: e => {
      const cp = st(e).a.current_position; const p = cp != null ? cp : 0;
      return entOpt(e, "invert_position") ? 100 - p : p;
    },
    fmt: v => (v != null ? v : 0) + "%", step: 10, min: 0, max: 100, slider: "v",
    set: (e, v) => callService("cover", "set_cover_position",
      { position: entOpt(e, "invert_position") ? 100 - v : v }, e)
  },
  /* THE NUMBER ADAPTER's range (entity-controls Phase 2): the value
     IS the state, and min/max/step/unit are the ENTITY's own
     contract — never hard-coded 0..100 or step 3 (the design's
     Number rule). A missing or malformed step falls back to 1 via
     nudgeStep's published-attribute guard. Serves number.* and
     input_number.* — the domain picks the service. */
  number: {
    get: e => { const v = parseFloat(st(e).s); return isNaN(v) ? null : v; },
    fmt: (v, e) => {
      if (v == null) return "–";
      const u = (e && st(e).a.unit_of_measurement) || "";
      /* % and ° hug the number; worded units get their space */
      return (Math.round(v * 1000) / 1000) +
        (u ? ((u === "%" || u === "°") ? "" : " ") + u : "");
    },
    step: 1, stepAttr: "step", minAttr: "min", maxAttr: "max",
    set: (e, v) => callService((e || "").split(".")[0], "set_value",
      { value: Math.round(v * 1000) / 1000 }, e)
  }
};
/* one range resolution for every consumer (nudge, slider drag, track
   fill): the entity's published attributes beat the kind's defaults —
   extracted from nudgeStep (Phase 0 #4), byte-identical precedence */
function stepBounds(k, e) {
  const a = st(e).a || {};
  return {
    step: k.stepAttr && +a[k.stepAttr] > 0 ? +a[k.stepAttr] : k.step,
    min: k.minAttr && a[k.minAttr] != null ? +a[k.minAttr] : k.min,
    max: k.maxAttr && a[k.maxAttr] != null ? +a[k.maxAttr] : k.max
  };
}
function nudgeStep(e, kind, dir) {
  const k = STEP_KINDS[kind];
  if (!k || !e) return;
  /* PHASE 0, entity-controls (inconsistency #4): the entity's OWN
     published step and range win over the kind's defaults — a climate
     that declares target_temp_step 0.5 steps by 0.5, a fan that
     declares percentage_step 25 steps by 25. Kinds without a
     published attribute keep their defaults, byte-identical.
     (Resolution now lives in stepBounds so the slider track and the
     −/+ can never disagree about the range — Phase 2.) */
  const b = stepBounds(k, e);
  let v = (+k.get(e) || 0) + dir * b.step;
  if (b.min != null) v = Math.max(b.min, v);
  if (b.max != null) v = Math.min(b.max, v);
  k.set(e, v);
}

/* chip bindings: an options list (from attributes) + a setter */
const CHIP_KINDS = {
  hvac_mode: { options: e => st(e).a.hvac_modes, current: e => st(e).s,
    set: (e, v) => callService("climate", "set_hvac_mode", { hvac_mode: v }, e) },
  fan_mode: { options: e => st(e).a.fan_modes, current: e => st(e).a.fan_mode,
    set: (e, v) => callService("climate", "set_fan_mode", { fan_mode: v }, e) },
  preset: { options: e => st(e).a.preset_modes, current: e => st(e).a.preset_mode,
    set: (e, v) => callService((e || "").split(".")[0], "set_preset_mode", { preset_mode: v }, e) },
  source: { options: e => st(e).a.source_list, current: e => st(e).a.source,
    set: (e, v) => callService("media_player", "select_source", { source: v }, e) },
  effect: { options: e => st(e).a.effect_list, current: e => st(e).a.effect,
    set: (e, v) => callService("light", "turn_on", { effect: v }, e) },
  /* v0.57: receivers publish listening modes — MultiChannel Stereo on
     the Onkyo's own page beats bouncing it through Harmony IR */
  sound_mode: { options: e => st(e).a.sound_mode_list, current: e => st(e).a.sound_mode,
    set: (e, v) => callService("media_player", "select_sound_mode", { sound_mode: v }, e) },
  /* THE SELECT ADAPTER (entity-controls Phase 2): the entity's own
     options list, the state as the current choice, select_option to
     write — select.* and input_select.*, domain picks the service */
  select: { options: e => st(e).a.options, current: e => st(e).s,
    set: (e, v) => callService((e || "").split(".")[0], "select_option",
      { option: v }, e) }
};
function cycleChip(e, t, dir) {
  const k = CHIP_KINDS[t.kind], opts = (k && k.options(e)) || [];
  if (!opts.length) return;
  const i = Math.max(0, opts.indexOf(k.current(e)));
  k.set(e, opts[(i + dir + opts.length) % opts.length]);
}

/* Roving highlight for button-row widgets (coverbtns, transport):
   while the row tile is merely FOCUSED, ◀▶ move a highlight across
   its buttons and select presses the highlighted one — no capture
   step, matches "a row of physical buttons". Buttons are located by
   data-<attr>; default index 1 = the center button (Stop/Play-Pause). */
function roveBtns(t, attr) {
  const el = document.getElementById("tile_" + t.id);
  /* skip buttons in hidden rows (2026-09-01, found building the lock
     trio: a cover with no tilt still counted its hidden tilt buttons
     in the rove ring) — display:none has no offsetParent */
  return el ? [el, [...el.querySelectorAll(`[data-${attr}]`)]
    .filter(b => b.offsetParent !== null)] : [null, []];
}
function roveMove(t, attr, d) {
  const [el, btns] = roveBtns(t, attr);
  if (!btns.length) return;
  el._ci = ((el._ci != null ? el._ci : 1) + d + btns.length) % btns.length;
  btns.forEach((b, i) => b.classList.toggle("cvsel", i === el._ci));
}
function rovePick(t, attr) {
  const [el, btns] = roveBtns(t, attr);
  return btns.length ? btns[el._ci != null ? el._ci : 1].dataset[attr] : null;
}

/* per-domain detail composition (chips with no options self-hide).
   Layout doctrine (v0.9.3): row 1 = power toggle (back is the GLOBAL
   status-bar chevron); NO headings — a small dim icon marks each
   row's meaning; option buttons are preset-tile sized. */
const DETAIL_TILES = {
  climate: e => [
    { id: "dp", type: "power", entity: e, label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "temperature", entity: e, icon: "material:thermostat", label: "", span: 2 },
    { id: "dm", type: "chips", kind: "hvac_mode", entity: e, icon: "material:hvac", label: "", span: 2 },
    { id: "df", type: "chips", kind: "fan_mode", entity: e, icon: "material:mode_fan", label: "", span: 2 },
    { id: "dpr", type: "chips", kind: "preset", entity: e, icon: "material:tune", label: "", span: 2 }
  ],
  light: e => [
    { id: "dp", type: "power", entity: e, label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "brightness", entity: e, icon: "material:light_mode", label: "", span: 2 },
    { id: "de", type: "chips", kind: "effect", entity: e, icon: "material:auto_awesome", label: "", span: 2 }
  ],
  media_player: e => [
    { id: "dp", type: "power", entity: e, label: "", span: 2 },
    { id: "dt", type: "transport", entity: e, label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "volume", entity: e, icon: "material:volume_up", label: "", span: 2 },
    { id: "dsrc", type: "chips", kind: "source", entity: e, icon: "material:input", label: "", span: 2 },
    { id: "dsnd", type: "chips", kind: "sound_mode", entity: e, icon: "material:graphic_eq", label: "", span: 2 }
  ],
  cover: e => [
    { id: "dc", type: "coverbtns", entity: e, label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "position", entity: e, icon: "material:height", label: "", span: 2 }
  ],
  fan: e => [
    { id: "dp", type: "power", entity: e, label: "", span: 2 },
    { id: "ds", type: "stepper", kind: "percentage", entity: e, icon: "material:mode_fan", label: "", span: 2 },
    { id: "dpr", type: "chips", kind: "preset", entity: e, icon: "material:tune", label: "", span: 2 }
  ],
  switch: e => [
    { id: "dp", type: "power", entity: e, label: "", span: 2 }
  ],
  /* entity-controls Phase 2: the native domains get real pages —
     number is its stepper (the entity's own range), select is its
     options row. input_* twins share the composers. */
  number: e => [
    { id: "ds", type: "stepper", kind: "number", entity: e,
      icon: "material:tune", label: "", span: 2 }
  ],
  select: e => [
    { id: "dch", type: "chips", kind: "select", entity: e,
      icon: "material:list", label: "", span: 2 }
  ]
};
DETAIL_TILES.input_number = DETAIL_TILES.number;
DETAIL_TILES.input_select = DETAIL_TILES.select;
/* PHASE 0, entity-controls (inconsistency #1): domains with no
   composer (sensor, remote, …) still get a page — a lone readout
   tile. The launcher fallback (device.js select/hold → detail:<e>)
   counts on detail: never resolving null for a real entity. */
const genericDetail = e => [
  { id: "dr", type: "device", entity: e, tap: "none", label: "", span: 2 }
];
/* VOL keys retarget to the device's primary range ON ITS DETAIL SCREEN
   ONLY (everywhere else VOL stays room/activity audio). */
const DETAIL_VOL_KIND = {
  climate: "temperature", light: "brightness",
  media_player: "volume", cover: "position", fan: "percentage",
  number: "number", input_number: "number"
};

/* the STOCK domain controllers (config.controllers.<domain>, tiles
   bound to "$device") are the editable form of DETAIL_TILES; a
   per-device CUSTOM copy (variant_of: <domain>, entity: <eid>) wins
   for its device. Fallback: the hardcoded composition. */
function bindDeviceTiles(tiles, eid) {
  /* reduce, not Object.fromEntries (Chromium 73+): syntax floor is
     61 — the stock Astrion webview. See boot.js. */
  const sub = v => v === "$device" ? eid
    : Array.isArray(v) ? v.map(sub)
    : (v && typeof v === "object")
      ? Object.entries(v).reduce((o, kv) => (o[kv[0]] = sub(kv[1]), o), {})
      : v;
  return tiles.map(sub);
}
function detailDef(eid) {
  const dom = eid.split(".")[0];
  const cs = (CONFIG && CONFIG.controllers) || {};
  for (const c of Object.values(cs))
    if (c && c.variant_of && c.domain === dom && c.entity === eid) return c;
  const stock = cs[dom];
  return (stock && stock.domain === dom) ? stock : null;
}
function detailScreen(eid) {
  const def = detailDef(eid);
  const raw = def
    ? ((def.tiles && def.tiles.length) ? def.tiles
        : (def.sections || []).reduce((a, x) => a.concat(x.tiles || []), []))
    : (DETAIL_TILES[eid.split(".")[0]] || genericDetail)(eid);
  if (!raw || !raw.length) return null;
  const tiles = def ? bindDeviceTiles(raw, eid) : raw;
  return {
    name: st(eid).a.friendly_name || eid.split(".")[1].replace(/_/g, " "),
    virtual: true,
    tiles,
    initial_focus: tiles.some(t => t.id === "ds") ? "ds" : tiles[0].id
  };
}
/* SOURCES detail (v0.35): navigate("sources:<entity>") — the input
   picker as a virtual screen. One chips row (kind source): the live
   source_list, current highlighted, pick → select_source. Launched
   by the `sources` tile and the repurposed title-bar input button. */
function sourcesScreen(eid) {
  if (!eid) return null;
  const fn = st(eid).a.friendly_name;
  return {
    name: (fn || eid.split(".")[1].replace(/_/g, " ")) + " · Inputs",
    virtual: true,
    /* pickpage (2026-08-31 — Suresh: "bad formatting"): a page whose
       whole body is ONE options list sheds the tile chrome — no
       floating icon, no card skin, no page-sized focus ring; the
       roving pill highlight is the cursor here */
    tiles: [{ id: "dsrc", type: "chips", kind: "source", entity: eid,
      label: "", span: 2, cls: "pickpage", trailing: false }],
    initial_focus: "dsrc"
  };
}

/* PICK (entity-controls Phase 2): navigate("pick:<entity>:<kind>") —
   the Picker variant's destination, sourcesScreen generalized: one
   chips row of the entity's live options, current highlighted, pick
   commits. Virtual, so the Picker tile works from any surface. */
function pickScreen(spec) {
  const i = spec.lastIndexOf(":");
  const eid = i > 0 ? spec.slice(0, i) : spec;
  const kind = i > 0 ? spec.slice(i + 1) : "select";
  if (!eid || !CHIP_KINDS[kind]) return null;
  const fn = st(eid).a.friendly_name;
  return {
    name: fn || eid.split(".")[1].replace(/_/g, " "),
    virtual: true,
    tiles: [{ id: "dpick", type: "chips", kind: kind, entity: eid,
      label: "", span: 2, cls: "pickpage", trailing: false }],
    initial_focus: "dpick"
  };
}

/* GROUPS (v0.60): navigate("group:<id>") renders one group from the
   running activity's cast — its members, each drawn as `shows`. It is
   the SAME mechanism as Devices > Add Nav Card; the only variable is
   what the children render as, which is the whole insight (Suresh:
   "Maybe that is TYPE").

   Virtual, so a shared controller carries one groups generator and
   every room gets its own cards for free. A group with an explicit
   `target` never reaches here — the nav card goes straight to the
   authored page, which then owns everything on it. */
function groupScreen(gid) {
  /* v0.61: presumed too — a group page reached with nothing running
     fills in from the surface its card was on */
  const aid = renderActivityId();
  const act = aid && (CONFIG.activities || {})[aid];
  if (!act) return null;
  const g = castGroup(act, gid);
  if (!g) return null;
  /* PER-MEMBER shows (v0.76 — Suresh: "move the Children Show out.
     And put the device options in the device rows"): each member's
     presentation decides what IT draws as; the group's own `shows`
     survives as the members' default, so deployed configs render
     unchanged until a row says otherwise. */
  const tiles = (g.members || [])
    .map(did => {
      const p = presOf(act, did);
      return groupChildTile(did, presType(p) || presType(g) || "device",
        "g_" + gid, p);
    })
    .filter(Boolean);
  if (!tiles.length) return null;
  return {
    name: (act.name ? act.name + " · " : "") + (g.name || gid),
    virtual: true,
    grid: { columns: (g.grid && g.grid.columns) || 1 },
    tiles
  };
}

/* SPEAKER GROUP SCREEN (v0.83.7 Speaker Groups): the launcher tile's
   destination — navigate("spkgrp:<id>") renders one named group from
   CONFIG.speaker_groups as a full grouping card WITH per-player trim
   sliders. Virtual like group:/detail:, so the launcher works from
   any surface and the running activity's context (if any) supplies
   the join master via the card's own fallback chain. */
function speakerGroupScreen(gid) {
  const g = (CONFIG.speaker_groups || {})[gid];
  if (!g) return null;
  const ents = (g.entities || []).filter(en =>
    typeof en === "string" && en.indexOf(".") > 0);
  if (ents.length < 2) return null;
  /* master = the (presumed) activity's player when there is one —
     resolved HERE, not left as $context (an unwired $context hides
     the whole tile in visibleTile); with no activity anywhere
     group_master stays absent and grpMaster's fallback chain picks
     a coordinator / playing member / first listed */
  const aid = renderActivityId();
  const act = aid && (CONFIG.activities || {})[aid];
  const cm0 = act && act.context && act.context.media_player;
  const cm = typeof cm0 === "string" && cm0.indexOf(".") > 0 ? cm0 : undefined;
  /* TILES, NOT A MEGA-CARD (2026-08-20 — his screenshots: "Each row
     should behave as a tile"): one grpmember tile per player + the
     Group Volume tile. Real tiles → the focus walk, the tile gap,
     and the value nav-mode all come free. */
  const tiles = ents.map(m => ({
    id: "sgm_" + m, type: "grpmember", entity: m,
    entities: ents, group_master: cm,
    /* label NOW (friendly name if state already arrived, else the
       deslugged entity tail) — grpmember.render upgrades it live
       the moment state lands. No icon: the rows read like the
       mega-card did, and the track needs the width. */
    label: (st(m).a || {}).friendly_name ||
      m.split(".").pop().replace(/_/g, " "),
    trailing: false,
  }));
  tiles.push({
    id: "sgv_" + gid, type: "grpvol", label: "Group volume",
    entities: ents, group_master: cm, trailing: false,
  });
  return {
    name: g.name || gid,
    virtual: true,
    grid: { columns: 1 },
    tiles,
    initial_focus: "sgm_" + ents[0]
  };
}

/* screen id resolution: config screens + virtual detail screens +
   LIBRARY CONTROLLERS ("controller:<id>" → config.controllers — the
   shared control surfaces; the active activity's context overlay
   parameterizes them, same as any screen) */
function screenOf(id) {
  if (typeof id === "string" && id.startsWith("detail:"))
    return detailScreen(id.slice(7));
  if (typeof id === "string" && id.startsWith("sources:"))
    return sourcesScreen(id.slice(8));
  if (typeof id === "string" && id.startsWith("pick:"))
    return pickScreen(id.slice(5));   /* Select's Picker (Phase 2) */
  if (typeof id === "string" && id.startsWith("queue:"))
    return queueScreen(id.slice(6));
  if (id === "keys:")           /* key capture (v0.55) */
    return keysScreen();
  if (id === "diag:")           /* diagnostics (v0.80.5) */
    return diagScreen();
  if (typeof id === "string" && id.startsWith("group:"))
    return groupScreen(id.slice(6));   /* a cast group (v0.60) */
  if (typeof id === "string" && id.startsWith("spkgrp:"))
    return speakerGroupScreen(id.slice(7));   /* a speaker group (v0.83.7) */
  if (typeof id === "string" && id.startsWith("controller:"))
    return (CONFIG && CONFIG.controllers && CONFIG.controllers[id.slice(11)]) || null;
  return (CONFIG && CONFIG.screens && CONFIG.screens[id]) || null;
}

/* effective trailing action for a tile: explicit config wins
   (trailing: false suppresses); detailable device tiles default to
   a settings icon opening their generated detail screen */
function trailingOf(t) {
  if (!t) return null;
  if (t.trailing !== undefined) return t.trailing || null;
  const w = WIDGETS[t.type] || {};
  if (!w.detailable) return null;
  const de = resolveEntity(t.entity);
  return (de && DETAIL_TILES[de.split(".")[0]])
    ? { icon: "material:tune", action: { navigate: "detail:" + de } }
    : null;
}
