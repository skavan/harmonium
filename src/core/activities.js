/* ================================================================
   Activities: select = start (off) / open (running); hold or
   power = end, with optional inline two-press confirm.
   ================================================================ */
function actOf(t) { return (CONFIG.activities || {})[t.activity] || null; }
function isActivityActive(id) {
  const a = (CONFIG.activities || {})[id], sel = CONFIG.global.activity_select;
  return !!(a && sel && st(sel).s === (a.state_value || id));
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
  if (a.start) callService("script", "turn_on", null, a.start);
  if (a.screen) navigate(a.screen);
  return true;
}
function endActivity(a) {
  const stopScript = a.stop ||
    (CONFIG.activities && CONFIG.activities.off && CONFIG.activities.off.start);
  if (stopScript) callService("script", "turn_on", null, stopScript);
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
