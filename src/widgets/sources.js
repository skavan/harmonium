/* SOURCES tile (v0.35, role-governed v0.36) — ONE tile that opens the
   input picker. Tap → the sources:<entity> virtual detail: the live
   source_list as chips, current highlighted, pick → select_source.
   Default entity: $context.source_select — the ROLE decides which
   device owns inputs here (assign it in the activity's Setup; the
   display usually, not the streamer). Unwired role → the stock tile
   hides itself (hide-unwired doctrine). The sub line shows the
   CURRENT input, so the tile doubles as a status readout. */
WIDGETS.sources = {
  /* v0.57: no SELECT_SOURCE on the device -> no input picker to open */
  hidden: e => !!e && !sfHas(e, MPF.SELECT_SOURCE),
  /* never a BLANK tile (2026-08-31 — Suresh's screenshot: a TV
     reporting no current source left the tile empty — a mystery, not
     a control): with inputs to offer, invite the choice instead. */
  sub: (e, t) => {
    const mp = e || resolveEntity(t.entity || "$context.source_select");
    if (!mp) return "";
    const cur = st(mp).a.source;
    if (cur) return cur;
    return chipOptions(mp, "source").length ? "Choose input…" : "";
  },
  isOn: () => false,
  select: (e, t) => {
    const mp = e || resolveEntity(t.entity || "$context.source_select");
    if (!mp) { flashBar("No source device wired here"); return; }
    if (!(st(mp).a.source_list || []).length) { flashBar("No inputs reported"); return; }
    navigate("sources:" + mp);
  }
};
