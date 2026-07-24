/* POWER toggle — standalone round homeassistant.toggle button (also
   the power row on generated detail pages). */
WIDGETS.power = {
    /* standalone round toggle (homeassistant.toggle) */
    sub: () => "",
    isOn: e => ACTIVE(st(e).s),
    select: e => callService("homeassistant", "toggle", null, e),
    body: () => `<div class="pwrow">
      <button class="dpbtn pwbtn" data-pw="1"><span class="material-symbols-outlined">power_settings_new</span></button>
    </div>`,
    wire: (el, t) => wireTaps(el, "pw", () =>
      callService("homeassistant", "toggle", null, resolveEntity(t.entity)))
  };
