/* ================================================================
   SUBSCRIPTIONS — only what's on screen

   The core thesis, executed: entitiesFor collects every entity a
   screen can touch (tiles, groups, context, the activity select),
   subscribeFor asks HA for exactly that set via subscribe_entities,
   and applyDiff merges the compact diffs — ~20 messages per screen,
   not the full-instance firehose the stock frontend drinks.
   ================================================================ */
function groupEntities(t) {
  return t.type === "nav" && navStyle(t) === "summary" ? navTargetEntities(t) : [];
}

/* Entities for a screen = tiles ∪ groups ∪ context ∪ activity select */
function rawTilesOf(sc) {
  /* enabled:false (v0.40 blessed sections): a switched-off section
     keeps its items in config but stops rendering AND subscribing */
  /* reduce/concat, not flatMap: .flatMap is Chromium 69+ and the
     syntax floor is 61 (stock Astrion webview) — see boot.js */
  return sc.sections
    ? sc.sections.filter(x => x.enabled !== false)
        .reduce((a, x) => a.concat(x.tiles || []), [])
    : (sc.tiles || []);
}
function tilesOf(sc) {
  /* surfDressTile (v0.83.7): the Controller tab's label overrides +
     np_style must dress EVERY derivation — makeTile builds from the
     render pipeline, but renderStates re-derives through here, and an
     undressed twin would feed sub()/render() the wrong tile */
  return rawTilesOf(sc).reduce((a, t) => a.concat(expandTile(t)), [])
    .map(surfDressTile).filter(visibleTile);
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
  /* EXIT GUARD (v0.83.7 — found in .87's log: subscribe_entities
     rejected with "Entity ID $device is an invalid entity ID"): ONE
     unresolved token in the list and HA rejects the WHOLE message —
     the page then gets no state updates at all (same failure class
     as 2026-07-26). Whatever slips through the adders above, only
     real entity ids leave this function: a dot, and no $-token. */
  return [...set].filter(v =>
    typeof v === "string" && v.includes(".") && v.indexOf("$") === -1);
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

