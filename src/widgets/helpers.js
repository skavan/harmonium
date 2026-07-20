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
  ch_up: "add", ch_down: "remove"
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
