/* ================================================================
   THE CAST VOCABULARY — shared by every generator and by
   activities.js/render.js: who is in an activity's cast, its groups,
   per-member presentation (presApply), the tiles a member draws as
   (groupChildTile / looseShowTile), and the Controller-tab band
   switch (srfOff). Split out of core/generators.js (v0.83.11).
   ================================================================ */
/* THE CONTROLLER TAB'S BAND SWITCHES (v0.83.7 — Suresh: "What if
   I don't want to control multiple players. What if I do."): every
   band the activity's controller renders is a per-activity switch,
   stored on a.surface (the same home surface.devices has used since
   v0.48). Absent = Auto (today's behavior); false = off. The shared
   surface stays shared; the preference travels with the activity. */
const srfOff = (act, k) => !!(act && actSurface(act)[k] === false);

/* An activity's CAST: explicit devices list (Studio Setup v2), else
   derived from the role wiring in role order — primary first. */
function castFromCtx(ctx) {
  const seen = [];
  for (const r of ["media_player", "dpad", "power", "volume", "volume_level",
                   "source_select"]) {
    const v = (ctx || {})[r];
    if (typeof v === "string" && v.includes(".") && !seen.includes(v)) seen.push(v);
  }
  return seen;
}
/* ---- THE CAST, v0.60 -------------------------------------------------
   A cast member is a DEVICE id (string) or a GROUP (object):

     "cast": [ "bar_sonos",
               { "group": "zones", "name": "Zones",
                 "icon": "material:speaker_group", "shows": "volume",
                 "members": ["bar_onkyo", "bar_onkyo_z2"] } ]

   Grouping is a PER-ACTIVITY composition decision, not a property of
   the device — the same two receivers can be tucked behind a card in
   one room and stand inline in another, with no duplicate devices.
   (v0.59 put `volume_zone` on the device and got this backwards; the
   question "what if another page wants them individually?" had no
   answer but 'clone the device', which is the tell.)

   A grouped device KEEPS ITS OTHER JOBS: the receiver can sit inside
   the Zones group and still be the activity's source_select. A group
   governs the presentation of the thing it draws, nothing else. */
/* PREVIEW-AS SHOWS THE ROLES' CAST (2026-09-05, feedback-1 — Suresh,
   designing a music controller: "the preview has Dining Fan,
   Receiver etc… extra devices in the cast. Hard coded. And additive
   to the controller. What we really want to do is restrict the
   preview cast to the ones with controller roles"). The extras are
   per-activity riders (the cast's "on controller" opt-ins) — real on
   the live surface, noise while DESIGNING the controller itself. So
   under the Studio's preview-as impersonation (S.pvActivity — and
   only there; live rendering never passes this gate) the cast
   narrows to members that fill a role in the activity's compiled
   context. */
function pvRoleEntities(act) {
  const out = {};
  const ctx = (act && act.context) || {};
  for (const k in ctx) {
    const v = ctx[k];
    if (typeof v === "string" && v.indexOf(".") > 0) out[v] = 1;
  }
  return out;
}
function pvFillsRole(m, wired) {
  if (typeof m === "string") {
    if (m.indexOf(".") > 0) return !!wired[m];     /* loose entity */
    const d = (CONFIG.devices || {})[m];           /* device id */
    const r = (d && d.roles) || {};
    for (const k in r) if (wired[r[k]]) return true;
    return false;
  }
  if (m && typeof m === "object" && m.group)
    return (m.members || []).some(x => pvFillsRole(x, wired));
  return false;
}
/* ONE gate for every cast-shaped list (2026-09-05 drift round —
   Suresh: "The spurious devices (Fan Receiver etc..) are still
   there. Lets get this done right. Once and for all"): the first
   pass filtered a.cast and a.devices but the RIDERS also flow
   through act.extra_devices (the speakers band's loose list, the
   where:"controls" promotions), which stayed raw. Every list of
   cast members / loose entities narrows HERE under roles-only
   preview-as; live rendering pays nothing. */
function pvFilterCast(act, list) {
  if (!S.pvActivity || !S.pvRolesOnly || !list || !list.length) return list || [];
  const wired = pvRoleEntities(act);
  return list.filter(m => pvFillsRole(m, wired));
}
function castMembers(act) {
  const all = Array.isArray(act && act.cast) ? act.cast : [];
  return pvFilterCast(act, all);
}
function castGroups(act) {
  return castMembers(act).filter(m => m && typeof m === "object" && m.group);
}
function castDeviceIds(act) {
  return castMembers(act).filter(m => typeof m === "string");
}
function groupedDeviceIds(act) {
  const out = [];
  castGroups(act).forEach(g => (g.members || []).forEach(m => {
    if (typeof m === "string" && out.indexOf(m) < 0) out.push(m);
  }));
  return out;
}
function castGroup(act, gid) {
  return castGroups(act).filter(g => g.group === gid)[0] || null;
}
/* which ROLE a Draws-as type binds to — DERIVED from the adapter
   registry (core/adapters.js, Phase 1), plus the one legacy alias:
   `stepper` survives as volume-drawn-as-stepper. Unknown types fall
   back to the launcher, which is always available and always correct. */
const SHOWS_ROLE = (function () {
  const m = { stepper: "volume" };
  for (const k in ADAPTERS) if (ADAPTERS[k].role) m[k] = ADAPTERS[k].role;
  return m;
})();
/* ---- PRESENTATION, PER MEMBER (v0.76 — Suresh: "put the device
   options in the device rows… display name, display icon, display
   mode, click to"). `act.present` is a keyed map — device id for cast
   members, entity id for loose entities:

     "present": { "bar_onkyo":  { "name": "Upper Amp",
                                  "icon": "material:speaker",
                                  "shows": "volume", "tap": "none" },
                  "media_player.onkyo_avr_basement": { "shows": "power" } }

   A map, not member objects, ON PURPOSE: every consumer of the cast —
   wiring, groups, regen, the Roles tab — keys by the id string, and a
   shape change there would touch twenty call sites to say one thing.
   `shows` moves the summary-vs-control line per MEMBER (the group's
   own `shows` survives as the members' default); `tap` says what a
   tap does: "" = the widget's smart default, "open" = the device's
   page, "none" = a pure readout. */
function presOf(act, key) {
  return (act && act.present && act.present[key]) || null;
}
/* fold one member's presentation into a generated tile. `ent` is the
   tile's own entity — the "open" trail's destination on control tiles
   (device tiles speak `tap` natively, widgets/device.js). */
function presApply(tile, p, ent) {
  if (!tile || !p) return tile;
  /* a STORED name always wins — including the intentional "" (v0.77.1,
     Suresh: "let me blank them via ⚙"): the Studio only persists an
     empty name when the user actively cleared a set one, so "" here
     means "no label", never "untouched" */
  if (typeof p.name === "string") tile.label = p.name;
  if (typeof p.sub === "string") tile.sub_text = p.sub;   /* "" = none */
  if (p.icon) tile.icon = p.icon;
  /* card_group rides into the generated tile (Phase 3) — the render
     walk merges same-group tiles of one section into one card */
  if (typeof p.card_group === "string" && p.card_group)
    tile.card_group = p.card_group;
  /* COMPAT (Wave C's first spelling): a variant on a device-typed
     present entry still dresses the launcher into its density —
     envelopes saved before the fan/cover adapters heal in the
     Studio, but the engine renders them right meanwhile. The dress
     pins the card chassis and span like every density tile. */
  if (tile.type === "device" && !tile.density &&
      (p.variant === "inline" || p.variant === "compact"))
    densityDress(tile, p.variant);
  if (p.tap === "none") { tile.tap = "none"; tile.trailing = false; }
  else if (p.tap === "open") {
    if (tile.type === "device") tile.tap = "open";
    else if (ent) tile.trailing = { icon: "material:chevron_right",
      action: { navigate: "detail:" + ent } };
  }
  return tile;
}
/* one tile for one member of a group, drawn as `shows` */
function groupChildTile(did, shows, idPrefix, pres) {
  /* DRAWS AS NOTHING (2026-09-06 — Suresh): the member is cast but
     draws no tile of its own; roles/keys/claims stay, aggregate
     bands still read it, this builder emits nothing */
  if (shows === "none") return null;
  const d = (CONFIG.devices || {})[did];
  /* LOOSE ENTITIES CAN GROUP TOO (v0.83.7 tidy-ups — his cast is raw
     media_players, and the group ticks had nothing to offer): a
     member id that IS an entity renders through the loose path — a
     control when its ⚙ says so, a device row otherwise. */
  if (!d && typeof did === "string" && did.includes(".")) {
    if (shows && shows !== "device")
      return looseShowTile(did, Object.assign({}, pres, { shows }), idPrefix);
    return presApply({
      type: "device",
      id: idPrefix + "_" + did.replace(/[^a-zA-Z0-9]+/g, "_"),
      entity: did, span: 2, brRow: false,
      label: st(did).a.friendly_name || did.split(".").pop().replace(/_/g, " "),
      icon: "material:devices"
    }, pres, did);
  }
  if (!d) return null;
  const roles = d.roles || {};
  const base = {
    id: idPrefix + "_" + did.replace(/[^a-zA-Z0-9]+/g, "_"),
    label: d.name || did,
    icon: d.icon || "material:devices",
    span: 2
  };
  const role = SHOWS_ROLE[shows];
  const ent = role ? roles[role] : null;
  /* THE SUMMARY-VS-CONTROL LINE (Suresh): a control that fits in a
     tile is drawn; anything needing more room becomes a launcher into
     that device's own controller, which is where complexity belongs.
     `device` is the default AND the universal fallback. */
  if (!ent) {
    const primary = roles.media_player || roles.volume || roles.power ||
      roles.source_select || roles.dpad || roles.commands;
    if (!primary) return null;
    return presApply(Object.assign(base, { type: "device", entity: primary }),
      pres, primary);
  }
  /* CONTROLS ARE CARDS (v0.76.4 — Suresh's screenshot: the Devices
     section is a columns-1 surface, so its tiles render as ROWS — and
     a volume widget crammed into the row chassis is a wreck. The
     volumes band always drew these as cards; brRow: false pins that
     shape wherever the control lands). The `device` fallback stays
     unstamped — launcher rows are right at home in a list. */
  /* ONE volume control, FOUR shapes (v0.83.7 — Suresh: "we have
     Volume Control and Volume Stepper in DRAWS AS. And we have
     Volume Style with overlapping choices"): Draws-as picks the
     CONTROL, Volume style picks the SHAPE — including stepper,
     which the old branch here silently ignored. shows: "stepper"
     survives as a legacy alias for volume + style stepper. */
  if (shows === "volume" || shows === "stepper") {
    const vstyle = shows === "stepper" ? "stepper" :
      resolveVariant(presVariant(pres), globalVariant("volume")) || "slider";
    /* a PROMOTED per-device control, never "the volume band" —
       exempt from the band-label override (v0.83.7: typing a band
       label renamed his promoted Receiver) */
    return presApply(vstyle === "stepper"
      ? Object.assign(base, { type: "stepper", kind: "volume",
          brRow: false, bandGen: 1, entity: ent,
          level_entity: roles.volume_level || ent })
      : Object.assign(base, { type: "volume", entity: ent,
          brRow: false, bandGen: 1,
          level_entity: roles.volume_level || ent,
          slider: vstyle === "slider" }),
      pres, ent);
  }
  /* generic control branch — through the canonical reader (Phase 2:
     a member drawn as Number/Select carries its variant and lands on
     the right widget; the six older types pass through untouched) */
  const gtile = Object.assign(base, { type: shows, brRow: false, entity: ent });
  if (pres && pres.variant) gtile.variant = pres.variant;
  return presApply(canonTile(gtile), pres, ent);
}
/* a LOOSE entity drawn as a control (v0.76): no device bundle to
   resolve roles from — the entity IS every role it needs */
function looseShowTile(ent, p, idPrefix) {
  if (presType(p) === "none") return null;   /* draws as Nothing — see groupChildTile */
  const dom0 = ent.split(".")[0];
  const base = {
    id: idPrefix + "_" + ent.replace(/[^a-zA-Z0-9]+/g, "_"),
    label: st(ent).a.friendly_name || ent.split(".").pop(),
    /* the domain's own glyph where the domain IS the control (the
       canvas: identity is the icon and status string only) */
    icon: dom0 === "fan" ? "material:mode_fan"
      : dom0 === "cover" ? "material:blinds"
      : dom0 === "switch" || dom0 === "input_boolean" ? "material:toggle_on"
      : dom0 === "lock" ? "material:lock"
      : dom0 === "button" || dom0 === "input_button" ? "material:radio_button_checked"
      : dom0 === "scene" ? "material:play_circle" : "material:devices",
    span: 2
  };
  const shows = presType(p);
  base.brRow = false;              /* controls are cards — see above */
  let tile;
  if (shows === "volume" || shows === "stepper") {
    /* style decides the shape here too (v0.83.7 unification) */
    /* the adapter's dflt (slider — v0.83.1 "default should be fat")
       closes the ladder here too; "compact" was a pre-ruling relic
       (2026-09-01 review: Onkyo chosen as stepper rendered compact
       whenever the variant write was lost — the FALLBACK was wrong) */
    const vstyle = shows === "stepper" ? "stepper" :
      resolveVariant(presVariant(p), globalVariant("volume")) || "slider";
    tile = vstyle === "stepper"
      ? Object.assign(base, { type: "stepper", kind: "volume",
          bandGen: 1, entity: ent, level_entity: ent })
      : Object.assign(base, { type: "volume", entity: ent, bandGen: 1,
          level_entity: ent, slider: vstyle === "slider" });
  }
  else {
    tile = Object.assign(base, { type: shows, entity: ent });
    if (p && p.variant) tile.variant = p.variant;
    tile = canonTile(tile);     /* Number/Select land on their widget */
  }
  return presApply(tile, p, ent);
}

/* ONE ORDERED CAST BAND — shared builders (2026-09-06, round 7 —
   Suresh: "Whatever the order is, in the tab, should be the order
   on the panel"). The group nav card and the promoted-member tiles
   used to belong to the groups band alone; the merged cast band
   (genVolumeTiles, when the screen carries both generators) emits
   them too, so the shapes live HERE, once. */
function castGroupNavTile(idPrefix, g) {
  const card = {
    type: "nav",
    id: idPrefix + "_" + String(g.group).replace(/[^a-zA-Z0-9]+/g, "_"),
    label: g.name || g.group,
    icon: g.icon || "material:widgets",
    style: g.style || "summary",
    target: g.target || ("group:" + g.group),
    hide_when_empty: true,
    span: 2
  };
  /* the authored status line (feedback-3 round 2): {count}/{active}
     substitute in the nav widget, "" = no line at all */
  if (typeof g.sub === "string") card.sub = g.sub;
  return card;
}
function castLoosePromoTile(idPrefix, ent, p) {
  if (!p || p.where !== "controls" || presType(p) === "none") return null;
  const shL = presType(p);
  return (shL && shL !== "device")
    ? looseShowTile(ent, p, idPrefix)
    : presApply({ type: "device",
        id: idPrefix + "_" + ent.replace(/[^a-zA-Z0-9]+/g, "_"),
        entity: ent, span: 2,
        label: st(ent).a.friendly_name || ent.split(".").pop(),
        icon: "material:devices" }, p, ent);
}
function castDevicePromoTile(idPrefix, did, p) {
  if (!p || p.where !== "controls" || presType(p) === "none") return null;
  const shD = presType(p);
  return groupChildTile(did,
    (shD && shD !== "device") ? shD : "device", idPrefix, p);
}

function castOf(aid) {
  const a = (CONFIG.activities || {})[aid];
  if (!a) return [];
  if (Array.isArray(a.devices) && a.devices.length)
    /* the compiled list narrows under roles-only preview-as too;
       castFromCtx is role-derived by construction */
    return pvFilterCast(a, a.devices);
  return castFromCtx(a.context);
}

/* A summary-style nav card's entities need subscribing (its sub shows
   live counts) — plain/image nav cards subscribe nothing. Derivation
   itself lives with the widget (navTargetEntities, widgets/nav.js). */
