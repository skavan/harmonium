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
const cap = s => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
const lvlEnt = (e, t) => resolveEntity(t && t.level_entity) || e;
const rc = (e, c) => { if (e && c) callService("remote", "send_command", { command: c }, e); };
/* command resolution: default < tile "commands" < activity context "dpad_commands" */
const DPAD_DEFAULT = {
  up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", select: "ENTER",
  back: "BACK", home: "HOME", menu: "MENU", info: "INFO",
  ch_up: "CHANNEL_UP", ch_down: "CHANNEL_DOWN"
};
const BTN_ICON = {
  up: "keyboard_arrow_up", down: "keyboard_arrow_down",
  left: "keyboard_arrow_left", right: "keyboard_arrow_right",
  select: "adjust", back: "undo", home: "home", menu: "menu", info: "info",
  ch_up: "add", ch_down: "remove", power: "power_settings_new"
};
function cmdFor(t, key) {
  const m = Object.assign({}, DPAD_DEFAULT, t.commands || {}, ctxFor(S.screen).dpad_commands || {});
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
