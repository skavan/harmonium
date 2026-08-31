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
const DEVICE_VERB = {
  media_player: e => ["playing", "paused", "buffering"].includes(st(e).s)
    ? () => callService("media_player", "media_play_pause", null, e) : null,
  light: e => () => callService("light", "toggle", null, e),
  switch: e => () => callService("switch", "toggle", null, e),
  fan: e => () => callService("fan", "toggle", null, e),
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

WIDGETS.device = {
  sub: (e, t) => {
    const s = st(e), dom = (e || "").split(".")[0];
    /* advanced: show a specific attribute instead of the smart summary */
    if (t.attr) {
      const v = s.a[t.attr];
      return v == null ? cap(s.s) : String(v);
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
    if (dom === "button" || dom === "input_button") {
      const ago = agoStr(s.s);
      return ago ? "Pressed " + ago : "Press";
    }
    if (dom === "scene") {
      const ago = agoStr(s.s);
      return ago ? "Ran " + ago : "Run";
    }
    return cap(s.s);
  },
  isOn: e => ACTIVE(st(e).s),
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
    const verb =
      t.tap === "toggle" ? () => callService("homeassistant", "toggle", null, e)
      : t.tap === "play_pause" ? () => callService("media_player", "media_play_pause", null, e)
      : DEVICE_VERB[dom] && DEVICE_VERB[dom](e);
    if (verb) return verb();
    open(); /* no verb → the compound page */
  },
  hold: (e, t) => {
    const tgt = deviceTarget(t) || (e ? "detail:" + e : null);
    if (tgt) navigate(tgt);
  },
};
