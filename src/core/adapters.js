/* ================================================================
   THE ADAPTER REGISTRY — entity-controls Phase 1
   (docs/design-entity-controls.md v2, 2026-08-30).

   An ADAPTER owns the semantic contract between an HA entity and a
   Harmonium control; a VARIANT is a shape that never changes the
   contract. ONE canonical spelling in every envelope: the adapter
   token is `type`, the shape is `variant`. Legacy spellings
   (`style`, `slider: true`, `kind: "volume"`, `shows`,
   `volume_style`) are COMPAT-READ here — the reader lets an updated
   engine render canonical configs safely before anyone opens the
   Studio, and renders legacy configs byte-for-byte as before.

   The table below has a TWIN in studio-src/src/lib/stocklib.js —
   probe-entity-phase1 byte-compares the marked region, so the two
   surfaces can never drift (the Draws-as lesson, Phase 0 #3,
   promoted to doctrine). Mushroom's card model is the reference:
   one semantic card, presentation separate (its display_mode is
   our variant); the shared options block is identical everywhere.

   `domains`: entity domains the adapter offers itself to (absent =
   any entity — the Launcher rule). `role`: the device-library claim
   it binds to (null = none needed). `variants`: the legal shapes,
   [] = single shape. `dflt`: the adapter's built-in default shape.
   Number/Select rows land in Phase 2 — reserving the tokens here
   would put dead choices in every Draws-as list. */
var ADAPTERS =
/* @adapter-table-begin v1 */
{
  device:    { role: null,            variants: [] },
  volume:    { role: "volume",        domains: ["media_player"],
               variants: ["compact", "slider", "stepper"], dflt: "slider" },
  power:     { role: "power",
               domains: ["media_player", "switch", "light", "fan",
                         "input_boolean"], variants: [] },
  media:     { role: "media_player",  domains: ["media_player"],
               variants: [], row: false },
  transport: { role: "media_player",  domains: ["media_player"],
               variants: [] },
  sources:   { role: "source_select", domains: ["media_player"],
               variants: ["auto", "picker", "cycle", "chips"],
               dflt: "auto" },
  number:    { role: null, domains: ["number", "input_number"],
               variants: ["auto", "compact", "slider", "stepper",
                          "vertical"], dflt: "auto" },
  select:    { role: null, domains: ["select", "input_select"],
               variants: ["auto", "picker", "cycle", "chips"],
               dflt: "auto" },
}
/* @adapter-table-end */
;

/* ---- the resolution ladder (design decision 9) ----
   Three rungs: the member's own choice → the activity surface
   default → the global/theme default (else the adapter's built-in).
   Resolution stops at the first rung that answers; a rung never
   partially answers. Call sites feed rungs IN LADDER ORDER — the
   function is trivial on purpose: it exists so the ladder has ONE
   name, one shape, and one place to read it. */
function resolveVariant() {
  for (var i = 0; i < arguments.length; i++)
    if (arguments[i]) return arguments[i];
  return null;
}
/* rung 1 of a `present` entry: canonical `variant`, legacy `style` */
function presVariant(p) { return (p && (p.variant || p.style)) || null; }
/* what a present entry DRAWS AS: canonical `type`, legacy `shows` */
function presType(p) { return (p && (p.type || p.shows)) || null; }
/* rung 2: canonical surface.<adapter>_variant, legacy volume_style */
function surfaceVariant(act, adapter) {
  const s = (act && act.surface) || {};
  return s[adapter + "_variant"] ||
    (adapter === "volume" ? s.volume_style : null) || null;
}
/* rung 3: global.style.<adapter> (today's spelling IS canonical) */
function globalVariant(adapter) {
  return (((CONFIG || {}).global || {}).style || {})[adapter] || null;
}

/* ---- the compat reader: canonical tile → working shape ----
   Widgets keep today's internal vocabulary ({type:"stepper",
   kind:"volume"}, {type:"volume", slider:true}); an AUTHORED tile in
   the canonical spelling translates here, at expandTile, before any
   widget sees it. Legacy and unknown tiles pass through UNTOUCHED
   (absent variant = legacy behavior, byte-for-byte; an unknown
   adapter token is preserved, never silently replaced). Returns the
   SAME object when no translation applies — generated tiles and
   legacy configs pay nothing. */
function canonTile(t) {
  if (!t) return t;
  if (t.type === "volume" && t.variant) {
    const c = Object.assign({}, t);
    const v = c.variant;
    delete c.variant;
    delete c.slider;
    if (v === "stepper") { c.type = "stepper"; c.kind = "volume"; }
    else if (v === "compact") c.slider = false;
    else c.slider = true;
    /* NOTE (2026-08-31 bug fix — Suresh's compact Receiver rendered
       the fat track): bare volume has meant SLIDER since v0.83.1
       ("default should be fat"), so Compact must write
       slider: false explicitly — the earlier reader dropped the key
       and got the fat default. FP-NORM v2 (ownership.js/catalogs.py)
       carries the matching hash-form ruling. */
    return c;
  }
  /* THE NUMBER ADAPTER (Phase 2): rides the stepper widget with
     kind "number" (STEP_KINDS.number — the entity's own range).
     Slider/Vertical add the fat track; Auto is DETERMINISTIC and
     versioned with the engine (design ruling): HA mode "slider" →
     Slider; "box" → Stepper; auto/absent → Slider when
     (max−min)/step ≤ 100, else Stepper. Absent variant = Auto here —
     these adapters have no legacy behavior to preserve. */
  if (t.type === "number") {
    const c = Object.assign({}, t);
    const v = numberAutoVariant(c);
    delete c.variant;
    c.type = "stepper";
    c.kind = "number";
    if (v === "slider") c.slider = "h";
    else if (v === "vertical") c.slider = "v";
    /* stepper AND compact: the ROW shape — − [track over value] +
       (the unified numeric language, 2026-08-31; Compact may later
       earn a shorter chassis, but the shape is one) */
    else c.slider = false;
    return c;
  }
  /* THE SELECT ADAPTER (Phase 2): Auto = Picker. Period. (the design
     ruling — layout-sensing Auto is future work, because two engine
     versions must never disagree about what Auto renders). Chips is
     the inline row; Cycle is the pageless picker. */
  if (t.type === "select") {
    const c = Object.assign({}, t);
    const v = c.variant || "auto";
    delete c.variant;
    c.kind = "select";
    if (v === "chips") c.type = "chips";
    else {
      c.type = "picker";
      if (v === "cycle") c.cycle = true;
    }
    return c;
  }
  /* SOURCES gains the same shapes (2026-08-31 — Suresh: "surely I
     should get the variant option too?"): the input list IS a
     select, kind "source". Auto/absent keeps the CLASSIC sources
     tile (byte-identical — zero change for every deployed config);
     an explicit variant rides the Select machinery: Picker adds the
     ◀▶-cycle-in-place value grammar, Cycle is pageless, Chips is
     the inline row. The role's default entity bakes in so a bare
     generated tile still resolves. */
  if (t.type === "sources" && t.variant && t.variant !== "auto") {
    const c = Object.assign({}, t);
    const v = c.variant;
    delete c.variant;
    c.kind = "source";
    c.entity = c.entity || "$context.source_select";
    if (v === "chips") c.type = "chips";
    else {
      c.type = "picker";
      if (v === "cycle") c.cycle = true;
    }
    return c;
  }
  return t;
}
/* which adapter a WORKING-shape tile belongs to (the reverse of
   canonTile — used by card grouping's row-form check, Phase 3) */
function adapterOfTile(t) {
  if (!t) return null;
  if (t.type === "volume") return "volume";
  if (t.type === "stepper")
    return t.kind === "volume" ? "volume"
      : t.kind === "number" ? "number" : null;
  if (t.type === "picker") return "select";
  if (t.type === "chips") return t.kind === "select" ? "select" : null;
  return ADAPTERS[t.type] ? t.type : null;
}
/* card-groupable? An adapter that advertises NO row form (media —
   an art hero cannot flatten into a card row) renders standalone;
   everything else, non-adapter tiles included, may share a card
   (design-card-group-focus.md, "Row-form advertisement"). */
function tileGroupable(t) {
  const a = adapterOfTile(t);
  return !(a && ADAPTERS[a] && ADAPTERS[a].row === false);
}
/* Number's Auto rules — deterministic on the entity's published
   metadata, assertable in a probe with fixed inputs */
function numberAutoVariant(c) {
  const v = c.variant;
  if (v && v !== "auto") return v;
  const a = st(c.entity || "").a || {};
  if (a.mode === "slider") return "slider";
  if (a.mode === "box") return "stepper";
  const min = +a.min, max = +a.max;
  const step = +a.step > 0 ? +a.step : 1;
  if (isFinite(min) && isFinite(max) && (max - min) / step <= 100)
    return "slider";
  return "stepper";
}
