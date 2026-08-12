/* the QUEUE ROW widget — see queueScreen above. isOn is the LIVE
   playing test (title + artist beats duplicate titles); the ▶ mark
   and the accent highlight both ride renderStates. */
WIDGETS.qrow = {
  sub: (e, t) => t.sub_label || "",
  isOn: (e, t) => !!e && st(e).a.media_title === t.q_title &&
    (!t.q_artist || !st(e).a.media_artist ||
      st(e).a.media_artist === t.q_artist),
  select: (e, t) => runAction(t.action),
  body: () => `<span class="qnowic material-symbols-outlined">play_arrow</span>`,
};
