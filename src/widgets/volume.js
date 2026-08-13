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
       repeated rather than two unrelated widgets. DEFAULT since
       v0.83.1 (statusreview: "I think default should be fat") —
       generated tiles say slider:false when a compact style was
       chosen; a bare hand-authored volume tile now draws the track. */
    /* v0.83.3 (Suresh, seeing the slider tile beside a stepper: "like
       the first example in height but with the volume % instead of a
       duplicate slider"): in slider mode the row's middle is the
       PERCENTAGE — the fat track two lines up already draws the
       level, and the mini-meter just duplicated it. Compact mode
       (slider:false) keeps the meter: with no track above, it IS the
       level. Row height unchanged either way. */
    body: t => {
      const sl = t && t.slider !== false;
      return (sl ? `<div class="sldr"><i></i></div>` : "") +
        `<div class="volrow">
      <button class="dpbtn" data-vol="down"><span class="material-symbols-outlined">remove</span></button>
      ${sl ? `<div class="volpct">–</div>` : `<div class="meter"><i></i></div>`}
      <button class="dpbtn" data-vol="up"><span class="material-symbols-outlined">add</span></button>
    </div>`;
    },
    wire: (el, t) => {
      /* OPTIMISTIC NUDGE (v0.83.1 — statusreview: "Doesn't update
         quickly"): +/- used to wait a full HA round-trip (plus the
         device's own report latency) before the meter moved. Bump
         the LOCAL state by a nominal step immediately and re-render;
         the next diff from HA overwrites with truth. */
      const nudge = (d) => {
        const le = resolveEntity(t && t.level_entity) || resolveEntity(t.entity);
        const cur = S.states.get(le);
        if (cur && cur.a && cur.a.volume_level != null) {
          cur.a.volume_level = Math.max(0, Math.min(1,
            cur.a.volume_level + (d === "up" ? 0.05 : -0.05)));
          renderStates();
        }
      };
      wireTaps(el, "vol", d => {
        nudge(d);
        callService("media_player", "volume_" + d, null, resolveEntity(t.entity));
      });
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
        /* the drag is optimistic in STATE too (v0.83.1): the "Vol n%"
           title line and any sibling meter follow the finger, not the
           round-trip */
        const le = resolveEntity(t && t.level_entity) || resolveEntity(t.entity);
        const cur = S.states.get(le);
        if (cur && cur.a) cur.a.volume_level = Math.round(f * 100) / 100;
        /* the center % follows the finger */
        const pc = el.querySelector(".volpct");
        if (pc) pc.textContent = Math.round(f * 100) + "%";
        const now = Date.now();
        if ((final || now - (sl._t || 0) > 150) && f !== sl._lastF) {
          sl._t = now; sl._lastF = f;
          renderStates();
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
      if (!e) return;
      const l = st(lvlEnt(e, t)).a.volume_level;
      const pc = el.querySelector(".volpct");
      if (pc) pc.textContent = l != null ? pct(l) : "–";
      const sl = el.querySelector(".sldr");
      if (!sl || sl._drag) return;
      sl.firstElementChild.style.width = Math.round((l || 0) * 100) + "%";
    }
  };
