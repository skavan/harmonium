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

/* SLIDER TOUCH HYGIENE (v0.83.11 — Suresh's Watch Fire TV: "trying
   to scroll the LCD often triggers the LCD buttons instead"). Every
   slider used to seize the pointer ON pointerdown and jump to the
   touch point — so a vertical swipe that merely STARTED on a volume
   track dragged volume instead of scrolling the page. One shared
   wire-up now (volume, stepper, group master, group rows): the track
   waits for INTENT —
     · commit along the slider's axis (~8px, dominant)  → engage:
       capture the pointer, jump, drag (same feel as before);
     · movement across the axis → hands the touch back to the page
       (touch-action pan-y/pan-x lets the browser scroll it);
     · a clean tap (no real movement) still sets on release.
   pointercancel = the browser took the gesture — nothing is set.
   `sl._drag` keeps its old meaning, so render()'s don't-fight-the-
   finger checks are untouched. apply(ev, final) is the widget's own
   value function, exactly as before. */
function wireSlider(sl, apply, axis) {
  const h = axis !== "v";
  sl.style.touchAction = h ? "pan-y" : "pan-x";
  sl.addEventListener("click", ev => ev.stopPropagation());
  sl.addEventListener("pointerdown", ev => {
    ev.stopPropagation();
    sl._sx = ev.clientX; sl._sy = ev.clientY;
    sl._live = true; sl._drag = false;
  });
  sl.addEventListener("pointermove", ev => {
    if (sl._drag) { apply(ev, false); return; }
    if (!sl._live) return;
    const dx = Math.abs(ev.clientX - sl._sx), dy = Math.abs(ev.clientY - sl._sy);
    const along = h ? dx : dy, across = h ? dy : dx;
    if (along > 8 && along >= across) {         // committed to the track
      try { sl.setPointerCapture(ev.pointerId); }
      catch (x) { /* synthetic events carry no pointer id */ }
      sl._drag = true;
      apply(ev, false);
    } else if (across > 8) sl._live = false;    // it's a scroll — let go
  });
  sl.addEventListener("pointerup", ev => {
    if (sl._drag) { sl._drag = false; apply(ev, true); }
    else if (sl._live) apply(ev, true);         // a TAP — set once
    sl._live = false;
  });
  sl.addEventListener("pointercancel", () => { sl._drag = sl._live = false; });
}

const WIDGETS = {};

/* ================================================================
   NAV MODES (2026-08-20 — Suresh, designing the speaker-group page:
   "We need to make this logic something that is configured so we
   don't have to hard code it all. Seems like we have 3 or 4 'modes'
   of navigation." Exactly four:

     action  — OK fires the tile. ◀▶ walk. The default.
     value   — ◀▶ adjust the tile's value, OK does its secondary
               (mute on volume, join on a group member); ▲▼ walk.
     options — ◀▶ rove a highlight through the tile's choices,
               OK commits the highlighted one (chips, transport).
     capture — OK grabs the whole pad (dpad passthrough tiles: the
               only survivors of capture, because they genuinely
               forward keys to another device).

   A widget declares its default (`nav`, value or function(t)); a
   TILE may override with `"nav": "action" | "value" | "options"`
   in config — so the policy is data, and the Studio can offer it
   as a per-tile dropdown. Legacy widgets that declare
   selectCaptures and no `nav` read as capture; widgets with `keys`
   and no `nav` read as value. */
function navOf(t) {
  if (t && typeof t.nav === "string") return t.nav;
  const w = (t && WIDGETS[t.type]) || {};
  const n = typeof w.nav === "function" ? w.nav(t) : w.nav;
  if (n) return n;
  const caps = typeof w.selectCaptures === "function"
    ? w.selectCaptures(t) : w.selectCaptures;
  if (caps) return "capture";
  if (w.keys) return "value";
  return "action";
}
