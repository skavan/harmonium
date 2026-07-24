/* MEDIA buttons — transport-adjacent named keys (rew/ff/…) for
   media_player entities. */
WIDGETS.mediabtns = {
    /* media mode bar: shuffle + repeat for the tile's player.
       Tap toggles (shuffle) / cycles (repeat off→all→one→off);
       ◀▶ rove while focused, select presses (coverbtns model).
       Accent icon = mode active; repeat shows repeat_one on "one". */
    sub: () => "",
    isOn: () => false,
    keys: {
      left:  (e, t) => roveMove(t, "mb", -1),
      right: (e, t) => roveMove(t, "mb", +1)
    },
    select: (e, t) => mbPress(e, rovePick(t, "mb") || "shuffle"),
    body: () => `<div class="btnrow">
      <button class="dpbtn cvsel" data-mb="shuffle"><span class="material-symbols-outlined">shuffle</span></button>
      <button class="dpbtn" data-mb="repeat"><span class="material-symbols-outlined">repeat</span></button>
    </div>`,
    wire: (el, t) => {
      el._ci = 0;                       // roving default = shuffle (matches cvsel)
      wireTaps(el, "mb", k => mbPress(resolveEntity(t.entity), k));
    },
    render: (el, e) => {
      const a = st(e).a;
      const sh = el.querySelector('[data-mb="shuffle"]');
      const rp = el.querySelector('[data-mb="repeat"]');
      if (sh) sh.classList.toggle("mbon", !!a.shuffle);
      if (rp) {
        rp.classList.toggle("mbon", !!a.repeat && a.repeat !== "off");
        rp.firstElementChild.textContent =
          a.repeat === "one" ? "repeat_one" : "repeat";
      }
    }
  };

function mbPress(e, k) {
  if (!e) return;
  const a = st(e).a;
  if (k === "shuffle")
    callService("media_player", "shuffle_set", { shuffle: !a.shuffle }, e);
  else {
    const next = { off: "all", all: "one", one: "off" }[a.repeat || "off"] || "all";
    callService("media_player", "repeat_set", { repeat: next }, e);
  }
}
