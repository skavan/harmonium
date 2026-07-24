/* STEPPER — the − value + row (brightness, setpoint, position,
   percentage…); kind picks entity attribute + service. */
WIDGETS.stepper = {
    /* big −/value/+ row bound to a STEP_KINDS range (t.kind).
       Kinds with a bounded 0-100 range also get a fat slider track
       (slider: "h" | "v" in STEP_KINDS) above the row — drag or tap
       sets the value directly; −/+ remain the precision control. */
    sub: () => "",
    isOn: e => ACTIVE(st(e).s),
    selectCaptures: true, captureHint: "▲▼ adjust · back releases",
    capture: {
      up:   (e, t) => nudgeStep(e, t.kind, +1),
      down: (e, t) => nudgeStep(e, t.kind, -1)
    },
    body: t => {
      const k = STEP_KINDS[t.kind] || {};
      const sl = k.slider
        ? `<div class="sldr${k.slider === "v" ? " vert" : ""}"><i></i></div>` : "";
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
        const min = k.min ?? 0, max = k.max ?? 100;
        const v = Math.round(min + f * (max - min));
        const now = Date.now();
        if ((final || now - (sl._t || 0) > 150) && v !== sl._lastV) {
          sl._t = now; sl._lastV = v;
          k.set(resolveEntity(t.entity), v);
        }
      };
      sl.addEventListener("click", ev => ev.stopPropagation());
      sl.addEventListener("pointerdown", ev => {
        ev.stopPropagation();
        sl.setPointerCapture(ev.pointerId);
        sl._drag = true;
        apply(ev, false);
      });
      sl.addEventListener("pointermove", ev => { if (sl._drag) apply(ev, false); });
      sl.addEventListener("pointerup", ev => {
        if (sl._drag) { sl._drag = false; apply(ev, true); }
      });
      sl.addEventListener("pointercancel", () => { sl._drag = false; });
    },
    render(el, e, t) {
      const k = STEP_KINDS[t.kind];
      el.querySelector(".stepval").textContent = k ? k.fmt(k.get(e)) : "–";
      const sl = el.querySelector(".sldr");
      if (sl && k && k.slider && !sl._drag) {   // don't fight the finger
        const min = k.min ?? 0, max = k.max ?? 100;
        const f = Math.max(0, Math.min(1, ((+k.get(e) || 0) - min) / (max - min)));
        sl.firstElementChild.style[k.slider === "v" ? "height" : "width"] =
          Math.round(f * 100) + "%";
      }
    }
  };
