/* ================================================================
   CONTROLLER-BAND GENERATORS — the bands a controller renders for
   the RUNNING activity: the volumes cast, the activity's presets,
   the speaker-grouping card, and cast-group nav cards. Split out of
   core/generators.js (v0.83.11); expandTile (there) dispatches here,
   and the cast vocabulary lives in core/gen-cast.js.
   ================================================================ */
/* type: "volumes" */
function genVolumeTiles(t) {
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
    /* round 8 ("Honor the order in the Controller"): the round-7
       merged cast band is retired — bands stack per the Controller
       tab's order again, and this generator emits volume rows only */
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
       and stepper remain one declaration away. Phase 1: the rungs
       resolve through the NAMED ladder (core/adapters.js) — the
       generator tile's own choice, the activity surface default, the
       global/theme default, the adapter's built-in. Canonical
       spellings (`variant`, surface.volume_variant) read first;
       legacy (`style`, surface.volume_style) stay readable. */
    const dflt = resolveVariant(
      t.variant || t.style,
      surfaceVariant(act, "volume"),                 /* Controller tab default */
      globalVariant("volume")) || "slider";
    const out = [];
    const volRowFor = (did) => {
      const d = (CONFIG.devices || {})[did];
      if (!d) return null;
      const roles = d.roles || {};
      const ve = roles[role];
      if (!ve) return null;
      const o = dopts[ve] || {};
      if (o.volume === false) return null;
      /* THE BAND JOINS THE PRESENTATION SYSTEM (v0.77.1 — one member,
         one ⚙, every generated tile follows): name (member's, always
         — Suresh's call — with "" as the intentional no-label), icon,
         and STYLE, on the ladder present.style → device_options.
         volume_style → the generator tile's own → global. */
      const pv = presOf(act, did);
      /* rung 1: the member's own choice (canonical `variant`, legacy
         `style`), then the legacy device_options pin — read but never
         written anew (design decision: rung 1's legacy tail) */
      const style = resolveVariant(presVariant(pv), o.volume_style, dflt);
      const base = {
        id: t.id + "_" + did.replace(/[^a-zA-Z0-9]+/g, "_"),
        entity: ve,
        label: pv && typeof pv.name === "string" ? pv.name : (d.name || did),
        icon: (pv && pv.icon) || d.icon || "material:volume_up",
        span: 2
      };
      /* the band builds its tiles inline (not via presApply), so the
         member's card_group rides explicitly (Phase 3) */
      if (pv && typeof pv.card_group === "string" && pv.card_group)
        base.card_group = pv.card_group;
      /* WHICH TILE IS "THE VOLUME BAND" (v0.83.7 — Suresh: "the
         volume band is the row associated with the Volume Role"):
         the tile whose entity is the activity's WIRED volume takes
         the Controller-tab label override; every other cast volume
         is a per-device row and keeps its own name (bandGen —
         surfDressTile skips those). */
      if (ve !== (act.context || {}).volume) base.bandGen = 1;
      return style === "stepper"
        /* the ARC split rides the stepper too (Phase 0, entity-controls
           inconsistency #2): converting a volume to Stepper must not
           drop where the LEVEL actually lives */
        ? Object.assign(base, { type: "stepper", kind: "volume",
            level_entity: roles.volume_level || ve })
        : Object.assign(base, {
            type: "volume",
            level_entity: roles.volume_level || ve,
            slider: style === "slider"
          });
    };
    const ctxV0 = (act.context || {})[role];
    const wiredRow = () => {
      if (!(typeof ctxV0 === "string" && ctxV0.includes("."))) return null;
      const o2 = dopts[ctxV0] || {};
      if (o2.volume === false) return null;
      const pv2 = presOf(act, ctxV0);
      const style2 = resolveVariant(presVariant(pv2), o2.volume_style, dflt);
      const base2 = {
        id: t.id + "_" + ctxV0.replace(/[^a-zA-Z0-9]+/g, "_"),
        entity: ctxV0,
        label: pv2 && typeof pv2.name === "string" ? pv2.name
          : (st(ctxV0).a.friendly_name || ctxV0.split(".").pop()),
        icon: (pv2 && pv2.icon) || "material:volume_up",
        /* the wired volume itself — the band's one true tile,
           so the label override applies (no bandGen) */
        span: 2
      };
      if (pv2 && typeof pv2.card_group === "string" && pv2.card_group)
        base2.card_group = pv2.card_group;
      return style2 === "stepper"
        ? Object.assign(base2, { type: "stepper", kind: "volume",
            level_entity: (act.context || {}).volume_level || ctxV0 })
        : Object.assign(base2, { type: "volume",
            level_entity: (act.context || {}).volume_level || ctxV0,
            slider: style2 === "slider" });
    };
    castDeviceIds(act).forEach(did => {
      if (grouped.indexOf(did) >= 0) return;
      const v = volRowFor(did);
      if (v) out.push(v);
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
      const w = wiredRow();
      if (w) out.push(w);
    }
    return out;
}

/* type: "presets" */
function genActPresetTiles(t) {
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
    /* accent palette (identity-palette V1): the band tile's style
       is the children's default — a preset may override it, and its
       own `accent` slot rides the spread like every other key */
    return list.map((p, i) => Object.assign(
      { type: "preset", span: 2, activity: aid,
        accent_style: t.accent_style || t.identity_style }, p,
      { id: t.id + "_" + (p.id || i) }));
}

/* type: "speakers" */
function genSpeakerTiles(t) {
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
      (act && actSurface(act).speakers_group) || null;
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
      /* both loose lists ride the roles-only gate (2026-09-05 drift
         round): riders in extra_devices / a.devices otherwise kept
         sneaking into the speakers card under preview-as */
      const loose = [].concat(
        typeof cm === "string" ? [cm] : [],
        pvFilterCast(act, act.extra_devices || []),
        pvFilterCast(act, Array.isArray(act.devices) ? act.devices : []));
      loose.forEach(en => {
        if (typeof en === "string" && en.indexOf("media_player.") === 0 &&
            members.indexOf(en) < 0)
          members.push(en);
      });
    }
    if (srfOff(act, "speakers")) return [];   /* Controller tab: band off */
    if (members.length < 2) return [];
    const mode = t.mode ||
      (act && actSurface(act).speakers_mode) ||
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

/* type: "groups" */
function genGroupTiles(t) {
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
    /* ONE ORDER, ONE WALK (2026-09-05, feedback-3 round 3 — Suresh:
       "why can't I move the group like any other tile? I should be
       able to"). Round 2 pinned group cards last, which made them
       immovable by construction. The real fix is structural: the
       CAST is one ordered list — device ids, loose ENTITY ids
       (first-class members now; the Studio migrates extra_devices in
       on load), and group objects — and this band emits that list in
       order: each member's promoted control or nav card at the
       member's own position. Unmigrated configs keep their
       extra_devices promotions, trailing (the pre-migration read). */
    /* the builders live in gen-cast.js now (round 7) — one source
       for this generator AND the merged cast band */
    const gout = [];
    const presW = act.present || {};
    const groupedW = groupedDeviceIds(act);
    castMembers(act).forEach(m => {
      if (m && typeof m === "object" && m.group) {
        if (!groupsOff && (m.where || "controls") === "controls")
          gout.push(castGroupNavTile(t.id, m));
        return;
      }
      if (typeof m !== "string" || groupedW.indexOf(m) >= 0) return;
      const tl = m.indexOf(".") > 0
        ? castLoosePromoTile(t.id, m, presW[m])
        : castDevicePromoTile(t.id, m, presW[m]);
      if (tl) gout.push(tl);
    });
    /* LEGACY extra_devices (configs the Studio hasn't migrated):
       their promotions trail the cast, as they always rendered */
    pvFilterCast(act, act.extra_devices || []).forEach(ent => {
      if (groupedW.indexOf(ent) >= 0) return;
      const tl = castLoosePromoTile(t.id, ent, presW[ent]);
      if (tl) gout.push(tl);
    });
    return gout;
}
