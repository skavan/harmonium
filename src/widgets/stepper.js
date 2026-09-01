/* STEPPER — the numeric control family (volume, brightness,
   setpoint, position, percentage, number…); kind picks entity
   attribute + service.

   THE CONTROL LANGUAGE (2026-08-31 — docs/design-control-language.md,
   from the Claude Design canvas; Suresh's ruling). Every numeric
   control is one of exactly THREE shapes on ONE chassis — the same
   title row, the same 58×46 ± buttons, the same 12px radius. What
   sits between the buttons is what tells the user how the control
   behaves, and A TRACK MEANS SCRUBBABLE — that presence is
   load-bearing across the app:

     FAT      — the 44px drag track above, − [value 21px] + row
                below. The screen's headline value (one per screen
                as guidance, not law): volume on an activity,
                temperature on a climate device, detail ranges.
     COMPACT  — − [32px track, value 14px INSET right] +. Continuous
                but secondary: scrubbable, carries its own value in
                the track; the value flips to accent ink past ~88%
                fill so it stays legible over the fill (t.inset).
     STEPPER  — − [value 21px] +, NO track. Discrete values only —
                bass, trim, signed offsets. No track because there
                is nothing to scrub; that absence is what makes it a
                different control rather than a smaller slider.

   The title line is the name, nothing else — no shape puts its
   number there, and no tile shows the same number twice. */
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
    /* the FAT deck: an explicit tile ask (Slider/Vertical variants)
       or the kind's detail-page default; volume's fat form is the
       volume widget, never this one */
    _fat: t => {
      if (t.kind === "volume" || t.inset) return false;
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
      /* COMPACT: the 32px track with the value inset in it.
         VOLUME left this branch 2026-09-01 (Suresh's img: "Stepper
         specified, compact shown") — a stepper is TRACKLESS by the
         ruled language; kind makes no exception. */
      if (t.inset) return `<div class="steprow vol">
      <button class="dpbtn" data-st="-1"><span class="material-symbols-outlined">remove</span></button>
      <div class="sldr inrow"><i></i><b class="inval">–</b></div>
      <button class="dpbtn" data-st="1"><span class="material-symbols-outlined">add</span></button>
    </div>`;
      /* STEPPER: no track — the value takes the middle at 21px */
      return `<div class="steprow">
      <button class="dpbtn" data-st="-1"><span class="material-symbols-outlined">remove</span></button>
      <div class="stepval">–</div>
      <button class="dpbtn" data-st="1"><span class="material-symbols-outlined">add</span></button>
    </div>`;
    },
    wire(el, t) {
      wireTaps(el, "st", d => nudgeStep(
        t.kind === "volume" ? lvlEnt(resolveEntity(t.entity), t) : resolveEntity(t.entity),
        t.kind, +d));
      const k = STEP_KINDS[t.kind], sl = el.querySelector(".sldr");
      if (!k || !sl) return;
      /* orientation: the fat deck says; the compact track is always
         horizontal. A track present means scrubbable — wire it. */
      const ori = WIDGETS.stepper._fat(t) || "h";
      const apply = (ev, final) => {
        const r = sl.getBoundingClientRect();
        let f = ori === "v"
          ? 1 - (ev.clientY - r.top) / r.height
          : (ev.clientX - r.left) / r.width;
        f = Math.max(0, Math.min(1, f));
        if (ori === "v")
          sl.firstElementChild.style.height = Math.round(f * 100) + "%";
        else setFill(sl, f);
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
      const muted = t.kind === "volume" && !!st(e).a.is_volume_muted;
      const text = k ? k.fmt(k.get(le), le) : "–";
      /* the value — every shape owns its number: the fat/stepper
         middle (.stepval) or the compact inset (.inval) */
      const sv = el.querySelector(".stepval") || el.querySelector(".inval");
      if (sv) {
        if (muted)
          sv.innerHTML = `<span class="material-symbols-outlined vmute">volume_off</span>`;
        else sv.textContent = text;
      }
      const sl = el.querySelector(".sldr");
      if (!sl || !k) return;
      if (t.kind === "volume") sl.classList.toggle("muted", muted);
      if (sl._drag) return;              // don't fight the finger
      const b = stepBounds(k, le);
      const has = b.min != null && b.max != null && b.max > b.min;
      /* a compact track with no resolvable range hides — the value
         would sit on a 0-100 lie */
      if (sl.classList.contains("inrow"))
        sl.classList.toggle("hidden", !has);
      if (!has) return;
      const f = Math.max(0, Math.min(1,
        ((+k.get(le) || 0) - b.min) / (b.max - b.min)));
      if (sl.classList.contains("vert"))
        sl.firstElementChild.style.height = Math.round(f * 100) + "%";
      else setFill(sl, f);
      /* the INSET value flips to accent ink once the fill runs
         beneath it — a single threshold at ~88%, not a blend */
      const iv = sl.querySelector(".inval");
      if (iv) iv.classList.toggle("flip", f >= 0.88);
    }
  };
