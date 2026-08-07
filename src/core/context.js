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
  /* ONE SELECT PER ROOM (v0.67 — the Games Room made this real). The
     integration mints `select.harmonium_<page>_activity` for every
     page that owns activities, but the engine only ever read the one
     named in `global.activity_select`. With a second room that is
     actively wrong: music playing in the Bar would have supplied the
     $context for a controller opened from the Games Room. A room page
     may now name its own select, and we ask the room we are STANDING
     IN — falling back to the global one, so a single-room workspace
     is untouched. */
  const sel = roomActivitySelect();
  if (sel) {
    const v = st(sel).s;
    for (const [id, a] of Object.entries(CONFIG.activities || {}))
      if ((a.state_value || id) === v)
        return id === "off" ? null : (activityInScope(id) ? id : null);
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
/* WHICH ROOM AM I IN? The screen itself if it owns activities, else
   the page we were reached through (a controller is shared, so it
   belongs to whoever opened it). Shares presumedActivity's trail. */
function roomTrail() {
  const out = [S.screen];
  for (let i = S.stack.length - 1; i >= 0; i--) out.push(S.stack[i]);
  return out;
}
/* A SHARED SURFACE CANNOT NAME A ROOM (v0.67.4 — Suresh: "When I run
   Listen To Music in the Games room, it takes me to the bar controller
   page. This implies stock has hardcoded stuff in it.")

   Nothing was hardcoded — the shared `controller:music` was ANSWERING
   for a room, and answering first-come. Both `listen_sonos` (Bar) and
   `games_music` (Games) declare it as their screen, so
   activitiesOwning() returned both and this loop took [0]: the Bar.
   The Bar's select said `listen_sonos`, so every $context slot filled
   with Bar devices and the title bar said Bar.

   The trail already held the right answer one step further along — the
   room page we walked THROUGH. So: an owner-derived guess only counts
   when the owners AGREE. Split the vote and the surface abstains and
   we keep walking. This is presumedActivity's rule (v0.61) applied to
   the select, and it is why a shared controller stays shared. */
function roomActivitySelect() {
  const trail = roomTrail();
  for (let i = 0; i < trail.length; i++) {
    const sc = rawScreen(trail[i]);
    if (sc && sc.activity_select) return sc.activity_select;
    /* the activity we are standing on names its owning room */
    const owns = activitiesOwning(trail[i]);
    let found = null, split = false;
    for (let j = 0; j < owns.length && !split; j++) {
      const rv = (CONFIG.activities[owns[j]] || {}).room_view;
      const rs = rv && rawScreen(rv);
      const s = rs && rs.activity_select;
      if (!s) continue;
      if (found && s !== found) split = true;
      else found = s;
    }
    if (found && !split) return found;
  }
  return (CONFIG.global || {}).activity_select;
}
/* an activity only owns the surfaces of its OWN room — otherwise the
   Bar's running music would supply $context in the Games Room */
function activityInScope(id) {
  const a = (CONFIG.activities || {})[id];
  if (!a || !a.room_view) return true;          /* unroomed = global */
  const trail = roomTrail();
  if (trail.indexOf(a.room_view) >= 0) return true;
  if (a.screen && trail.indexOf(a.screen) >= 0) return true;
  /* a room with no OTHER room in play keeps the old behaviour */
  const rooms = {};
  for (const k in CONFIG.activities) {
    const rv = CONFIG.activities[k].room_view;
    if (rv) rooms[rv] = 1;
  }
  return Object.keys(rooms).length < 2;
}

/* ---- THE PRESUMED ACTIVITY (v0.61) --------------------------------
   Suresh, twice now: "I should NEVER see this blank page. I want to
   see the preview. I can always hit the power button to turn it on!"

   Standing on a controller with nothing running, the page had no
   $context, so every tile resolved to null and hid itself — a void
   with an apologetic sentence in it. v0.48 fixed the TAPPED case
   (pendingActivity); this fixes the rest: RENDER AS the activity that
   owns this surface, showing its devices in their true (off) state.

   Nothing here claims the activity is running. Truth stays with
   `currentActivityId()` — the End button, hold-Power, the activity
   tile's own ON state. This is presentation, and only presentation.
   Note it can only ever ADD to a page that was previously blank: the
   fallback fires exactly when the old code had no context at all. */
function activitiesOwning(sid) {
  const acts = (CONFIG && CONFIG.activities) || {};
  const owns = [];
  for (const id in acts) if (acts[id].screen === sid) owns.push(id);
  return owns;
}
/* Screens that own no activity and never will, and so may inherit a
   presumption from wherever they were opened: the GENERATED ones, and
   DRAWERS (`drawer: true` — the Apps grid, the Music Library), which
   are destinations you step into and back out of. A plain page —
   a room — presumes nothing, or the guess leaks backwards onto it. */
const VIRTUAL_PREFIX = ["detail:", "sources:", "queue:", "group:", "keys:"];
/* raw config lookup, deliberately NOT screenOf: screenOf generates the
   virtual screens, and groupScreen asks for the render activity — that
   way lies recursion */
function rawScreen(sid) {
  if (!CONFIG || typeof sid !== "string") return null;
  if (sid.startsWith("controller:"))
    return (CONFIG.controllers || {})[sid.slice(11)] || null;
  return (CONFIG.screens || {})[sid] || null;
}
/* WHO OWNS THE SURFACE I AM STANDING ON? The nearest screen in the
   inheritance chain that any activity declares as its `screen`, and
   the activities that declare it. Shared by presumedActivity (which
   picks one) and renderActivityId (which only asks whether the
   RUNNING activity is among them). Empty = this surface belongs to
   nobody in particular — a room page, the library — and imposes no
   opinion. */
function surfaceOwners() {
  if (!CONFIG || !CONFIG.activities) return [];
  const sid = S.screen;
  const back = [];
  for (let i = S.stack.length - 1; i >= 0; i--) back.push(S.stack[i]);
  const virt = typeof sid === "string" &&
    VIRTUAL_PREFIX.some(p => sid.startsWith(p));
  const sc = virt ? null : rawScreen(sid);
  const inherits = virt || !!(sc && sc.drawer);
  const search = [sid];
  if (inherits) {
    if (sc && sc.parent) search.push(sc.parent);
    back.forEach(x => search.push(x));
  }
  for (let t = 0; t < search.length; t++) {
    /* IN SCOPE ONLY (v0.68.3). A drawer's declared `parent` can point
       at a surface owned by ANOTHER ROOM — the Apps drawer's parent is
       the generic `controller:tv`, owned by the Games activities,
       while the Bar reaches it through its own `bar_tv` fork. Without
       this filter the Bar's Apps drawer answers "games_gtv". Caught by
       the regression test, not by reading. */
    const owns = activitiesOwning(search[t]).filter(id => activityInScope(id));
    if (owns.length) return owns;
  }
  return [];
}
function presumedActivity() {
  if (!CONFIG || !CONFIG.activities) return null;
  const sid = S.screen;
  /* where we came from, nearest first */
  const back = [];
  for (let i = S.stack.length - 1; i >= 0; i--) back.push(S.stack[i]);
  const virt = typeof sid === "string" &&
    VIRTUAL_PREFIX.some(p => sid.startsWith(p));
  const sc = virt ? null : rawScreen(sid);
  const inherits = virt || !!(sc && sc.drawer);
  /* a drawer's declared `parent` is consulted first — it is the way
     back, so it is also the honest answer when the stack is empty */
  const search = [sid];
  if (inherits) {
    if (sc && sc.parent) search.push(sc.parent);
    back.forEach(x => search.push(x));
  }
  for (let t = 0; t < search.length; t++) {
    /* same scope filter as surfaceOwners (v0.68.3) — a parent in
       another room is not this page's owner */
    const owns = activitiesOwning(search[t]).filter(id => activityInScope(id));
    if (!owns.length) continue;
    if (owns.length === 1) return owns[0];
    /* a SHARED surface (one TV player, many TV activities) cannot be
       guessed from the surface alone — the ROOM we walked through is
       the disambiguator, nearest first; failing that, config order */
    for (let s = 0; s < back.length; s++) {
      const local = owns.filter(id => CONFIG.activities[id].room_view === back[s]);
      if (local.length) return local[0];
    }
    return owns[0];
  }
  return null;
}
/* what the page DRAWS as (running, else presumed) — never what is
   running. Every caller that acts on the world wants currentActivityId.

   A SURFACE IS SUPPLIED BY THE ACTIVITY THAT OWNS IT (v0.68.3 —
   Suresh: "Games Room - Music Media Player has Games TV and Games
   Receiver in it. As I said before, Sonos Pool has zero other
   devices… Clicking the library brings up a Nothing to browse on this
   player.")

   Games TV + Games Receiver is precisely `games_xbox`'s cast. With
   Xbox running, opening the MUSIC player in that room drew the Xbox's
   $context onto it: its volume cast, and `media_player` = the
   television — which is why the library then had nothing to browse.
   The room scope from v0.67.4 was doing its job; the missing rule is
   the other axis. Being in the right ROOM does not make an activity
   the right source for the surface you are standing on: a music
   controller is declared by the music activities, and the Xbox is not
   one of them.

   So: if this surface is OWNED (some activity declares it as its
   `screen`) and the running activity is not one of the owners, the
   page draws as its owner instead — which is exactly what
   presumedActivity() already computes, room-disambiguated. Surfaces
   nobody owns (a room page) keep the running activity, and truth
   (isActivityActive, the End button, hold-Power) does not move: this
   is presentation, as v0.61 was. */
function renderActivityId() {
  const cur = currentActivityId();
  if (cur) {
    const owners = surfaceOwners();
    if (!owners.length || owners.indexOf(cur) >= 0) return cur;
    const owned = presumedActivity();
    if (owned) return owned;
  }
  return cur || presumedActivity();
}
function ctxFor(screenId) {
  const scCtx = (screenOf(screenId) || {}).context || {};
  const aid = renderActivityId();
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
  /* WIDGET SELF-SUPPRESSION (v0.57): a widget may declare hidden(e, t)
     and vanish when the device cannot do the thing it draws — the
     Onkyo has no transport, so the transport row is not a control, it
     is a lie. Unknown state never hides (supported_features arrives
     with the first diff; tilesOf re-filters and tileSig re-renders). */
  {
    const w = (typeof WIDGETS !== "undefined" && WIDGETS[t.type]) || null;
    if (w && typeof w.hidden === "function" &&
        w.hidden(resolveEntity(t.entity), t)) return false;
  }
  /* per-activity content overrides on a SHARED controller: one Watch
     TV page, many activities — tiles opt in/out declaratively.
       when: { activity: watch_smart }        show only then
       when: { not_activity: [watch_smart] }  hide then
     Re-render rides tileSig: the filtered set changes with the
     activity, so the grid refreshes on activity switches. */
  if (t.when) {
    const cur = renderActivityId();
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
    /* SEARCH, DECLARED (v0.66). Sonos cannot search — it answers an
       empty list — so the tile names the engine that can. Written as a
       BLOCK rather than a loose key because the engine is a decision
       someone has to be able to see:

         "search": { "engine": "music_assistant",
                     "entity": "media_player.ma_bar",
                     "classes": ["artist","album","track","playlist"] }

       There is one engine today and the setting still exists — this is
       not a control with one option (v0.62), it is a declaration of
       WHICH ENGINE ANSWERS, and the seam a second one slots into.
       `classes` is the scope: Suresh likes MA but finds it "almost too
       overwhelming", and never ASKING for its generated playlists,
       audiobooks and recommendations is the cure. v0.65's flat
       `search_entity` still works. */
    const sQ = t.search || (t.search_entity ? { entity: t.search_entity } : null);
    B.qmp = sQ && sQ.entity ? resolveEntity(sQ.entity) : null;
    B.qengine = (sQ && sQ.engine) || (B.qmp ? "music_assistant" : "");
    B.qclasses = (sQ && sQ.classes) ||
      ["artist", "album", "track", "playlist"];
    /* DEPTH IS DECLARED (v0.67.3): `config_entry` names WHICH Music
       Assistant to ask directly — its own service takes a `limit`,
       HA's generic search_media does not and stops at 5 per class.
       Absent, the standard contract still runs. */
    B.qentry = (sQ && sQ.config_entry) || "";
    B.qlimit = (sQ && +sQ.limit) || 0;
    if (!B.qmp && B.qon) { B.qon = false; B.q = ""; B.qres = null; }
    B._active = true;
    const loading = [{ type: "preset", id: t.id + "_ld", span: 2, brw: true,
      icon: "material:hourglass_empty", label: "Loading library…", action: {} }];
    const L0 = B.nodes[browseKey(mp, null)];
    /* SEARCH DOES NOT WAIT FOR THE TREE (v0.68.1). This gate returned
       "Loading library…" until the browse ROOT came back — and search
       needs none of it: it has its own engine, its own player and its
       own results. Opening the library and typing straight away meant
       waiting out a fetch whose answer was never going to be used,
       with an empty bar (B.ui = null renders NOTHING) while you did.
       The fetch still starts, because closing search lands you in the
       tree; it just no longer blocks the door. */
    if (!L0) {
      browseFetch(mp, null);
      if (!B.qon) { B.ui = null; return loading; }
    }
    /* ROOT CURATION (v0.49.1, a setting not a hardcode): HA's
       media-source:// plumbing hides by default (`media_sources:
       true` keeps it); `include: [titles]` narrows — advisory. */
    let roots = L0 ? L0.children : [];
    if (!t.media_sources)
      roots = roots.filter(c =>
        !String(c.media_content_id || "").startsWith("media-source://"));
    if (Array.isArray(t.include) && t.include.length) {
      const want = t.include.map(x => String(x).toLowerCase());
      const m = roots.filter(c =>
        want.includes(String(c.title || "").toLowerCase()));
      if (m.length) roots = m;
    }
    if (!roots.length && !B.qon) {
      B.ui = null;
      return [{ type: "preset", id: t.id + "_err", span: 2, brw: true,
        icon: "material:error_outline",
        label: (L0 && L0.error) || "Nothing to browse on this player",
        action: {} }];
    }
    /* WHICH PLAYER GETS THE PLAY (v0.66). Browsing: the tree's own
       player, as always. SEARCHING: the SONOS entity whenever the id
       converts to a Spotify share link — one entity to look at, and
       Sonos streams from Spotify with the HA box out of the audio
       path. Artists and MA-library ids cannot share-link, so those
       fall back to the player that found them. */
    const playOf = (c, viaMa) => {
      if (viaMa) {
        const uri = brSpotifyUri(c.media_content_id);
        if (uri) return { service: "media_player.play_media", target: mp,
          data: { media_content_id: uri, media_content_type: "music" } };
        return { service: "media_player.play_media", target: viaMa,
          data: { media_content_id: c.media_content_id,
                  media_content_type: c.media_content_type } };
      }
      return { service: "media_player.play_media", target: mp,
        data: { media_content_id: c.media_content_id,
                media_content_type: c.media_content_type } };
    };
    const mkItems = (node, out) => {
      if (node.error)
        out.push({ type: "preset", id: t.id + "_err", span: 2, brw: true,
          icon: "material:error_outline", label: node.error, action: {} });
      node.children.forEach((c, i) => {
        const play = playOf(c, node.viaMa);
        out.push({
          type: "preset", id: t.id + "_" + i, label: c.title, brw: true,
          icon: BROWSE_ICON[c.media_class] || "material:library_music",
          /* the badge is set only where the kind ISN'T implied by the
             chip you're standing on — i.e. the All grid */
          ...(node.badges && node.badges[i] ? { badge: node.badges[i] } : {}),
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
      /* SAY WHEN YOU TRUNCATE (v0.62): silence here reads as "that is
         everything", which is the one thing it isn't */
      /* a STRING more says it in words (search knows there is deeper
         water but not how deep); a number counts what was withheld */
      if (node.more)
        out.push({ type: "preset", id: t.id + "_more", span: 2, brw: true,
          icon: "material:more_horiz",
          label: typeof node.more === "string" ? node.more
            : node.children.length + " shown · " + node.more + " more",
          action: {} });
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
        const cats = brOrder(fc.map(x => ({ title: x.lbl,
          media_content_id: "__fav:" + x.k, media_content_type: "__synth",
          media_class: "directory", can_expand: true, can_play: false })),
          t.categories);
        const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
        B.cat = brRef(selCat);
        B.ui = { roots: SROOTS, cats };
        const fav = fc.find(x => "__fav:" + x.k === B.cat.id) || fc[0];
        const FICON = { playlists: "material:queue_music",
          artists: "material:person", albums: "material:album",
          tracks: "material:music_note", radio: "material:radio" };
        const ftiles = fav.items.map((it, i) => ({
          type: "preset", id: t.id + "_" + i, label: it.name, brw: true,
          icon: FICON[fav.k] || "material:library_music",
          ...(it.image ? { icon_image: it.image } : {}),
          action: { service: "media_player.play_media", target: mp,
            data: { media_content_id: it.uri,
                    media_content_type: it.media_type } },
        }));
        /* the SENSOR caps at 100 (sensor.py LIMIT) and cannot tell us
           whether it truncated — a full list is the only signal there
           is, so say it plainly rather than imply completeness */
        if (fav.items.length >= FAV_SENSOR_CAP)
          ftiles.push({ type: "preset", id: t.id + "_more", span: 2, brw: true,
            icon: "material:more_horiz",
            label: FAV_SENSOR_CAP + " shown · the favourites feed caps here",
            action: {} });
        return ftiles;
      }
      /* __lib: the real tree's top level becomes the chips */
      const selCat = roots.find(c => brSame(c, B.cat)) || roots[0];
      B.cat = brRef(selCat);
      B.ui = { roots: SROOTS, cats: brOrder(roots, t.categories) };
      const L2 = B.nodes[browseKey(mp, B.cat)];
      if (!L2) { browseFetch(mp, B.cat); return loading; }
      return L2;
    };
    /* SEARCH MODE (v0.65) short-circuits the tree entirely: the bands
       become the query + keyboard, and the chips become the KINDS the
       answer contains. Everything below (roots, categories, drill)
       resumes untouched the moment search closes. */
    if (B.qon) {
      /* DRILLING A RESULT (v0.66): an artist can't be share-linked to
         Sonos, but MA marks it expandable — so stepping into one lists
         their albums FROM MA, and those albums play on Sonos like any
         other result. The fetch has to use the ENGINE's player: the
         ids are its own and the tree's player has never heard of them. */
      if (B.sub.length) {
        const top = B.sub[B.sub.length - 1];
        const Ln = B.nodes[browseKey(B.qmp, top)];
        B.ui = { roots: [], cats: null, search: true };
        if (!Ln) { browseFetch(B.qmp, top); return loading; }
        Ln.viaMa = B.qmp;
        return mkItems(Ln, [{ type: "preset", id: t.id + "_up", span: 2,
          brw: true, icon: "material:arrow_back",
          label: Ln.title ? "\u2039 " + Ln.title : "\u2039 Back",
          action: { browse: "__up" } }]);
      }
      const items = (B.qres && B.qres.items) || [];
      const kinds = [];
      items.forEach(c => {
        const k = c.media_class || "item";
        if (!kinds.some(x => x.qclass === k))
          kinds.push({ title: BR_KIND_NAME[k] || k, qclass: k,
            media_content_id: "__q:" + k, media_content_type: "__qkind" });
      });
      /* SHOW THE SLICES BEFORE THERE IS ANYTHING TO SLICE (v0.68.1 —
         Suresh: "Its not obvious what Im looking at, I think we should
         have the tab bar (artists/playlists etc..) shown. Not just the
         magnifying icon. If there is no search text, the tabs are
         disabled."). With no results the strip collapsed to a lone
         magnifier, which says nothing about what search even DOES.
         The declared `classes` already name the answer's shape, so
         draw them — greyed and unpressable until an answer exists. */
      const cats = items.length
        ? [{ title: "All", qclass: "", media_content_id: "__q:",
             media_content_type: "__qkind" }].concat(kinds)
        : [{ title: "All", qclass: "", disabled: true,
             media_content_id: "__q:", media_content_type: "__qkind" }].concat(
            (B.qclasses || []).map(k => ({
              title: BR_KIND_NAME[k] || k, qclass: k, disabled: true,
              media_content_id: "__q:" + k, media_content_type: "__qkind" })));
      B.ui = { roots: [], cats: cats, search: true };
      /* SAY THAT WE ARE LOOKING (v0.68.1 — "there is no visual
         feedback"). A centred line, not the library's hourglass tile:
         this is a search in flight, not a page loading. */
      if (B.qbusy && !items.length)
        return [{ type: "preset", id: t.id + "_qw", brw: true,
          /* no `span`: .brwait takes 1/-1 in CSS, and an inline span
             from the v0.68 proportional rule would out-specify it */
          cls: "brwait", icon: "material:search",
          label: "Searching…", action: {} }];
      if (B.qerr)
        return [{ type: "preset", id: t.id + "_qe", span: 2, brw: true,
          icon: "material:error_outline", label: B.qerr, action: {} }];
      /* AN EMPTY QUERY SHOWS NOTHING (v0.67.2 — Suresh, of the tile
         that used to sit here: "What is the point of that great big
         button? Type to search ma bar?"). None: the query line right
         above it already says "type to search", and a tile that does
         nothing when tapped is furniture. Silence is the answer. */
      if (!B.q.trim()) return [];
      const shown = B.qcat
        ? items.filter(c => (c.media_class || "item") === B.qcat) : items;
      if (!shown.length)
        return [{ type: "preset", id: t.id + "_qn", span: 2, brw: true,
          icon: "material:search_off",
          label: "Nothing for “" + B.q.trim() + "”", action: {} }];
      /* SAY THAT THE WELL IS DEEPER (v0.67.3 — "It should show that
         there are more, must be thousands!"), and SAY WHICH (v0.67.5 —
         "The There's more should appear in the tab results too, if
         true"). It always did appear in a tab whose kind was capped —
         but an unnamed note in All that vanishes on a tab reads as a
         bug rather than as an answer. Naming the kinds makes the rule
         visible: the limit is PER KIND, so All can be deep in artists
         while tracks are exhausted. */
      const cap = (B.qres && B.qres.capped) || [];
      const capShown = B.qcat
        ? (cap.indexOf(B.qcat) >= 0 ? [B.qcat] : []) : cap;
      const deep = capShown.length
        ? "More " + capShown.map(k =>
            (BR_KIND_NAME[k] || k).toLowerCase()).join(" · ") +
          " — add a word to narrow it down"
        : 0;
      /* the SAME item renderer the tree uses — thumbnails, play,
         drill-in and the ▶ badge all come along. Results MIX kinds by
         nature, which is exactly what the v0.62 badge is for. */
      return mkItems({ title: "Search", children: shown, viaMa: B.qmp,
        more: deep,
        badges: shown.map(c => BROWSE_ICON[c.media_class] ||
          "material:library_music") }, []);
    }
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
        const real = brOrder(L1.children, t.categories);
        /* THE "ALL" CHIP (v0.62 — Suresh: "what Sonos is returning is
           ALL favorites and then we're slicing them by category, which
           is useful, but sometimes artificial. What's the difference
           between a coffee shop playlist and coffee shop radio?").
           So when this root is the only one — i.e. the categories ARE
           the whole library — offer the unsliced view first. Each item
           carries a badge naming the folder it came from, which is the
           thing the slicing was for. */
        const wantAll = roots.length === 1 && real.length > 1 &&
          t.all !== false;
        const cats = wantAll ? [BR_ALL].concat(real) : real;
        const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
        B.cat = brRef(selCat);
        B.ui = { roots, cats };
        if (B.cat.type === BR_ALL.media_content_type) {
          const keys = real.map(c => browseKey(mp, brRef(c)));
          const missing = real.filter((c, i) => !B.nodes[keys[i]]);
          if (missing.length) {
            missing.forEach(c => browseFetch(mp, brRef(c)));
            return loading;
          }
          /* badges ride ALONGSIDE the children, never ON them: the
             child objects are the shared node cache, and stamping
             them would leave badges behind in the single-category
             grids once you had visited All */
          const kids = [], badges = [];
          let more = 0;
          real.forEach((c, i) => {
            const n = B.nodes[keys[i]];
            more += n.more || 0;
            (n.children || []).forEach(k => {
              kids.push(k);
              badges.push(brBadge(c.title, k));
            });
          });
          gridNode = { title: "All", children: kids, more: more, badges: badges };
        } else {
          const L2 = B.nodes[browseKey(mp, B.cat)];
          if (!L2) { browseFetch(mp, B.cat); return loading; }
          gridNode = L2;
        }
      } else if (roots.length > 1 && roots.every(brDir)) {
        const fc = favList();
        if (fc.length) {
          B.root = { id: "__fav", type: "__synth", title: "Favorites" };
          B.cat = null;
          const r = synth(fc);
          if (Array.isArray(r)) return r;
          gridNode = r;
        } else {
          B.ui = { roots: [], cats: brOrder(roots, t.categories), flat: true };
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
    const dflt = t.style || ((CONFIG.global || {}).style || {}).volume || "compact";
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
      const style = o.volume_style || dflt;
      const base = {
        id: t.id + "_" + did.replace(/[^a-zA-Z0-9]+/g, "_"),
        entity: ve,
        label: d.name || did,
        icon: d.icon || "material:volume_up",
        span: 2
      };
      out.push(style === "stepper"
        ? Object.assign(base, { type: "stepper", kind: "volume" })
        : Object.assign(base, {
            type: "volume",
            level_entity: roles.volume_level || ve,
            slider: style === "slider"
          }));
    });
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
    return act.presets.map((p, i) => Object.assign(
      { type: "preset", span: 2 }, p,
      { id: t.id + "_" + (p.id || i) }));
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
    return castGroups(act).map(g => ({
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
/* one tile for one member of a group, drawn as `shows` */
function groupChildTile(did, shows, idPrefix) {
  const d = (CONFIG.devices || {})[did];
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
    return Object.assign(base, { type: "device", entity: primary });
  }
  if (shows === "volume")
    return Object.assign(base, { type: "volume", entity: ent,
      level_entity: roles.volume_level || ent,
      slider: (((CONFIG.global || {}).style || {}).volume || "compact") === "slider" });
  if (shows === "stepper")
    return Object.assign(base, { type: "stepper", kind: "volume", entity: ent });
  return Object.assign(base, { type: shows, entity: ent });
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
  /* v0.67: every ROOM's select — a second room's activity tiles must
     stay truthful while you are standing in the first one */
  for (const sid in (CONFIG.screens || {})) {
    const sel2 = CONFIG.screens[sid].activity_select;
    if (sel2) set.add(sel2);
  }
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
  const aid = renderActivityId();
  if (aid !== S.lastAct) { S.lastAct = aid; if (S.connected) subscribeFor(S.screen); }

  renderStates();
  if (!S.painted) {
    S.painted = true;
    S.bootMs = Math.round(performance.now() - T0);
    perf();
  }
}
