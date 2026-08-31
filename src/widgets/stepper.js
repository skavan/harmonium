/* STEPPER — the numeric control family (volume, brightness,
   setpoint, position, percentage, number…); kind picks entity
   attribute + service.

   ONE DESIGN LANGUAGE (2026-08-31 — Suresh, four screenshots deep:
   "In short we need a design language that is consistent"). Every
   numeric control is one of exactly TWO shapes, sharing the volume
   widget's proportions (58×46 buttons, 21px/600 value type):

     ROW  — − [track over value] + on one line: the volume-stepper
            classic, now carrying its number beneath the track (his
            img-4 ruling: "volume stepper is the way to go (but
            missing the value)"). The default for every kind and for
            Number's Stepper/Compact variants. A kind whose bounds
            don't resolve hides the track and centers the value.
     FAT  — the big drag track above, − value + row below: the
            Slider/Vertical variants and the detail-page ranges.

   The 42px display type and the title-line "Vol n%" are RETIRED —
   the control owns its own number in both shapes; the title line is
   the name, nothing else. */
WIDGETS.stepper = {
    /* v0.58: a stepper for a range the device does not expose is a lie
       that reads 0% forever — only the volume kind has a feature bit
       to check; the rest are gated by their own attributes. */
    /* ARC split (Phase 0): capability, level reads and level writes
       all follow t.level_entity when set. Mute stays on the MAIN
       entity, matching the volume widget's doctrine. */
    hidden: (e, t) => !!e && t.kind === "volume" &&
      !sfHas(lvlEnt(e, t), MPF.VOLUME_SET | MPF.VOLUME_STEP | MPF.VOLUME_MUTE),
    sub: () => "",
    isOn: e => ACTIVE(st(e).s),
    /* VALUE MODE, EVERY KIND (2026-08-20 nav modes — the AirCon
       ruling): ◀▶ nudge the value while focused, ▲▼ always walk;
       OK's secondary: the volume kind toggles mute. */
    nav: "value",
    keys: {
      left:  (e, t) => void nudgeStep(t && t.kind === "volume" ? lvlEnt(e, t) : e,
        (t && t.kind) || "volume", -1),
      right: (e, t) => void nudgeStep(t && t.kind === "volume" ? lvlEnt(e, t) : e,
        (t && t.kind) || "volume", +1),
    },
    select: (e, t) => {
      if (!e || !t || t.kind !== "volume") return;
      const cur = S.states.get(e);
      const next = !(cur && cur.a && cur.a.is_volume_muted);
      if (cur && cur.a) cur.a.is_volume_muted = next;
      callService("media_player", "volume_mute", { is_volume_muted: next }, e);
    },
    /* which track the tile wants: the FAT deck only via an explicit
       tile ask (Slider/Vertical variants) or the kind's detail-page
       default — the volume kind always takes the row (its fat form
       is the volume widget) */
    _fat: t => {
      if (t.kind === "volume") return false;
      const k = STEP_KINDS[t.kind] || {};
      return t.slider !== undefined ? t.slider : k.slider;
    },
    body: t => {
      const fat = WIDGETS.stepper._fat(t);
      if (fat) return `<div class="sldr${fat === "v" ? " vert" : ""}"><i></i></div>
    <div class="steprow">
      <button class="dpbtn" data-st="-1"><span class="material-symbols-outlined">remove</span></button>
      <div class="stepval">–</div>
      <button class="dpbtn" data-st="1"><span class="material-symbols-outlined">add</span></button>
    </div>`;
      return `<div class="steprow vol">
      <button class="dpbtn" data-st="-1"><span class="material-symbols-outlined">remove</span></button>
      <div class="stepmid"><div class="sldr inrow"><i></i></div><div class="stepval sm">–</div></div>
      <button class="dpbtn" data-st="1"><span class="material-symbols-outlined">add</span></button>
    </div>`;
    },
    wire(el, t) {
      wireTaps(el, "st", d => nudgeStep(
        t.kind === "volume" ? lvlEnt(resolveEntity(t.entity), t) : resolveEntity(t.entity),
        t.kind, +d));
      const k = STEP_KINDS[t.kind], sl = el.querySelector(".sldr");
      if (!k || !sl) return;
      /* orientation: the fat deck says, the row is always horizontal */
      const ori = WIDGETS.stepper._fat(t) || "h";
      /* drag/tap on the track → proportional set. Optimistic fill;
         calls throttled, final on release. Bounds via stepBounds:
         the entity's published min/max win. */
      const apply = (ev, final) => {
        const r = sl.getBoundingClientRect();
        let f = ori === "v"
          ? 1 - (ev.clientY - r.top) / r.height
          : (ev.clientX - r.left) / r.width;
        f = Math.max(0, Math.min(1, f));
        sl.firstElementChild.style[ori === "v" ? "height" : "width"] =
          Math.round(f * 100) + "%";
        const ent = t.kind === "volume"
          ? lvlEnt(resolveEntity(t.entity), t) : resolveEntity(t.entity);
        const b = stepBounds(k, ent);
        const min = b.min != null ? b.min : 0, max = b.max != null ? b.max : 100;
        const v = Math.round(min + f * (max - min));
        const now = Date.now();
        if ((final || now - (sl._t || 0) > 150) && v !== sl._lastV) {
          sl._t = now; sl._lastV = v;
          k.set(ent, v);
        }
      };
      wireSlider(sl, apply, ori);   // intent-gated; covers stay vertical
    },
    render(el, e, t) {
      const k = STEP_KINDS[t.kind];
      const le = t.kind === "volume" ? lvlEnt(e, t) : e;
      /* the value — BOTH shapes own their number now; volume's mute
         state swaps it for the glyph, matching the volume widget */
      const sv = el.querySelector(".stepval");
      if (sv) {
        if (t.kind === "volume" && st(e).a.is_volume_muted)
          sv.innerHTML = `<span class="material-symbols-outlined vmute">volume_off</span>`;
        else sv.textContent = k ? k.fmt(k.get(le), le) : "–";
      }
      const sl = el.querySelector(".sldr");
      if (!sl || !k) return;
      if (t.kind === "volume")
        sl.classList.toggle("muted", !!st(e).a.is_volume_muted);
      if (sl._drag) return;              // don't fight the finger
      const b = stepBounds(k, le);
      const has = b.min != null && b.max != null && b.max > b.min;
      /* a row track with no resolvable range hides — the value
         centers alone rather than drawing a 0-100 lie */
      if (sl.classList.contains("inrow"))
        sl.classList.toggle("hidden", !has);
      if (!has) return;
      const f = Math.max(0, Math.min(1,
        ((+k.get(le) || 0) - b.min) / (b.max - b.min)));
      sl.firstElementChild.style[sl.classList.contains("vert") ? "height" : "width"] =
        Math.round(f * 100) + "%";
    }
  };
