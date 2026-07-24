/* COVER tile — position summary; tap toggles open/close
   (entity_options.invert_position respected). */
WIDGETS.cover = {
    /* invert_position flips the DISPLAY (state word, %, meter) so a
       retracted screen reads "Closed · 0%"; actions are unchanged */
    sub: e => {
      const inv = entOpt(e, "invert_position");
      let s = st(e).s;
      if (inv) s = ({ open: "closed", closed: "open",
                      opening: "closing", closing: "opening" })[s] || s;
      let p = st(e).a.current_position;
      if (p != null && inv) p = 100 - p;
      return cap(s) + (p != null ? " · " + p + "%" : "");
    },
    isOn: e => {
      const s = st(e).s;
      if (["opening", "closing"].includes(s)) return true;   // moving
      return entOpt(e, "invert_position") ? s === "closed" : s === "open";
    },
    meter: e => {
      const p = st(e).a.current_position ?? 0;
      return (entOpt(e, "invert_position") ? 100 - p : p) / 100;
    },
    select: e => callService("cover", "toggle", null, e),
    detailable: true
  };
