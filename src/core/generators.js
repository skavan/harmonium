/* ================================================================
   TILE GENERATORS — config-declared, activity-aware

   expandTile turns one declared tile into zero-or-more real tiles,
   dispatching on t.type. The PAGE generators (activities, apps,
   keys, devices, presets_from) live here; the CONTROLLER-BAND
   generators (volumes, presets, speakers, groups) are in
   core/gen-bands.js; the shared cast vocabulary (castOf,
   castMembers, groupChildTile, presApply, srfOff…) is in
   core/gen-cast.js. Everything is one global scope — the build
   concatenates; build-engine.mjs is the file list's authority.
   ================================================================ */
function expandTile(t) {
  const gen = TILE_GENERATORS[t.type];
  return gen ? gen(t) : [t];
}
    /* NOTE: `sources` stopped being a generator in v0.35 — it's a plain
     tile now (widgets/sources.js) that opens the sources:<mp> detail.
     The v0.33 inline expansion (one preset per input) was clunky. */
const TILE_GENERATORS = {
  activities: genActivityTiles,
  apps: genAppTiles,
  keys: genKeyTiles,
  browse: (t) => genBrowse(t),        /* core/gen-browse.js */
  devices: genDeviceTiles,
  volumes: genVolumeTiles,            /* core/gen-bands.js from here… */
  presets: genActPresetTiles,
  speakers: genSpeakerTiles,
  groups: genGroupTiles,              /* …to here */
  presets_from: genPresetsFrom,
};

/* type: "activities" */
function genActivityTiles(t) {
    /* the activities section GENERATES from the registry: one tile
       per activity owned by this hub (t.room), in registry order.
       Room functions ("off") are hold-Power territory, not tiles. */
    return Object.entries(CONFIG.activities || {})
      .filter(([id, a]) => id !== "off" && (a.room_view || null) === (t.room || null))
      .map(([id, a]) => ({
        type: "activity", activity: id, id: t.id + "_" + id,
        label: a.name || id, icon: a.icon || "material:play_circle",
        color: a.color,          /* ACCENT tints the tile's ON state */
      }));
}

/* type: "apps" */
function genAppTiles(t) {
    /* one preset tile per app the resolved DIALECT offers (v0.46:
       app_class → dialect — a platform's whole vocabulary).
       Resolution: tile `dialect` (legacy `class`; literal or $context
       ref) → $context.dialect (legacy app_class) → the only dialect,
       when exactly one exists. Nothing resolves → empty drawer. */
    const ctx = ctxFor(S.screen);
    let clsId = t.dialect || t.class || ctx.dialect || ctx.app_class;
    if (typeof clsId === "string" && clsId.startsWith("$context."))
      clsId = ctx[clsId.slice(9)];
    const classes = CONFIG.dialects || CONFIG.app_classes || {};
    if (!clsId && Object.keys(classes).length === 1) clsId = Object.keys(classes)[0];
    const cls = classes[clsId];
    if (!cls) return [];
    const reg = CONFIG.apps || {};
    const entries = cls.apps || {};
    /* WAKE (v0.83.9 — Suresh: launching a FireTV app while the box
       is off/idle "actually does the app change but screen remains
       blank or screen saver. I find the back button works"): the
       DIALECT may declare a `wake` — "key:<id>" borrows an entry
       from its own keys catalog, anything else rides the classLaunch
       grammar. firePreset checks the player's state at TAP time and
       fires this first (then waits wake_delay ms, default 600)
       before the launch. No wake declared = exactly today. */
    let wkE = cls.wake;
    if (typeof wkE === "string" && wkE.startsWith("key:"))
      wkE = (cls.keys || {})[wkE.slice(4)];
    const wake = wkE != null ? classLaunch(wkE) : null;
    const wakeDelay = +cls.wake_delay > 0 ? +cls.wake_delay : 0;
    const ids = Array.isArray(t.include)
      ? t.include.filter((x) => entries[x] != null) : Object.keys(entries);
    return ids.map((aid) => {
      const e = entries[aid], meta = reg[aid] || {};
      const ov = typeof e === "object" && e !== null ? e : {};
      const action = classLaunch(e);
      const image = ov.image || meta.image;
      return action && {
        type: "preset", id: t.id + "_" + aid,
        /* cls "app" (v0.83.8 — "bigger tiles, text"): app launchers
           earn their own CSS size class via the chassis passthrough,
           so the drawer can grow without touching preset tiles at
           large (presets band, device keys) */
        cls: "app",
        ...(wake ? { wake, ...(wakeDelay ? { wakeDelay } : {}) } : {}),
        icon: ov.icon || meta.icon || "material:apps",
        ...(image ? { icon_image: image } : {}),
        label: ov.name || meta.name || aid,
        action,
      };
    }).filter(Boolean);
}

/* type: "keys" */
function genKeyTiles(t) {
    /* DEVICE KEYS (v0.46): one preset tile per key the active
       DIALECT's catalog declares — platform vocabulary as data
       (Suresh: one player, dialects supply the differences). Entries
       ride the classLaunch grammar exactly like apps. No dialect, no
       catalog, or commands unwired → nothing renders and the section
       skips itself (empty sections are dropped, heading included). */
    const ctx = ctxFor(S.screen);
    let dId = t.dialect || ctx.dialect || ctx.app_class;
    if (typeof dId === "string" && dId.startsWith("$context."))
      dId = ctx[dId.slice(9)];
    const dial = (CONFIG.dialects || CONFIG.app_classes || {})[dId];
    const entries = (dial && dial.keys) || {};
    return Object.keys(entries).map(kid => {
      const e = entries[kid] || {};
      const action = classLaunch(e);
      return action && {
        type: "preset", id: t.id + "_" + kid,
        entity: e.entity || "$context.commands",
        icon: e.icon || "material:radio_button_checked",
        label: e.name || kid,
        action,
      };
    }).filter(Boolean);
}

/* type: "devices" */
function genDeviceTiles(t) {
    /* the activity's CAST generates device tiles — primary first,
       always in sync with Setup (the Studio's "Unlink" bakes them
       into plain tiles when page-level art direction is wanted).
       remote.* entities are skipped: the control surface's Remote
       pad IS their tile — a stateless remote row is noise.
       A BARE generator (stock controllers): the cast comes from the
       ACTIVE activity only when that activity actually TARGETS this
       surface (music playing must not put a Sonos on the TV page);
       otherwise it derives from the screen's own default context.
       surface.devices === false (the per-activity "auto-populate
       devices" switch) suppresses it. */
    let castAid = t.activity || null;
    if (!castAid) {
      const cur = renderActivityId();
      const act = cur && (CONFIG.activities || {})[cur];
      if (act && act.screen === S.screen) {
        if (act.surface && act.surface.devices === false) return [];
        castAid = cur;
      }
    }
    /* CAST CURATION (v0.36): Setup's per-device visibility toggle —
       device_options[entity].tile === false keeps a cast member out
       of the Devices section (it stays wired to its roles) */
    const dopts = (castAid && ((CONFIG.activities || {})[castAid] || {}).device_options) || {};
    const ents = castAid ? castOf(castAid)
      : castFromCtx((screenOf(S.screen) || {}).context || {});
    /* the COMMANDS CHANNEL is plumbing, not a device (v0.46.3 —
       Suresh's screenshot: "Hisense Projector ADB · Off" as a tile is
       noise): skip the entity wired to commands unless it also plays
       media, or device_options forces it visible */
    const ctx2 = ctxFor(S.screen);
    const cmdEnt = typeof ctx2.commands === "string" ? ctx2.commands : null;
    /* THE INLINE PASS (v0.76): an UNGROUPED cast device whose
       presentation says `shows` draws AS that control right here — no
       group-of-one workaround. Its bundle entities collapse into the
       one control tile, emitted at the position of the first of them
       so the cast's order holds. Loose entities with a `shows` render
       the control on themselves. Everything else takes the classic
       device-tile path, with name/icon/tap overrides folded in. */
    const actP = castAid && (CONFIG.activities || {})[castAid];
    const presM = (actP && actP.present) || {};
    const inlineOf = {};
    /* a DEVICE-keyed presentation reaches the classic path through the
       device's entities — the tile is keyed by entity, the row the
       user configured by device id */
    const devPres = {};
    /* PROMOTED AWAY (v0.77): a member whose presentation says
       where: "controls" renders in the controls band (the groups
       generator) — its entities leave this section entirely */
    const skipW = {};
    if (actP) {
      const grouped2 = groupedDeviceIds(actP);
      castDeviceIds(actP).forEach(did => {
        if (grouped2.indexOf(did) >= 0) return;
        const p = presM[did];
        if (!p) return;
        const d = (CONFIG.devices || {})[did];
        if (!d) return;
        Object.values(d.roles || {}).forEach(e => {
          if (p.where === "controls") { skipW[e] = 1; return; }
          if (p.shows && p.shows !== "device") inlineOf[e] = did;
          else devPres[e] = p;
        });
      });
      (actP.extra_devices || []).forEach(ent => {
        const p = presM[ent];
        if (p && p.where === "controls") skipW[ent] = 1;
      });
    }
    const doneInline = {};
    /* a grouped LOOSE entity leaves this section for its group's
       page, same as a grouped device (v0.83.7 tidy-ups) */
    const groupedIds = actP ? groupedDeviceIds(actP) : [];
    return ents.filter(e => !skipW[e])
      .filter(e => groupedIds.indexOf(e) < 0)
      .filter(e => e.split(".")[0] !== "remote" || inlineOf[e])
      .filter(e => !(cmdEnt && e === cmdEnt && e !== ctx2.media_player &&
        !(dopts[e] && dopts[e].tile === true)))
      .filter(e => !(dopts[e] && dopts[e].tile === false)).map(e => {
      const did = inlineOf[e];
      if (did) {
        if (doneInline[did]) return null;      /* the bundle collapsed */
        doneInline[did] = 1;
        return groupChildTile(did, presM[did].shows, t.id, presM[did]);
      }
      if (presM[e] && presM[e].shows && presM[e].shows !== "device")
        return looseShowTile(e, presM[e], t.id);
      const s = st(e), dom = e.split(".")[0];
      return presApply({
        type: "device", id: t.id + "_" + e.replace(/[^a-zA-Z0-9]+/g, "_"),
        entity: e,
        label: s.a.friendly_name || e.split(".").pop(),
        icon: dom === "media_player"
            ? (s.a.device_class === "tv" ? "material:tv" : "material:speaker")
          : dom === "remote" ? "material:settings_remote"
          : dom === "light" ? "material:lightbulb"
          : dom === "climate" ? "material:thermostat"
          : dom === "switch" ? "material:toggle_on"
          : dom === "fan" ? "material:mode_fan"
          : "material:devices",
      }, presM[e] || devPres[e], e);
    }).filter(Boolean)
      /* DEMOTED GROUPS (v0.77): where: "devices" sends a group's nav
         card down here, after the device tiles */
      .concat(!actP ? [] : castGroups(actP)
        .filter(g => g.where === "devices")
        .map(g => ({
          type: "nav",
          id: t.id + "_g_" + String(g.group).replace(/[^a-zA-Z0-9]+/g, "_"),
          label: g.name || g.group,
          icon: g.icon || "material:widgets",
          style: g.style || "summary",
          target: g.target || ("group:" + g.group),
          hide_when_empty: true,
          span: 2
        })));
}

/* type: "presets_from" */
function genPresetsFrom(t) {
  const list = st(resolveEntity(t.entity)).a[t.attribute || "items"];
  if (!Array.isArray(list)) return [];
  return list.slice(0, t.limit || 48).map((item, i) => {
    const g = Object.assign({ type: "preset" }, substItem(t.item || {}, item));
    g.id = t.id + "_" + i;
    if (t.action) g.action = substItem(t.action, item);
    if (g.icon_image == null) delete g.icon_image;   // fall back to g.icon
    return g;
  });
}
