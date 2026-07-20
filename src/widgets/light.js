WIDGETS.light = {
    sub: e => st(e).s === "on"
      ? "On · " + Math.round((st(e).a.brightness || 255) / 2.55) + "%"
      : cap(st(e).s),
    isOn: e => st(e).s === "on",
    meter: e => st(e).s === "on" ? (st(e).a.brightness || 255) / 255 : 0,
    select: e => callService("light", "toggle", null, e),
    detailable: true,
    holdCapture: true, captureHint: "▲▼ brightness · back releases",
    capture: {
      up:   e => nudgeLight(e, +26), down: e => nudgeLight(e, -26),
      select: e => callService("light", "toggle", null, e)
    }
  };
