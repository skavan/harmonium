/* BUTTONS strip — a row of named device keys (back/home/menu/…)
   sent via remote.send_command through cmdFor's command map. */
WIDGETS.buttons = {
    /* device button bar (2-4 slots): each slot is a logical dpad key
       sent to `entity` through cmdFor — so the same bar emits UP vs
       KEY_UP etc. per the active activity's dpad_commands. */
    sub: () => "", isOn: () => false,
    body: t => `<div class="btnrow">` +
      (t.buttons || ["info", "menu", "back", "home"]).map(k =>
        `<button class="dpbtn" data-cmd="${k}"><span class="material-symbols-outlined">${BTN_ICON[k] || k}</span></button>`
      ).join("") + `</div>`,
    wire: (el, t) => wireTaps(el, "cmd", k => {
      /* ON-SCREEN power drives the ACTIVITY (v0.48.1 — Suresh: "Power
         is turning off the device, not the activity"): toggling the
         activity keeps the select and the devices moving TOGETHER —
         end (with the standard confirm) when it's running, start (the
         full generated sequence) when it isn't. Raw device power is
         what the PHYSICAL short-press power policy is for; pages with
         no current activity keep the old device fallback.
         v0.61: the PRESUMED activity counts here — the page you are
         looking at is drawn as that activity, so the power button on
         it starts that activity. Suresh's own sentence: "I can always
         hit the power button to turn it on!" */
      if (k === "power") {
        const aid = renderActivityId();
        const a = aid && (CONFIG.activities || {})[aid];
        if (a) {
          if (isActivityActive(aid)) { endCurrentActivity(); renderStates(); }
          else { startActivity(aid); flashBar("Starting " + (a.name || aid), "on"); }
          return;
        }
        if (ctPower()) return;
        const pe = resolveEntity("$context.power");
        if (pe) callService("homeassistant", "toggle", null, pe);
        return;
      }
      rc(resolveEntity(t.entity), cmdFor(t, k));
    })
  };
