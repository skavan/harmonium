/* VOLUME — up/down/mute strip + optional level slider; truth may
   come from a separate level_entity (the ARC split). */
/* MUTE is part of the volume truth (v0.83.7 — .88 status review:
   "no on remote indicator of mute status"). Truth reads from the
   reporting entity (level_entity when split), falling back to the
   command entity. */
const volMuted = (e, t) => {
  const m = st(lvlEnt(e, t)).a.is_volume_muted;
  return m != null ? !!m : !!st(e).a.is_volume_muted;
};
/* THE JUMP-BACK CURE (v0.83.10 — status review #1: "It jumps forward
   like 5pts and then jumps back like 3"). The optimistic nudge bumps
   by a NOMINAL step (5%), but the device steps by its OWN (a Sonos
   moves 2-3%) — so HA's echo yanked the meter backward mid-tap. Two
   fixes working together, per LEVEL entity:
   · a HOLD window: while taps are fresh (1.8s), an echo that
     disagrees is noted but the display keeps the optimistic value —
     truth is adopted the moment the window lapses;
   · a LEARNED step: the first echo teaches the device's real
     increment (|echo − start| / taps), so the next tap's optimism
     matches reality and there is nothing left to snap. */
const VOL_OPT = {};    /* level-entity → {v, until, truth0, taps} */
const VOL_STEP = {};   /* level-entity → learned device step */
function volNudgeOpt(le, dir) {
  const cur = S.states.get(le);
  if (!cur || !cur.a || cur.a.volume_level == null) return;
  const now = Date.now();
  let o = VOL_OPT[le];
  if (!o || now >= o.until)
    o = VOL_OPT[le] = { truth0: cur.a.volume_level, taps: 0, v: cur.a.volume_level };
  o.taps += 1;
  const step = VOL_STEP[le] || 0.05;
  o.v = Math.max(0, Math.min(1, o.v + (dir === "up" ? step : -step)));
  o.until = now + 1800;
  cur.a.volume_level = o.v;
}
/* called from render(): returns the level to DISPLAY, learning the
   device step from any echo that lands inside the hold window */
function volHeld(le, l) {
  const o = VOL_OPT[le];
  if (!o) return l;
  if (Date.now() >= o.until) { delete VOL_OPT[le]; return l; }
  if (l != null && Math.abs(l - o.v) > 0.001) {
    const est = Math.abs(l - o.truth0) / Math.max(1, o.taps);
    if (est >= 0.005 && est <= 0.12) VOL_STEP[le] = est;
    /* re-assert so every reader (sub, meter) agrees while holding */
    const cur = S.states.get(le);
    if (cur && cur.a) cur.a.volume_level = o.v;
    return o.v;
  }
  return l;
}
WIDGETS.volume = {
    /* commands go to `entity`; the meter reads `level_entity` when set
       (e.g. TV receives ARC volume keys, soundbar reports the level) */
    sub: (e, t) => {
      /* SLIDER MODE SAYS IT ONCE (v0.83.7 — Suresh, four screenshots
         deep: "note we duplicate the volume % on the 1st and 3rd"):
         the center readout owns the number (and the mute glyph), so
         the title line carries only the name. Compact keeps the
         "Vol n%" title — its meter has no numeral of its own. */
      if (t && t.slider !== false) return "";
      if (volMuted(e, t)) return "Muted";
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
        volNudgeOpt(le, d);
        renderStates();
      };
      /* TAP THE SPEAKER ICON TO MUTE (v0.83.10 — status review #7:
         "In a browser, Mute is a problem" — the only pointer path to
         mute was select-capture, and a mouse never long-presses).
         Optimistic flip on the reporting entity; HA's echo confirms. */
      const ic = el.querySelector(".icwrap") || el.querySelector(".top .ic");
      if (ic) {
        ic.style.cursor = "pointer";
        ic.title = "mute / unmute";
        ic.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const ce = resolveEntity(t.entity);
          if (!ce) return;
          const re = resolveEntity(t && t.level_entity) || ce;
          const cur = S.states.get(re);
          const next = !(cur && cur.a && cur.a.is_volume_muted);
          if (cur && cur.a) { cur.a.is_volume_muted = next; renderStates(); }
          callService("media_player", "volume_mute",
            { is_volume_muted: next }, ce);
        });
      }
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
      wireSlider(sl, apply, "h");   // intent-gated: vertical swipes scroll
    },
    /* keep the track in step with HA while not dragging */
    render: (el, e, t) => {
      if (!e) return;
      const le = lvlEnt(e, t);
      const l = volHeld(le, st(le).a.volume_level);
      const m = volMuted(e, t);
      const pc = el.querySelector(".volpct");
      /* muted: the center % becomes the mute glyph (v0.83.7) — the
         level is still on the track, dimmed, so unmuting is no
         surprise */
      if (pc) pc.innerHTML = m
        ? `<span class="material-symbols-outlined vmute">volume_off</span>`
        : (l != null ? pct(l) : "–");
      const sl = el.querySelector(".sldr");
      const mt = el.querySelector(".meter");
      if (sl) sl.classList.toggle("muted", m);
      if (mt) mt.classList.toggle("muted", m);
      if (!sl || sl._drag) return;
      sl.firstElementChild.style.width = Math.round((l || 0) * 100) + "%";
    }
  };
