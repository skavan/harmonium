/* ================================================================
   THE SONOS INDEX — phase 3, engine-side

   Crawl (browse contract, ~8 requests, skips A:TRACKS), per-player
   localStorage cache with built_at, forgiving local matching
   ("mama mia" finds Mamma Mia), instant merge into search. See the
   banner on brIdxCrawl and docs/design-search-sources.md §6.
   ================================================================ */
/* ================================================================
   THE SONOS INDEX (v0.73 — phase 3 of design-search-sources.md,
   built ENGINE-SIDE per design-library-ui.md §1's correction: the
   crawl is the same browse_media call the tree already makes, ~8
   requests, and localStorage is precisely the instant-on cache the
   storage-tiers decision reserved browser storage FOR. An index is
   derived and rebuildable in seconds; a cache-clear self-heals on
   the next library open.

   What it buys, in order of value:
   · FV: and SQ: — Sonos favourites and saved queues, which Music
     Assistant cannot see at all — become SEARCHABLE.
   · FORGIVING matching, which no remote service offers: case and
     diacritic folding, token-order independence, and one wrong
     letter ("mama mia" finds Mamma Mia).
   · The library still answers while a provider outage has taken the
     engines down — measured need, 2026-08-10.

   Per PLAYER: the index is keyed on the tree's player and its ids
   are that player's own — native by construction, which is why the
   routing model needs no new case. Skips A:TRACKS (~1.8 MB; live
   Sonos search answers tracks uncapped) and folder shares.
   ================================================================ */
const IDX_MAX_AGE = 24 * 3600 * 1000;      /* stale after a day */
const IDX_SKIP = /track|folder/i;          /* library cats not crawled */
function brIdxKey(mp) { return "hakr_sidx_" + mp; }
function brIdx(mp) {
  const B = S.browse;
  if (B.idxCache && B.idxCache.mp === mp) return B.idxCache.data;
  let d = null;
  try { d = JSON.parse(localStorage.getItem(brIdxKey(mp))); } catch (e) {}
  B.idxCache = { mp, data: d };
  return d;
}
function brIdxEnsure(mp) {
  const d = brIdx(mp);
  if (d && Date.now() - (d.built_at || 0) < IDX_MAX_AGE) return;
  brIdxCrawl(mp);
}
function brIdxCrawl(mp) {
  const B = S.browse;
  if (!mp || !S.connected || B.idxBusy) return;
  B.idxBusy = true;
  const cats = {};
  let pending = 0, rootsDone = false;
  const fetchNode = (node, cb) => {
    const msg = { type: "media_player/browse_media", entity_id: mp };
    if (node) {
      msg.media_content_id = node.id != null ? node.id : "";
      msg.media_content_type = node.type;
    }
    send(msg, m => cb(m && m.success ? (m.result || {}) : null));
  };
  const finish = () => {
    B.idxBusy = false;
    const data = { built_at: Date.now(), cats };
    try { localStorage.setItem(brIdxKey(mp), JSON.stringify(data)); }
    catch (e) { /* quota/blocked: the in-memory copy still serves */ }
    B.idxCache = { mp, data };
    if (S.screen && B._active) navigate(S.screen, true);
  };
  const grab = (key, node) => {
    pending++;
    fetchNode(node, r => {
      if (r) cats[key] = (r.children || []).map(c => ({
        t: c.title, id: c.media_content_id, ty: c.media_content_type,
        cl: c.media_class }));
      if (!--pending && rootsDone) finish();
    });
  };
  fetchNode(null, root => {
    if (!root) { B.idxBusy = false; return; }
    const dirs = (root.children || []).filter(c => c.can_expand && !c.can_play &&
      !String(c.media_content_id || "").startsWith("media-source://"));
    let waiting = 0;
    dirs.forEach(rc => {
      const fav = /favou?rite/i.test(String(rc.title || ""));
      waiting++;
      fetchNode({ id: rc.media_content_id, type: rc.media_content_type }, rr => {
        ((rr && rr.children) || []).forEach(cc => {
          if (!cc.can_expand || cc.can_play) return;
          if (!fav && IDX_SKIP.test(String(cc.title || ""))) return;
          grab((fav ? "fav:" : "lib:") + brFoldCat(cc.title),
            { id: cc.media_content_id, type: cc.media_content_type });
        });
        if (!--waiting) { rootsDone = true; if (!pending) finish(); }
      });
    });
    if (!waiting) { rootsDone = true; finish(); }
  });
}

/* ---- forgiving local matching (the "mama mia" fix) ---- */
function brFold(s) {
  s = String(s || "").toLowerCase();
  try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  catch (e) { /* pre-normalize engines: case folding still applies */ }
  return s;
}
/* edit distance <= 1, cheap two-pointer walk */
function brNear(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; }
    else if (la > lb) i++;
    else j++;
  }
  return edits + (la - i) + (lb - j) <= 1;
}
/* index class per category, when the item itself didn't say */
const IDX_CLASS = { playlists: "playlist", artists: "artist",
  albums: "album", tracks: "track", radio: "channel", genres: "genre",
  composers: "artist" };
function brIdxSearch(mp, q, opts) {
  const d = brIdx(mp);
  if (!d || !d.cats) return [];
  const toks = brFold(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const favOnly = !!(opts && opts.favOnly);
  const out = [];
  Object.keys(d.cats).forEach(key => {
    const fav = key.slice(0, 4) === "fav:";
    /* with a real engine answering, the index contributes ONLY what
       nothing else can see — FV:/SQ: (design-library-ui.md §3: the
       library categories index the same NAS under different uris) */
    if (favOnly && !fav) return;
    const cls = IDX_CLASS[key.slice(4)] || "directory";
    d.cats[key].forEach(it => {
      const ft = brFold(it.t);
      const words = ft.split(/\s+/);
      const hit = toks.every(tok =>
        ft.indexOf(tok) >= 0 ||
        (tok.length >= 4 && words.some(w => brNear(tok, w))));
      if (!hit) return;
      out.push({ title: it.t, media_class: it.cl || cls,
        media_content_type: it.ty, media_content_id: it.id,
        can_play: true, can_expand: false, children: [],
        /* the id belongs to the TREE's player: play there, natively —
           null (not undefined) so mkItems takes the override */
        _viaMa: null, _idx: 1 });
    });
  });
  return out.slice(0, 100);
}

