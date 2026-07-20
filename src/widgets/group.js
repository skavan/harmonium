WIDGETS.group = {
    sub: (e, t) => {
      const n = (t.entities || []).length;
      const on = (t.entities || []).filter(x => ACTIVE(st(x).s)).length;
      return `${n} entities · ${on} active`;
    },
    isOn: (e, t) => (t.entities || []).some(x => ACTIVE(st(x).s)),
    select: (e, t) => { if (t.target) navigate(t.target); }
  };
