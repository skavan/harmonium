/* ================================================================
   TILE GENERATORS — config-declared, activity-aware

   expandTile turns one declared tile into zero-or-more real tiles:
   `activities`, `apps`, `keys`, `browse` (core/gen-browse.js),
   `devices`, `volumes`, `presets`, `groups`, and `presets_from`.
   Generators read the ACTIVITY (cast, presets, groups) so shared
   surfaces stay generic — a room with nothing to show renders
   nothing, header and all. The cast helpers at the bottom are the
   shared vocabulary (castOf, castMembers, groupChildTile…).
   ================================================================ */
function expandTile(t) {
  if (t.type === "activities") {
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
  if (t.type === "apps") {
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
        icon: ov.icon || meta.icon || "material:apps",
        ...(image ? { icon_image: image } : {}),
        label: ov.name || meta.name || aid,
        action,
      };
    }).filter(Boolean);
  }
  if (t.type === "keys") {
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
  }  if (t.type === "browse") return genBrowse(t);
    /* NOTE: `sources` stopped being a generator in v0.35 — it's a plain
     tile now (widgets/sources.js) that opens the sources:<mp> detail.
     The v0.33 inline expansion (one preset per input) was clunky. */
  if (t.type === "devices") {
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
/* THE CONTROLLER TAB'S BAND SWITCHES (v0.83.7 — Suresh: "What if
   I don't want to control multiple players. What if I do."): every
   band the activity's controller renders is a per-activity switch,
   stored on a.surface (the same home surface.devices has used since
   v0.48). Absent = Auto (today's behavior); false = off. The shared
   surface stays shared; the preference travels with the activity. */
const srfOff = (act, k) => !!(act && act.surface && act.surface[k] === false);
  if (t.type === "volumes") {
    /* VOLUME CAST (v0.57 — Suresh: "there might be 8 volumes; think of
       them as device tiles with a volume role"). One control per CAST
       device that declares roles.volume. Label and icon come from the
       DEVICE registry, so the shared controller stays generic and each
       house names its own zones — no volume_2/volume_3 slots, no
       per-room controller fork. Treatment follows global.style.volume
       ("compact" | "slider" | "stepper"), overridable on the generator
       tile and per device via device_options[entity].volume_style. */
    /* v0.57.1: bind to the RUNNING activity, NOT to "the activity whose
       screen I am standing on". The old test (act.screen === S.screen)
       meant the generator produced nothing anywhere except the
       activity's own controller — so a zones view reached by nav came
       up empty, and a nav summary could not expand it either. */
    let aid = t.activity && t.activity !== "$current" ? t.activity : null;
    if (!aid) {
      const cur = renderActivityId();
      if (cur && (CONFIG.activities || {})[cur]) aid = cur;
    }
    const act = aid && (CONFIG.activities || {})[aid];
    if (!act) return [];
    if (srfOff(act, "volume")) return [];   /* Controller tab: band off */
    /* WHICH ROLE THIS INSTANCE DRAWS (v0.59 — Suresh: "it's not
       intuitive right now"). Was: infer the master from the activity
       wiring and call everything else "the rest". Nothing declared it,
       so nothing could show it or set it — zones were invisible.
       Now the DEVICE says which it is:
         roles.volume       -> a control on the controller (the master)
         roles.volume_zone  -> a room this feeds, behind the Zones card
       One word per device, visible in the Studio's role table. */
    const role = t.role || "volume";
    /* a device inside a group is drawn on the GROUP's page, not here */
    const grouped = groupedDeviceIds(act);
    const dopts = act.device_options || {};
    /* fat by default (v0.83.1 — statusreview: "default should be fat"):
       the slider treatment is the default volume everywhere; compact
       and stepper remain one declaration away */
    const dflt = t.style ||
      (act.surface && act.surface.volume_style) ||   /* Controller tab default */
      ((CONFIG.global || {}).style || {}).volume || "slider";
    const out = [];
    castDeviceIds(act).forEach(did => {
      if (grouped.indexOf(did) >= 0) return;
      const d = (CONFIG.devices || {})[did];
      if (!d) return;
      const roles = d.roles || {};
      const ve = roles[role];
      if (!ve) return;
      const o = dopts[ve] || {};
      if (o.volume === false) return;
      /* THE BAND JOINS THE PRESENTATION SYSTEM (v0.77.1 — one member,
         one ⚙, every generated tile follows): name (member's, always
         — Suresh's call — with "" as the intentional no-label), icon,
         and STYLE, on the ladder present.style → device_options.
         volume_style → the generator tile's own → global. */
      const pv = presOf(act, did);
      const style = (pv && pv.style) || o.volume_style || dflt;
      const base = {
        id: t.id + "_" + did.replace(/[^a-zA-Z0-9]+/g, "_"),
        entity: ve,
        label: pv && typeof pv.name === "string" ? pv.name : (d.name || did),
        icon: (pv && pv.icon) || d.icon || "material:volume_up",
        span: 2
      };
      /* WHICH TILE IS "THE VOLUME BAND" (v0.83.7 — Suresh: "the
         volume band is the row associated with the Volume Role"):
         the tile whose entity is the activity's WIRED volume takes
         the Controller-tab label override; every other cast volume
         is a per-device row and keeps its own name (bandGen —
         surfDressTile skips those). */
      if (ve !== (act.context || {}).volume) base.bandGen = 1;
      out.push(style === "stepper"
        ? Object.assign(base, { type: "stepper", kind: "volume" })
        : Object.assign(base, {
            type: "volume",
            level_entity: roles.volume_level || ve,
            slider: style === "slider"
          }));
    });
    /* THE LOOSE VOLUME (v0.76.5 — Suresh: "On Listen to Music there
       is no volume control on the controller, even though volume is
       an assigned role"). The generator only knew CAST DEVICES
       claiming roles.volume — an activity whose volume wiring points
       at a RAW ENTITY (the legacy / loose shape) rendered nothing,
       while its sibling with a pre-wired Sonos got the slider. If no
       cast device supplied the control, the wired entity itself is
       the control. */
    if (!out.length) {
      const ctxV = (act.context || {})[role];
      if (typeof ctxV === "string" && ctxV.includes(".")) {
        const o2 = dopts[ctxV] || {};
        if (o2.volume !== false) {
          const pv2 = presOf(act, ctxV);
          const style2 = (pv2 && pv2.style) || o2.volume_style || dflt;
          const base2 = {
            id: t.id + "_" + ctxV.replace(/[^a-zA-Z0-9]+/g, "_"),
            entity: ctxV,
            label: pv2 && typeof pv2.name === "string" ? pv2.name
              : (st(ctxV).a.friendly_name || ctxV.split(".").pop()),
            icon: (pv2 && pv2.icon) || "material:volume_up",
            /* the wired volume itself — the band's one true tile,
               so the label override applies (no bandGen) */
            span: 2
          };
          out.push(style2 === "stepper"
            ? Object.assign(base2, { type: "stepper", kind: "volume" })
            : Object.assign(base2, { type: "volume",
                level_entity: (act.context || {}).volume_level || ctxV,
                slider: style2 === "slider" }));
        }
      }
    }
    return out;
  }
  if (t.type === "presets") {
    /* THE ACTIVITY'S OWN SHORTCUTS (v0.64 — Suresh: "these presets
       shouldn't be hardcoded in the stock controller. The logical
       place to define presets is in the Listen to Sonos activity
       isn't it? What if I wanted a preset to play CoffeeHouse
       Radio?"). Quite so. v0.63 put two on the SHARED music
       controller and scoped them with `when` — which works, and is
       the wrong layer: content that belongs to one activity was
       living in the surface every activity shares.

       So presets join the cast, its groups and its volumes as things
       the ACTIVITY owns, and the controller carries one generator
       that never names them. A room with no activity presets renders
       nothing here, header and all. */
    let aid = t.activity && t.activity !== "$current" ? t.activity : null;
    if (!aid) {
      const cur = renderActivityId();
      if (cur && (CONFIG.activities || {})[cur]) aid = cur;
    }
    const act = aid && (CONFIG.activities || {})[aid];
    if (!act || !Array.isArray(act.presets)) return [];
    if (srfOff(act, "presets")) return [];   /* Controller tab: band off */
    /* `include: [ids]` narrows to a subset, in the order given —
       v0.68.5, and note it is not a new idea: the `apps` generator has
       taken exactly this option since v0.46. One activity's presets can
       now appear on two surfaces with different subsets: the three
       music shortcuts on the room page, the whole set (those plus the
       Pool grouping pair) on the player. */
    let list = act.presets;
    if (Array.isArray(t.include) && t.include.length) {
      const by = {};
      list.forEach(p => { if (p && p.id) by[p.id] = p; });
      list = t.include.map(id => by[id]).filter(Boolean);
    }
    /* STAMP THE OWNING ACTIVITY (v0.68.6 — Suresh: "isn't this what
       this section is for? It should turn on listen to sonos activity
       and then launch the playlist?").

       It is, and the engine has agreed since v0.12: firePreset reads
       `t.activity` and, if that activity is not running, starts it,
       polls the select until it confirms, THEN fires the action —
       "Harmony-favorite behaviour", in its own words. Hand-written
       preset tiles have always carried `activity` and always got this.

       The v0.64 GENERATOR never passed it on. It knows `aid` — it just
       looked the presets up with it — and then emitted tiles without
       it, so every generated preset silently lost the warm-start the
       chassis was ready to give it. One word, and the three guarded
       start-then-play sequences I hand-rolled in v0.68.5 become
       unnecessary: the engine was already doing it.

       In the defaults, not forced, so a preset may still name a
       different activity than the one it is listed under. */
    return list.map((p, i) => Object.assign(
      { type: "preset", span: 2, activity: aid }, p,
      { id: t.id + "_" + (p.id || i) }));
  }
  if (t.type === "speakers") {
    /* SPEAKER GROUPING (v0.83.7 — beta-gaps §3, P1 #4): expand to
       ONE grouping card. Members come from the tile's own
       `entities` list when authored, else from the RUNNING
       activity's cast — every device with a media_player claim.
       Fewer than two players = nothing to group = no card, which is
       what lets this ride the stock controller without ceremony. */
    /* SPEAKER GROUPS (v0.83.7 — Suresh: "the receiver is a
       media_player but its only job is to be an amplifier.
       Conversely there are many ma media players that I might want
       to add"): a NAMED, workspace-level collection —
       CONFIG.speaker_groups.<id> = { name, entities } — independent
       of any cast. The tile (or the activity's Controller tab, via
       surface.speakers_group) points at one, and the card offers
       THOSE players instead of the cast. Two card modes: "launcher"
       (a slim count tile — "5 available · 2 linked" — opening the
       generated spkgrp: screen with per-player sliders, so levels
       get trimmed BEFORE linking) or "inline" (the full card in
       place, today's shape). Group-fed tiles default to launcher;
       cast-fed keep inline — zero change to deployed configs. */
    let aid = t.activity && t.activity !== "$current" ? t.activity : null;
    if (!aid) {
      const cur = renderActivityId();
      if (cur && (CONFIG.activities || {})[cur]) aid = cur;
    }
    const act = aid && (CONFIG.activities || {})[aid];
    const gid = t.group ||
      (act && act.surface && act.surface.speakers_group) || null;
    const grp = gid && (CONFIG.speaker_groups || {})[gid];
    const labels = {};
    let members = [];
    if (grp) {
      members = (grp.entities || []).filter(en =>
        typeof en === "string" && en.indexOf(".") > 0);
    } else if (Array.isArray(t.entities) && t.entities.length) {
      members = t.entities.slice();
    } else if (act) {
      castDeviceIds(act).forEach(did => {
        const d = (CONFIG.devices || {})[did];
        if (!d) return;
        const mp = (d.roles || {}).media_player;
        if (!mp || members.indexOf(mp) >= 0) return;
        members.push(mp);
        labels[mp] = d.name || did;
      });
      /* LOOSE ENTITIES COUNT TOO (v0.83.7 — Suresh's Listen to
         Music casts two raw media_players, no pre-wired devices,
         and the card never appeared): the wired media_player, the
         extra_devices, and the legacy a.devices array all
         contribute their media_player.* entries. Names come live
         from friendly_name at render time. */
      const cm = act.context && act.context.media_player;
      const loose = [].concat(
        typeof cm === "string" ? [cm] : [],
        act.extra_devices || [],
        Array.isArray(act.devices) ? act.devices : []);
      loose.forEach(en => {
        if (typeof en === "string" && en.indexOf("media_player.") === 0 &&
            members.indexOf(en) < 0)
          members.push(en);
      });
    }
    if (srfOff(act, "speakers")) return [];   /* Controller tab: band off */
    if (members.length < 2) return [];
    const mode = t.mode ||
      (act && act.surface && act.surface.speakers_mode) ||
      (grp ? "launcher" : "inline");
    /* with no activity in play (a group tile on a plain hub) the
       entity stays ABSENT — an unwired $context hides the tile in
       visibleTile, and the card's fallback chain picks the master */
    const ent = t.entity || (act ? "$context.media_player" : undefined);
    if (mode === "launcher" && grp) return [{
      id: t.id, type: "grouplaunch", group: gid,
      entity: ent,
      entities: members,
      label: t.label || grp.name || gid,
      icon: t.icon || "material:speaker_group",
      span: 2
    }];
    return [{
      id: t.id, type: "grouping",
      entity: ent,
      entities: members,
      labels: t.labels || labels,
      label: t.label || (grp && (grp.name || gid)) || "Speakers",
      icon: t.icon || "material:speaker_group",
      span: 2
    }];
  }
  if (t.type === "groups") {
    /* One nav card per group in the running activity's cast. The
       controller says "render this activity's groups" and never names
       one, so the SHARED surfaces stay generic: a room with no groups
       renders nothing here. Same doctrine as always — groups are
       views, and the tile that points at one is a nav card. */
    let aid = t.activity && t.activity !== "$current" ? t.activity : null;
    if (!aid) {
      const cur = renderActivityId();
      if (cur && (CONFIG.activities || {})[cur]) aid = cur;
    }
    const act = aid && (CONFIG.activities || {})[aid];
    if (!act) return [];
    /* Controller tab: the Cast-group cards switch gates the NAV
       CARDS only (tidy-ups: "toggling that off, turns off the
       device I promoted into the controller" — a promoted control
       is not a group card; it merely shares this generator) */
    const groupsOff = srfOff(act, "groups");
    /* WHERE THINGS LIVE (v0.77 — Suresh: "When I create a group, it
       appears directly under the Volume Control. When I create a
       loose device, it appears in DEVICES. We should either (a) be
       consistent or (b) give optionality!"). Both: the DEFAULTS stay
       exactly as they were — groups here in the controls band,
       devices down in the Devices section — and one word flips
       either. `where: "devices"` on a group sends its nav card down;
       `where: "controls"` in a member's presentation promotes its
       tile up here, beside the group cards. */
    const gout = (groupsOff ? [] : castGroups(act)
      .filter(g => (g.where || "controls") === "controls"))
      .map(g => ({
      type: "nav",
      id: t.id + "_" + String(g.group).replace(/[^a-zA-Z0-9]+/g, "_"),
      label: g.name || g.group,
      icon: g.icon || "material:widgets",
      style: g.style || "summary",
      /* no target -> the generated page; target -> the author's own */
      target: g.target || ("group:" + g.group),
      hide_when_empty: true,
      span: 2
    }));
    const presW = act.present || {};
    const groupedW = groupedDeviceIds(act);
    castDeviceIds(act).forEach(did => {
      if (groupedW.indexOf(did) >= 0) return;
      const p = presW[did];
      if (!p || p.where !== "controls") return;
      const tl = groupChildTile(did,
        (p.shows && p.shows !== "device") ? p.shows : "device", t.id, p);
      if (tl) gout.push(tl);
    });
    (act.extra_devices || []).forEach(ent => {
      const p = presW[ent];
      if (!p || p.where !== "controls") return;
      const tl = (p.shows && p.shows !== "device")
        ? looseShowTile(ent, p, t.id)
        : presApply({ type: "device",
            id: t.id + "_" + ent.replace(/[^a-zA-Z0-9]+/g, "_"),
            entity: ent, span: 2,
            label: st(ent).a.friendly_name || ent.split(".").pop(),
            icon: "material:devices" }, p, ent);
      if (tl) gout.push(tl);
    });
    return gout;
  }
  if (t.type !== "presets_from") return [t];
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
/* which ROLE a `shows` type binds to. Unknown types fall back to the
   launcher, which is always available and always correct. */
const SHOWS_ROLE = {
  volume: "volume", stepper: "volume", power: "power",
  media: "media_player", transport: "media_player", sources: "source_select"
};
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
      ((pres && pres.style) ||
        ((CONFIG.global || {}).style || {}).volume || "slider");
    /* a PROMOTED per-device control, never "the volume band" —
       exempt from the band-label override (v0.83.7: typing a band
       label renamed his promoted Receiver) */
    return presApply(vstyle === "stepper"
      ? Object.assign(base, { type: "stepper", kind: "volume",
          brRow: false, bandGen: 1, entity: ent })
      : Object.assign(base, { type: "volume", entity: ent,
          brRow: false, bandGen: 1,
          level_entity: roles.volume_level || ent,
          slider: vstyle === "slider" }),
      pres, ent);
  }
  return presApply(Object.assign(base, { type: shows, brRow: false,
    entity: ent }), pres, ent);
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
  const shows = p.shows;
  base.brRow = false;              /* controls are cards — see above */
  let tile;
  if (shows === "volume" || shows === "stepper") {
    /* style decides the shape here too (v0.83.7 unification) */
    const vstyle = shows === "stepper" ? "stepper" :
      ((p && p.style) ||
        ((CONFIG.global || {}).style || {}).volume || "compact");
    tile = vstyle === "stepper"
      ? Object.assign(base, { type: "stepper", kind: "volume",
          bandGen: 1, entity: ent })
      : Object.assign(base, { type: "volume", entity: ent, bandGen: 1,
          level_entity: ent, slider: vstyle === "slider" });
  }
  else tile = Object.assign(base, { type: shows, entity: ent });
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
