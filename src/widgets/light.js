/* LIGHT tile — on/off + brightness%; tap toggles; meter = brightness. */
WIDGETS.light = {
    sub: e => st(e).s === "on"
      ? "On · " + Math.round((st(e).a.brightness || 255) / 2.55) + "%"
      : cap(st(e).s),
    isOn: e => st(e).s === "on",
    meter: e => st(e).s === "on" ? (st(e).a.brightness || 255) / 255 : 0,
    select: e => callService("light", "toggle", null, e),
    detailable: true,
    /* 2026-08-20 nav modes: value — ◀▶ nudge brightness while
       focused; OK still toggles (the widget's select). Hold-capture
       stays as an optional power gesture. */
    nav: "value",
    keys: {
      left:  e => void nudgeLight(e, -26),
      right: e => void nudgeLight(e, +26),
    },
    holdCapture: true, captureHint: "▲▼ brightness · back releases",
    capture: {
      up:   e => nudgeLight(e, +26), down: e => nudgeLight(e, -26),
      select: e => callService("light", "toggle", null, e)
    }
  };
