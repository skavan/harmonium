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
const VIRTUAL_PREFIX = ["detail:", "sources:", "queue:", "group:", "spkgrp:", "keys:"];
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
/* the Controller tab's band vocabulary (v0.83.7). FIXED_BANDS gate
   hand-placed singletons in visibleTile; RAW_BANDS also name the
   generator tiles for per-activity ORDERING (which happens on the
   DECLARED tiles, before expansion, so a generator keeps its
   identity). */
const FIXED_BANDS = { media: "np", transport: "transport",
  mediabtns: "modes", sources: "sources", volume: "volume" };
const RAW_BANDS = Object.assign({ volumes: "volume", speakers: "speakers",
  groups: "groups", presets: "presets", devices: "devices" }, FIXED_BANDS);

/* PER-ACTIVITY BAND ORDER (v0.83.7 — Suresh: "We should have a move
   up and move down to control the order"): a.surface.band_order is
   the activity's display order for the bands it recognizes. Band
   tiles permute among themselves WITHIN their section; everything
   unrecognized keeps its exact slot. Stable for ties. */
/* THE CONTROLLER TAB'S DRESSING PASS (v0.83.7 — "would be cool is a
   label slot, so we can override labels. ... No text means no
   label!"): per-activity band-label overrides + the Now Playing
   style, applied to the expanded tiles of controller-class screens.
   a.surface.band_labels.<band> = "text" ("" = NO label — .lbl:empty
   collapses); a.surface.np_style = "slim" | "art". Only bands that
   render ONE surface tile are labelable — per-item tiles (the
   volumes cast, presets, devices) keep their own names (bandGen). */
const LABELABLE_BANDS = { media: "np", transport: "transport",
  mediabtns: "modes", sources: "sources", volume: "volume",
  grouping: "speakers", grouplaunch: "speakers" };
function surfDressTile(t) {
  const sc = screenOf(S.screen);
  if (!sc || !(sc.class === "activity" || sc.type === "controller")) return t;
  const cur = renderActivityId();
  const act = cur && (CONFIG.activities || {})[cur];
  const srf = act && act.surface;
  if (!srf) return t;
  let patch = null;
  const band = !t.bandGen && (LABELABLE_BANDS[t.type] ||
    (t.type === "stepper" && t.kind === "volume" ? "volume" : null));
  const bl = srf.band_labels;
  if (band && bl && typeof bl[band] === "string")
    (patch = patch || {}).label = bl[band];
  if (t.type === "media" && srf.np_style && !t.style)
    (patch = patch || {}).style = srf.np_style;
  return patch ? Object.assign({}, t, patch) : t;
}
function surfOrderTiles(tiles) {
  const sc = screenOf(S.screen);
  if (!sc || !(sc.class === "activity" || sc.type === "controller")) return tiles;
  const cur = renderActivityId();
  const act = cur && (CONFIG.activities || {})[cur];
  const order = act && act.surface && act.surface.band_order;
  if (!Array.isArray(order) || !order.length) return tiles;
  const bandOf = t => RAW_BANDS[t.type] ||
    (t.type === "stepper" && t.kind === "volume" ? "volume" : null);
  const slots = [], bandTiles = [];
  tiles.forEach((t, i) => { if (bandOf(t)) { slots.push(i); bandTiles.push([t, i]); } });
  if (bandTiles.length < 2) return tiles;
  const rank = pair => {
    const ix = order.indexOf(bandOf(pair[0]));
    return ix < 0 ? 900 + pair[1] : ix;   // unlisted bands keep the tail, stably
  };
  bandTiles.sort((a, b) => rank(a) - rank(b) || a[1] - b[1]);
  const out = tiles.slice();
  slots.forEach((pos, i) => { out[pos] = bandTiles[i][0]; });
  return out;
}

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
  /* THE CONTROLLER TAB'S BAND SWITCHES (v0.83.7): on a
     controller-class screen, the running activity's a.surface can
     switch whole FIXED bands off — np (Now Playing), transport,
     modes, sources, volume. Generator bands (volumes, speakers,
     groups, presets, devices) gate themselves pre-expansion in
     generators.js; this covers the hand-placed singletons. Absent
     key = Auto = today's behavior. */
  {
    const sc0 = screenOf(S.screen);
    if (sc0 && (sc0.class === "activity" || sc0.type === "controller")) {
      const cur0 = renderActivityId();
      const act0 = cur0 && (CONFIG.activities || {})[cur0];
      const srf = act0 && act0.surface;
      if (srf) {
        const band = FIXED_BANDS[t.type] ||
          (t.type === "stepper" && t.kind === "volume" ? "volume" : null);
        if (band && srf[band] === false) return false;
      }
    }
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

