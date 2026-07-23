/* NAV CARD — one tile type that opens another page, in four styles:
     plain   — icon + label button (the old `nav`)
     image   — photo tile (the old `room`)
     summary — live "<n> entities · <k> active" derived from the
               target page's tiles (the old `group`)
     auto    — resolved at render: tile has an image → image; target
               page is a room → image; target page has entities →
               summary; else plain.
   Doctrine (2026-07-23): groups are just views; the tile that points
   at one is a nav card. Tap = go there — the target page owns all
   behaviour. */
function navStyle(t) {
  if (t.style && t.style !== "auto") return t.style;
  if (t.image) return "image";
  const sc = t.target ? screenOf(t.target) : null;
  if (sc && sc.room) return "image";
  if (navTargetEntities(t).length) return "summary";
  return "plain";
}
/* summary entities: the explicit list, else DERIVED live from the
   target page's tiles — one source of truth, no baked duplicates */
function navTargetEntities(t) {
  if (Array.isArray(t.entities) && t.entities.length) return t.entities;
  if (!t.target) return [];
  const sc = screenOf(t.target);
  if (!sc) return [];
  return rawTilesOf(sc).map(x => x.entity)
    .filter(e => typeof e === "string" && e.includes("."));
}

WIDGETS.nav = {
  sub: (e, t) => {
    if (navStyle(t) !== "summary") return (t && t.sub) || "";
    const ents = navTargetEntities(t);
    const on = ents.filter(x => ACTIVE(st(x).s)).length;
    return `${ents.length} entities · ${on} active`;
  },
  isOn: (e, t) =>
    navStyle(t) === "summary" && navTargetEntities(t).some(x => ACTIVE(st(x).s)),
  body: t => navStyle(t) === "image"
    ? `<img class="roomimg" src="${t.image || ""}" alt="">`
    : `<div class="meter hidden"><i></i></div>`,
  /* style rides in as a class (nav-plain / nav-image / nav-summary)
     so the CSS can shape each without a separate widget type */
  wire: (el, t) => el.classList.add("nav-" + navStyle(t)),
  select: (e, t) => { if (t.target) navigate(t.target); else flashBar("No page linked yet"); },
};
