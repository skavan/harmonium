/* VOLUME — up/down/mute strip + optional level slider; truth may
   come from a separate level_entity (the ARC split). */
WIDGETS.volume = {
    /* commands go to `entity`; the meter reads `level_entity` when set
       (e.g. TV receives ARC volume keys, soundbar reports the level) */
    sub: (e, t) => {
      const l = st(lvlEnt(e, t)).a.volume_level;
      return "Vol " + (l != null ? pct(l) : "–");
    },
    inlineSub: true,                 // value rides the title line
    isOn: e => st(e).s !== "off",
    meter: (e, t) => st(lvlEnt(e, t)).a.volume_level || 0,
    selectCaptures: true, captureHint: "▲▼ volume · select mutes · back releases",
    capture: {
      up:   e => callService("media_player", "volume_up", null, e),
      down: e => callService("media_player", "volume_down", null, e),
      select: e => callService("media_player", "volume_mute",
        { is_volume_muted: !st(e).a.is_volume_muted }, e)
    },
    /* SLIDER TREATMENT (v0.57): the same fat .sldr track the stepper
       draws, so a screen full of zone volumes reads as ONE control
       repeated rather than two unrelated widgets. Opt in per tile
       (slider: true) or house-wide via global.style.volume. */
    body: t => (t && t.slider ? `<div class="sldr"><i></i></div>` : "") +
      `<div class="volrow">
      <button class="dpbtn" data-vol="down"><span class="material-symbols-outlined">remove</span></button>
      <div class="meter"><i></i></div>
      <button class="dpbtn" data-vol="up"><span class="material-symbols-outlined">add</span></button>
    </div>`,
    wire: (el, t) => {
      wireTaps(el, "vol", d =>
        callService("media_player", "volume_" + d, null, resolveEntity(t.entity)));
      const sl = el.querySelector(".sldr");
      if (!sl) return;
      /* drag/tap → volume_set on the COMMAND entity (never level_entity:
         an ARC pair reports on the soundbar but is driven at the TV).
         Optimistic fill, throttled calls, final on release — same
         contract as the stepper so the two feel identical. */
      const apply = (ev, final) => {
        const r = sl.getBoundingClientRect();
        let f = (ev.clientX - r.left) / r.width;
        f = Math.max(0, Math.min(1, f));
        sl.firstElementChild.style.width = Math.round(f * 100) + "%";
        const now = Date.now();
        if ((final || now - (sl._t || 0) > 150) && f !== sl._lastF) {
          sl._t = now; sl._lastF = f;
          callService("media_player", "volume_set",
            { volume_level: Math.round(f * 100) / 100 }, resolveEntity(t.entity));
        }
      };
      sl.addEventListener("click", ev => ev.stopPropagation());
      sl.addEventListener("pointerdown", ev => {
        ev.stopPropagation();
        if (sl.setPointerCapture) sl.setPointerCapture(ev.pointerId);
        sl._drag = true; apply(ev, false);
      });
      sl.addEventListener("pointermove", ev => { if (sl._drag) apply(ev, false); });
      const end = ev => { if (sl._drag) { sl._drag = false; apply(ev, true); } };
      sl.addEventListener("pointerup", end);
      sl.addEventListener("pointercancel", end);
    },
    /* keep the track in step with HA while not dragging */
    render: (el, e, t) => {
      const sl = el.querySelector(".sldr");
      if (!sl || sl._drag || !e) return;
      const l = st(lvlEnt(e, t)).a.volume_level;
      sl.firstElementChild.style.width = Math.round((l || 0) * 100) + "%";
    }
  };
