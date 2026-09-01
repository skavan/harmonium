/* DEVICE tile — ONE entity, everything else resolved from its domain
   (the Studio's "just pick the entity" tile). Doctrine:
   - tap = the domain's obvious verb (play/pause a playing/paused
     media_player, toggle a light/switch/fan). No clean verb (an OFF
     media player, a thermostat, a remote) → open the device's page
     instead: starting things properly is the activity's job
     (warm-start doctrine), not a naked turn_on from a tile.
   - hold (touch long-press) = always the page.
   - the page ("Opens") is INFERRED when not set: the view of the
     activity whose primary media_player / dpad is this entity — the
     Porch TV tile knows about the tv screen because Watch Smart TV
     declared it. tile.target overrides.
   - tile.tap overrides the verb: "toggle" | "play_pause" | "open". */
/* the speed a percentage-only fan last ran at (session memory, so a
   toggle-off → toggle-on returns to the speed you had) */
const FAN_RESUME = {};
const DEVICE_VERB = {
  media_player: e => ["playing", "paused", "buffering"].includes(st(e).s)
    ? () => callService("media_player", "media_play_pause", null, e) : null,
  light: e => () => callService("light", "toggle", null, e),
  switch: e => () => callService("switch", "toggle", null, e),
  /* fan.toggle needs FanEntityFeature TURN_ON/TURN_OFF (32|16) —
     fansync-class fans expose speed only (features 5) and HA
     rejects the call outright ("does not support action
     fan.toggle", live 2026-09-01, Dining Fan). Those fans toggle
     through the percentage instead: off = 0, on = the speed it
     last ran at this session (seeded on every render), else 100. */
  fan: e => () => {
    const a = st(e).a || {};
    const f = a.supported_features || 0;
    if (f & 48) return void callService("fan", "toggle", null, e);
    if (f & 1) {
      if (ACTIVE(st(e).s) && (a.percentage || 0) > 0) {
        FAN_RESUME[e] = a.percentage;
        return void callService("fan", "set_percentage", { percentage: 0 }, e);
      }
      return void callService("fan", "set_percentage",
        { percentage: FAN_RESUME[e] || 100 }, e);
    }
    callService("homeassistant", "toggle", null, e);
  },
  input_boolean: e => () => callService("input_boolean", "toggle", null, e),
  /* v0.78.1 (review: "I added a button… Pressing does nothing"):
     the verb table had never met the press-shaped domains, so their
     tiles fell through to open() — which, with no activity claiming
     a button, opened nothing at all. The obvious verb IS the domain. */
  button: e => () => callService("button", "press", null, e),
  input_button: e => () => callService("input_button", "press", null, e),
  scene: e => () => callService("scene", "turn_on", null, e),
  script: e => () => callService("script", "turn_on", null, e),
};
/* a timestamp state, said like a person (buttons and scenes carry
   their last-fired time AS the state — the raw ISO string is noise) */
function agoStr(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return "just now";
  if (m < 120) return m + " min ago";
  if (m < 48 * 60) return Math.round(m / 60) + " h ago";
  return Math.round(m / 1440) + " d ago";
}

function deviceTarget(t) {
  if (t.target) return t.target;
  for (const a of Object.values(CONFIG.activities || {})) {
    const c = a.context || {};
    const scr = a.screen || a.view;
    if (scr && (c.media_player === t.entity || c.dpad === t.entity)) return scr;
  }
  return null;
}

/* DEVICE-TILE DENSITIES (Wave C — docs/design-control-language.md,
   the v2 canvas): screens, fans and covers reduce to one tile with
   three densities. A = the launcher (this widget as it always was).
   B = `density: "inline"`: the launcher band plus one 46px action
   row — a drag track for a continuous value (fan), or three
   stretched buttons for discrete positioning (cover), plus a tilt
   row when the cover supports it. C = `density: "compact"`: the
   control shares the 84px row with the name (fixed cluster right).
   Exactly two control fillings, ever; domain identity is the icon
   and status string only. Domains without a density mapping ignore
   the field and stay launchers. */
const DENSITY_DOMS = { fan: 1, cover: 1, switch: 1, input_boolean: 1, lock: 1 };
/* §9: no continuum, no fat — a switch or lock asked for inline
   renders its compact tile (the density scale doing its job) */
const FLAT_DOMS = { switch: 1, input_boolean: 1, lock: 1 };
const CVF = { OPEN_TILT: 16, CLOSE_TILT: 32, STOP_TILT: 64 };
/* COVER INVERT (V7 round — Suresh: "2% open, becomes 98% closed"):
   "invert": true on a cover tile flips the DISPLAY space — readout,
   state word, fill and scrub all live in the flipped axis, for
   covers whose HA position reads backwards on the wall (projector
   screens). The trio keeps its physical directions and the
   end-stop disable logic stays in HA's own space. */
const covShow = (t, p) => p == null ? null : (t && t.invert ? 100 - p : p);
const covWord = (t, s) => {
  if (!(t && t.invert)) return cap(s);
  const m = { open: "Closed", closed: "Open",
    opening: "Closing", closing: "Opening" };
  return m[s] || cap(s);
};
/* ---- V7 §9: stateless & binary domains ---- */
const PRESS_DOMS = { button: 1, input_button: 1, scene: 1 };
const BINARY_DOMS = { switch: 1, input_boolean: 1 };
/* the optimistic Sent flash (§9: "fires on press and does not wait
   for acknowledgement — that flash is the only feedback available,
   so it must not be skippable"). Keyed BY TILE ID, not on the tile
   object — canonTile hands out copies, so a def property would miss
   the copy the next render reads. Same for the lock's hold line. */
const SENT_UNTIL = {};
const HOLD_MSG = {};
function pressFlash(t) {
  if (!t || !t.id) return;
  SENT_UNTIL[t.id] = Date.now() + 1200;
  const el = document.getElementById("tile_" + t.id);
  if (el) {
    el.classList.add("sent");
    const sub = el.querySelector(".sub");
    if (sub) sub.textContent = "Sent";
  }
  setTimeout(() => {
    if (SENT_UNTIL[t.id] <= Date.now()) {
      delete SENT_UNTIL[t.id];
      if (el) el.classList.remove("sent");
      renderStates();
    }
  }, 1250);
}
/* the unlock/open HOLD (§9, settled at 500ms — --hold-ms in the
   theme): fires on completion, letting go before that undoes it.
   The fill and the accent-ink duplicate label are driven in JS px
   (the Chromium-61 floor again — clip-path animation is not owed to
   us there), same tokens, same look. */
function holdMs() {
  const v = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue("--hold-ms"));
  return isFinite(v) && v > 0 ? v : 500;
}
function wireHoldSeg(b, t, fire, msg) {
  const stop = () => {
    if (b._raf) cancelAnimationFrame(b._raf);
    b._raf = null; b._t0 = 0;
    b.classList.remove("holding");
    const f = b.querySelector(".hfill"), d = b.querySelector(".sgdup");
    if (f) f.style.width = "0px";
    if (d) d.style.width = "0px";
    if (HOLD_MSG[t.id]) { delete HOLD_MSG[t.id]; renderStates(); }
  };
  b.addEventListener("click", ev => { ev.stopPropagation(); ev.preventDefault(); });
  b.addEventListener("pointerdown", ev => {
    ev.stopPropagation();
    if (b.classList.contains("dis")) return;
    const w = b.offsetWidth, ms = holdMs();
    const f = b.querySelector(".hfill"), d = b.querySelector(".sgdup");
    const inner = d && d.firstElementChild;
    if (inner) inner.style.width = w + "px";
    b.classList.add("holding");
    HOLD_MSG[t.id] = msg;
    const sub = b.closest(".tile") && b.closest(".tile").querySelector(".sub");
    if (sub) sub.textContent = msg;
    b._t0 = Date.now();
    const step = () => {
      if (!b._t0) return;
      const p = Math.min(1, (Date.now() - b._t0) / ms);
      const px = Math.round(w * p) + "px";
      if (f) f.style.width = px;
      if (d) d.style.width = px;
      if (p >= 1) { stop(); fire(); return; }
      b._raf = requestAnimationFrame(step);
    };
    step();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(x =>
    b.addEventListener(x, stop));
}
const devDensity = t => {
  const dom = (resolveEntity(t && t.entity) || (t && t.entity) || "").split(".")[0];
  if (!(t && t.density && DENSITY_DOMS[dom])) return null;
  return FLAT_DOMS[dom] ? "compact" : t.density;
};

WIDGETS.device = {
  sub: (e, t) => {
    const s = st(e), dom = (e || "").split(".")[0];
    const den = devDensity(t);
    /* the pre-state placeholder ("…") is an internal sentinel — it
       must NEVER render as a status line (2026-09-01, his Studio
       preview: a tile with a bad entity read "…" under its name; a
       single-line tile then centres per V7 instead of carrying a
       blank-looking row) */
    if (s.s === "…") return "";
    /* advanced: show a specific attribute instead of the smart summary */
    if (t.attr) {
      const v = s.a[t.attr];
      return v == null ? cap(s.s) : String(v);
    }
    /* STATUS IS DROPPED BY THE CONTROL THAT REPLACES IT, not by the
       density (the canvas rule): a fan's track reads the number, so
       inline drops the "· 25%" and compact drops the line; a cover's
       buttons show nothing, so its state line stays at every density */
    if (dom === "fan") {
      /* both densities own the number (row value / inset value) —
         the status line goes entirely; the launcher keeps it */
      if (den) return "";
      const p = s.a.percentage;
      return cap(s.s) + (p == null || !ACTIVE(s.s) ? "" : " · " + p + "%");
    }
    if (dom === "cover") {
      const p = covShow(t, s.a.current_position);
      /* fat: the value lives IN the track — no line. Compact (V5
         §4C) and the launcher: the full status line. */
      if (den === "inline") return "";
      return covWord(t, s.s) + (p != null ? " · " + p + "%" : "");
    }
    /* §9 switch: the pair IS the readout — compact carries no status
       line at all (the only discrete domain that stays at 100) */
    if (BINARY_DOMS[dom] && den) return "";
    /* §9 lock: five states, all of which the panel must show */
    if (dom === "lock" && den) {
      if (t && HOLD_MSG[t.id]) return HOLD_MSG[t.id];
      const ls = s.s;
      if (ls === "locked")
        return sfHas(e, 1) ? "Locked · hold to unlock or open" : "Locked";
      if (ls === "locking") return "Locking…";
      if (ls === "unlocking") return "Unlocking…";
      if (ls === "jammed") return "Jammed — check the bolt";
      return cap(ls);
    }
    if (dom === "media_player") {
      const detail = s.a.media_title || s.a.source;
      return cap(s.s) + (detail && ACTIVE(s.s) ? " · " + detail : "");
    }
    if (dom === "light")
      return s.s === "on"
        ? "On · " + Math.round((s.a.brightness || 255) / 2.55) + "%" : cap(s.s);
    if (dom === "climate")
      return (s.a.current_temperature != null ? s.a.current_temperature + "° · " : "") + cap(s.s);
    /* press-shaped domains: the state is a timestamp — say when, not
       what (v0.78.1: the tile read "2026-08-12T14:52:59.942357+00:00") */
    if (PRESS_DOMS[dom]) {
      /* §9: the tile is the button — a single centred line at rest,
         "Sent" for ~1.2s after a press. (The old "Pressed 12 min
         ago" line retired with the V7 canvas.) */
      return (t && SENT_UNTIL[t.id] > Date.now()) ? "Sent" : "";
    }
    return cap(s.s);
  },
  /* §9 accent discipline: orange only on a device that is RUNNING.
     A press tile has no state; an unlocked door is not doing
     anything (recessed, not lit); locked = engaged. */
  isOn: e => {
    const dom = (e || "").split(".")[0];
    if (PRESS_DOMS[dom]) return false;
    if (dom === "lock") return st(e).s === "locked";
    return ACTIVE(st(e).s);
  },
  /* V5 §4C: a discrete compact carries its value on a STATUS LINE
     beneath the name (never beside it — "a long value competes with
     the name and wins") and grows to 116 — the launcher's two-line
     block plus the trio row, not a new shape */
  detailable: true,   /* auto ⚙ trail → the generated detail screen */
  select: (e, t) => {
    const dom = (e || "").split(".")[0];
    /* PHASE 0, entity-controls: a launcher must never be interactive
       and inert — no authored controller resolving is not a reason to
       swallow the tap; the entity's generated detail page is the
       final fallback (design-entity-controls, inconsistency #1). */
    const open = () => {
      const tgt = deviceTarget(t) || (e ? "detail:" + e : null);
      if (tgt) navigate(tgt);
    };
    if (t.tap === "none") return;      /* a pure readout */
    if (t.tap === "open") return open();
    /* density cover: OK commits the roved button (the coverbtns
       grammar) — Stop by default */
    if (devDensity(t) && dom === "cover") {
      const svc = rovePick(t, "cv") || "stop_cover";
      const tilt = svc.indexOf("tilt:") === 0;
      return void callService("cover", tilt ? svc.slice(5) : svc, null, e);
    }
    /* §9 switch pair: OK commits the roved side; before any rove the
       default is the side that CHANGES the state (stateless targets:
       either is safe to hit without reading first) */
    if (devDensity(t) && BINARY_DOMS[dom]) {
      const el2 = t.id && document.getElementById("tile_" + t.id);
      const roved = el2 && el2._ci != null ? rovePick(t, "sw") : null;
      const svc = roved || (ACTIVE(st(e).s) ? "turn_off" : "turn_on");
      return void callService(dom, svc, null, e);
    }
    /* §9 lock: lock is one press (a stray OK harmlessly locks a
       door); unlock and open NEVER fire from a tap — the hold is
       the gesture, on glass and on the pad alike */
    if (devDensity(t) && dom === "lock") {
      const el2 = t.id && document.getElementById("tile_" + t.id);
      const roved = el2 && el2._ci != null ? rovePick(t, "lk") : null;
      const svc = roved || "lock";
      if (svc === "lock")
        return void callService("lock", "lock", null, e);
      return void flashBar("Hold OK to " + (svc === "open" ? "open" : "unlock"));
    }
    const verb =
      t.tap === "toggle" ? () => callService("homeassistant", "toggle", null, e)
      : t.tap === "play_pause" ? () => callService("media_player", "media_play_pause", null, e)
      : DEVICE_VERB[dom] && DEVICE_VERB[dom](e);
    if (verb) {
      verb();
      if (PRESS_DOMS[dom]) pressFlash(t);   /* §9: the Sent flash */
      return;
    }
    open(); /* no verb → the compound page */
  },
  hold: (e, t) => {
    /* §9 lock on the d-pad: holding OK with a hold target roved IS
       the hold gesture — the chassis hold timer (keydown-anchored)
       clears the same deliberate-press bar as the 500ms touch hold */
    if (devDensity(t) && (e || "").split(".")[0] === "lock") {
      const el2 = t.id && document.getElementById("tile_" + t.id);
      const roved = el2 && el2._ci != null ? rovePick(t, "lk") : null;
      if (roved === "unlock" || roved === "open")
        return void callService("lock", roved, null, e);
    }
    const tgt = deviceTarget(t) || (e ? "detail:" + e : null);
    if (tgt) navigate(tgt);
  },
  /* ---- the density bodies (v3 — one chassis, two fillings) ---- */
  body: t => {
    const den = devDensity(t);
    if (!den) return "";
    const e = resolveEntity(t.entity) || t.entity || "";
    const dom = e.split(".")[0];
    const trio = (pre) => `
      <button class="dpbtn" data-cv="${pre}open_cover${pre ? "_tilt" : ""}"><span class="material-symbols-outlined">arrow_upward</span></button>
      <button class="dpbtn" data-cv="${pre}stop_cover${pre ? "_tilt" : ""}"><span class="material-symbols-outlined">stop</span></button>
      <button class="dpbtn" data-cv="${pre}close_cover${pre ? "_tilt" : ""}"><span class="material-symbols-outlined">arrow_downward</span></button>`;
    if (dom === "fan") {
      /* continuous: ± around the value (fat) or the 32px track
         (compact) — the numeric card, nothing else */
      if (den === "compact")
        return `<div class="steprow">
        <button class="dpbtn" data-dvn="-1"><span class="material-symbols-outlined">remove</span></button>
        <div class="sldr inrow"><i></i><b class="inval">–</b></div>
        <button class="dpbtn" data-dvn="1"><span class="material-symbols-outlined">add</span></button>
      </div>`;
      return `<div class="sldr"><i></i></div>
      <div class="steprow">
        <button class="dpbtn" data-dvn="-1"><span class="material-symbols-outlined">remove</span></button>
        <b class="stepval">–</b>
        <button class="dpbtn" data-dvn="1"><span class="material-symbols-outlined">add</span></button>
      </div>`;
    }
    /* §9 switch: the two-up STATE PAIR — two explicit labelled
       targets, never a sliding toggle ("a toggle asks what will
       this do; a pair is stateless") */
    if (BINARY_DOMS[dom])
      return `<div class="devrow statepair">
        <button class="dpbtn spseg" data-sw="turn_off"><span class="material-symbols-outlined">power_settings_new</span><b>Off</b></button>
        <button class="dpbtn spseg" data-sw="turn_on"><span class="material-symbols-outlined">bolt</span><b>On</b></button>
      </div>`;
    /* §9 lock: pair (lock / hold-to-unlock), growing to the covers'
       92px icon-only trio when the entity supports open. The hold
       segments carry the fill layer and the accent-ink duplicate
       row that inverts as the edge passes. */
    if (dom === "lock") {
      const seg = (svc, glyph, lbl) => `
        <button class="dpbtn spseg${svc === "lock" ? "" : " lkhold"}" data-lk="${svc}">${
          svc === "lock" ? "" : '<i class="hfill"></i>'}
          <span class="sgbase"><span class="material-symbols-outlined">${glyph}</span>${
            lbl ? `<b class="sglbl">${lbl}</b>` : ""}</span>${
          svc === "lock" ? "" : `<span class="sgdup"><span class="sgin"><span class="material-symbols-outlined">${glyph}</span>${
            lbl ? `<b class="sglbl">${lbl}</b>` : ""}</span></span>`}
        </button>`;
      /* ONE row: the open segment unhides (and the labels drop —
         92px cells are icon-only) when render sees OPEN support */
      return `<div class="devrow statepair lkrow">${
        seg("lock", "lock", "Lock") + seg("unlock", "lock_open", "Hold") +
        seg("open", "door_open", "").replace('class="dpbtn spseg lkhold"',
          'class="dpbtn spseg lkhold hidden"')}</div>`;
    }
    /* discrete: the trio fills the action row. Fat adds the position
       track above it (scrubbable — a track means scrubbable — and it
       doubles as the readout, value inset at 21px). Tilt stays a
       second row, revealed by the device's features at render. */
    if (den === "compact")
      return `<div class="devrow">${trio("")}</div>
      <div class="devrow tiltrow hidden">${trio("tilt:")}</div>`;
    return `<div class="sldr"><i></i><b class="inval">–</b></div>
      <div class="devrow">${trio("")}</div>
      <div class="devrow tiltrow hidden">${trio("tilt:")}</div>`;
  },
  wire: (el, t) => {
    const ent = () => resolveEntity(t.entity);
    const dom = (resolveEntity(t.entity) || t.entity || "").split(".")[0];
    /* §9 press tiles: the tile IS the control — mark the chassis so
       it rides the control surface; the chassis select fires the
       press and pressFlash paints the Sent window */
    if (PRESS_DOMS[dom] && t.tap !== "none") el.classList.add("prs");
    const den = devDensity(t);
    if (!den) return;
    /* cover buttons — tilt spellings carry a prefix the tap strips */
    wireTaps(el, "cv", v => {
      const tilt = v.indexOf("tilt:") === 0;
      callService("cover", tilt ? v.slice(5) : v, null, ent());
    });
    /* fan ± — the shared numeric step (entity metadata decides) */
    wireTaps(el, "dvn", d => { nudgeStep(ent(), "percentage", +d); renderStates(); });
    /* §9 switch pair — stateless targets, always both live */
    wireTaps(el, "sw", v => callService(dom, v, null, ent()));
    /* §9 lock: lock is a single press; unlock and open are 500ms
       holds (wireHoldSeg — never a click) */
    if (dom === "lock") {
      el.querySelectorAll('[data-lk="lock"]').forEach(b =>
        b.addEventListener("click", ev => { ev.stopPropagation();
          callService("lock", "lock", null, ent()); }));
      el.querySelectorAll(".lkhold").forEach(b => {
        const svc = b.dataset.lk;
        wireHoldSeg(b, t,
          () => callService("lock", svc, null, ent()),
          "Hold to " + (svc === "open" ? "open" : "unlock") + "…");
      });
    }
    /* v3 detail route in compact: the icon-plus-name zone opens the
       device's page — there is no room for a tune affordance */
    if (den === "compact" && (dom === "cover" || dom === "lock"))
      el.classList.add("dv3");    /* the 116 two-line discrete chassis */
    if (den === "compact") {
      const top = el.querySelector(".top");
      if (top) top.addEventListener("click", ev => {
        ev.stopPropagation();
        const e = ent() || t.entity;
        const tgt = deviceTarget(t) || (e ? "detail:" + e : null);
        if (tgt) navigate(tgt);
      });
    }
    const sl = el.querySelector(".sldr");
    if (!sl) return;
    const apply = (ev, final) => {
      const r = sl.getBoundingClientRect();
      let f = (ev.clientX - r.left) / r.width;
      f = Math.max(0, Math.min(1, f));
      setFill(sl, f);
      const v = Math.round(f * 100);
      const now = Date.now();
      if ((final || now - (sl._t || 0) > 150) && v !== sl._lastV) {
        sl._t = now; sl._lastV = v;
        if (dom === "cover")
          callService("cover", "set_cover_position",
            { position: t.invert ? 100 - v : v }, ent());
        else callService("fan", "set_percentage", { percentage: v }, ent());
      }
    };
    wireSlider(sl, apply, "h");
  },
  /* D-pad: fan ◀▶ nudge the percentage; cover ◀▶ rove the buttons
     (both rows, one highlight). Launcher tiles decline — the walk
     proceeds as always. */
  keys: {
    left: (e, t) => {
      const den = devDensity(t);
      if (!den) return false;
      const dom = (e || "").split(".")[0];
      if (dom === "fan") return void nudgeStep(e, "percentage", -1);
      return void roveMove(t,
        BINARY_DOMS[dom] ? "sw" : dom === "lock" ? "lk" : "cv", -1);
    },
    right: (e, t) => {
      const den = devDensity(t);
      if (!den) return false;
      const dom = (e || "").split(".")[0];
      if (dom === "fan") return void nudgeStep(e, "percentage", +1);
      return void roveMove(t,
        BINARY_DOMS[dom] ? "sw" : dom === "lock" ? "lk" : "cv", +1);
    },
  },
  render: (el, e, t) => {
    const den = devDensity(t);
    if (!den || !e) return;
    const dom = e.split(".")[0];
    const sl = el.querySelector(".sldr");
    const fillTo = (p) => {
      if (!sl || sl._drag) return null;
      const f = Math.max(0, Math.min(1, (p || 0) / 100));
      setFill(sl, f);
      return f;
    };
    if (dom === "fan") {
      const p = st(e).a.percentage;
      if (p > 0) FAN_RESUME[e] = p;   /* seed the toggle-back speed */
      const f = fillTo(p);
      const iv = el.querySelector(".inval");
      const sv = el.querySelector(".stepval");
      if (iv) { iv.textContent = p != null ? p + "%" : "–";
        if (f != null) iv.classList.toggle("flip", f >= 0.88); }
      if (sv) sv.textContent = p != null ? p + "%" : "–";
      return;
    }
    /* §9 switch: three segment states — the side that is not current
       stands proud (--tile-hi), the current side is accent when the
       device is ENGAGED and recessed when it is not; unavailable
       raises both (a toggle must invent a third position, a pair
       simply raises both sides) */
    if (BINARY_DOMS[dom]) {
      const s2 = st(e).s;
      const on = s2 === "on";
      const unav = s2 === "unavailable" || s2 === "unknown";
      el.querySelectorAll("[data-sw]").forEach(b => {
        const seg = b.dataset.sw === "turn_on";
        b.classList.toggle("cur-acc", !unav && on && seg);
        b.classList.toggle("cur-rec", !unav && !on && !seg);
      });
      return;
    }
    /* §9 lock: five states the panel must show; transit disables
       both sides; jammed is the first real use of --danger */
    if (dom === "lock") {
      const s2 = st(e).s;
      const openable = !!sfHas(e, 1);
      const row = el.querySelector(".lkrow");
      if (row) row.classList.toggle("lktrio", openable);
      const openSeg = el.querySelector('[data-lk="open"]');
      if (openSeg) openSeg.classList.toggle("hidden", !openable);
      const transit = s2 === "locking" || s2 === "unlocking" || s2 === "opening";
      const lockSeg = el.querySelector('[data-lk="lock"]');
      const unlk = el.querySelector('[data-lk="unlock"]');
      const lbl = (b, txt) => b && b.querySelectorAll(".sglbl")
        .forEach(x => { x.textContent = txt; });
      lbl(lockSeg, s2 === "locked" ? "Locked" : s2 === "locking" ? "Locking"
        : s2 === "jammed" ? "Retry" : "Lock");
      lbl(unlk, s2 === "unlocked" ? "Unlocked"
        : s2 === "unlocking" ? "Unlocking" : s2 === "open" ? "Open" : "Hold");
      if (lockSeg) lockSeg.classList.toggle("cur-acc", s2 === "locked");
      if (unlk) unlk.classList.toggle("cur-rec",
        s2 === "unlocked" || (s2 === "open" && !openable));
      if (openSeg) openSeg.classList.toggle("cur-rec", s2 === "open");
      el.querySelectorAll("[data-lk]").forEach(b =>
        b.classList.toggle("dis", transit));
      /* the state glyph (an authored icon outside the lock family
         stays; the defaults — a bare tile included — cycle with the
         state) */
      const ic = el.querySelector(".top .ic");
      if (ic && !ic.classList.contains("icsvg") &&
          !ic.classList.contains("icmask") && (!t.icon ||
          /^material:(lock|lock_open|lock_clock|door_open|error)$/.test(t.icon))) {
        ic.classList.add("material-symbols-outlined");
        ic.textContent =
          s2 === "jammed" ? "error" : transit ? "lock_clock"
          : s2 === "locked" ? "lock" : s2 === "open" ? "door_open" : "lock_open";
      }
      el.classList.toggle("jam", s2 === "jammed");
      return;
    }
    /* cover: the fat track doubles as the position readout — the
       inset value reads the % (or the bare state when the device
       reports none: Unknown lives in the track, not a status line);
       tilt row appears with the feature; end-stop actions take the
       disabled surface but KEEP their box, so the trio never shifts */
    const p = st(e).a.current_position;      /* HA's own axis */
    const dp = covShow(t, p);                /* the displayed axis */
    const f = fillTo(dp);
    const iv = el.querySelector(".inval");
    if (iv) { iv.textContent = dp != null ? dp + "%" : covWord(t, st(e).s);
      if (f != null) iv.classList.toggle("flip", f >= 0.88); }
    const tr = el.querySelector(".tiltrow");
    if (tr) tr.classList.toggle("hidden",
      !sfHas(e, CVF.OPEN_TILT | CVF.CLOSE_TILT | CVF.STOP_TILT));
    el.querySelectorAll("[data-cv]").forEach(b => {
      const v = b.getAttribute("data-cv");
      const dis = (v === "open_cover" && p === 100) ||
                  (v === "close_cover" && p === 0);
      b.classList.toggle("dis", !!dis);
    });
  },
};
