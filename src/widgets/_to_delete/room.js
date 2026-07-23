WIDGETS.room = {
    sub: () => "",
    isOn: (e, t) => t.target === CONFIG.home_screen,   /* mock: highlight current */
    select: (e, t) => { if (t.target) navigate(t.target); else flashBar("Mock room"); },
    body: t => `<img class="roomimg" src="${t.image || ""}" alt="">`
  };
