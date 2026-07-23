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
function activityStateOn(a) {
  const d = a && a.state;
  if (!d || !d.on) return null;               // no declaration → v1 truth
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
  const sel = CONFIG.global.activity_select;
  return !!(sel && st(sel).s === (a.state_value || id));
}
/* all entities any activity's state eval depends on (subscribed on
   every screen so activity tiles stay truthful everywhere) */
function activityStateEntities() {
  const set = new Set();
  Object.values(CONFIG.activities || {}).forEach(a =>
    ((a.state || {}).entities || []).forEach(e => set.add(e)));
  return set;
}
function isActActive(t) { return isActivityActive(t.activity); }

/* Generic action object: { navigate: <screen> } or
   { service, target|entity, data } — same grammar presets use. */
function runAction(a) {
  if (!a) return;
  if (a.navigate) { navigate(a.navigate); return; }
  const parts = (a.service || "").split(".");
  if (parts.length === 2)
    callService(parts[0], parts[1], a.data, resolveEntity(a.target || a.entity));
}

/* Presets: one-tap content shortcuts. If the preset names an activity,
   ensure it's running first (Harmony-favorite behavior), then fire. */
function firePreset(t) {
  /* resolve the target NOW — a drawer screen may navigate away before
     a deferred run() fires, and $context must be the drawer's own */
  const a = t.action || {}, parts = (a.service || "").split(".");
  const target = resolveEntity(a.target || a.entity);
  const run = () => {
    if (parts.length !== 2) return;
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
  runActionRef(a.start);
  if (a.screen) navigate(a.screen);
  return true;
}
function endActivity(a) {
  runActionRef(a.stop ||
    (CONFIG.activities && CONFIG.activities.off && CONFIG.activities.off.start));
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
  const t = (barConfirm._t ??= {});
  if (Date.now() - (t[key] || 0) > TIMING.confirm) {
    t[key] = Date.now();
    flashBar(msg, tone || "off", TIMING.confirm);
    return false;
  }
  t[key] = 0;
  cfmClear();          // confirmed: stop the pulse — the action is happening
  return true;
}
