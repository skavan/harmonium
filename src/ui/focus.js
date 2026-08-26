/* ================================================================
   Focus: spatial D-pad navigation + capture mode
   ================================================================ */
/* Focus ids come in three flavors:
   · a tile id                     (element #tile_<id>)
   · "hero_*"                      (banner title / section jumps)
   · "<tileid>::trail"             (a tile's trailing action zone)  */
const TRAIL = "::trail";
const isTrailId = id => typeof id === "string" && id.endsWith(TRAIL);
const trailBase = id => id.slice(0, -TRAIL.length);

/* focusable items = hero nav elements + visible tiles (+ trails) */
function focusables() {
  const list = [];
  document.querySelectorAll("#banner [data-fid]").forEach(el =>
    list.push({ id: el.dataset.fid, el }));
  tiles().forEach(t => {
    const el = document.getElementById("tile_" + t.id);
    if (!el || el.offsetParent === null) return;   // skip hidden tiles
    list.push({ id: t.id, el });
    const tr = el.querySelector(".trail");
    if (tr) list.push({ id: tr.dataset.fid, el: tr });
  });
  return list;
}
function focusEl(id) {
  return document.getElementById("tile_" + id) ||
    document.querySelector(`#banner [data-fid="${id}"]`) ||
    document.querySelector(`#grid [data-fid="${id}"]`);
}

function setFocus(id) {
  releaseCapture();
  if (S.confirmTile && S.confirmTile !== id) { clearConfirm(); }
  S.focusId = id;
  grid.querySelectorAll(".tile").forEach(el =>
    el.classList.toggle("focused", el.id === "tile_" + id));
  grid.querySelectorAll(".trail").forEach(el =>
    el.classList.toggle("focused", el.dataset.fid === id));
  document.querySelectorAll("#banner [data-fid]").forEach(el =>
    el.classList.toggle("focused", el.dataset.fid === id));
  const el = focusEl(id);
  /* gridScrollTo, not scrollIntoView (v0.83.11): the native call
     propagates to ancestor scrollers — across the preview iframe it
     slid the whole Studio pane (render.js has the full story) */
  if (el && el.closest("#grid")) gridScrollTo(el, "nearest");
  /* the claim countdown bar follows the ring (and re-seeks after a
     grid re-render); no-op off a TV-page claim. Guarded: drawClaimBar
     lives in input.js, later in the build. */
  if (typeof drawClaimBar === "function") drawClaimBar();
}

function spatialMove(dir) {
  const cur = focusEl(S.focusId);
  if (!cur) return false;
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best = null, bestScore = Infinity;
  focusables().forEach(f => {
    if (f.id === S.focusId) return;
    /* THE TAB ROW IS NOT A D-PAD STOP (2026-08-19 — Suresh: "dpad
       up/dn, sometimes goes into tab row (it shouldn't)"): the hero
       chips are touch targets and hold-CH anchors, not part of the
       tile walk — ▲ from the first row used to land on them. Banner
       items are skipped for vertical moves; with no vertical door
       in, the D-pad can't reach them at all, which is the intent. */
    if ((dir === "up" || dir === "down") &&
        String(f.id).indexOf("hero_") === 0) return;
    /* TRAILS IN THE WALK (v0.85.7, refined twice — Suresh on the TV
       hero: "no DPAD key gets me to the Library button… Right takes
       me down to the Fire TV DEVICE with the settings area
       selected"). Three truths, one rule:
         1. ANOTHER tile's trail is never a walk stop — that was the
            "Right jumps to a ⚙ far below" bug (the only dx>8
            candidate on a single-column page was a distant corner
            badge).
         2. A tile's OWN trail is always reachable HORIZONTALLY.
         3. Vertically, the own trail counts only when it is a real
            ROW (the hero's full-width "Library" door), never a
            corner badge (the browse ▶, 28px — stepping on those
            broke the library's ▲-into-the-bar entry). Width is the
            honest discriminator between the two shapes. */
    if (isTrailId(f.id)) {
      if (f.id !== S.focusId + TRAIL) return;            /* not mine */
      if ((dir === "up" || dir === "down") && f.el.offsetWidth < 100)
        return;                                          /* corner badge */
    }
    const r = f.el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const dx = x - cx, dy = y - cy;
    const inDir = (dir === "up" && dy < -8) || (dir === "down" && dy > 8) ||
                  (dir === "left" && dx < -8) || (dir === "right" && dx > 8);
    if (!inDir) return;
    const primary = (dir === "up" || dir === "down") ? Math.abs(dy) : Math.abs(dx);
    const cross   = (dir === "up" || dir === "down") ? Math.abs(dx) : Math.abs(dy);
    const score = primary + cross * 2.5;
    if (score < bestScore) { bestScore = score; best = f.id; }
  });
  if (best) { setFocus(best); return true; }
  return false;
}

function pageScreen(dir) {
  const order = CONFIG.screen_order, i = order.indexOf(S.screen);
  if (i < 0) return;                       // detail/unlisted screens don't page
  const j = dir === "right" ? i + 1 : i - 1;
  if (j >= 0 && j < order.length) navigate(order[j]);
}

function captureWidget() {
  const t = tileDef(S.focusId);
  return t && WIDGETS[t.type].capture ? t : null;
}
function releaseCapture() {
  if (!S.captured) return;
  S.captured = false;
  grid.querySelectorAll(".tile.captured").forEach(el => el.classList.remove("captured"));
}
function enterCapture() {
  const t = captureWidget();
  if (!t) return false;
  S.captured = true;
  document.getElementById("tile_" + t.id).classList.add("captured");
  return true;
}
