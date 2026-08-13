/* FAN tile — on/off + percentage summary; tap toggles. */
WIDGETS.fan = {
  /* fan tile: tap = toggle; state line shows speed % (or preset);
     hold captures the D-pad for speed; ⚙ trail → generated detail
     (power + speed slider + preset buttons from preset_modes). */
  sub: e => {
    const s = st(e), p = s.a.percentage;
    return cap(s.s) + (s.s === "on" && p ? " · " + p + "%"
      : s.a.preset_mode ? " · " + deslug(s.a.preset_mode) : "");
  },
  isOn: e => st(e).s === "on",
  meter: e => { const p = st(e).a.percentage; return (p != null ? p : 0) / 100; },
  select: e => callService("fan", "toggle", null, e),
  detailable: true,
  holdCapture: true, captureHint: "▲▼ speed · back releases",
  capture: {
    up:   e => nudgeStep(e, "percentage", +1),
    down: e => nudgeStep(e, "percentage", -1),
    select: e => callService("fan", "toggle", null, e)
  }
};
