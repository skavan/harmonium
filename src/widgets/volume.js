/* VOLUME — up/down/mute strip + optional level slider; truth may
   come from a separate level_entity (the ARC split). */
WIDGETS.volume = {
    /* commands go to `entity`; the meter reads `level_entity` when set
       (e.g. TV receives ARC volume keys, soundbar reports the level) */
    sub: (e, t) => {
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
    body: () => `<div class="volrow">
      <button class="dpbtn" data-vol="down"><span class="material-symbols-outlined">remove</span></button>
      <div class="meter"><i></i></div>
      <button class="dpbtn" data-vol="up"><span class="material-symbols-outlined">add</span></button>
    </div>`,
    wire: (el, t) => wireTaps(el, "vol", d =>
      callService("media_player", "volume_" + d, null, resolveEntity(t.entity)))
  };
