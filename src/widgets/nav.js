/* NAV CARD — one tile type that opens another page, in four styles:
     plain   — icon + label button (the old `nav`)
     image   — photo tile (the old `room`)
     summary — live "<n> entities · <k> active" derived from the
               target page's tiles (the old `group`)
     auto    — resolved at render: a picture to show → image; target
               page has entities → summary; else plain.
   Doctrine (2026-07-23): groups are just views; the tile that points
   at one is a nav card. Tap = go there — the target page owns all
   behaviour. */
/* THE PICTURE A ROOM CARD SHOWS (v0.67.2 — Suresh: "I added a nav
   tile to Bar. Not rendering properly."): `auto` used to pick the
   IMAGE style for any card pointing at a room, picture or no picture,
   so a card without `image` rendered <img src=""> — a broken-image
   glyph in a photo-shaped tile. A room already declares its picture
   once, in its banner: BORROW it rather than make the author paste
   the same path twice, and only wear the photo shape when there is
   actually a photo. */
function navImage(t) {
  if (t.image) return t.image;
  const sc = t.target ? screenOf(t.target) : null;
  const b = sc && sc.banner;
  if (b && b.enabled !== false && b.image) return b.image;
  return "";
}
function navStyle(t) {
  /* an explicit image: with nothing to show is still a broken image —
     fall through to the ladder rather than render void */
  if (t.style && t.style !== "auto" &&
      !(t.style === "image" && !navImage(t))) return t.style;
  if (navImage(t)) return "image";
  if (navTargetEntities(t).length) return "summary";
  return "plain";
}
/* summary entities: the explicit list, else DERIVED live from the
   target page's tiles — one source of truth, no baked duplicates */
let _navDepth = 0;
function navTargetEntities(t) {
  if (Array.isArray(t.entities) && t.entities.length) return t.entities;
  if (!t.target) return [];
  const sc = screenOf(t.target);
  if (!sc) return [];
  /* SEE THROUGH GENERATORS (v0.57.1): a zones view whose volumes come
     from a `volumes` tile has no raw .entity to read, so the summary
     used to report "0 entities · 0 active" and `auto` fell back to
     plain. Expand instead — but STAND ON THE TARGET while doing it,
     because generators resolve $context against S.screen and would
     otherwise answer for the wrong room. Depth-guarded: a target that
     carries a nav card pointing back here must not recurse. */
  let tiles;
  if (_navDepth) {
    tiles = rawTilesOf(sc);
  } else {
    const prev = S.screen;
    _navDepth++;
    try { S.screen = t.target; tiles = tilesOf(sc); }
    catch (err) { tiles = rawTilesOf(sc); }
    finally { S.screen = prev; _navDepth--; }
  }
  return tiles.map(x => x.entity)
    .filter(e => typeof e === "string" && e.includes("."));
}

WIDGETS.nav = {
  /* v0.57.1: opt-in — a summary card that summarises NOTHING is
     chrome. Lets the shared controllers carry a "Zones" card that
     simply is not there in a room with a single volume. Opt-in so no
     existing card changes behaviour. */
  hidden: (e, t) => !!t.hide_when_empty && navStyle(t) === "summary" &&
    !navTargetEntities(t).length,
  sub: (e, t) => {
    if (navStyle(t) !== "summary") return (t && t.sub) || "";
    const ents = navTargetEntities(t);
    const on = ents.filter(x => ACTIVE(st(x).s)).length;
    return `${ents.length} entities · ${on} active`;
  },
  isOn: (e, t) =>
    navStyle(t) === "summary" && navTargetEntities(t).some(x => ACTIVE(st(x).s)),
  body: t => navStyle(t) === "image"
    ? `<img class="roomimg" src="${navImage(t)}" alt="">`
    : `<div class="meter hidden"><i></i></div>`,
  /* style rides in as a class (nav-plain / nav-image / nav-summary)
     so the CSS can shape each without a separate widget type */
  wire: (el, t) => {
    const style = navStyle(t);
    el.classList.add("nav-" + style);
    /* the shared photo-tile dress (v0.85.8): widgets.css styles
       .tile.photo, and preset tiles with an `image` wear the same
       class — one look, two widgets. image_opacity moved to the
       chassis (tiles.js) for the same reason. */
    if (style === "image") el.classList.add("photo");
  },
  select: (e, t) => { if (t.target) navigate(t.target); else flashBar("No page linked yet"); },
};
