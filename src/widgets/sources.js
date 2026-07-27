/* SOURCES tile (v0.35, role-governed v0.36) — ONE tile that opens the
   input picker. Tap → the sources:<entity> virtual detail: the live
   source_list as chips, current highlighted, pick → select_source.
   Default entity: $context.source_select — the ROLE decides which
   device owns inputs here (assign it in the activity's Setup; the
   display usually, not the streamer). Unwired role → the stock tile
   hides itself (hide-unwired doctrine). The sub line shows the
   CURRENT input, so the tile doubles as a status readout. */
WIDGETS.sources = {
  sub: (e, t) => {
    const mp = e || resolveEntity(t.entity || "$context.source_select");
    return (mp && st(mp).a.source) || "";
  },
  isOn: () => false,
  select: (e, t) => {
    const mp = e || resolveEntity(t.entity || "$context.source_select");
    if (!mp) { flashBar("No source device wired here"); return; }
    if (!(st(mp).a.source_list || []).length) { flashBar("No inputs reported"); return; }
    navigate("sources:" + mp);
  }
};
