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
/* THE BINDING LADDER (v0.83.11 — Suresh: "There should be an apply
   to children toggle, so if I set these on a parent page (i.e.
   Porch), they apply to porch and all its child controllers"):
   global.buttons → inheriting ANCESTORS (farthest first, so nearer
   overrides) → the screen's own buttons. A page OFFERS its bindings
   downward with `buttons_inherit: true`; a child takes them by
   standing under it — plain pages/drawers climb their declared
   `parent` chain, and a controller or virtual screen with no parent
   hops to the room it serves (the running/presumed activity's
   room_view). The current screen's own bindings always apply. */
function bindChain() {
  const out = [];                      /* screen objects, nearest first */
  const seen = new Set();
  let cur = S.screen, hops = 0;
  while (cur && !seen.has(cur) && hops++ < 12) {
    seen.add(cur);
    const sc = rawScreen(cur);
    if (sc) out.push(sc);
    let next = sc && sc.parent;
    if (!next) {
      /* the room hop is for screens with no PLACE of their own —
         controllers (library or legacy) and virtual screens. A plain
         page without a parent is a ROOT, not a child of whatever
         room happens to be running (caught by the probe: child2
         inherited porch's bindings through the running activity). */
      const hopper = !sc ||
        (typeof cur === "string" && cur.indexOf("controller:") === 0) ||
        sc.type === "controller" || sc.class === "activity";
      if (hopper) {
        const aid = renderActivityId() || presumedActivity();
        const room = aid && CONFIG.activities && CONFIG.activities[aid] &&
          CONFIG.activities[aid].room_view;
        next = room && !seen.has(room) ? room : null;
      }
    }
    cur = next;
  }
  return out;
}
/* DIALECT CAPABILITIES (v0.84.3 — Suresh: "devices have their own
   custom commands, remotes have theirs; the engine is the glue").
   The active context's dialect may declare `capabilities` — a
   button→action map in the shared grammar (service/data/navigate,
   targets as $context.<role>), so a device-type verb like Fire TV's
   `settings` (androidtv.adb_command) lives ONCE on the dialect and
   reaches every activity of that type, instead of being hardcoded
   into a shared controller (where it would poison other device
   types). Lowest rung of the ladder: global/ancestor/screen bindings
   all override it, and an unwired role no-ops in runAction — so an
   unbound, unwired, or wrong-type press stays a deliberate no-op.
   (Design: claude/design-device-capabilities.md — this is slice 1,
   dialect-only; the device_classes layer is deferred.) */
function dialectButtons() {
  const d = ctxFor(S.screen).dialect;
  const dial = d && CONFIG.dialects && CONFIG.dialects[d];
  return (dial && dial.capabilities) || {};
}
function boundButtons() {
  const out = Object.assign({}, dialectButtons());
  Object.assign(out, CONFIG.global && CONFIG.global.buttons);
  const chain = bindChain();
  /* chain[0] is the CURRENT screen only when it's a real (authored)
     one — on a virtual screen (detail:/group:/…) every entry is an
     ancestor and stays opt-in, so a room's bindings reach its detail
     pages exactly when buttons_inherit says so */
  const ownFirst = !!rawScreen(S.screen);
  for (let i = chain.length - 1; i >= 0; i--)
    if ((ownFirst && i === 0) || chain[i].buttons_inherit)
      Object.assign(out, chain[i].buttons || {});
  return out;
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

/* ================================================================
   THE PAD DOCTRINE, FINAL FORM (2026-08-20 — three field rounds
   converged on Suresh's sentence: "dpad should always navigate the
   screen EXCEPT for the TV, where ChUp and ChDn engage panel
   mode"). One rule: THE PAD DRIVES WHICHEVER SCREEN YOU'RE
   NAVIGATING. A page that declares a device navigation target (TV,
   receiver OSD) sends the pad THERE, and CH walks the LCD instead
   (borrowing the pad while you walk — the strip says so). Every
   other page — rooms, details, and yes, MUSIC — the pad walks the
   LCD natively and OK means the focused tile (play/pause on the
   hero, mute on a volume row: the widgets already speak music).
   The earlier "transport pad" owner (▲=next, then the same-day
   at-rest hybrid) is DELETED — both put a hidden mode on keys whose
   focus-follows meaning was already right ("I am on the receiver
   tile … I hit OK and it pauses the music" — that was the bug).
   Media conveniences live on keys the panel doesn't need:
   hold-◀/▶ seek ∓15s · hold-CH▲/▼ previous/next track · short CH
   jumps sections (walks when there's nothing to jump) · menu →
   library via the stock binding — and the astrion2 glyph row
   (prev/play_pause/stop/next) works from ANY page while music runs.
   Physical keys only for the pad claim, as passthrough always was.
   ================================================================ */
/* who owns the physical pad on THIS screen (latch aside):
   "device" — passthrough (TV/OSD): keys go to the wired dpad entity
   null     — the panel's own: everything else, music included */
function padOwner() {
  if (!CAPS.has("physical_dpad")) return null;
  return passthroughActive() ? "device" : null;
}
/* a MUSIC-SHAPED page: an activity controller with a media player
   in context and no device navigation target — where the media
   defaults (hold-seek, hold-CH track skip, CH section jump) live */
function mediaScreen() {
  const sc = (CONFIG && screenOf(S.screen)) || {};
  if (sc.dpad_passthrough) return false;
  if (sc.control_target &&
      ["up", "down", "left", "right", "select"].every(ctPass)) return false;
  return (sc.class === "activity" || sc.type === "controller") &&
    !!resolveEntity("$context.media_player");
}
/* the page that IS the music library: it renders a browse tile.
   FIELD LESSON (2026-08-20 round 4: "ChUp … seems to be jumping
   sections in the Music Library which isn't even on screen!"):
   S.browse persists after leaving the library, so brStepCat MUST
   be gated to the screen that actually shows it — stepping an
   invisible category strip also re-navigated the current screen
   and threw the focus to the first tile. */
function browseScreen() {
  /* read the RAW screen def — the browse tile expands into item
     tiles at render time, so the rendered list no longer says
     "browse" */
  const sc = (CONFIG && screenOf(S.screen)) || {};
  const secs = sc.sections || (sc.tiles ? [{ tiles: sc.tiles }] : []);
  return secs.some(s => (s.tiles || []).some(t => t && t.type === "browse"));
}
/* music surfaces = the controller AND its library (his round-4
   call: the library's CH steps the category strip; both get the
   hold conveniences). The apps drawer is a library too but not a
   music surface — no browse tile, so it stays plain. */
function musicSurface() {
  return mediaScreen() ||
    (browseScreen() && !!resolveEntity("$context.media_player"));
}
/* the player the transport keys drive: the page's own context first,
   else the RUNNING activity's — so astrion2's dedicated transport
   row (F4–F7) works from the room page, the library, anywhere */
function mediaCtx() {
  const t = resolveEntity("$context.media_player");
  if (t) return t;
  const aid = currentActivityId();
  const c = aid && CONFIG.activities[aid] && CONFIG.activities[aid].context;
  return (c && typeof c.media_player === "string") ? c.media_player : null;
}
/* the borrow: any CH press arms/renews it (rolling TIMING.padLatch);
   so does every latched pad press. Back, touch, and navigation end
   it early. On panel-native screens it never arms — no mode where
   there is no mode to enter. */
function padLatched() { return (S.padLatch || 0) > Date.now(); }
function padArm() {
  if (!padOwner()) return;
  /* the borrow window: config input.pad_latch_seconds (Code tab on
     the Input policy slice) beats the 8s default */
  const ms = (CONFIG && CONFIG.input && +CONFIG.input.pad_latch_seconds > 0)
    ? +CONFIG.input.pad_latch_seconds * 1000 : (TIMING.padLatch || 8000);
  S.padWindow = ms;                 // the full window, for the countdown bar
  S.padLatch = Date.now() + ms;
  padStrip();
  drawClaimBar();
}
/* THE CLAIM COUNTDOWN BAR (2026-08-24): an accent line on the focused
   tile's bottom edge that starts full and shrinks to zero as the borrow
   runs down — the per-element twin of the pad strip's drain. Re-seeks on
   every call (negative animation-delay), so a grid re-render mid-claim
   resumes at the right point instead of refilling. Cleared when the
   claim ends or focus clears. TV pages only (padOwner === device). */
function drawClaimBar() {
  const old = document.getElementById("claimbar");
  if (old) old.remove();
  if (!padLatched() || padOwner() !== "device" || !S.focusId) return;
  const el = (typeof focusEl === "function") && focusEl(S.focusId);
  if (!el || !el.closest || !el.closest("#grid")) return;
  const win = S.padWindow || 0, rem = S.padLatch - Date.now();
  if (win <= 0 || rem <= 0) return;
  const bar = document.createElement("div");
  bar.id = "claimbar";
  bar.style.animationDuration = win + "ms";
  bar.style.animationDelay = (rem - win) + "ms";   // negative: seek to now
  el.appendChild(bar);
}
function padClear() {
  if (!S.padLatch) return;
  S.padLatch = 0;
  padStrip();
}
function padStrip() {
  /* RING ⇔ CLAIM on TV pages (2026-08-24): when the borrow lapses,
     drop the panel focus so the ring never outlives the claim — the
     exit bookend of no-default-focus-on-TV-entry (render.js). */
  if (!padLatched() && padOwner() === "device" && S.focusId) setFocus(null);
  const el = document.getElementById("padstrip");
  if (!el) return;
  const on = padLatched();
  el.classList.toggle("hidden", !on);
  /* the grid's bottom padding must clear BOTH strips while the
     borrow is on (v0.85.7 — Suresh: a Ch-scrolled tile "sits
     underneath that strip [and] gets clipped"): #app carries the
     state class (CH-61: no :has()), grid.css sizes the padding. */
  document.getElementById("app").classList.toggle("padstrip-on", on);
  /* the final second is a VISIBLE DRAIN (spec §6.4): the strip warns
     that the next press hands the pad back to the device */
  el.classList.toggle("draining", on && (S.padLatch - Date.now()) <= 1000);
  clearTimeout(padStrip._t);
  if (on) {
    const left = S.padLatch - Date.now();
    /* wake at drain-start (1s before expiry), then at expiry */
    const next = left > 1000 ? left - 1000 : left;
    padStrip._t = setTimeout(padStrip, Math.max(60, next + 30));
  }
}
/* hands on the glass = the panel is being TOUCHED; the pad returns
   to the activity immediately */
document.addEventListener("pointerdown", () => padClear(), true);
/* the dedicated transport keys (astrion2's glyph row, or any remote
   naming keys prev/play_pause/stop/next) — fired at mediaCtx() so
   they follow the running music from any page */
function padMedia(button, tgt) {
  callService("media_player",
    button === "prev" ? "media_previous_track"
    : button === "next" ? "media_next_track"
    : button === "stop" ? "media_stop" : "media_play_pause", null, tgt);
  if (typeof PREVIEW !== "undefined" && PREVIEW)
    flashBar(button === "prev" ? "⏮ Previous track"
      : button === "next" ? "⏭ Next track"
      : button === "stop" ? "⏹ Stop" : "⏯ Play/Pause");
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

/* repaint after the focus leaves an options-mode tile — its render
   clears the roving highlight only when it runs */
function blurRove(prevId) {
  if (!prevId || prevId === S.focusId) return;
  const t = tileDef(prevId);
  if (t && typeof navOf === "function" && navOf(t) === "options") renderStates();
}

/* THE KEY-MAP CARD (spec §10.1, 2026-08-24): "what do my buttons do
   HERE?" — computed for the CURRENT page (so it must be snapshotted at
   ⓘ-tap time, before opening diag, which navigates away). Contextual by
   design; this is the pressure valve that lets routing be page-aware
   without being mysterious. Returns [{k, d}] rows the diag page renders. */
function keymapFriendly(eid) {
  const s = eid && st(eid);
  return (s && s.a && s.a.friendly_name) || eid || "";
}
function keymapActionDesc(a) {
  if (!a) return "—";
  if (a.navigate) {
    const s = screenOf(a.navigate) || rawScreen(a.navigate);
    return "Open " + ((s && s.name) || String(a.navigate).replace(/^.*:/, ""));
  }
  if (a.sequence) return "Run " + a.sequence;
  if (a.service) {
    const verb = a.service.split(".")[1] || a.service;
    const cmd = a.data && a.data.command;
    return deslug(verb) + (cmd ? " · " + cmd : "");
  }
  if (a.seek !== undefined) return (a.seek >= 0 ? "+" : "") + a.seek + "s";
  return "action";
}
function keymapCardRows() {
  const sc = screenOf(S.screen) || {};
  const pt = passthroughActive();
  const tuner = !!(sc.tuner || (sc.control_target && sc.control_target.tuner));
  const bb = boundButtons();
  const rows = [];
  rows.push({ k: "▲ ▼ ◀ ▶ · OK",
    d: pt ? "Drive the device" : "Move focus · OK activates" });
  rows.push({ k: "CH + −",
    d: tuner ? "Channel up / down (device)"
      : pt ? "Reveal / walk the panel (borrows the pad)"
      : "Walk the panel" });
  rows.push({ k: "Back",
    d: pt ? "Device back · hold = Harmonium" : "Harmonium back" });
  rows.push({ k: "Home",
    d: pt ? "Device home · hold = Harmonium" : "Harmonium home" });
  const bm = bb.menu;
  rows.push({ k: "Menu",
    d: bm ? keymapActionDesc(bm)
      : (deviceKeyTarget() ? "Device menu" : "Open the focused tile's page") });
  const vt = resolveEntity("$context.volume");
  rows.push({ k: "Vol + − · Mute",
    d: vt ? "→ " + keymapFriendly(vt) : "nothing wired" });
  const mp = mediaCtx();
  if (mp) rows.push({ k: "⏮ ⏯ ⏭", d: "→ " + keymapFriendly(mp) });
  ["source", "settings", "screencast"].forEach(function (b) {
    if (bb[b]) rows.push({ k: cap(b), d: keymapActionDesc(bb[b]) });
  });
  return rows;
}
/* snapshot the current page's key map, then hand off to the diag page */
function openKeymapCard() {
  const sc = screenOf(S.screen);
  S.keymapCard = { page: (sc && barTitle(sc)) || "this page", rows: keymapCardRows() };
  navigate("diag:");
}

function act(button, phys) {
  if (!CONFIG || !S.screen) return;

  /* THE PAD CLAIM (2026-08-20 doctrine, final form) — PHYSICAL keys
     only; touch taps always drive the UI. The pad is claimed on
     exactly ONE kind of page: a declared device navigation target
     (passthrough), and only until CH borrows it for the panel —
     then the five keys fall through to the panel paths below and
     each press renews the borrow. Everywhere else the pad IS the
     panel's, natively — no claim, no mode, no strip. Capture
     outranks everything: a widget the user grabbed keeps its keys.
     v0.11: Back is never claimed — tap-Back is UI back everywhere;
     hold-Back/Home send the device keys (see keydown). */
  if (phys && !S.captured &&
      ["up", "down", "left", "right", "select"].includes(button)) {
    if (padLatched()) padArm();              // walking renews the borrow
    else if (padOwner() === "device") {
      rc(deviceKeyTarget(), cmdFor({}, button));
      /* the Studio preview can't show the device reacting — say
         where the key went so the pad doesn't read as dead */
      if (typeof PREVIEW !== "undefined" && PREVIEW)
        flashBar("D-pad → device (passthrough)");
      return;
    }
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
    case "up": case "down": {
      /* the library BAR layer (v0.85.7 — brBarKey in browse.js):
         while it holds the ring, it owns the pad */
      if (typeof brBarKey === "function" && brBarKey(button)) break;
      /* an OPTIONS tile paints a roving highlight; repaint when the
         walk leaves it so the outline doesn't linger (chips clear
         their rove state in render when unfocused) */
      const was = S.focusId;
      const moved = spatialMove(button);
      /* ▲ off the top of the library grid climbs INTO the bar (his
         #8: chips first, roots above, ▼ walks back to the first tile) */
      if (!moved && button === "up" &&
          typeof brBarEnter === "function" && brBarEnter()) break;
      blurRove(was);
      break;
    }
    case "left": case "right": {
      if (typeof brBarKey === "function" && brBarKey(button)) break;
      /* widget-owned ◀▶ while merely FOCUSED (no capture) — e.g.
         coverbtns' roving highlight, or a volume tile's level
         (round 4 field call: "DPad left and Right SHOULD" change
         the volume). A handler may return false to decline —
         per-tile scoping (the stepper only claims volume kind). */
      /* nav modes: a tile overridden to "action" walks even when its
         widget offers ◀▶ handlers (the whole policy is data now) */
      if (!isTrailId(S.focusId) && w && w.keys && w.keys[button] &&
          navOf(t) !== "action") {
        if (w.keys[button](eid, t) !== false) { renderStates(); break; }
      }
      { const was = S.focusId;
        if (!spatialMove(button)) pageScreen(button);
        blurRove(was); }
      break;
    }
    case "select": {
      if (typeof brBarKey === "function" && brBarKey(button)) break;
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
      /* nav modes decide OK: "capture" grabs the pad (dpad tiles
         only, in stock); everything else runs the widget's select —
         mute, join, commit-the-roved-option, fire */
      if (navOf(t) === "capture" && w.capture) { enterCapture(); renderStates(); }
      else if (w.select) { w.select(eid, t); renderStates(); }
      break;
    }
    case "back":
      if (typeof brBarKey === "function" && brBarKey("back")) break;
      padClear();          // Back hands the pad home AND does its job
      if (S.confirmTile) { clearConfirm(); renderStates(); break; }
      if (S.stack.length) { navigate(S.stack.pop(), true); break; }
      /* NO HISTORY → UP ONE LEVEL (v0.85.7 — Suresh: "what do we
         want back button behaviour to be? Prior page or up one
         level?" Answer: both. Prior page when history exists — Back
         retraces where you actually were, sideways jumps included.
         With NO history — a boot or deep link straight onto a child
         page — Back climbs one level instead of doing nothing.
         Stops at the boot view; it never jumps past it to the
         overview (that's Home's job). */
      {
        const bsc = screenOf(S.screen) || {};
        const bdest = (bsc.parent && screenOf(bsc.parent)) ? bsc.parent
          : (S.screen !== CONFIG.home_screen ? CONFIG.home_screen : null);
        if (bdest && screenOf(bdest) && bdest !== S.screen)
          navigate(bdest, true);
      }
      break;
    case "back_hold": case "home_hold": {
      /* SHELL-OWNED hold gesture: KeyMapper maps a physical long-press
         to a distinct key (see keymap), because injected keys don't
         deliver reliable keyup/hold timing to the webview. Sends the
         DEVICE's back/home; degrades to tap without a device target. */
      /* v0.85.7: the OPEN VOCABULARY reaches the hold keys too — a
         screen/global `buttons` binding on back_hold/home_hold wins
         (e.g. home_hold → {navigate: overview} = "hold Home jumps
         straight to the top"), then the device-key default. */
      const bhb = boundButtons()[button];
      if (bhb) { runAction(bhb); break; }
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
      const bh = boundButtons().power_hold;
      if (bh) { runAction(bh); break; }
      const cur = currentActivityId();
      if (!cur) { flashBar("Nothing running"); break; }
      const ca = CONFIG.activities[cur] || {};
      endActivity(ca);
      flashBar("Ending " + (ca.name || cur));
      break;
    }
    case "menu": {
      /* a BINDING wins first (final doctrine, 2026-08-20 — the
         stock music page binds menu → navigate music_library: "the
         hamburger jumps to the Library", his call); then the
         physical MENU key (Astrion: '#') → the device's menu
         command on screens with a device context; on a
         multi-section page without one, MENU tours the categories
         (wraps) */
      const bm = boundButtons().menu;
      if (bm) { runAction(bm); break; }
      const mt = deviceKeyTarget();
      if (mt) { rc(mt, cmdFor({}, "menu")); break; }
      /* v0.85.7 (Suresh: "The menu button should do nothing, unless
         the active tile has a subpage, in which case it should fire
         that page (like lights or climate etc)"). The category tour
         is gone — MENU opens the FOCUSED tile's own page: a nav
         card's target, an activity tile's controller, a device
         tile's hold destination (explicit/inferred page, else its
         detail: page). Nothing focused, or nothing behind the tile
         → deliberate no-op. */
      const mft = tileDef(S.focusId);
      if (!mft) break;
      let mdest = null;
      if (mft.type === "nav") mdest = mft.target || null;
      else if (mft.type === "activity") {
        const ma = (CONFIG.activities || {})[mft.activity] || {};
        mdest = ma.screen || ma.view || null;
      } else if (mft.entity) {
        const me = resolveEntity(mft.entity);
        mdest = (typeof deviceTarget === "function" && deviceTarget(mft)) ||
          (me ? "detail:" + me : null);
      }
      if (mdest) navigate(mdest);
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
      /* TUNER EXCEPTION (spec §5.6): the one case where Ch± LEAVES
         Harmonium. A page whose subject is a tuner (`tuner: true` on
         the screen or its control_target) sends channel up/down to the
         device and does NOT walk the panel or arm the claim. */
      if (button === "ch_up" || button === "ch_down") {
        const sct = screenOf(S.screen) || {};
        if (sct.tuner || (sct.control_target && sct.control_target.tuner)) {
          const tt = deviceKeyTarget();
          if (tt) { rc(tt, cmdFor({}, button)); break; }
        }
      }
      /* ANY CH press is panel intent — it borrows the pad (his #3:
         "Both Hold and short press") whether a binding wins or the
         focus-walk default runs */
      if (button === "ch_up" || button === "ch_down") padArm();
      /* TV page, first Ch± after IDLE: REVEAL the ring at the top
         element WITHOUT walking (2026-08-24 — "you need the first
         ChUp/ChDn to see where we are on the panel"). padArm just
         armed the claim; with no ring yet this press is orientation,
         the next one walks. TV pages only (padOwner === device). */
      if ((button === "ch_up" || button === "ch_down") &&
          padOwner() === "device" && !S.focusId) {
        const sc0 = screenOf(S.screen), a0 = sc0 && tilesOf(sc0);
        const first0 = sc0 && (sc0.initial_focus || (a0 && a0[0] && a0[0].id));
        if (first0) { setFocus(first0); break; }
      }
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
      const b = boundButtons()[button];   /* the ladder: global → inherited → own */
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
      /* CH = MOVE THE FOCUS (2026-08-19: "ChUp, ChDn, navigate the
         LCD. Always."), REFINED on music by the final doctrine
         (2026-08-20): with the pad walking natively there, CH-walk
         was redundant, so on a music-shaped page short CH takes the
         BIG JUMP — the library's category strip, the section tabs —
         and falls back to the plain walk when there's nothing to
         jump ("change section if there are sections, redundant walk
         if not" — his words). CH▲ = up the page (d = −1) either
         way. On passthrough screens CH stays the walk — it's the
         only walk there is. A config binding beat everything above. */
      if (button === "ch_up" || button === "ch_down") {
        const d = button === "ch_up" ? -1 : 1;
        /* on the LIBRARY the section jump is the category strip —
           and only there (browseScreen gates the persistent
           S.browse); the controller uses its hero tabs; anything
           without a jump falls back to the walk */
        if (browseScreen() &&
            typeof brStepCat === "function" && brStepCat(d)) break;
        /* v0.85.7 (Suresh: "On a Page like Porch, ChUp and ChDn
           should jump sections. Since we have them."): the music
           doctrine's short-CH section jump is now EVERY panel-native
           page's — any page with jump stops (hero_label or titled
           sections) steps them; pages without jumps keep the walk.
           TV/passthrough pages keep the walk too — there CH is the
           panel's only walk (the pad belongs to the device). */
        if (padOwner() !== "device" && heroCycle(d)) break;
        { const wasCh = S.focusId;
          spatialMove(button === "ch_up" ? "up" : "down");
          blurRove(wasCh); }
        break;
      }
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
    case "ch_up_hold": case "ch_down_hold": {
      /* HOLD-CH (final doctrine, 2026-08-20): on a MUSIC-shaped
         page the hold skips tracks — CH▲-hold = previous, CH▼-hold
         = next ("Long Press in Next / Previous Track" — the section
         work moved to the SHORT press there). Everywhere else the
         hold keeps the BIG JUMPS: the browse category strip, the
         section chips — CH▲-hold to the PREVIOUS one (up the page).
         A binding wins first. Holds are the SHELL's job (see FIELD
         LESSON below): KeyMapper long-press on CH▲/CH▼ sends ' /. */
      padArm();   // on a passthrough screen a jump is panel intent (no-op elsewhere)
      const bch = boundButtons()[button];
      if (bch) { runAction(bch); break; }
      const d = button === "ch_up_hold" ? -1 : 1;
      if (musicSurface()) {
        padMedia(d < 0 ? "prev" : "next", resolveEntity("$context.media_player"));
        break;
      }
      /* brStepCat only where the strip is on screen (see browseScreen) */
      if (browseScreen() &&
          typeof brStepCat === "function" && brStepCat(d)) break;
      heroCycle(d);
      break;
    }
    default: {
      /* OPEN BUTTON VOCABULARY (v0.54 — Suresh: "dpad left hold and
         right hold to do RWD and FFWD"): ANY logical button a keymap
         can emit is bindable — a screen/global `buttons` entry runs
         its action (shared grammar: navigate/sequence/service/seek).
         Unbound stays a deliberate no-op. left_hold/right_hold land
         here; new remotes can mint new names without engine edits. */
      const bd = boundButtons()[button];   /* same ladder as above */
      if (bd) { runAction(bd); break; }
      /* MEDIA DEFAULTS (final doctrine, 2026-08-20). Unbound
         hold-◀/hold-▶ on a music-shaped page SEEK ∓15s ("Hold ◀/▶
         = seek") — the stock TV screen binds these same buttons to
         REWIND/FAST_FORWARD passthrough, and that binding won
         above. And the DEDICATED transport keys — astrion2's glyph
         row names F4–F7 prev/play_pause/stop/next — drive the
         running music from ANY page (mediaCtx falls back to the
         running activity's player). */
      if ((button === "left_hold" || button === "right_hold") && musicSurface()) {
        runAction({ seek: button === "right_hold" ? 15 : -15,
          entity: "$context.media_player" });
        break;
      }
      if (["prev", "play_pause", "stop", "next"].includes(button)) {
        const mt = mediaCtx();
        if (mt) padMedia(button, mt);
        break;
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
  /* THE HAUNTED PREVIEW (v0.85.7 — Suresh: "Ugh. Preview page is
     defaulting to debug"). hakr_debug is deliberately sticky per
     BROWSER — but the Studio preview shares the desktop browser's
     origin, so one #debug=1 experiment in a tab haunted the preview
     forever. In PREVIEW the card now follows the config's own Key
     debug switch ONLY (live, togglable from the page settings);
     localStorage stays the sticky device-side door. And init resets
     the lines — it re-runs on every preview config push, and each
     run stacked another "debug on" banner line. */
  const cfgOn = !!(CONFIG && CONFIG.global && CONFIG.global.debug);
  DBG.on = (typeof PREVIEW !== "undefined" && PREVIEW)
    ? cfgOn
    : cfgOn || localStorage.getItem("hakr_debug") === "1";
  document.getElementById("dbg").classList.toggle("hidden", !DBG.on);
  DBG.lines = []; DBG.last = 0;
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
    /* the hold timer belongs to the PANEL's select — skip it when the
       pad's owner (a passthrough device) has the key and no borrow is
       live (the tap then fires on keyup and the claim routes it) */
    if (e.repeat || S.captured || (padOwner() && !padLatched())) return;
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
  if (e.repeat && !S.captured && b !== "vol_up" && b !== "vol_down") {
    /* FAST-DPAD HOLD (2026-08-27): auto-repeat drives the DEVICE only
       when the pad is the device's (passthrough, no CH borrow) AND
       the dialect speaks in actions — a string command means `input
       keyevent`, far too slow to repeat (unchanged: repeats stay
       dropped). rc() paces the stream (TIMING.dpadRepeat), so
       browser-rate repeats cost nothing extra, and releasing the key
       stops the flow instantly — the reason hold is host-paced
       presses and NOT a device-side burst: his 5-press sendevent
       bursts kept scrolling after the finger lifted. */
    if (!["up", "down", "left", "right"].includes(b)) return;
    if (padOwner() !== "device" || padLatched()) return;
    if (typeof cmdFor({}, b) !== "object") return;
    act(b, true);
    return;
  }
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
