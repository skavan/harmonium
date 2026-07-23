WIDGETS.group = {
    /* summary entities come from groupEntities(): the explicit list,
       else derived live from the target page's tiles */
    sub: (e, t) => {
      const ents = groupEntities(t);
      const on = ents.filter(x => ACTIVE(st(x).s)).length;
      return `${ents.length} entities · ${on} active`;
    },
    isOn: (e, t) => groupEntities(t).some(x => ACTIVE(st(x).s)),
    select: (e, t) => { if (t.target) navigate(t.target); }
  };
