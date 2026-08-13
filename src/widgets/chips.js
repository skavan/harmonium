/* CHIPS row — one-tap choice pills for an entity attribute list
   (hvac_mode, fan_mode, preset, effect …); kind picks the recipe. */
WIDGETS.chips = {
  /* v0.57: a chips row with nothing to choose is chrome — hide it.
     This is what keeps the new sound_mode row off every media_player
     that has no sound_mode_list, with no per-domain special-casing. */
  hidden: (e, t) => !!e && !chipOptions(e, t.kind).length,
    /* option pills from a CHIP_KINDS binding (t.kind); options are
       read from entity attributes each render, so they track the
       device. Tile self-hides when the entity offers no options.
       D-pad: capture, then ◀▶ cycles (and applies) the option. */
    sub: () => "",
    isOn: () => false,
    selectCaptures: true, captureHint: "◀▶ change · back releases",
    capture: {
      left:  (e, t) => cycleChip(e, t, -1),
      right: (e, t) => cycleChip(e, t, +1)
    },
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
      row.querySelectorAll(".chip").forEach(c =>
        c.classList.toggle("on", c.dataset.ch === cur));
    }
  };
