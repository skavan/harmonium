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
const srfOff = (act, k) => !!(act && act.surface && act.surface[k] === false);

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
function castMembers(act) {
  return Array.isArray(act && act.cast) ? act.cast : [];
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
  const base = {
    id: idPrefix + "_" + ent.replace(/[^a-zA-Z0-9]+/g, "_"),
    label: st(ent).a.friendly_name || ent.split(".").pop(),
    icon: "material:devices",
    span: 2
  };
  const shows = presType(p);
  base.brRow = false;              /* controls are cards — see above */
  let tile;
  if (shows === "volume" || shows === "stepper") {
    /* style decides the shape here too (v0.83.7 unification) */
    const vstyle = shows === "stepper" ? "stepper" :
      resolveVariant(presVariant(p), globalVariant("volume")) || "compact";
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

function castOf(aid) {
  const a = (CONFIG.activities || {})[aid];
  if (!a) return [];
  if (Array.isArray(a.devices) && a.devices.length) return a.devices;
  return castFromCtx(a.context);
}

/* A summary-style nav card's entities need subscribing (its sub shows
   live counts) — plain/image nav cards subscribe nothing. Derivation
   itself lives with the widget (navTargetEntities, widgets/nav.js). */
