/* ================================================================
   Widget catalog (chassis adapters).
   ================================================================ */
const pct = v => Math.round(v * 100) + "%";
const st = eid => S.states.get(eid) || { s: "…", a: {} };
const ACTIVE = s => !["off", "idle", "unavailable", "unknown", "standby", null, "…"].includes(s);

/* Shared capture map for device-remote widgets (dpad, passthrough):
   while captured, direction keys go to the tile's remote entity,
   translated through cmdFor (so activity dpad_commands apply). */
const DPAD_CAPTURE = {};
["up", "down", "left", "right", "select", "back"].forEach(k =>
  DPAD_CAPTURE[k] = (e, t) => rc(e, cmdFor(t, k)));

/* Wire a widget body's <button data-ATTR="x"> children to a handler.
   stopPropagation keeps the tap from also firing the tile's select. */
function wireTaps(el, attr, fn) {
  el.querySelectorAll(`[data-${attr}]`).forEach(b =>
    b.addEventListener("click", ev => { ev.stopPropagation(); fn(b.dataset[attr]); }));
}

const WIDGETS = {};
