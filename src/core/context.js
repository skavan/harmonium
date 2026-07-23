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
/* ---- app registry resolution --------------------------------------
   An APP is a house-level identity (name/icon); LAUNCH is per-device:
   explicit override for this media_player -> auto (its default source
   name appears in the device's live source_list) -> hidden here.
   Override forms: "sequence:<id>" (building block, runs HA-side),
   plain string (a source name), or an action object (preset grammar
   {service,...} or HA-ish {action,...}). */
function appLaunch(app, mp) {
  const ov = (app.launch || {})[mp];
  if (ov != null) {
    if (typeof ov === "string") {
      if (ov.startsWith("sequence:"))
        return { service: "harmonium.run", data: { sequence: ov.slice(9) } };
      return { service: "media_player.select_source", entity: mp, data: { source: ov } };
    }
    if (ov.service) return ov;
    if (ov.action)
      return { service: ov.action, data: ov.data,
        entity: (ov.target && ov.target.entity_id) || ov.entity || mp };
    return null;
  }
  if (!app.source) return null;
  const list = st(mp).a.source_list;
  /* unknown source_list -> benefit of the doubt; known list decides */
  if (Array.isArray(list) && !list.includes(app.source)) return null;
  return { service: "media_player.select_source", entity: mp, data: { source: app.source } };
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
    /* one preset tile per registry app launchable on the target */
    const mp = resolveEntity(t.entity || "$context.media_player");
    if (!mp) return [];
    /* curation: an ordered `include` list picks WHICH apps this drawer
       offers (a conscious choice per drawer); default = whole registry */
    const reg = CONFIG.apps || {};
    const ids = Array.isArray(t.include) ? t.include.filter(x => reg[x]) : Object.keys(reg);
    return ids.map((aid) => [aid, reg[aid]]).map(([aid, app]) => {
      const action = appLaunch(app, mp);
      return action && {
        type: "preset", id: t.id + "_" + aid,
        icon: app.icon || "material:apps", label: app.name || aid,
        action,
      };
    }).filter(Boolean);
  }
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
    const ents = castAid ? castOf(castAid)
      : castFromCtx((screenOf(S.screen) || {}).context || {});
    return ents.filter(e => e.split(".")[0] !== "remote").map(e => {
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
  for (const r of ["media_player", "dpad", "power", "volume", "volume_level"]) {
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
  Object.values(ctxFor(screenId)).forEach(v => { if (typeof v === "string") set.add(v); });
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
