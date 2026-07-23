WIDGETS.activity = {
    sub: (e, t) => {
      if (S.confirmTile === t.id) return "Press again to end";
      return isActActive(t) ? "On · press to open" : "Off · press to start";
    },
    isOn: (e, t) => isActActive(t),
    select: (e, t) => {
      const a = actOf(t); if (!a) return;
      if (S.confirmTile === t.id) { requestEnd(t, a); return; }
      if (isActActive(t)) {
        /* v2 self-heal: device truth says ON but the select is stale —
           silently repair the routing cache while opening the screen */
        const sel = CONFIG.global.activity_select;
        if (sel && activityStateOn(a) === true &&
            st(sel).s !== (a.state_value || t.activity))
          callService(sel.split(".")[0], "select_option",
            { option: a.state_value || t.activity }, sel);
        if (a.screen) navigate(a.screen);
      }
      else startActivity(t.activity);
    },
    hold: (e, t) => {
      const a = actOf(t);
      if (a && isActActive(t)) requestEnd(t, a);
    }
  };
