WIDGETS.activity = {
    sub: (e, t) => {
      if (S.confirmTile === t.id) return "Press again to end";
      return isActActive(t) ? "On · press to open" : "Off · press to start";
    },
    isOn: (e, t) => isActActive(t),
    select: (e, t) => {
      const a = actOf(t); if (!a) return;
      if (S.confirmTile === t.id) { requestEnd(t, a); return; }
      if (isActActive(t)) { if (a.screen) navigate(a.screen); }
      else startActivity(t.activity);
    },
    hold: (e, t) => {
      const a = actOf(t);
      if (a && isActActive(t)) requestEnd(t, a);
    }
  };
