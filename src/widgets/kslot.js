/* KSLOT — one slot of THE REMOTE on the key-capture screen (v0.56).
   A physical button described in the Studio's layout builder, waiting
   to learn which raw key it emits. Tap = assign the pending capture.
   Three flavors, one widget: a named slot, a BLANK (a spacer in the
   physical grid — inert), and the 💾 Save tile.

   The tile is deliberately dumb: no entity, no subscription. Its sub
   line reports the raw keys currently routed to it (profile keymap
   plus this session's unsaved assignments), so the grid reads as the
   remote's own legend. isOn lights a slot the moment it has a key —
   at a glance you can see which buttons are still unlearned.
   (Lives in widgets/ because WIDGETS is not defined until
   registry.js — the v0.51.1 lesson.) */
WIDGETS.kslot = {
  /* two chassis-level looks, decided once at build time: a slot with
     no standard glyph wears its NAME at key size (the chassis always
     renders SOME icon — "•" is its fallback — so the class hides it),
     and a blank slot fades to a spacer. */
  wire: (el, t) => {
    if (t.blank) el.classList.add("kblank");
    else if (t.slot && !KEYCAP_GLYPHS[t.slot]) el.classList.add("noglyph");
  },
  sub: (e, t) => {
    if (t.blank) return "";
    if (t.save) return t.sub_label || "";
    const ks = keysForSlot(t.slot);
    return ks.length ? ks.map(k => (k === " " ? "Space" : k)).join(" · ")
                     : "unassigned";
  },
  isOn: (e, t) => !t.blank && !t.save && keysForSlot(t.slot).length > 0,
  select: (e, t) => {
    if (t.blank) return;
    if (t.save) { keycapSave(); return; }
    keycapAssign(t.slot);
  },
};
