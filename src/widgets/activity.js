/* ACTIVITY tile — one activity's face: lit from the room's activity
   select (or v2 state rules); tap starts/opens, confirm-to-end rides
   the status bar. */
WIDGETS.activity = {
    sub: (e, t) => {
      if (S.confirmTile === t.id) return "Press again to end";
      /* v0.58 said everything; v0.78 says enough (review: "Too much
         text… just say hold to end (when on) and Off - press to
         start"). Press-to-open is what an ON tile obviously does —
         only the END gesture needs teaching. */
      return isActActive(t)
        ? "On · hold to end"
        : "Off · press to start";
    },
    isOn: (e, t) => isActActive(t),
    select: (e, t) => {
      const a = actOf(t); if (!a) return;
      if (S.confirmTile === t.id) { requestEnd(t, a); return; }
      if (isActActive(t)) {
        /* v2 self-heal: device truth says ON but the select is stale —
           silently repair the routing cache while opening the screen */
        const sel = roomActivitySelect();
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
