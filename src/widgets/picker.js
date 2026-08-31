/* PICKER — the Select adapter's default shape (entity-controls
   Phase 2): a value tile. The sub line shows the CURRENT option (the
   sources-tile pattern, generalized to any CHIP_KINDS list), so the
   tile doubles as a readout. Interactions, remote-first:
     ◀▶  step through the options in place (the value grammar —
         the AirCon ruling: no capture, ▲▼ always walk);
     OK / tap  opens the pick:<entity>:<kind> options page —
         unless `cycle` (the Cycle variant), where OK/tap steps
         forward and there is no page.
   Self-hides when the entity publishes no options (the chips-row
   doctrine: a control with nothing to choose is chrome). */
WIDGETS.picker = {
  hidden: (e, t) => !!e && !chipOptions(e, (t && t.kind) || "select").length,
  /* the READOUT never goes blank (2026-08-31 — Suresh's screenshot:
     an empty tile is a mystery, not a control): the current option
     always shows, and the CYCLE variant also names what the next
     press brings — "Movie ▸ Night mode". No current yet → invite. */
  sub: (e, t) => {
    const kind = (t && t.kind) || "select";
    const k = CHIP_KINDS[kind];
    const c = e && k && k.current(e);
    const cur = c != null && c !== "" && c !== "…" ? deslug(String(c)) : "";
    if (!cur) return "Choose…";
    if (!(t && t.cycle)) return cur;
    const opts = chipOptions(e, kind);
    const i = opts.indexOf(c);
    const next = opts.length > 1
      ? opts[(Math.max(0, i) + 1) % opts.length] : null;
    return next ? cur + " ▸ " + deslug(String(next)) : cur;
  },
  isOn: () => false,
  nav: "value",
  keys: {
    left:  (e, t) => void cycleChip(e, t, -1),
    right: (e, t) => void cycleChip(e, t, +1),
  },
  select: (e, t) => {
    if (!e) return;
    if (t && t.cycle) return void cycleChip(e, t, +1);
    if (!chipOptions(e, (t && t.kind) || "select").length) {
      flashBar("No options reported");
      return;
    }
    navigate("pick:" + e + ":" + ((t && t.kind) || "select"));
  },
};
