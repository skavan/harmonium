/* CLIMATE tile — current temp · state summary; tap steps through
   nothing (detail page owns control); meter shows setpoint drift. */
WIDGETS.climate = {
    sub: e => {
      const a = st(e).a;
      return `${cap(st(e).s)} · now ${a.current_temperature != null ? a.current_temperature : "–"}° → set ${a.temperature != null ? a.temperature : "–"}°`;
    },
    isOn: e => st(e).s !== "off",
    detailable: true,
    /* VALUE MODE (2026-08-20 nav modes): ◀▶ nudge the setpoint while
       focused, OK toggles off/cool — the old capture's jobs on the
       final doctrine's grammar (horizontal = value, ▲▼ = walk). */
    nav: "value",
    keys: {
      left:  e => nudgeClimate(e, -1),
      right: e => nudgeClimate(e, +1)
    },
    select: e => callService("climate", "set_hvac_mode",
      { hvac_mode: st(e).s === "off" ? "cool" : "off" }, e)
  };
