/* COVER buttons — the Open · Stop · Close trio used on generated
   cover detail pages. */
WIDGETS.coverbtns = {
    /* covers don't toggle on/off — they Open / Stop / Close.
       D-pad: ◀▶ move the roving highlight while focused (keys map, no
       capture), select presses the highlighted button (default Stop). */
    sub: () => "",
    isOn: e => ["open", "opening", "closing"].includes(st(e).s),
    keys: {
      left:  (e, t) => roveMove(t, "cv", -1),
      right: (e, t) => roveMove(t, "cv", +1)
    },
    select: (e, t) => callService("cover", rovePick(t, "cv") || "stop_cover", null, e),
    body: () => `<div class="btnrow">
      <button class="dpbtn" data-cv="open_cover"><span class="material-symbols-outlined">arrow_upward</span></button>
      <button class="dpbtn cvsel" data-cv="stop_cover"><span class="material-symbols-outlined">stop</span></button>
      <button class="dpbtn" data-cv="close_cover"><span class="material-symbols-outlined">arrow_downward</span></button>
    </div>`,
    wire: (el, t) => wireTaps(el, "cv", svc =>
      callService("cover", svc, null, resolveEntity(t.entity)))
  };
