WIDGETS.climate = {
    sub: e => {
      const a = st(e).a;
      return `${cap(st(e).s)} · now ${a.current_temperature ?? "–"}° → set ${a.temperature ?? "–"}°`;
    },
    isOn: e => st(e).s !== "off",
    detailable: true,
    selectCaptures: true, captureHint: "▲▼ setpoint · select toggles off/cool · back releases",
    capture: {
      up: e => nudgeClimate(e, +1), down: e => nudgeClimate(e, -1),
      select: e => callService("climate", "set_hvac_mode",
        { hvac_mode: st(e).s === "off" ? "cool" : "off" }, e)
    }
  };
