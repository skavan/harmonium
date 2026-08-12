/* DPAD pad — on-screen directional pad; capturing: while focused,
   physical arrows go to the device (cmdFor map). */
WIDGETS.dpad = {
    /* on-screen remote panel for touch devices (ring + side keys);
       hidden on hardware remotes via `unless: physical_dpad` */
    sub: () => "",
    isOn: () => false,
    selectCaptures: true, captureHint: "D-pad → device · [ sends back · home releases",
    capture: DPAD_CAPTURE,
    body: () => `<div class="dp-wrap">
      <div class="dp-side">
        <button class="dpbtn" data-act="vol_up"><span class="material-symbols-outlined">add</span></button>
        <span class="dp-cap">VOL</span>
        <button class="dpbtn" data-act="vol_down"><span class="material-symbols-outlined">remove</span></button>
      </div>
      <div class="dp-mid">
        <div class="dp-corners">
          <button class="dpbtn" data-cmd="info"><span class="material-symbols-outlined">info</span></button>
          <button class="dpbtn" data-cmd="menu"><span class="material-symbols-outlined">menu</span></button>
        </div>
        <div class="dp-pad">
          <button class="dpbtn up" data-cmd="up"><span class="material-symbols-outlined">keyboard_arrow_up</span></button>
          <button class="dpbtn lf" data-cmd="left"><span class="material-symbols-outlined">keyboard_arrow_left</span></button>
          <button class="dpbtn ok" data-cmd="select">OK</button>
          <button class="dpbtn rt" data-cmd="right"><span class="material-symbols-outlined">keyboard_arrow_right</span></button>
          <button class="dpbtn dn" data-cmd="down"><span class="material-symbols-outlined">keyboard_arrow_down</span></button>
        </div>
        <div class="dp-corners">
          <button class="dpbtn" data-cmd="back"><span class="material-symbols-outlined">undo</span></button>
          <button class="dpbtn" data-cmd="home"><span class="material-symbols-outlined">home</span></button>
        </div>
      </div>
      <div class="dp-side">
        <button class="dpbtn" data-cmd="ch_up"><span class="material-symbols-outlined">add</span></button>
        <span class="dp-cap">CH</span>
        <button class="dpbtn" data-cmd="ch_down"><span class="material-symbols-outlined">remove</span></button>
      </div>
    </div>`,
    wire(el, t) {
      wireTaps(el, "cmd", k => rc(resolveEntity(t.entity), cmdFor(t, k)));
      wireTaps(el, "act", a => act(a));    // VOL keys route via global.buttons
    }
  };
