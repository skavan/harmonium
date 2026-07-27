/* ================================================================
   Context: screen context overlaid by the ACTIVE activity's context
   (activity read live from the state of global.activity_select).
   ================================================================ */
function currentActivityId() {
  const sel = CONFIG.global.activity_select;
  if (!sel) return null;
  const v = st(sel).s;
  for (const [id, a] of Object.entries(CONFIG.activities || {}))
    if ((a.state_value || id) === v) return id === "off" ? null : id;
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
      }));
  }
  if (t.type === "apps") {
    /* one preset tile per app the resolved DEVICE CLASS offers.
       Class resolution: tile `class` (literal or $context ref) →
       $context.app_class (the running activity's dialect) → the only
       class, when exactly one exists. No class → empty drawer. */
    const ctx = ctxFor(S.screen);
    let clsId = t.class || ctx.app_class;
    if (typeof clsId === "string" && clsId.startsWith("$context."))
      clsId = ctx[clsId.slice(9)];
    const classes = CONFIG.app_classes || {};
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
    return ents.filter(e => e.split(".")[0] !== "remote")
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
  return sc.sections ? sc.sections.flatMap(x => x.tiles) : (sc.tiles || []);
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
