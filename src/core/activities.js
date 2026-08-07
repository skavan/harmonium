/* ================================================================
   Activities: select = start (off) / open (running); hold or
   power = end, with optional inline two-press confirm.
   ================================================================ */
function actOf(t) { return (CONFIG.activities || {})[t.activity] || null; }

/* ---- v2 declarative activity state --------------------------------
   An activity may declare `state:` — the harmonia evals as data:
     state:
       entities: [media_player.x, ...]      # subscribed everywhere
       on:                                   # any of these shapes:
         all: [ {entity, state|equals|in|not_in, attribute?} ... ]
         any: [ ...conds ]
         any_state: [on, playing, ...]       # primary entity shortcut
   When present, activity TRUTH is derived live from device state — the
   input_select becomes routing cache, not truth. Absent → v1 behavior
   (truth = the select). */
function evalCond(c) {
  if (!c || !c.entity) return false;
  const s = st(c.entity);
  const v = c.attribute ? s.a[c.attribute] : s.s;
  if (c.equals !== undefined) return v === c.equals;
  if (c.state !== undefined)
    return Array.isArray(c.state) ? c.state.includes(v) : v === c.state;
  if (c.in) return Array.isArray(c.in) && c.in.includes(v);
  if (c.not_in) return Array.isArray(c.not_in) && !c.not_in.includes(v);
  return ACTIVE(v);
}
/* IMPLIED STATE (v0.48.1 — Suresh: "State is flaky... activity select
   is on, but a device is manually switched off"): an activity with NO
   authored state rule derives truth LIVE from its primary cast
   device's media_player — so a manually-powered-off device can never
   strand an ON tile behind a stale select. never_off devices (Fire
   TV) are exempt by their own trait: their state can't witness the
   activity, so the select stays truth there. An authored rule always
   wins. */
function impliedStateEnt(a) {
  const dev = a && (CONFIG.devices || {})[(a.cast || [])[0]];
  if (!dev || (dev.traits || {}).never_off) return null;
  return (dev.roles || {}).media_player || null;
}
function impliedStateOn(a) {
  const mp = impliedStateEnt(a);
  if (!mp) return null;                       // no witness → select is truth
  return ["on", "playing", "paused", "buffering", "idle"].includes(st(mp).s);
}
function activityStateOn(a) {
  const d = a && a.state;
  if (!d || !d.on) return impliedStateOn(a);  // no declaration → implied, else v1
  const on = d.on;
  if (Array.isArray(on)) return on.every(evalCond);
  if (on.all) return on.all.every(evalCond);
  if (on.any) return on.any.some(evalCond);
  if (on.any_state) {
    const prim = (d.entities || [])[0];
    return prim ? on.any_state.includes(st(prim).s) : null;
  }
  return null;
}
function isActivityActive(id) {
  const a = (CONFIG.activities || {})[id];
  if (!a) return false;
  const ev = activityStateOn(a);
  if (ev !== null) return ev;                 // v2: devices are the truth
  /* THE ACTIVITY'S OWN ROOM ANSWERS (v0.67.4). This read
     `global.activity_select` — which is literally the Bar's select —
     so a second room's undeclared-state activity would have taken its
     truth from the Bar. Ask the select of the room that OWNS it (not
     the room we are standing in: this is the ACTIVITY's truth, not the
     screen's), keeping global as the last resort so a single-room
     workspace is untouched. Nothing reaches this path today — every
     activity declares `state` — which is precisely why it would have
     sat here waiting for the next room. */
  const own = a.room_view && rawScreen(a.room_view);
  const sel = (own && own.activity_select) || CONFIG.global.activity_select;
  return !!(sel && st(sel).s === (a.state_value || id));
}
/* all entities any activity's state eval depends on (subscribed on
   every screen so activity tiles stay truthful everywhere) */
function activityStateEntities() {
  const set = new Set();
  Object.values(CONFIG.activities || {}).forEach(a => {
    const ents = (a.state || {}).entities || [];
    if (ents.length) ents.forEach(e => set.add(e));
    else {
      /* implied-state witnesses subscribe too — tiles stay truthful */
      const mp = impliedStateEnt(a);
      if (mp) set.add(mp);
    }
  });
  return set;
}
function isActActive(t) { return isActivityActive(t.activity); }

/* Generic action object: { navigate: <screen> } or { sequence: <id> }
   or { service, target|entity, data } — the ONE action grammar shared
   by presets, trailing slots, and key bindings (v0.28). */
function runAction(a) {
  if (!a) return;
  if (a.browse !== undefined) { browseGo(a.browse); return; }
  if (a.navigate) { navigate(a.navigate); return; }
  if (a.sequence) { callService("harmonium", "run", { sequence: a.sequence }); return; }
  if (a.seek !== undefined) {
    /* RELATIVE SEEK (v0.54): HA's media_seek is absolute-only and
       music players have no rewind service — but the engine already
       tracks live position (same interpolation the progress bar
       uses), so {seek: ±N} scrubs any seekable player. */
    const e = resolveEntity(a.target || a.entity || "$context.media_player");
    if (!e) { flashBar("No player wired"); return; }
    const s = st(e);
    let p = s.a.media_position || 0;
    if (s.s === "playing" && s.a.media_position_updated_at)
      p += (Date.now() - Date.parse(s.a.media_position_updated_at)) / 1000;
    let tp = p + (+a.seek || 0);
    if (s.a.media_duration) tp = Math.min(s.a.media_duration - 1, tp);
    tp = Math.max(0, tp);
    callService("media_player", "media_seek", { seek_position: Math.round(tp) }, e);
    flashBar((+a.seek >= 0 ? "⏩ +" : "⏪ −") + Math.abs(+a.seek) + "s");
    return;
  }
  const parts = (a.service || "").split(".");
  if (parts.length !== 2) return;
  const ref = a.target || a.entity;
  const target = resolveEntity(ref);
  if (ref && !target) return;   // unresolved context → no-op, never untargeted
  callService(parts[0], parts[1], a.data, target);
}

/* Presets: one-tap content shortcuts. If the preset names an activity,
   ensure it's running first (Harmony-favorite behavior), then fire. */
function firePreset(t) {
  /* BROWSE taps (v0.49) navigate the library tree, no service call */
  if (t.action && t.action.browse !== undefined) {
    browseGo(t.action.browse);
    return true;
  }
  /* resolve the target NOW — a drawer screen may navigate away before
     a deferred run() fires, and $context must be the drawer's own */
  const a = t.action || {}, parts = (a.service || "").split(".");
  const ref = a.target || a.entity;
  const target = resolveEntity(ref);
  const run = () => {
    /* A PRESET MAY NAME A SEQUENCE (v0.63): the same action grammar
       everything else already speaks. Orchestration belongs HA-side —
       a preset that joins two speakers is a sequence, not a service
       call, and it shouldn't have to spell out harmonium.run by hand.
       Warm-start still applies: the activity comes up first, then
       this runs. */
    if (a.sequence) { runActionRef("sequence:" + a.sequence); return; }
    if (parts.length !== 2) return;
    /* unresolved $context → SAY SO (v0.48.2 — Suresh's silent
       playlist: no music activity on the deck meant no player wired,
       and the tap just shrugged) */
    if (ref && !target) {
      flashBar("No player wired — start an activity that casts one");
      return;
    }
    callService(parts[0], parts[1], a.data, target);
  };
  if (t.activity && !isActivityActive(t.activity)) {
    if (!startActivity(t.activity)) return false;   // switch-confirm pending
    let n = 0;                                  // poll the activity select
    const iv = setInterval(() => {              // (~12s budget) before firing
      if (isActivityActive(t.activity)) { clearInterval(iv); run(); }
      else if (++n > 40) { clearInterval(iv); flashBar("Activity didn't start"); }
    }, TIMING.presetPoll);
  } else run();
  return true;
}
/* An activity's start/stop is an ACTION REF:
     sequence:<id>  — a building-block sequence from the config,
                      executed HA-side by the integration
                      (harmonium.run); first-class citizen
     script.<x>     — a plain HA script entity; 2nd-class but
                      supported forever */
function runActionRef(ref) {
  if (!ref) return;
  if (ref.startsWith("sequence:"))
    callService("harmonium", "run", { sequence: ref.slice(9) });
  else callService("script", "turn_on", null, ref);
}
function startActivity(id) {
  const a = (CONFIG.activities || {})[id];
  if (!a) return false;
  /* optional switch guard: starting an activity while ANOTHER runs
     usually ends it (the HA scripts are exclusive) — when
     confirm_switch is set (per-activity, else global), ask first via
     the status bar. Returns false while the confirm is pending. */
  const cur = currentActivityId();
  const guard = a.confirm_switch != null ? a.confirm_switch
    : !!CONFIG.global.confirm_switch;
  if (cur && cur !== id && guard &&
      !barConfirm("actsw", "Press again to switch to " + (a.name || id), "on"))
    return false;
  /* NO START ACTION is legal (v0.47 — Suresh's blank-player report):
     the activity still becomes ACTIVE (display state + context) so
     the player renders; orchestration is opt-in, not a prerequisite */
  if (a.start) runActionRef(a.start);
  else callService("harmonium", "set_activity", { activity: id });
  /* the tap IS the intent: the player renders as this activity from
     this moment (see currentActivityId's pending impersonation) —
     never the "No activity is active" page — even while the select
     lags or the start action fails. */
  S.pendingActivity = id;
  if (a.screen) navigate(a.screen);
  return true;
}
function endActivity(a) {
  /* the activity's own stop; WITHOUT one it falls back to its page's
     hold-Power binding (the authored sledgehammer), then the current
     page's, then the global one. The special "off" activity is gone
     (v0.28) — All Off is just an Action a binding points at. */
  if (a.stop) { runActionRef(a.stop); return; }
  const owner = a.room_view && CONFIG.screens && CONFIG.screens[a.room_view];
  const b = (owner && owner.buttons && owner.buttons.power_hold) ||
    ((screenOf(S.screen) || {}).buttons || {}).power_hold ||
    (CONFIG.global.buttons || {}).power_hold;
  if (b) runAction(b);
  else flashBar("No stop action set");
}
function requestEnd(t, a) {
  if (a.confirm_end && S.confirmTile !== t.id) {
    S.confirmTile = t.id;
    clearTimeout(S.confirmTimer);
    S.confirmTimer = setTimeout(() => { S.confirmTile = null; renderStates(); }, TIMING.confirm);
    renderStates();
    return;
  }
  clearTimeout(S.confirmTimer); S.confirmTile = null;
  endActivity(a);
  renderStates();
}
function clearConfirm() {
  if (!S.confirmTile) return;
  clearTimeout(S.confirmTimer); S.confirmTile = null;
}

/* Status-bar two-press confirm (no tile to turn red): first press
   flashes the prompt — pulsing red for OFF-flavored confirms, accent
   for ON (tone, default "off") — second within TIMING.confirm
   returns true. */
function barConfirm(key, msg, tone) {
  if (barConfirm._t == null) barConfirm._t = {};
  const t = barConfirm._t;
  if (Date.now() - (t[key] || 0) > TIMING.confirm) {
    t[key] = Date.now();
    flashBar(msg, tone || "off", TIMING.confirm);
    return false;
  }
  t[key] = 0;
  cfmClear();          // confirmed: stop the pulse — the action is happening
  return true;
}
