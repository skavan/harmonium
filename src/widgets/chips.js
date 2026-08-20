/* CHIPS row — one-tap choice pills for an entity attribute list
   (hvac_mode, fan_mode, preset, effect …); kind picks the recipe. */
/* OPTIONS MODE (2026-08-20 — Suresh, on the AirCon page: "Left and
   Right DPad should navigate within the Tiles and OK should trigger
   the subselection"): no more capture. ◀▶ rove a highlight through
   the pills — starting from the active one — and OK commits the
   highlighted choice. The highlight is per-tile, session-local, and
   drops the moment focus walks off the tile. Touch taps unchanged. */
const CHIP_ROVE = {};   /* tile id → roved option index */
function chipRove(e, t, dir) {
  const k = CHIP_KINDS[t.kind];
  if (!k) return false;
  const opts = chipOptions(e, t.kind);
  if (!opts.length) return false;
  let i = CHIP_ROVE[t.id];
  if (i == null) i = Math.max(0, opts.indexOf(k.current(e)));
  i = (i + dir + opts.length) % opts.length;
  CHIP_ROVE[t.id] = i;
  return true;
}
function chipCommit(e, t) {
  const k = CHIP_KINDS[t.kind];
  const opts = chipOptions(e, t.kind);
  const i = CHIP_ROVE[t.id];
  if (!k || i == null || !opts[i]) return;
  k.set(resolveEntity(t.entity), opts[i]);
  flashBar(deslug(opts[i]));
}
WIDGETS.chips = {
  /* v0.57: a chips row with nothing to choose is chrome — hide it.
     This is what keeps the new sound_mode row off every media_player
     that has no sound_mode_list, with no per-domain special-casing. */
  hidden: (e, t) => !!e && !chipOptions(e, t.kind).length,
    /* option pills from a CHIP_KINDS binding (t.kind); options are
       read from entity attributes each render, so they track the
       device. Tile self-hides when the entity offers no options. */
    sub: () => "",
    isOn: () => false,
    nav: "options",
    keys: {
      left:  (e, t) => chipRove(e, t, -1),
      right: (e, t) => chipRove(e, t, +1)
    },
    select: (e, t) => chipCommit(e, t),
    body: () => `<div class="chiprow"></div>`,
    render(el, e, t) {
      const k = CHIP_KINDS[t.kind];
      if (!k) return;
      const opts = chipOptions(e, t.kind);
      el.classList.toggle("hidden", !opts.length);
      const row = el.querySelector(".chiprow");
      const sig = JSON.stringify(opts);
      if (row.dataset.sig !== sig) {
        row.dataset.sig = sig;
        /* label deslugged (wind_free → "wind free"); data-ch keeps
           the RAW value — that's what the service call needs */
        row.innerHTML = opts.map(o =>
          `<button class="chip" data-ch="${o}">${deslug(o)}</button>`).join("");
        wireTaps(row, "ch", v => k.set(resolveEntity(t.entity), v));
      }
      const cur = k.current(e);
      /* the roving highlight lives only while the tile is focused */
      if (S.focusId !== t.id) delete CHIP_ROVE[t.id];
      const ri = CHIP_ROVE[t.id];
      const chips = row.querySelectorAll(".chip");
      chips.forEach((c, i) => {
        c.classList.toggle("on", c.dataset.ch === cur);
        c.classList.toggle("rove", ri != null && i === ri);
      });
    }
  };
