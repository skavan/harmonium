/* ================================================================
   Input: keyboard → logical buttons → actions
   ================================================================ */
let holdTimer = null, holdFired = false;

/* device target for hold-Back / hold-Home: the screen's passthrough
   entity or the context dpad slot — null on non-device screens
   (hold then simply behaves like tap). */
function deviceKeyTarget() {
  const scd = (CONFIG && screenOf(S.screen)) || {};
  return resolveEntity(scd.dpad_passthrough || ctxFor(S.screen).dpad || null);
}

/* Harmony rule: on a screen declaring dpad_passthrough, a physical
   D-pad drives the device directly (touch drives the UI). */
function passthroughActive() {
  const scp = (CONFIG && screenOf(S.screen)) || {};
  return !!(scp.dpad_passthrough && CAPS.has("physical_dpad"));
}

function act(button, phys) {
  if (!CONFIG || !S.screen) return;

  /* Harmony passthrough claims PHYSICAL keys only — touch taps on
     tiles always drive the UI, even on a passthrough screen.
     v0.11: Back is NO LONGER claimed — tap-Back is UI back everywhere;
     hold-Back/Home send the device keys (see keydown). */
  if (phys && passthroughActive() &&
      ["up", "down", "left", "right", "select"].includes(button)) {
    const scp = screenOf(S.screen);
    rc(resolveEntity(scp.dpad_passthrough), cmdFor({}, button));
    return;
  }

  const t = tileDef(S.focusId), w = t && WIDGETS[t.type];
  const eid = t ? resolveEntity(t.entity) : null;

  if (S.captured && w && w.capture) {          // widget owns the D-pad
    const h = w.capture[button];
    if (h) { h(eid, t); renderStates(); return; }
    if (button === "back") { releaseCapture(); renderStates(); return; }
    if (button === "home") { releaseCapture(); navigate(CONFIG.home_screen); return; }
  }

  switch (button) {
    case "up": case "down":
      spatialMove(button); break;
    case "left": case "right": {
      /* widget-owned ◀▶ while merely FOCUSED (no capture) — e.g.
         coverbtns' roving highlight */
      if (!isTrailId(S.focusId) && w && w.keys && w.keys[button]) {
        w.keys[button](eid, t); renderStates(); break;
      }
      if (!spatialMove(button)) pageScreen(button);
      break;
    }
    case "select": {
      if (typeof S.focusId === "string" && S.focusId.startsWith("hero_")) {
        heroActivate(S.focusId); break;
      }
      if (isTrailId(S.focusId)) {
        const tr = trailingOf(tileDef(trailBase(S.focusId)));
        if (tr) runAction(tr.action);
        break;
      }
      if (!w) break;
      if (S.confirmTile === t.id && w.select) { w.select(eid, t); break; }
      if (w.selectCaptures) { enterCapture(); renderStates(); }
      else if (w.select) { w.select(eid, t); renderStates(); }
      break;
    }
    case "back":
      if (S.confirmTile) { clearConfirm(); renderStates(); break; }
      if (S.stack.length) navigate(S.stack.pop(), true);
      break;
    case "back_hold": case "home_hold": {
      /* SHELL-OWNED hold gesture: KeyMapper maps a physical long-press
         to a distinct key (see keymap), because injected keys don't
         deliver reliable keyup/hold timing to the webview. Sends the
         DEVICE's back/home; degrades to tap without a device target. */
      const base = button === "back_hold" ? "back" : "home";
      const tgt = deviceKeyTarget();
      if (tgt) rc(tgt, cmdFor({}, base));
      else act(base, phys);
      break;
    }
    case "power_hold":
      /* shell-owned long-press power = All Off, WITH two-press confirm
         (user call: blast radius deserves the prompt even on the
         deliberate gesture) */
      if (barConfirm("alloffh", "Hold power again to turn everything off")) {
        endActivity({});
        flashBar("All Off");
      }
      break;
    case "menu": {
      /* physical MENU key (Astrion: '#') → the device's menu command
         on screens with a device context; no-op elsewhere */
      const mt = deviceKeyTarget();
      if (mt) rc(mt, cmdFor({}, "menu"));
      break;
    }
    case "home": {
      /* home goes UP one level via the screen's `parent` (fallback:
         sub screen → room page; room page → global.main_home). Home
         RESETS history (isBack navigation → chevron hides). */
      S.stack = [];
      const scr = screenOf(S.screen) || {};
      const dest = (scr.parent && CONFIG.screens[scr.parent]) ? scr.parent
        : S.screen !== CONFIG.home_screen ? CONFIG.home_screen
        : CONFIG.global.main_home;
      if (dest && CONFIG.screens[dest] && dest !== S.screen) navigate(dest, true);
      break;
    }
    case "power": {
      /* Power is SCOPED BY SCREEN CLASS:
         detail → toggle the device (immediate — one device, reversible)
         group  → all page devices off/on (status-bar confirm)
         activity → end the running activity (confirm)
         room   → activity end if running, else All Off (confirm) */
      const scp2 = screenOf(S.screen) || {};
      const cls = classOf(scp2, S.screen);
      const aid = currentActivityId();
      if (cls === "detail") {
        callService("homeassistant", "toggle", null, S.screen.slice(7));
        break;
      }
      if (cls === "group") {
        const ents = powerEntities(scp2);
        if (!ents.length) { flashBar("Nothing to switch"); break; }
        const anyOn = ents.some(x => ACTIVE(st(x).s));
        if (!barConfirm("gpwr", `Press power again to turn ${ents.length} devices ${anyOn ? "off" : "on"}`,
            anyOn ? "off" : "on"))
          break;
        callService("homeassistant", anyOn ? "turn_off" : "turn_on", null, ents);
        flashBar((anyOn ? "Turning off " : "Turning on ") + ents.length + " devices");
        break;
      }
      if (!aid) {
        if (cls === "room") {                    // room, nothing running → All Off
          if (barConfirm("alloff", "Press power again to turn everything off")) {
            endActivity({});
            flashBar("All Off");
          }
        } else flashBar("No activity running");
        break;
      }
      const a = CONFIG.activities[aid];
      const tile = tiles().find(x => x.type === "activity" && x.activity === aid);
      if (tile) { setFocus(tile.id); requestEnd(tile, a); break; }
      /* no activity tile on this screen → confirm via the status bar */
      if (a.confirm_end && !barConfirm("endact", "Press power again to end " + (a.name || aid)))
        break;
      endActivity(a);
      flashBar("Ending " + (a.name || aid));
      break;
    }
    case "vol_up": case "vol_down": case "ch_up": case "ch_down":
    case "mute": case "menu_hold": {
      /* Exception to "VOL is always audio": on a device DETAIL
         screen, VOL nudges that device's primary range (brightness,
         setpoint, volume, position). Everywhere else: activity audio. */
      if ((button === "vol_up" || button === "vol_down") &&
          typeof S.screen === "string" && S.screen.startsWith("detail:")) {
        const de = S.screen.slice(7);
        const kind = DETAIL_VOL_KIND[de.split(".")[0]];
        if (kind) { nudgeStep(de, kind, button === "vol_up" ? +1 : -1); break; }
      }
      /* v0.11 focus-follows: focused device tile with a primary range →
         VOL nudges IT. Media is carved out — a focused media tile keeps
         the context audio path ($context.volume), never volume_set on
         the focused player, so ARC/CEC volume routing survives. */
      if ((button === "vol_up" || button === "vol_down") && eid) {
        const fd = eid.split(".")[0];
        if (fd !== "media_player" && DETAIL_VOL_KIND[fd]) {
          nudgeStep(eid, DETAIL_VOL_KIND[fd], button === "vol_up" ? +1 : -1);
          renderStates();
          break;
        }
      }
      /* logical-button bindings: a screen-level `buttons` map overrides
         global.buttons per screen (e.g. music binds ch_up/ch_down to
         next/previous track, menu_hold to the music drawer); entries
         use the shared action grammar — {service, entity|target, data}
         OR {navigate: <screen>} */
      const bmap = Object.assign({}, CONFIG.global.buttons,
        (screenOf(S.screen) || {}).buttons || {});
      const b = bmap[button];
      if (b) {
        if (b.navigate) { navigate(b.navigate); break; }
        const target = resolveEntity(b.entity || b.target);
        if (!target) break;                    // unresolved context → no-op,
        const [domain, service] = b.service.split(".");   // never untargeted
        callService(domain, service, b.data, target);
        break;
      }
      /* mute default (no config binding needed): toggle mute on the
         context audio path — same ARC-aware target VOL uses */
      if (button === "mute") {
        const tgt = resolveEntity("$context.volume");
        if (tgt) callService("media_player", "volume_mute",
          { is_volume_muted: !st(tgt).a.is_volume_muted }, tgt);
      }
      break;
    }
  }
}

/* ---- key-event debug card ----------------------------------------
   Enable via config global.debug, URL #debug=1 (sticky, #debug=0
   clears), or localStorage hakr_debug=1. Logs RAW keyboard events in
   CAPTURE phase — before any engine handling, including unmapped keys
   — to diagnose what the shell/KeyMapper actually delivers. */
const DBG = { on: false, lines: [], last: 0 };
function dbgInit() {
  DBG.on = !!(CONFIG && CONFIG.global && CONFIG.global.debug) ||
    localStorage.getItem("hakr_debug") === "1";
  document.getElementById("dbg").classList.toggle("hidden", !DBG.on);
  if (DBG.on) dbgLog("debug on · press keys…");
}
function dbgLog(msg) {
  if (!DBG.on) return;
  const now = performance.now();
  const dt = DBG.last ? Math.round(now - DBG.last) : 0;
  DBG.last = now;
  DBG.lines.unshift("+" + String(dt).padStart(4) + "ms " + msg);
  if (DBG.lines.length > 7) DBG.lines.length = 7;
  document.getElementById("dbg").textContent = DBG.lines.join("\n");
}
function dbgKey(t, e) {
  dbgLog(t + " key=" + JSON.stringify(e.key) + " code=" + (e.code || "?") +
    " kc=" + e.keyCode + (e.repeat ? " rpt" : "") +
    " → " + (KEYMAP[e.key] || "(unmapped)"));
}
window.addEventListener("keydown", e => dbgKey("▼", e), true);
window.addEventListener("keyup", e => dbgKey("▲", e), true);
window.addEventListener("keypress", e => dbgKey("·", e), true);

/* FIELD LESSON (v0.11.1): KeyMapper-injected keys do NOT deliver
   reliable keyup/hold timing to the webview — keyup-gated taps and
   in-engine hold timers died on the Astrion. Doctrine: taps fire on
   KEYDOWN (instant, field-proven); HOLD gestures are the SHELL's job —
   KeyMapper long-press mappings send DISTINCT keys (back_hold /
   home_hold / power_hold). Select keeps its keyup+timer hold-capture
   (Enter delivers proper pairs and the gesture is field-verified). */
document.addEventListener("keydown", e => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; // let the auth form type
  const b = KEYMAP[e.key];
  if (!b) return;
  e.preventDefault();
  if (b === "select") {                         // hold-select gesture
    if (e.repeat || S.captured || passthroughActive()) return; // tap on keyup
    holdFired = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {              // timer-based: works even
      holdFired = true;                         // if the shell sends no
      const t = tileDef(S.focusId);             // key-repeat events
      const w = t && WIDGETS[t.type];
      if (w && w.holdCapture && w.capture) enterCapture();
      else if (w && w.hold) w.hold(resolveEntity(t.entity), t);
      renderStates();
    }, TIMING.hold);
    return;
  }
  if (e.repeat && !S.captured && b !== "vol_up" && b !== "vol_down") return;
  act(b, true);
});

document.addEventListener("keyup", e => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (KEYMAP[e.key] !== "select") return;
  e.preventDefault();
  clearTimeout(holdTimer);
  if (!holdFired) act("select", true);
  holdFired = false;
});
