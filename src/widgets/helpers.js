/* HA MediaPlayerEntityFeature bits used for self-suppression */
const MPF = {
  PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, PREV: 16, NEXT: 32,
  SELECT_SOURCE: 2048, STOP: 4096, PLAY: 16384, SELECT_SOUND_MODE: 65536
};
/* CAPABILITY IS STICKY (v0.60 — Suresh: "I never want to see a blank
   panel. I should always see the page. Its up to me to turn it on if
   its off"). v0.57 gated widgets on the LIVE supported_features, which
   quietly conflated two different facts:
     capability   — this box has no transport, ever            -> hide
     availability — this box is asleep right now               -> SHOW
   Plenty of integrations report a thinner mask while a device is off,
   so the live read turned "asleep" into "incapable" and emptied the
   page. We therefore remember the RICHEST mask an entity has ever
   published and gate on that: capability only ever grows, so a
   sleeping receiver keeps every control it owns. */
const SF_SEEN = {};
function sfHas(e, mask) {
  if (!e) return true;
  const sf = st(e).a.supported_features;
  if (sf != null) SF_SEEN[e] = (SF_SEEN[e] || 0) | sf;
  const known = SF_SEEN[e];
  return known == null ? true : !!(known & mask);   /* never seen -> assume yes */
}
/* same rule for attribute-driven option lists: an off receiver drops
   sound_mode_list, and a chips row that vanishes on standby is the
   blank panel by another route. Remember the last non-empty list. */
const OPT_SEEN = {};
function chipOptions(e, kind) {
  const k = CHIP_KINDS[kind];
  if (!k || !e) return [];
  const cur = k.options(e) || [];
  const key = e + "|" + kind;
  if (cur.length) { OPT_SEEN[key] = cur; return cur; }
  return OPT_SEEN[key] || [];
}

/* Shared widget helpers — remote-command resolution (DPAD_DEFAULT <
   tile commands < activity dpad_commands), icon map, nudge steppers
   for light/climate. */
/* display-caps + DESLUG (v0.83.3 — statusreview tweak: "presets like
   wind_free. We need to intelligently strip the _ so it reads wind
   free"): every cap() call site is a DISPLAY of an entity state or
   enum, so underscores become spaces here once — fan_only → "Fan
   only", heat_cool → "Heat cool". Raw values still go to HA
   untouched (deslug is display-layer only, like entOpt). */
const deslug = s => String(s == null ? "" : s).replace(/_/g, " ");
const cap = s => { s = deslug(s); return s.charAt(0).toUpperCase() + s.slice(1); };
/* FRIENDLY APP NAMES (v0.85.8 — Suresh: "source shows as
   com.britbox.us.firetv and com.fubo.firetv.screen, whereas Hulu and
   ESPN show correctly. We need a friendly name key"): the master app
   list already IS the friendly-name registry — every dialect launch
   entry ties the raw package/source string a player reports to an app
   id whose identity carries the display name. Build the reverse map
   once per config: `source:` strings directly, `am start` commands by
   the package before the "/". A string not in the map (a player that
   already reports a real name, or an app Harmonium never launched)
   passes through untouched. Display-layer only, like deslug. */
let _alCfg = null, _alMap = null;
function appLabel(v) {
  if (!v) return v;
  if (_alCfg !== CONFIG) {
    _alCfg = CONFIG;
    _alMap = {};
    const reg = CONFIG.apps || {};
    const dial = CONFIG.dialects || CONFIG.app_classes || {};
    for (const d in dial) {
      const apps = dial[d].apps || {};
      for (const aid in apps) {
        const e = apps[aid] || {};
        const name = (reg[aid] && reg[aid].name) || cap(aid);
        if (typeof e.source === "string") _alMap[e.source] = name;
        const cmd = e.data && e.data.command;
        if (typeof cmd === "string") {
          const m = cmd.match(/am start (?:-n )?([\w.]+)\//);
          if (m) _alMap[m[1]] = name;
        }
      }
    }
  }
  return _alMap[v] || v;
}
const lvlEnt = (e, t) => resolveEntity(t && t.level_entity) || e;
/* FAST DPAD (2026-08-27 — his Fire TV latency investigation): a
   dpad_commands value may be a full ACTION object instead of a key
   name. `input keyevent` costs 150-400ms of Java process spawn per
   press on Android/Fire TV; a raw-input action (androidtv.adb_command
   → sendevent) lands in single-digit ms. Strings keep the
   remote.send_command path byte-identical; objects run through
   runAction and carry their own service/target (the entity rung is
   theirs to name — "$context.media_player" keeps a dialect house-
   portable). Object sends are PACED here, where every path funnels
   (keydown, hold-repeat, widget capture, on-screen pad): his box's
   UI consumes ~6 presses/sec — host-paced 150ms and device-paced
   200ms tests converged on the same ceiling (the launcher's focus
   animation, not the transport) — so a press landing inside
   TIMING.dpadRepeat of the last is dropped, which mirrors what the
   device itself would do with it. */
var _rcLast = 0;
const rc = (e, c) => {
  if (!c) return;
  if (typeof c === "object") {
    const now = Date.now();
    if (now - _rcLast < TIMING.dpadRepeat) return;
    _rcLast = now;
    runAction(c);
    return;
  }
  if (e) callService("remote", "send_command", { command: c }, e);
};
/* command resolution (v0.84.7 — the DIALECT rung):
     DPAD_DEFAULT < dialect.dpad_commands < tile "commands"
                  < activity context "dpad_commands"
   The defaults below are ANDROID/Fire TV names, which is what most of
   the world speaks — but an Apple TV (pyatv) only accepts its own
   lowercase vocabulary and answers "command not recognized" to every
   one of these (forum report, 2026-08-24). The per-device escape hatch
   (a device's traits.dpad_commands) always existed but was invisible
   in the Studio; the DIALECT is where a platform's command vocabulary
   belongs — same place its apps, channels and wake already live — so
   one appletv dialect fixes every Apple TV in the house at once. */
const DPAD_DEFAULT = {
  up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", select: "ENTER",
  back: "BACK", home: "HOME", menu: "MENU", info: "INFO",
  ch_up: "CHANNEL_UP", ch_down: "CHANNEL_DOWN"
};
/* the active surface's dialect command map ({} when it declares none) */
function dialectCommands() {
  var d = ctxFor(S.screen).dialect;
  var dial = d && CONFIG.dialects && CONFIG.dialects[d];
  return (dial && dial.dpad_commands) || {};
}
const BTN_ICON = {
  up: "keyboard_arrow_up", down: "keyboard_arrow_down",
  left: "keyboard_arrow_left", right: "keyboard_arrow_right",
  select: "adjust", back: "undo", home: "home", menu: "menu", info: "info",
  ch_up: "add", ch_down: "remove", power: "power_settings_new"
};
function cmdFor(t, key) {
  const m = Object.assign({}, DPAD_DEFAULT, dialectCommands(),
    t.commands || {}, ctxFor(S.screen).dpad_commands || {});
  return m[key];
}

function nudgeLight(e, delta) {
  const b = Math.max(3, Math.min(255, (st(e).a.brightness || 0) + delta));
  callService("light", "turn_on", { brightness: b }, e);
}
function nudgeClimate(e, delta) {
  const t = (st(e).a.temperature || 72) + delta;
  callService("climate", "set_temperature", { temperature: t }, e);
}
