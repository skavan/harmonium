/* TRANSPORT strip — prev · play/pause · next for a media_player. */
WIDGETS.transport = {
    /* transport row: rew / play-pause / ff. D-pad: ◀▶ move the roving
       highlight while focused (same model as coverbtns — the music
       screen has no dpad_passthrough, so the row IS the transport),
       select presses the highlighted control (default play-pause). */
    sub: () => "",
    isOn: e => st(e).s === "playing",
    keys: {
      left:  (e, t) => roveMove(t, "tr", -1),
      right: (e, t) => roveMove(t, "tr", +1)
    },
    select: (e, t) =>
      callService("media_player", rovePick(t, "tr") || "media_play_pause", null, e),
    body: () => `<div class="trow">
      <button class="dpbtn" data-tr="media_previous_track"><span class="material-symbols-outlined">skip_previous</span></button>
      <button class="dpbtn trbig cvsel" data-tr="media_play_pause"><span class="material-symbols-outlined">play_pause</span></button>
      <button class="dpbtn" data-tr="media_next_track"><span class="material-symbols-outlined">skip_next</span></button>
    </div>`,
    wire: (el, t) => wireTaps(el, "tr", svc =>
      callService("media_player", svc, null, resolveEntity(t.entity)))
  };
