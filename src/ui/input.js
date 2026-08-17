/* ================================================================
   Input: keyboard → logical buttons → actions
   ================================================================ */
let holdTimer = null, holdFired = false;

/* ---- v2 control target -------------------------------------------
   A view may declare `control_target` (v2 authoring): which entity the
   physical keys drive (navigation/power/volume) and WHICH keys pass
   through. The active activity's `controls` map is the fallback, then
   the v1 heuristics (dpad_passthrough / context.dpad). All of this is
   pure data — under a v1 config nothing here changes behavior. */
function controlTarget() {
  const sc = (CONFIG && screenOf(S.screen)) || {};
  if (sc.control_target) return sc.control_target;
  const aid = currentActivityId();
  return (aid && (CONFIG.activities[aid] || {}).controls) || null;
}
function ctPass(button) {
  const ct = controlTarget();
  return !!(ct && Array.isArray(ct.pass_through) && ct.pass_through.includes(button));
}
/* v2 input policy from config.input.physical_buttons — absent = v1 */
function inputPB() {
  return (CONFIG && CONFIG.input && CONFIG.input.physical_buttons) || null;
}

/* device target for hold-Back / hold-Home: control_target.navigation,
   the screen's passthrough entity, or the context dpad slot — null on
   non-device screens (hold then simply behaves like tap). */
function deviceKeyTarget() {
  const scd = (CONFIG && screenOf(S.screen)) || {};
  const ct = controlTarget();
  return resolveEntity((ct && ct.navigation) ||
    scd.dpad_passthrough || ctxFor(S.screen).dpad || null);
}

/* Harmony rule: physical D-pad drives the device when the view says so —
   v2: control_target.pass_through covers all five nav keys;
   v1: the screen declares dpad_passthrough. Touch always drives the UI. */
function passthroughActive() {
  if (!CAPS.has("physical_dpad")) return false;
  const scp = (CONFIG && screenOf(S.screen)) || {};
  if (scp.control_target)
    return ["up", "down", "left", "right", "select"].every(ctPass);
  return !!scp.dpad_passthrough;
}

/* v2 power-to-target: controls.power may be a full {service, entity}
   action; control_target.power is an entity (default: toggle). */
function ctPower() {
  const ct = controlTarget();
  if (!ct || !ct.power) return false;
  if (typeof ct.power === "object" && ct.power.service) {
    const [d, s] = ct.power.service.split(".");
    const tgt = resolveEntity(ct.power.entity || ct.power.target);
    if (tgt) { callService(d, s, ct.power.data, tgt); return true; }
    return false;
  }
  const tgt = resolveEntity(ct.power);
  if (!tgt) return false;
  callService("homeassistant", "toggle", null, tgt);
  return true;
}

/* end the CURRENT activity with the standard confirm flow (shared by
   class-scoped power and the v2 hold-power=activity_end role) */
function endCurrentActivity() {
  const aid = currentActivityId();
  if (!aid) { flashBar("No activity running"); return; }
  const a = CONFIG.activities[aid];
  const tile = tiles().find(x => x.type === "activity" && x.activity === aid);
  if (tile) { setFocus(tile.id); requestEnd(tile, a); return; }
  if (a.confirm_end && !barConfirm("endact", "Press power again to end " + (a.name || aid)))
    return;
  endActivity(a);
  flashBar("Ending " + (a.name || aid));
}

/* v2 routing shim: when config.input.physical_buttons declares the
   short-press-controls-target / hold-navigates-app model, reroute the
   primary keys BEFORE the v1 switch. Returns true when handled.
   PHYSICAL keys only — touch taps always drive the UI. Roles
   "control_target" and "all_off" on holds ARE the v1 defaults, so
   they fall through (return false) and the v1 switch serves them. */
function v2Route(button, phys) {
  const pb = inputPB();
  if (!pb || !phys) return false;
  const short = pb.short_press === "control_target";
  /* short press of back/home/power → the control target (when the view
     passes that key through and a target resolves) */
  if (short && ["back", "home", "power"].includes(button) && ctPass(button)) {
    if (button === "power") return ctPower();
    const tgt = deviceKeyTarget();
    if (tgt) { rc(tgt, cmdFor({}, button)); return true; }
    return false;                          // no target → fall through to UI
  }
  /* hold roles: back_hold/home_hold/power_hold carry the APP action */
  const hold = pb.hold || {};
  const role = { back_hold: hold.back, home_hold: hold.home, power_hold: hold.power }[button];
  if (!role) return false;
  if (role === "app_back") { act("back", false); return true; }
  if (role === "room_home") { act("home", false); return true; }
  if (role === "activity_end") {
    /* hold role: END WITHOUT ASKING (tap owns the confirmation) */
    const aid = currentActivityId();
    if (!aid) { flashBar("No activity running"); return true; }
    endActivity(CONFIG.activities[aid]);
    flashBar("Ending " + (CONFIG.activities[aid].name || aid));
    return true;
  }
  return false;
}

function act(button, phys) {
  if (!CONFIG || !S.screen) return;

  /* Harmony passthrough claims PHYSICAL keys only — touch taps on
     tiles always drive the UI, even on a passthrough screen.
     v0.11: Back is NO LONGER claimed — tap-Back is UI back everywhere;
     hold-Back/Home send the device keys (see keydown). */
  if (phys && passthroughActive() &&
      ["up", "down", "left", "right", "select"].includes(button)) {
    rc(deviceKeyTarget(), cmdFor({}, button));
    /* the Studio preview can't show the device reacting — say where
       the key went so the pad doesn't read as dead */
    if (typeof PREVIEW !== "undefined" && PREVIEW)
      flashBar("D-pad → device (passthrough)");
    return;
  }

  /* v2 input policy (config.input.physical_buttons): short press →
     control target, hold → app. No-op under a v1 config. */
  if (v2Route(button, phys)) return;

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
    case "power_hold": {
      /* long-press Power (v0.28): a power_hold BINDING is the page's
         authored sledgehammer (screen.buttons over global.buttons —
         "Porch All Off" is just an Action it points at). Unbound =
         the derived default: end the running activity IMMEDIATELY
         (tap asks, the deliberate hold doesn't); idle = nothing. */
      const bh = Object.assign({}, CONFIG.global.buttons,
        (screenOf(S.screen) || {}).buttons || {}).power_hold;
      if (bh) { runAction(bh); break; }
      const cur = currentActivityId();
      if (!cur) { flashBar("Nothing running"); break; }
      const ca = CONFIG.activities[cur] || {};
      endActivity(ca);
      flashBar("Ending " + (ca.name || cur));
      break;
    }
    case "menu": {
      /* physical MENU key (Astrion: '#') → the device's menu command
         on screens with a device context; on a multi-section page
         without one, MENU tours the categories (wraps) */
      const mt = deviceKeyTarget();
      if (mt) { rc(mt, cmdFor({}, "menu")); break; }
      heroCycle(1, true);
      break;
    }
    case "home": {
      /* home goes UP one level via the screen's `parent` (fallback:
         sub screen → room page; room page → global.main_home). Home
         RESETS history (isBack navigation → chevron hides). */
      S.stack = [];
      const scr = screenOf(S.screen) || {};
      const dest = (scr.parent && screenOf(scr.parent)) ? scr.parent
        : S.screen !== CONFIG.home_screen ? CONFIG.home_screen
        : CONFIG.global.main_home;
      if (dest && screenOf(dest) && dest !== S.screen) navigate(dest, true);
      break;
    }
    case "power": {
      /* Power is a PER-PAGE SETTING (v0.26), default Auto:
         detail → toggle the device (immediate — one device, reversible)
         auto   → hosts activities → end the running one (confirm);
                  plain page → all page devices off/on (confirm)
         screen.power: "activity" | "devices" overrides Auto */
      const scp2 = screenOf(S.screen) || {};
      const cls = classOf(scp2, S.screen);
      const aid = currentActivityId();
      if (cls === "detail") {
        callService("homeassistant", "toggle", null, S.screen.slice(7));
        break;
      }
      const scope = scp2.power === "activity" ? "activity"
        : scp2.power === "devices" ? "devices"
        : cls === "group" ? "devices" : "activity";
      if (scope === "devices") {
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
        /* doctrine 2026-07-23: idle view -> tap does NOTHING (hold is
           the All Off gesture); no more idle-tap All Off confirm.
           v0.61 amends that for ONE case: a surface being drawn as its
           PRESUMED activity. What you are looking at IS that activity,
           off — so power starts it, which is the only thing the button
           could sensibly mean here. An idle ROOM page presumes nothing
           and still does nothing. */
        const pres = presumedActivity();
        if (pres) {
          const pa = CONFIG.activities[pres] || {};
          startActivity(pres);
          flashBar("Starting " + (pa.name || pres), "on");
          break;
        }
        flashBar("Nothing running");
        break;
      }
      endCurrentActivity();
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
      if (b) { runAction(b); break; }   // shared grammar: navigate/sequence/service
      /* VOL DEFAULT (v0.83.7 — Suresh's Watch Fire TV: "remote volume
         keys and browser volume keys dont do anything. They should
         route to the TV which assigned the Volume role"): the doctrine
         says VOL is always audio, so it must not DEPEND on a config
         binding — the starter config shipped without one and every
         volume key on such an install was dead. Unbound VOL now goes
         to the activity's wired volume ($context.volume), exactly
         like the mute default below; a config binding still wins. */
      if (button === "vol_up" || button === "vol_down") {
        const vt = resolveEntity("$context.volume");
        if (vt) callService("media_player",
          button === "vol_up" ? "volume_up" : "volume_down", null, vt);
        break;
      }
      /* unbound CH on a multi-section page = CATEGORY/SECTION paging
         (the Music Library's ▲▼; bindings above always win) */
      /* browse bands (v0.50): CH steps the CATEGORY strip (wraps) */
      if ((button === "ch_up" || button === "ch_down") &&
          typeof brStepCat === "function" &&
          brStepCat(button === "ch_up" ? 1 : -1)) break;
      if ((button === "ch_up" || button === "ch_down") &&
          heroCycle(button === "ch_up" ? 1 : -1)) break;
      /* mute default (no config binding needed): toggle mute on the
         context audio path — same ARC-aware target VOL uses.
         v0.83.10 (status review #7 — his call): a FOCUSED volume tile
         wins — with the receiver's volume row selected, mute means
         THAT receiver; nothing focused (or anything else focused)
         keeps the Volume-role default. */
      if (button === "mute") {
        /* trailBase assumes a …TRAIL id — strip only when present */
        const fid = S.focusId || "";
        const ft = tileDef(fid.endsWith(TRAIL) ? trailBase(fid) : fid);
        const fv = ft && (ft.type === "volume" ||
          (ft.type === "stepper" && ft.kind === "volume"))
          ? resolveEntity(ft.entity) : null;
        const tgt = (fv && fv.split(".")[0] === "media_player" ? fv : null) ||
          resolveEntity("$context.volume");
        if (tgt) {
          const rd = (ft && fv === tgt && resolveEntity(ft.level_entity)) || tgt;
          callService("media_player", "volume_mute",
            { is_volume_muted: !st(rd).a.is_volume_muted }, tgt);
        }
      }
      break;
    }
    default: {
      /* OPEN BUTTON VOCABULARY (v0.54 — Suresh: "dpad left hold and
         right hold to do RWD and FFWD"): ANY logical button a keymap
         can emit is bindable — a screen/global `buttons` entry runs
         its action (shared grammar: navigate/sequence/service/seek).
         Unbound stays a deliberate no-op. left_hold/right_hold land
         here; new remotes can mint new names without engine edits. */
      const bd = Object.assign({}, CONFIG.global.buttons,
        (screenOf(S.screen) || {}).buttons || {})[button];
      if (bd) runAction(bd);
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
  /* KEY CAPTURE screen (v0.55): log EVERYTHING (mapped or not) and
     swallow it — a captured "back" must not navigate. Exit is the
     title-bar ‹ chevron (a DOM click, not this path). */
  if (S.screen === "keys:") {
    e.preventDefault();
    if (!e.repeat) keycapLog(e);
    return;
  }
  /* SEARCH TYPING (v0.65): while the library's search bar is open,
     TEXT WINS — the same contract as any focused field on any OS.
     It has to: the profiles bind `m`→mute, `p`→power, `o`→power_hold
     and space→select as desktop conveniences, so a rule of "don't
     capture mapped keys" made those four letters untypable and turned
     Backspace into Back, which navigated out of the library mid-word.
     Only PRINTABLE keys are taken. Arrows, Enter, F-keys and the
     punctuation KeyMapper actually emits (`[`, `;`, `#`, backtick,
     PageUp…) still route as buttons, so a hardware remote loses
     nothing and can still walk the results and press play. Escape
     closes search, which hands Escape back to Back. */
  if (S.browse && S.browse.qon && S.browse._active) {
    if (e.key === "Backspace") { e.preventDefault(); brKey("<"); return; }
    if (e.key === "Escape") { e.preventDefault(); brSearchToggle(); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey &&
        /[a-z0-9 ]/i.test(e.key)) {
      e.preventDefault();
      brKey(e.key === " " ? "_" : e.key.toLowerCase());
      return;
    }
  }
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
  if (S.screen === "keys:") { e.preventDefault(); return; }
  if (KEYMAP[e.key] !== "select") return;
  e.preventDefault();
  clearTimeout(holdTimer);
  if (!holdFired) act("select", true);
  holdFired = false;
});
