/* ================================================================
   THE AMALGAM — one Favorites, one Music Library (v0.72)

   brSynthView renders the synthetic ★/♫ pair: ★ merges the tree's
   own favourites root (Sonos FV:) with the MA favourites sensors —
   chips are the category union, duplicates collapse by folded name
   and THE BEST ROUTE FOR THE CAST PLAYER WINS; ♫ is the tree minus
   its favourites mirror. Full libraries are deliberately NOT merged
   (Sonos's NAS index and MA's library:// index the same files).

   `bx` is genBrowse's explicit context: { t, mp, B, roots, favRoot,
   loading, mkItems, playOf } — destructured below so the body reads
   exactly as it did inside the generator closure.
   ================================================================ */
/* the MA favourites sensors (v0.50.3 machinery):
   sensor.harmonium_music_<cat>, hourly favorite=True lists */
function brFavSensors() {
  return [["Playlists", "playlists"], ["Artists", "artists"],
    ["Albums", "albums"], ["Tracks", "tracks"], ["Radio", "radio"]]
    .map(([lbl, k]) => ({ lbl, k,
      items: (st("sensor.harmonium_music_" + k).a || {}).items || [] }))
    .filter(x => x.items.length);
}

function brSynthView(bx, fc) {
  const { t, mp, B, roots, favRoot, loading, mkItems, playOf } = bx;
    /* ================================================================
       THE AMALGAM (v0.72 — Suresh: "I would expect Favorites and
       Music Library return the amalgam of Sonos and MA", after the
       hall of mirrors: the Sonos tree carries its OWN Favorites /
       Music Library pair, and the v0.50.3 promotion overlaid a SECOND
       pair fed by the MA sensors — two Favorites with different
       contents, and which pair you saw depended on which branch of
       the tree answered. One rule now: the library lands on the
       synthetic pair whenever anything favourites-like exists, and
       each side has exactly one meaning.

       ★ FAVORITES — the MERGE of every favourites source: the tree's
       own favourites root (Sonos FV:, sliced by its category folders)
       and the MA sensors. Chips are the union of category names.
       Every tile is routed (v0.70) and source-badged (v0.71.2), and
       DUPLICATES — the same list hearted in both systems — collapse
       by folded name with THE BEST ROUTE FOR THE CAST PLAYER winning:
       native beats bridged beats fallback, so "Discover Weekly" plays
       the Sonos copy when casting Sonos and the MA copy when casting
       MA, with no setting anywhere.

       ♫ MUSIC LIBRARY — the tree WITHOUT its favourites root (no
       mirror). One remaining root auto-descends (Sonos: A: → Artists,
       Albums, …); several remain as chips.

       The FULL libraries are deliberately NOT amalgamated: Sonos's
       NAS index and MA's library:// index THE SAME FILES
       (design-library-ui.md §5 measured exactly this overlap) — a
       merge would double every album.

       Returns final tiles (Array), a NODE for the grid tail, the
       `loading` sentinel, or null (nothing favourites-like → tree). */
    const ROUTE_RANK = { native: 0, bridged: 1, fallback: 2, none: 3 };
    const foldCat = brFoldCat;   /* shared with the index (v0.73) */
      const SROOTS = [
        { title: "Favorites", media_content_id: "__fav",
          media_content_type: "__synth", media_class: "fav_root",
          can_expand: true, can_play: false },
        { title: "Music Library", media_content_id: "__lib",
          media_content_type: "__synth", media_class: "lib_root",
          can_expand: true, can_play: false },
      ];
      /* a REAL-root selection left by an earlier generation maps into
         the pair instead of resurrecting the old band (the flapping
         in the field report was exactly this) */
      if (B.root && B.root.type !== "__synth" &&
          roots.some(c => brSame(c, B.root)))
        B.root = (favRoot && brSame(favRoot, B.root))
          ? { id: "__fav", type: "__synth", title: "Favorites" }
          : { id: "__lib", type: "__synth", title: "Music Library" };
      const selS = SROOTS.find(c => brSame(c, B.root)) || SROOTS[0];
      B.root = brRef(selS);
      if (B.root.id === "__fav") {
        /* ---- category UNION ---- */
        const catMap = {}, order = [];
        /* chips wear PRETTY names (v0.73.1 — the field screenshot:
           HA groups Sonos favourites under raw type ids and the chip
           read "ALBUM_ARTISTS"): known folded keys get their proper
           label, unknown ones lose underscores and gain caps */
        const CAT_LABEL = { playlists: "Playlists", artists: "Artists",
          albums: "Albums", tracks: "Tracks", radio: "Radio",
          genres: "Genres", composers: "Composers" };
        const prettyCat = (key, raw) => CAT_LABEL[key] ||
          String(raw || key).replace(/_/g, " ")
            .replace(/\b[a-z]/g, ch => ch.toUpperCase());
        const addCat = (key, title) => {
          if (!catMap[key]) {
            catMap[key] = { title: prettyCat(key, title), fr: null, items: [] };
            order.push(key);
          }
          return catMap[key];
        };
        if (favRoot) {
          const Lf = B.nodes[browseKey(mp, brRef(favRoot))];
          if (!Lf) { browseFetch(mp, brRef(favRoot)); return loading; }
          Lf.children.filter(brDir).forEach(c => {
            addCat(foldCat(c.title), c.title).fr = brRef(c);
          });
        }
        fc.forEach(x => { addCat(foldCat(x.lbl), x.lbl).items = x.items; });
        if (!order.length) { B.root = B.cat = null; return null; }
        const cats = brOrder(order.map(k => ({ title: catMap[k].title,
          media_content_id: "__fav:" + k, media_content_type: "__synth",
          media_class: "directory", can_expand: true, can_play: false })),
          t.categories);
        const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
        B.cat = brRef(selCat);
        B.ui = { roots: SROOTS, cats };
        const cm = catMap[String(selCat.media_content_id).slice(6)] ||
          { fr: null, items: [] };
        /* the tree side of this category */
        let sKids = [];
        if (cm.fr) {
          const Lc = B.nodes[browseKey(mp, cm.fr)];
          if (!Lc) { browseFetch(mp, cm.fr); return loading; }
          sKids = Lc.children || [];
        }
        /* the sensor side, as browse-item shapes stamped with their
           own hand-off player so mkItems routes each one (v0.71.2) */
        const mKids = (cm.items || []).map(it => ({
          title: it.name, media_class: it.media_type || "playlist",
          media_content_type: it.media_type, media_content_id: it.uri,
          can_play: true, can_expand: false, children: [],
          _thumb: it.image || null,
          _viaMa: B.qmp || undefined,
        }));
        /* THE DEDUP: same (folded) name in both wells → keep the copy
           with the best route for the CAST player */
        const seen = {}, merged = [];
        const rankOf = c => {
          const via = c._viaMa !== undefined ? c._viaMa : undefined;
          const r = ROUTE_RANK[brRoute(c, mp, via)];
          return r == null ? 3 : r;
        };
        sKids.concat(mKids).forEach(c => {
          const k = String(c.title || "").toLowerCase().trim();
          if (seen[k] == null) { seen[k] = merged.length; merged.push(c); }
          else if (rankOf(c) < rankOf(merged[seen[k]])) merged[seen[k]] = c;
        });
        return mkItems({ title: selCat.title, children: merged }, []);
      }
      /* ---- __lib: the tree WITHOUT its favourites mirror ----
         (brSame compares a raw child against a REF — fold favRoot
         into ref shape or the filter silently keeps the mirror) */
      const favRef = favRoot && brRef(favRoot);
      let rem = roots.filter(c => !(favRef && brSame(c, favRef)));
      if (!rem.length) rem = roots;
      if (!rem.length) {
        B.ui = { roots: SROOTS, cats: null };
        return { title: "Music Library", children: [] };
      }
      if (rem.length === 1) {
        const Ll = B.nodes[browseKey(mp, brRef(rem[0]))];
        if (!Ll) { browseFetch(mp, brRef(rem[0])); return loading; }
        if (Ll.children.length && Ll.children.every(brDir)) {
          const cats = brOrder(Ll.children, t.categories);
          const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
          B.cat = brRef(selCat);
          B.ui = { roots: SROOTS, cats };
          const L2 = B.nodes[browseKey(mp, B.cat)];
          if (!L2) { browseFetch(mp, B.cat); return loading; }
          return L2;
        }
        B.ui = { roots: SROOTS, cats: null };
        return Ll;
      }
      const cats = brOrder(rem, t.categories);
      const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
      B.cat = brRef(selCat);
      B.ui = { roots: SROOTS, cats };
      const L2 = B.nodes[browseKey(mp, B.cat)];
      if (!L2) { browseFetch(mp, B.cat); return loading; }
      return L2;
}

