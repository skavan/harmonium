WIDGETS.buttons = {
    /* device button bar (2-4 slots): each slot is a logical dpad key
       sent to `entity` through cmdFor — so the same bar emits UP vs
       KEY_UP etc. per the active activity's dpad_commands. */
    sub: () => "", isOn: () => false,
    body: t => `<div class="btnrow">` +
      (t.buttons || ["info", "menu", "back", "home"]).map(k =>
        `<button class="dpbtn" data-cmd="${k}"><span class="material-symbols-outlined">${BTN_ICON[k] || k}</span></button>`
      ).join("") + `</div>`,
    wire: (el, t) => wireTaps(el, "cmd", k =>
      rc(resolveEntity(t.entity), cmdFor(t, k)))
  };
