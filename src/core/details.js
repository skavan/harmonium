/* ================================================================
   Device detail screens — VIRTUAL screens, generated per domain.
   navigate("detail:<entity_id>") composes generic primitives
   (power / stepper / chips). Chip options and stepper values come
   from the entity's own attributes, so no config is needed and the
   choices are always what the device actually supports.
   ================================================================ */

/* stepper bindings: one adjustable range per kind.
   `loc` is the OPTIMISTIC local write (2026-09-05, feedback-3 #2 —
   Suresh: "The sonos bass and treble steppers take forever to
   register a step and feel broken"): the displayed value used to
   wait for HA's confirming diff, so a slow integration read as dead
   buttons — and every tap before the confirm recomputed from the
   STALE value, so rapid taps didn't accumulate. Each kind writes its
   target into the local state first (the mute toggle's doctrine) and
   the confirming diff simply lands over it. */
const STEP_KINDS = {
  temperature: {
    get: e => st(e).a.temperature, fmt: v => (v != null ? v : "–") + "°", step: 1,
    stepAttr: "target_temp_step", minAttr: "min_temp", maxAttr: "max_temp",
    loc: (e, v) => { const c = S.states.get(e); if (c && c.a) c.a.temperature = v; },
    set: (e, v) => callService("climate", "set_temperature", { temperature: v }, e)
  },
  brightness: {
    get: e => st(e).s === "on" ? Math.round((st(e).a.brightness || 0) / 2.55) : 0,
    fmt: v => (v != null ? v : 0) + "%", step: 10, min: 0, max: 100, slider: "h",
    /* brightness_pct on turn_on lights the light — the local mirror
       flips the state too, or get() would keep answering 0 */
    loc: (e, v) => { const c = S.states.get(e);
      if (c && c.a) { c.s = "on"; c.a.brightness = Math.round(v * 2.55); } },
    set: (e, v) => callService("light", "turn_on", { brightness_pct: v }, e)
  },
  volume: {
    get: e => Math.round((st(e).a.volume_level || 0) * 100),
    fmt: v => (v != null ? v : 0) + "%", step: 3, min: 0, max: 100, slider: "h",
    loc: (e, v) => { const c = S.states.get(e); if (c && c.a) c.a.volume_level = v / 100; },
    set: (e, v) => callService("media_player", "volume_set", { volume_level: v / 100 }, e)
  },
  percentage: {
    get: e => { const p = st(e).a.percentage; return p != null ? p : 0; },
    fmt: v => (v != null ? v : 0) + "%", step: 10, min: 0, max: 100, slider: "h",
    stepAttr: "percentage_step",
    loc: (e, v) => { const c = S.states.get(e); if (c && c.a) c.a.percentage = v; },
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
    loc: (e, v) => { const c = S.states.get(e); if (c && c.a)
      c.a.current_position = entOpt(e, "invert_position") ? 100 - v : v; },
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
    /* the value IS the state for number entities — his Sonos bass and
       treble, the kind the feedback named */
    loc: (e, v) => { const c = S.states.get(e); if (c)
      c.s = String(Math.round(v * 1000) / 1000); },
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
  /* OPTIMISTIC FIRST (feedback-3 #2): write the target locally and
     repaint, THEN ask HA — taps register instantly and accumulate,
     and the confirming diff lands over the same value */
  if (k.loc) {
    k.loc(e, v);
    if (typeof renderStates === "function") renderStates();
  }
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
/* WHERE DO APPS LIVE IN THIS WORKSPACE? The first controller that is
   a drawer and generates an apps grid (type:"apps", in tiles or in
   sections). Found by shape, not by name — "apps" is only a starter
   convention. Null when the workspace has none. */
function appsDrawerId() {
  const cons = (CONFIG && CONFIG.controllers) || {};
  for (const cid in cons) {
    const c = cons[cid];
    if (!c || !c.drawer) continue;
    let tiles = Array.isArray(c.tiles) ? c.tiles.slice() : [];
    (Array.isArray(c.sections) ? c.sections : []).forEach(s => {
      if (s && Array.isArray(s.tiles)) tiles = tiles.concat(s.tiles);
    });
    if (tiles.some(t => t && t.type === "apps")) return "controller:" + cid;
  }
  return null;
}
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
    /* POWER leads, Now Playing second (2026-09-04 — Suresh: "The Now
       Playing should be below the Power button"; the slim NP itself
       was his earlier ask — "go with the Slim version, since its now
       a child of the Fire TV activity"). The NP's trailing is the
       APPS DRAWER when the workspace has one (the drawer serves the
       opener — ctxFor's drawer law — so from this page it is THIS
       device's apps); with no drawer it is suppressed, because the
       default trail would navigate to detail:<e> — the page we are
       already standing on, a button that visibly does nothing (his
       "The Apps button on Porch TV doesn't show me the Apps").
       FALLBACK ONLY since the same day: DOMAIN_STOCKS.media_player
       (stocklib, "Media Device") is this list's editable twin, and
       detailDef prefers it — a normalized config never reaches this
       branch. Change one, change both (probe-media-device-stock
       fences the pair). */
    /* gen 2 (2026-09-05, feedback-3 #4 — Suresh: "Lets make the stock
       Media Device use: Now Playing = Art, Volume = Slider"): the NP
       wears the art hero, the volume row is the fat slider (working
       spelling — no `variant`, so the wiring rewrite above still
       upgrades it per device). Twin: stocklib DOMAIN_STOCKS. */
    { id: "dp", type: "power", entity: e, label: "", span: 2 },
    { id: "dnp", type: "media", style: "art", entity: e,
      icon: "material:smart_display", label: "Now Playing", span: 2,
      trailing: appsDrawerId()
        ? { icon: "material:apps", action: { navigate: appsDrawerId() } }
        : false },
    { id: "dt", type: "transport", entity: e, label: "", span: 2 },
    { id: "ds", type: "volume", slider: true, entity: e, icon: "material:volume_up", label: "", span: 2 },
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
  /* THE DEVICE'S OWN PICK OUTRANKS (2026-09-04, Media Device round 3
     — Suresh: "we should assign a Device Controller per device
     instance, alongside the dialect setting we have now" and "it
     only shows Customize its page, not select one"): a pre-wired
     device may name its page — `page: "<controller id>"` on the
     device bundle, like `dialect`. Any same-domain controller
     qualifies: a variant made for another device (two Samsungs
     sharing one custom page), or the domain stock itself (pinning
     stock even while an entity-bound copy exists). A wrong-domain
     or missing id is ignored and the ladder below answers. */
  const own = deviceOwning(eid);
  if (own && own.d && typeof own.d.page === "string") {
    const c = cs[own.d.page.replace(/^controller:/, "")];
    if (c && c.domain === dom) return c;
  }
  for (const c of Object.values(cs))
    if (c && c.variant_of && c.domain === dom && c.entity === eid) return c;
  const stock = cs[dom];
  return (stock && stock.domain === dom) ? stock : null;
}
/* which pre-wired device owns this entity — any role claim counts,
   because a device IS its roles assembly (design-device-takeover) */
function deviceOwning(eid) {
  const ds = (CONFIG && CONFIG.devices) || {};
  for (const id in ds) {
    const d = ds[id], r = (d && d.roles) || {};
    for (const k in r) if (r[k] === eid) return { id: id, d: d };
  }
  return null;
}
/* THE DISPLAY-NAME CHAIN (2026-09-04 — Suresh: "we show the
   unfriendly entity name on the screen, we should show whatever was
   set or ends up as the Display Name"): the running activity's
   per-member Display name (present[deviceId].name) → the device's
   library name → the entity's friendly name. One chain for the page
   title AND the strip's wordmark, so they can never disagree. */
function deviceDisplayName(devId, dv, eid) {
  const aid = renderActivityId();
  const act = aid && (CONFIG.activities || {})[aid];
  const pr = act && presOf(act, devId);
  if (pr && typeof pr.name === "string" && pr.name) return pr.name;
  if (dv && dv.name) return dv.name;
  const s = eid && st(eid);
  return (s && s.a && s.a.friendly_name) || null;
}
function detailScreen(eid) {
  const def = detailDef(eid);
  const raw = def
    ? ((def.tiles && def.tiles.length) ? def.tiles
        : (def.sections || []).reduce((a, x) => a.concat(x.tiles || []), []))
    : (DETAIL_TILES[eid.split(".")[0]] || genericDetail)(eid);
  if (!raw || !raw.length) return null;
  const tiles = def ? bindDeviceTiles(raw, eid) : raw;
  const scr = {
    name: st(eid).a.friendly_name || eid.split(".")[1].replace(/_/g, " "),
    virtual: true,
    tiles,
    initial_focus: tiles.some(t => t.id === "ds") ? "ds" : tiles[0].id
  };
  /* THE TAKEOVER (2026-09-04, design-device-takeover — the forum ask:
     "if I click on the Sony TV from the cast, all roles switch to the
     Sony TV"; Suresh: the porch Samsung's tile showed none of it, so
     the generated page itself now declares the takeover). When the
     entity belongs to a pre-wired device, its page speaks the DEVICE:
     the device's roles/dialect/dpad_commands become the page context
     (own_context beats the activity's overlay in ctxFor), and the
     dpad role — when wired — takes the physical pad through the
     existing passthrough gate, which brings the BACK/HOME strip and
     the borrowed-keys chrome with it. Entities no device owns keep
     exactly the old page. */
  const own = deviceOwning(eid);
  if (own) {
    const dv = own.d;
    const ctx = Object.assign({}, dv.roles || {});
    if (dv.dialect) ctx.dialect = dv.dialect;
    if (dv.traits && dv.traits.dpad_commands)
      ctx.dpad_commands = dv.traits.dpad_commands;
    scr.context = ctx;
    scr.own_context = true;
    const dn = deviceDisplayName(own.id, dv, eid);
    if (dn) scr.name = dn;
    /* VOLUME HONORS THE WIRING (2026-09-05 — his porch: "a pre-wired
       device, with volume readout set to the soundbar … doesn't
       honor that setting"): the generated volume row was bound to
       the tapped entity, ignoring the device's own volume roles. A
       wired `volume_level` upgrades the row to the volume widget's
       ARC split (buttons → the volume role, readout → the level
       entity — the same spelling the activity's t_vol uses); a
       wired `volume` alone just retargets the stepper. User edits
       on the stock tile (hidden, span…) ride along.
       ONLY the untouched stock shape (2026-09-05 drift round —
       Suresh: "Volume shows stepper in config, but compact (correct)
       in ui"): this silent rewrite made the page diverge from what
       the editor shows. An AUTHORED pick — a canonical `variant`, or
       a tile that already carries its own ARC split (`level_entity`)
       — is the user's law and passes untouched; per-device copies
       bake the wiring at creation now (Studio
       instantiateDeviceController), so their config says what
       renders. The bare stock stepper still upgrades at render,
       because the shared stock and unbound templates serve MANY
       devices and can only resolve wiring per-render. */
    if (dv.roles && (dv.roles.volume || dv.roles.volume_level)) {
      const vr = dv.roles.volume, vl = dv.roles.volume_level;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        if (t.id !== "ds" || (t.kind !== "volume" && t.type !== "volume"))
          continue;
        if (t.variant || t.level_entity) continue;
        if (vl) {
          const nt = Object.assign({}, t, { type: "volume", slider: false,
            entity: vr || eid, level_entity: vl });
          delete nt.kind;
          tiles[i] = nt;
        } else if (vr && vr !== t.entity) {
          tiles[i] = Object.assign({}, t, { entity: vr });
        }
      }
    }
    /* the page declares its OWN control_target (2026-09-04, round 2 —
       Suresh's porch: "dpad is targetting the fire tv even though I'm
       looking at the samsung device"). controlTarget() falls back to
       the ACTIVITY's `controls` when a screen declares none, so the
       running activity's navigation target was intercepting the
       device page. A full declaration — not just v1 dpad_passthrough
       — outranks that fallback for every consumer: deviceKeyTarget,
       passthroughActive, ctPass, ctPower. */
    if (dv.roles && dv.roles.dpad) {
      scr.dpad_passthrough = dv.roles.dpad;
      scr.control_target = {
        navigation: dv.roles.dpad,
        pass_through: ["up", "down", "left", "right", "select", "back", "home"],
      };
      if (dv.roles.power) scr.control_target.power = dv.roles.power;
      if (dv.roles.volume) scr.control_target.volume = dv.roles.volume;
    }
  }
  return scr;
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
    /* the page wears the GROUP's name (2026-09-05 groups round —
       Suresh: "for the title to represent the groups name"): the
       activity prefix crowded the 349px bar and the card the user
       tapped already said where they were */
    name: g.name || gid,
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
  if (typeof id === "string" && id.startsWith("controller:")) {
    const c = (CONFIG && CONFIG.controllers && CONFIG.controllers[id.slice(11)]) || null;
    /* A DEVICE VARIANT AS A SURFACE (2026-09-05 — Suresh's minimal-TV
       flow: clone the Media Device page for the Samsung, then point
       the ACTIVITY at the clone). An entity-bound domain variant
       carries $device tiles; opened through detail: they bind in
       detailScreen, but opened AS a controller (an activity's
       screen) they would render the literal string. Bind here too —
       the copy's own `entity` is the truth either way. Context stays
       the activity's (no own_context): the tiles are pinned to the
       device, the $context refs resolve from whoever runs. */
    /* an UNBOUND template previews through a lent device (feedback-1:
       stock-editor copies carry no entity of their own — the Studio's
       preview-device impersonation supplies one, S.pvDevice) */
    const bindTo = c && c.domain &&
      (c.entity || (c.variant_of && typeof S !== "undefined" && S.pvDevice));
    if (c && bindTo) {
      const b = Object.assign({}, c);
      if (Array.isArray(c.tiles)) b.tiles = bindDeviceTiles(c.tiles, bindTo);
      if (Array.isArray(c.sections))
        b.sections = c.sections.map(s => (s && Array.isArray(s.tiles))
          ? Object.assign({}, s, { tiles: bindDeviceTiles(s.tiles, bindTo) })
          : s);
      return b;
    }
    return c;
  }
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
