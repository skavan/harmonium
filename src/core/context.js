/* ================================================================
   Context: screen context overlaid by the ACTIVE activity's context
   (activity read live from the state of global.activity_select).
   ================================================================ */
function currentActivityId() {
  /* PREVIEW IMPERSONATION (v0.46.1): the Studio names the activity
     being EDITED — the preview then renders the player exactly as
     that activity will see it (cast, dialect keys, apps), instead of
     whatever the live select happens to hold. Preview-only. */
  if (S.pvActivity && (CONFIG.activities || {})[S.pvActivity]) return S.pvActivity;
  const sel = CONFIG.global.activity_select;
  if (sel) {
    const v = st(sel).s;
    for (const [id, a] of Object.entries(CONFIG.activities || {}))
      if ((a.state_value || id) === v) return id === "off" ? null : id;
  }
  /* PENDING IMPERSONATION (v0.48 — Suresh: "I should never see that
     page. It should always fill in"): the select doesn't (yet, or at
     all) confirm an activity, but the user TAPPED one — render the
     player AS that activity anyway. Its tiles show the devices' true
     (off) state; only tile TRUTH (isActivityActive) stays with the
     select/device rules. Cleared naturally: the select confirming any
     activity wins above, and the next tap overwrites. */
  if (S.pendingActivity && (CONFIG.activities || {})[S.pendingActivity])
    return S.pendingActivity;
  return null;
}
function ctxFor(screenId) {
  const scCtx = (screenOf(screenId) || {}).context || {};
  const aid = currentActivityId();
  const aCtx = aid ? (CONFIG.activities[aid].context || {}) : {};
  return Object.assign({}, scCtx, aCtx);
}
function resolveEntity(ref, screenId) {
  if (!ref || typeof ref !== "string" || !ref.startsWith("$context.")) return ref;
  const v = ctxFor(screenId || S.screen)[ref.slice(9)];
  return typeof v === "string" ? v : null;
}

/* Per-entity display options from config.entity_options —
   e.g. { "cover.x": { invert_position: true } }. Display-layer only;
   services are never inverted. */
function entOpt(e, key) {
  const o = (CONFIG && CONFIG.entity_options) || {};
  return o[e] ? o[e][key] : undefined;
}

/* ---- Screen classes (v0.11 key-policy taxonomy) -------------------
   Physical keys carry a POLICY PER PAGE CLASS, not one behavior:
     room     — Home→system home · Power→All Off (confirm)
     group    — Home→parent room · Power→page devices off/on (confirm)
     detail   — Home→parent room · Power→device toggle (immediate)
     activity — Home→parent room · Power→end activity (confirm)
   Explicit `class` in config wins; otherwise inferred. `parent` names
   the screen Home laddering climbs to (multi-room proof). */
function classOf(sc, id) {
  if (sc.class) return sc.class;
  if (typeof id === "string" && id.startsWith("detail:")) return "detail";
  if (sc.dpad_passthrough) return "activity";
  if (id === (CONFIG && CONFIG.home_screen) || sc.banner) return "room";
  return "group";
}
/* group-power scope: switchable device entities on the page */
const POWER_DOMAINS = new Set(["light", "switch", "fan", "climate", "media_player"]);
function powerEntities(sc) {
  const set = new Set();
  tilesOf(sc).forEach(t => {
    const e = resolveEntity(t.entity);
    if (e && POWER_DOMAINS.has(e.split(".")[0])) set.add(e);
  });
  return [...set];
}

/* Capability-based tile visibility: tile.only / tile.unless name
   capabilities from the active device profile (string or array). */
function visibleTile(t) {
  const arr = v => Array.isArray(v) ? v : [v];
  /* a context-bound tile whose role is UNWIRED here hides itself —
     the Volume 2 tile only appears when the activity wires volume_2 */
  if (typeof t.entity === "string" && t.entity.startsWith("$context.") &&
      !resolveEntity(t.entity)) return false;
  if (t.only && !arr(t.only).every(c => CAPS.has(c))) return false;
  if (t.unless && arr(t.unless).some(c => CAPS.has(c))) return false;
  /* per-activity content overrides on a SHARED controller: one Watch
     TV page, many activities — tiles opt in/out declaratively.
       when: { activity: watch_smart }        show only then
       when: { not_activity: [watch_smart] }  hide then
     Re-render rides tileSig: the filtered set changes with the
     activity, so the grid refreshes on activity switches. */
  if (t.when) {
    const cur = currentActivityId();
    if (t.when.activity && !arr(t.when.activity).includes(cur)) return false;
    if (t.when.not_activity && arr(t.when.not_activity).includes(cur)) return false;
  }
  return true;
}

/* ---- $item expansion ----------------------------------------------
   A "presets_from" tile generates one preset tile per element of an
   entity's LIST attribute — the chips move at tile scale: content read
   live from an entity HA owns, riding the normal subscription.
   "$item.<field>" is the only substitution (whole-string values, any
   depth), the per-row sibling of "$context.<slot>". */
function substItem(v, item) {
  if (typeof v === "string" && v.startsWith("$item.")) {
    const x = item[v.slice(6)];
    return x === undefined ? null : x;
  }
  if (Array.isArray(v)) return v.map(x => substItem(x, item));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = substItem(x, item);
    return o;
  }
  return v;
}
/* APP CLASSES (v0.30): the master list is IDENTITY (name/icon/image);
   a device class is the platform's launch dialect — its entry per app
   IS the curation (listed = offered). Entry forms:
     source: X            → select_source on $context.media_player
     action/target/data   → any HA-style action (default entity: ctx mp)
     sequence: <id>       → run a named Action
   (+ optional name/icon/image overrides riding the entry). */
function classLaunch(e) {
  if (e == null) return null;
  if (typeof e === "string")
    return e.startsWith("sequence:")
      ? { service: "harmonium.run", data: { sequence: e.slice(9) } }
      : { service: "media_player.select_source",
          entity: "$context.media_player", data: { source: e } };
  if (e.sequence) return { service: "harmonium.run", data: { sequence: e.sequence } };
  if (e.source) return { service: "media_player.select_source",
    entity: "$context.media_player", data: { source: e.source } };
  if (e.service) return e;
  if (e.action) return { service: e.action, data: e.data,
    entity: (e.target && e.target.entity_id) || e.entity || "$context.media_player" };
  return null;
}

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
  }
  if (t.type === "browse") {
    /* THE STANDARD LIBRARY, THREE BANDS (v0.50 — see core/browse.js).
       Returns only the GRID (items); bands render in #brbar via
       browseBar(). Unwired player → nothing (the empty-page hint
       explains). Player changes reset everything. */
    const mp = resolveEntity(t.entity || "$context.media_player");
    if (!mp) { S.browse.ui = null; return []; }
    if (S.browse.mp !== mp) {
      S.browse.mp = mp;
      S.browse.root = S.browse.cat = null; S.browse.sub = [];
    }
    const B = S.browse;
    B._active = true;
    const loading = [{ type: "preset", id: t.id + "_ld", span: 2, brw: true,
      icon: "material:hourglass_empty", label: "Loading library…", action: {} }];
    const L0 = B.nodes[browseKey(mp, null)];
    if (!L0) { B.ui = null; browseFetch(mp, null); return loading; }
    /* ROOT CURATION (v0.49.1, a setting not a hardcode): HA's
       media-source:// plumbing hides by default (`media_sources:
       true` keeps it); `include: [titles]` narrows — advisory. */
    let roots = L0.children;
    if (!t.media_sources)
      roots = roots.filter(c =>
        !String(c.media_content_id || "").startsWith("media-source://"));
    if (Array.isArray(t.include) && t.include.length) {
      const want = t.include.map(x => String(x).toLowerCase());
      const m = roots.filter(c =>
        want.includes(String(c.title || "").toLowerCase()));
      if (m.length) roots = m;
    }
    if (!roots.length) {
      B.ui = null;
      return [{ type: "preset", id: t.id + "_err", span: 2, brw: true,
        icon: "material:error_outline",
        label: L0.error || "Nothing to browse on this player", action: {} }];
    }
    const mkItems = (node, out) => {
      if (node.error)
        out.push({ type: "preset", id: t.id + "_err", span: 2, brw: true,
          icon: "material:error_outline", label: node.error, action: {} });
      node.children.forEach((c, i) => {
        const play = {
          service: "media_player.play_media", target: mp,
          data: { media_content_id: c.media_content_id,
                  media_content_type: c.media_content_type },
        };
        out.push({
          type: "preset", id: t.id + "_" + i, label: c.title, brw: true,
          icon: BROWSE_ICON[c.media_class] || "material:library_music",
          ...(c._thumb ? { icon_image: c._thumb, icontain: true } : {}),
          action: c.can_expand
            ? { browse: { id: c.media_content_id, type: c.media_content_type,
                          title: c.title } }
            : play,
          ...(c.can_expand && c.can_play
            ? { trailing: { icon: "material:play_arrow", action: play } } : {}),
        });
      });
      if (!node.children.length && !node.error)
        out.push({ type: "preset", id: t.id + "_mt", span: 2, brw: true,
          icon: "material:music_off", label: "Nothing here", action: {} });
      return out;
    };
    /* FAVORITES PROMOTION (v0.50.3 — Suresh: "promote the Show
       Favorites so MA exactly mirrors the Sonos style"): MA's browse
       tree has NO favorites filter, but the integration's sensors
       (sensor.harmonium_music_<cat>, hourly favorite=True lists) DO —
       a FLAT tree with populated sensors synthesizes the Sonos shape:
       ⭐ Favorites (sensor-fed, the DEFAULT root) + Music Library
       (the real tree as chips). Returns an ARRAY of final tiles, or
       a NODE for the common grid tail, or null when ineligible. */
    const favList = () => [["Playlists", "playlists"], ["Artists", "artists"],
      ["Albums", "albums"], ["Tracks", "tracks"], ["Radio", "radio"]]
      .map(([lbl, k]) => ({ lbl, k,
        items: (st("sensor.harmonium_music_" + k).a || {}).items || [] }))
      .filter(x => x.items.length);
    const synth = (fc) => {
      const SROOTS = [
        { title: "Favorites", media_content_id: "__fav",
          media_content_type: "__synth", media_class: "fav_root",
          can_expand: true, can_play: false },
        { title: "Music Library", media_content_id: "__lib",
          media_content_type: "__synth", media_class: "lib_root",
          can_expand: true, can_play: false },
      ];
      const selS = SROOTS.find(c => brSame(c, B.root)) || SROOTS[0];
      B.root = brRef(selS);
      if (B.root.id === "__fav") {
        const cats = fc.map(x => ({ title: x.lbl,
          media_content_id: "__fav:" + x.k, media_content_type: "__synth",
          media_class: "directory", can_expand: true, can_play: false }));
        const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
        B.cat = brRef(selCat);
        B.ui = { roots: SROOTS, cats };
        const fav = fc.find(x => "__fav:" + x.k === B.cat.id) || fc[0];
        const FICON = { playlists: "material:queue_music",
          artists: "material:person", albums: "material:album",
          tracks: "material:music_note", radio: "material:radio" };
        return fav.items.map((it, i) => ({
          type: "preset", id: t.id + "_" + i, label: it.name, brw: true,
          icon: FICON[fav.k] || "material:library_music",
          ...(it.image ? { icon_image: it.image } : {}),
          action: { service: "media_player.play_media", target: mp,
            data: { media_content_id: it.uri,
                    media_content_type: it.media_type } },
        }));
      }
      /* __lib: the real tree's top level becomes the chips */
      const selCat = roots.find(c => brSame(c, B.cat)) || roots[0];
      B.cat = brRef(selCat);
      B.ui = { roots: SROOTS, cats: roots };
      const L2 = B.nodes[browseKey(mp, B.cat)];
      if (!L2) { browseFetch(mp, B.cat); return loading; }
      return L2;
    };
    let gridNode = null;
    /* a sticky __synth selection must not be stomped by the tree
       defaulting below — re-enter synthetic mode directly */
    if (B.root && B.root.type === "__synth") {
      const fc = favList();
      if (fc.length) {
        const r = synth(fc);
        if (Array.isArray(r)) return r;
        gridNode = r;
      } else { B.root = B.cat = null; }   /* sensors emptied → tree */
    }
    if (!gridNode) {
      /* selected ROOT: sticky → tile default_root (title, advisory) →
         first expandable → first. */
      let selRoot = roots.find(c => brSame(c, B.root)) || null;
      if (!selRoot && t.default_root)
        selRoot = roots.find(c => String(c.title || "").toLowerCase() ===
          String(t.default_root).toLowerCase()) || null;
      selRoot = selRoot || roots.find(c => c.can_expand) || roots[0];
      B.root = brRef(selRoot);
      if (!selRoot.can_expand) {         /* playable-only root: no grid */
        B.ui = { roots, cats: null };
        return [];
      }
      const L1 = B.nodes[browseKey(mp, B.root)];
      /* while L1 loads, DON'T flash the raw tree roots into band 1
         (v0.51 — Suresh: "a row of folders pops onto the top row for
         a second"): keep the previous bar (or none on first load) —
         the real shape decides once L1 lands */
      if (!L1) { browseFetch(mp, B.root); return loading; }
      /* CATEGORY STRIP (v0.50.2): two tree shapes, one look.
         DEEP (Sonos): roots hold a layer of pure directories → roots
         row + those directories as chips. FLAT (Music Assistant): the
         top level IS the categories → chips (favorites-promoted when
         the sensors are live, plain otherwise). */
      if (L1.children.length && L1.children.every(brDir)) {
        const cats = L1.children;
        const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
        B.cat = brRef(selCat);
        B.ui = { roots, cats };
        const L2 = B.nodes[browseKey(mp, B.cat)];
        if (!L2) { browseFetch(mp, B.cat); return loading; }
        gridNode = L2;
      } else if (roots.length > 1 && roots.every(brDir)) {
        const fc = favList();
        if (fc.length) {
          B.root = { id: "__fav", type: "__synth", title: "Favorites" };
          B.cat = null;
          const r = synth(fc);
          if (Array.isArray(r)) return r;
          gridNode = r;
        } else {
          B.ui = { roots: [], cats: roots, flat: true };
          gridNode = L1;
        }
      } else {
        B.ui = { roots, cats: null };
        gridNode = L1;
      }
    }
    if (gridNode === loading) return loading;
    /* deep drill below the bands (artist → albums → tracks …) */
    const out = [];
    if (B.sub.length) {
      const top = B.sub[B.sub.length - 1];
      const Ln = B.nodes[browseKey(mp, top)];
      if (!Ln) { browseFetch(mp, top); return loading; }
      out.push({ type: "preset", id: t.id + "_up", span: 2, brw: true,
        icon: "material:arrow_back",
        label: Ln.title ? "\u2039 " + Ln.title : "\u2039 Back",
        action: { browse: "__up" } });
      gridNode = Ln;
    }
    return mkItems(gridNode, out);
  }
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
      const cur = currentActivityId();
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
    return ents.filter(e => e.split(".")[0] !== "remote")
      .filter(e => !(cmdEnt && e === cmdEnt && e !== ctx2.media_player &&
        !(dopts[e] && dopts[e].tile === true)))
      .filter(e => !(dopts[e] && dopts[e].tile === false)).map(e => {
      const s = st(e), dom = e.split(".")[0];
      return {
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
      };
    });
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
function castOf(aid) {
  const a = (CONFIG.activities || {})[aid];
  if (!a) return [];
  if (Array.isArray(a.devices) && a.devices.length) return a.devices;
  return castFromCtx(a.context);
}

/* A summary-style nav card's entities need subscribing (its sub shows
   live counts) — plain/image nav cards subscribe nothing. Derivation
   itself lives with the widget (navTargetEntities, widgets/nav.js). */
function groupEntities(t) {
  return t.type === "nav" && navStyle(t) === "summary" ? navTargetEntities(t) : [];
}

/* Entities for a screen = tiles ∪ groups ∪ context ∪ activity select */
function rawTilesOf(sc) {
  /* enabled:false (v0.40 blessed sections): a switched-off section
     keeps its items in config but stops rendering AND subscribing */
  return sc.sections
    ? sc.sections.filter(x => x.enabled !== false).flatMap(x => x.tiles)
    : (sc.tiles || []);
}
function tilesOf(sc) {
  return rawTilesOf(sc).flatMap(expandTile).filter(visibleTile);
}
/* structural signature: generated tiles change when their source
   attribute does — renderStates re-renders the grid when this moves */
function tileSig(sc) {
  return JSON.stringify(tilesOf(sc).map(t => [t.id, t.label, t.icon_image, t.action]));
}
function tiles() { return tilesOf(screenOf(S.screen) || {}); }
function tileDef(id) { return tiles().find(t => t.id === id); }

function entitiesFor(screenId) {
  const sc = screenOf(screenId), set = new Set();
  const add = v => { v = resolveEntity(v, screenId); if (v) set.add(v); };
  /* raw tiles too: a presets_from source entity must be subscribed
     even though expansion replaces the tile itself */
  rawTilesOf(sc).filter(visibleTile).concat(tilesOf(sc))
    .forEach(t => { add(t.entity); add(t.level_entity);
      (t.entities || []).forEach(add); groupEntities(t).forEach(add); });
  /* context values that ARE entities get subscribed — but context also
     carries plain tokens (app_class: firetv) and ONE bad id makes HA
     reject the WHOLE subscribe_entities message (found live 2026-07-26:
     affected pages then got no state updates at all until a manual
     refresh). Entity ids have a dot; tokens don't. */
  Object.values(ctxFor(screenId)).forEach(v => {
    if (typeof v === "string" && v.includes(".")) set.add(v);
  });
  /* a browse tile's Favorites promotion feeds off the integration's
     MA-favorite sensors — subscribe them so the lists stay live */
  if (rawTilesOf(sc).some(t => t.type === "browse"))
    ["playlists", "artists", "albums", "tracks", "radio"]
      .forEach(k => set.add("sensor.harmonium_music_" + k));
  if (CONFIG.global.activity_select) set.add(CONFIG.global.activity_select);
  (CONFIG.global.status_entities || []).forEach(v => set.add(v));
  activityStateEntities().forEach(v => set.add(v));   // v2 state-eval deps
  return [...set];
}

function subscribeFor(screenId) {
  if (!CONFIG || !screenId) return;   // preview mode: config not yet injected
  if (S.subId) { send({ type: "unsubscribe_events", subscription: S.subId }); S.subId = null; }
  S.subId = send({ type: "subscribe_entities", entity_ids: entitiesFor(screenId) });
}

function applyDiff(ev) {
  if (ev.a) for (const [eid, x] of Object.entries(ev.a))
    S.states.set(eid, { s: x.s, a: x.a || {} });
  if (ev.c) for (const [eid, ch] of Object.entries(ev.c)) {
    const cur = S.states.get(eid) || { s: null, a: {} };
    const plus = ch["+"];
    if (plus) {
      if (plus.s !== undefined) cur.s = plus.s;
      if (plus.a) Object.assign(cur.a, plus.a);
    }
    if (ch["-"] && ch["-"].a) ch["-"].a.forEach(k => delete cur.a[k]);
    S.states.set(eid, cur);
  }
  if (ev.r) ev.r.forEach(eid => S.states.delete(eid));

  /* activity changed → context may rebind: resubscribe current screen */
  const aid = currentActivityId();
  if (aid !== S.lastAct) { S.lastAct = aid; if (S.connected) subscribeFor(S.screen); }

  renderStates();
  if (!S.painted) {
    S.painted = true;
    S.bootMs = Math.round(performance.now() - T0);
    perf();
  }
}
