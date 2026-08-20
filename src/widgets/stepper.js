/* STEPPER — the − value + row (brightness, setpoint, position,
   percentage…); kind picks entity attribute + service. */
WIDGETS.stepper = {
    /* v0.58: a stepper for a range the device does not expose is a lie
       that reads 0% forever — the Fire TV reports 22961 (no VOLUME_SET
       / STEP / MUTE), so its generated detail page drew a dead volume
       control. Only the volume kind has a feature bit to check; the
       rest are gated by their own attributes elsewhere. */
    hidden: (e, t) => !!e && t.kind === "volume" &&
      !sfHas(e, MPF.VOLUME_SET | MPF.VOLUME_STEP | MPF.VOLUME_MUTE),
    /* big −/value/+ row bound to a STEP_KINDS range (t.kind).
       Kinds with a bounded 0-100 range also get a fat slider track
       (slider: "h" | "v" in STEP_KINDS) above the row — drag or tap
       sets the value directly; −/+ remain the precision control. */
    /* THE VOLUME KIND IS ITS OWN SHAPE (v0.83.7 — Suresh: "Volume
       Slider vs Volume Stepper -- they are pretty much identical...
       Maybe Volume Stepper is like Compact except a fat slider bar"):
       exactly that. Compact's layout — "Vol n%" on the title line,
       −/+ around the middle — but the middle is the fat track IN the
       row instead of the mini meter, and there is no second track
       above. Now the four styles are four different controls. */
    sub: (e, t) => {
      if (t.kind !== "volume") return "";
      if (st(e).a.is_volume_muted) return "Muted";
      const l = st(e).a.volume_level;
      return "Vol " + (l != null ? pct(l) : "–");
    },
    inlineSub: t => t.kind === "volume",
    isOn: e => ACTIVE(st(e).s),
    /* VALUE MODE, EVERY KIND (2026-08-20 nav modes — his AirCon
       ruling: "DPad Up and Down should navigate the tiles as usual.
       Left and Right DPad should navigate within the Tiles"): ◀▶
       nudge the value while focused — volume, brightness, setpoint,
       position, all of them — ▲▼ always walk, and the last
       select-captures die. OK's secondary: the volume kind toggles
       mute; other kinds have no secondary (their tap targets are on
       screen). Even a vertical slider track adjusts on ◀▶ — one
       grammar beats axis-matching. */
    nav: "value",
    keys: {
      left:  (e, t) => void nudgeStep(e, (t && t.kind) || "volume", -1),
      right: (e, t) => void nudgeStep(e, (t && t.kind) || "volume", +1),
    },
    select: (e, t) => {
      if (!e || !t || t.kind !== "volume") return;
      const cur = S.states.get(e);
      const next = !(cur && cur.a && cur.a.is_volume_muted);
      if (cur && cur.a) cur.a.is_volume_muted = next;
      callService("media_player", "volume_mute", { is_volume_muted: next }, e);
    },
    body: t => {
      /* volume: track-in-row, number on the title line — see above */
      if (t.kind === "volume") return `<div class="steprow vol">
      <button class="dpbtn" data-st="-1"><span class="material-symbols-outlined">remove</span></button>
      <div class="sldr inrow"><i></i></div>
      <button class="dpbtn" data-st="1"><span class="material-symbols-outlined">add</span></button>
    </div>`;
      const k = STEP_KINDS[t.kind] || {};
      const sl = k.slider
        ? `<div class="sldr${k.slider === "v" ? " vert" : ""}"><i></i></div>` : "";
      /* other kinds (brightness, setpoint, position) keep the big
         display type — they ARE the page */
      return sl + `<div class="steprow">
      <button class="dpbtn" data-st="-1"><span class="material-symbols-outlined">remove</span></button>
      <div class="stepval">–</div>
      <button class="dpbtn" data-st="1"><span class="material-symbols-outlined">add</span></button>
    </div>`;
    },
    wire(el, t) {
      wireTaps(el, "st", d => nudgeStep(resolveEntity(t.entity), t.kind, +d));
      const k = STEP_KINDS[t.kind], sl = el.querySelector(".sldr");
      if (!k || !sl) return;
      /* drag/tap on the track → proportional set. Optimistic fill for
         responsiveness; service calls throttled, final on release. */
      const apply = (ev, final) => {
        const r = sl.getBoundingClientRect();
        let f = k.slider === "v"
          ? 1 - (ev.clientY - r.top) / r.height
          : (ev.clientX - r.left) / r.width;
        f = Math.max(0, Math.min(1, f));
        sl.firstElementChild.style[k.slider === "v" ? "height" : "width"] =
          Math.round(f * 100) + "%";
        const min = k.min != null ? k.min : 0, max = k.max != null ? k.max : 100;
        const v = Math.round(min + f * (max - min));
        const now = Date.now();
        if ((final || now - (sl._t || 0) > 150) && v !== sl._lastV) {
          sl._t = now; sl._lastV = v;
          k.set(resolveEntity(t.entity), v);
        }
      };
      wireSlider(sl, apply, k.slider);   // intent-gated; covers stay vertical
    },
    render(el, e, t) {
      const k = STEP_KINDS[t.kind];
      const sv = el.querySelector(".stepval");
      if (sv) sv.textContent = k ? k.fmt(k.get(e)) : "–";
      const sl = el.querySelector(".sldr");
      if (t.kind === "volume" && sl)
        sl.classList.toggle("muted", !!st(e).a.is_volume_muted);
      if (sl && k && k.slider && !sl._drag) {   // don't fight the finger
        const min = k.min != null ? k.min : 0, max = k.max != null ? k.max : 100;
        const f = Math.max(0, Math.min(1, ((+k.get(e) || 0) - min) / (max - min)));
        sl.firstElementChild.style[k.slider === "v" ? "height" : "width"] =
          Math.round(f * 100) + "%";
      }
    }
  };
