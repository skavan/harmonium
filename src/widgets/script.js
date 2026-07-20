WIDGETS.script = {
    sub: e => st(e).s === "on" ? "Running…" : "Press to run",
    isOn: e => st(e).s === "on",
    select: e => callService("script", "turn_on", null, e)
  };
