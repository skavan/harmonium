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
    get: e => st(e).a.temperature, fmt: v => (v ?? "–") + "°", step: 1,
    set: (e, v) => callService("climate", "set_temperature", { temperature: v }, e)
  },
  brightness: {
    get: e => st(e).s === "on" ? Math.round((st(e).a.brightness || 0) / 2.55) : 0,
    fmt: v => (v ?? 0) + "%", step: 10, min: 0, max: 100, slider: "h",
    set: (e, v) => callService("light", "turn_on", { brightness_pct: v }, e)
  },
  volume: {
    get: e => Math.round((st(e).a.volume_level || 0) * 100),
    fmt: v => (v ?? 0) + "%", step: 3, min: 0, max: 100, slider: "h",
    set: (e, v) => callService("media_player", "volume_set", { volume_level: v / 100 }, e)
  },
  percentage: {
    get: e => st(e).a.percentage ?? 0,
    fmt: v => (v ?? 0) + "%", step: 10, min: 0, max: 100, slider: "h",
    set: (e, v) => callService("fan", "set_percentage", { percentage: v }, e)
  },
  position: {
    /* invert_position: display = deployment (100 - HA position), so a
       retracted projector screen reads 0%. get/set both invert, so
       slider, −/+, and VOL stay coherent; cover SERVICES never invert. */
    get: e => {
      const p = st(e).a.current_position ?? 0;
      return entOpt(e, "invert_position") ? 100 - p : p;
    },
    fmt: v => (v ?? 0) + "%", step: 10, min: 0, max: 100, slider: "v",
    set: (e, v) => callService("cover", "set_cover_position",
      { position: entOpt(e, "invert_position") ? 100 - v : v }, e)
  }
};
function nudgeStep(e, kind, dir) {
  const k = STEP_KINDS[kind];
  if (!k || !e) return;
  let v = (+k.get(e) || 0) + dir * k.step;
  if (k.min != null) v = Math.max(k.min, v);
  if (k.max != null) v = Math.min(k.max, v);
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
    set: (e, v) => callService("light", "turn_on", { effect: v }, e) }
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
  return el ? [el, [...el.querySelectorAll(`[data-${attr}]`)]] : [null, []];
}
function roveMove(t, attr, d) {
  const [el, btns] = roveBtns(t, attr);
  if (!btns.length) return;
  el._ci = ((el._ci ?? 1) + d + btns.length) % btns.length;
  btns.forEach((b, i) => b.classList.toggle("cvsel", i === el._ci));
}
function rovePick(t, attr) {
  const [el, btns] = roveBtns(t, attr);
  return btns.length ? btns[el._ci ?? 1].dataset[attr] : null;
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
    { id: "dsrc", type: "chips", kind: "source", entity: e, icon: "material:input", label: "", span: 2 }
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
  ]
};
/* VOL keys retarget to the device's primary range ON ITS DETAIL SCREEN
   ONLY (everywhere else VOL stays room/activity audio). */
const DETAIL_VOL_KIND = {
  climate: "temperature", light: "brightness",
  media_player: "volume", cover: "position", fan: "percentage"
};

/* the STOCK domain controllers (config.controllers.<domain>, tiles
   bound to "$device") are the editable form of DETAIL_TILES; a
   per-device CUSTOM copy (variant_of: <domain>, entity: <eid>) wins
   for its device. Fallback: the hardcoded composition. */
function bindDeviceTiles(tiles, eid) {
  const sub = v => v === "$device" ? eid
    : Array.isArray(v) ? v.map(sub)
    : (v && typeof v === "object")
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]))
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
        : (def.sections || []).flatMap(x => x.tiles || []))
    : (DETAIL_TILES[eid.split(".")[0]] || (() => null))(eid);
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
    tiles: [{ id: "dsrc", type: "chips", kind: "source", entity: eid,
      icon: "material:input", label: "", span: 2 }],
    initial_focus: "dsrc"
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
  if (typeof id === "string" && id.startsWith("queue:"))
    return queueScreen(id.slice(6));
  if (id === "keys:")           /* key capture (v0.55) */
    return keysScreen();
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
