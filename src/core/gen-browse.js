/* ================================================================
   THE BROWSE GENERATOR — the library surface

   One generator renders the whole library experience: the ★/♫
   amalgam pair (v0.72), search mode (v0.65+), the category tree,
   drill-downs and the routed play actions (v0.70). It reads the
   state owned by core/browse.js (S.browse) and leans on the pure
   helpers in core/routing.js and core/sonos-index.js.

   Shape: everything is scoped inside genBrowse(t) — the helpers
   (playOf, mkItems, upRow, synthView) close over the tile and the
   resolved cast player, which is what keeps every call site honest
   about WHICH player a play targets.
   ================================================================ */
function genBrowse(t) {
    /* THE STANDARD LIBRARY, THREE BANDS (v0.50 — see core/browse.js).
       Returns only the GRID (items); bands render in #brbar via
       browseBar(). Unwired player → nothing (the empty-page hint
       explains). Player changes reset everything. */
    const mp = resolveEntity(t.entity || "$context.media_player");
    if (!mp) { S.browse.ui = null; return []; }
    if (S.browse.mp !== mp) {
      S.browse.mp = mp;
      S.browse.root = S.browse.cat = null; S.browse.sub = [];
    }
    const B = S.browse;
    /* SEARCH, DECLARED (v0.66). Sonos cannot search — it answers an
       empty list — so the tile names the engine that can. Written as a
       BLOCK rather than a loose key because the engine is a decision
       someone has to be able to see:

         "search": { "engine": "music_assistant",
                     "entity": "media_player.ma_bar",
                     "classes": ["artist","album","track","playlist"] }

       There is one engine today and the setting still exists — this is
       not a control with one option (v0.62), it is a declaration of
       WHICH ENGINE ANSWERS, and the seam a second one slots into.
       `classes` is the scope: Suresh likes MA but finds it "almost too
       overwhelming", and never ASKING for its generated playlists,
       audiobooks and recommendations is the cure. v0.65's flat
       `search_entity` still works. */
    /* SEARCH IS A ROLE (v0.69 — Suresh: "It's hardcoding a device
       inside a stock controller. This should be provided by context").
       WHICH entity can search is a fact about the DEVICE — the same
       shape as volume_level or commands — so the stock tile names
       nothing and binds `$context.search`. A device claims it once in
       the library; every activity that casts that device inherits it.
       Resolution, matching how the engine resolves everything else:
         explicit `search.entity`   a custom controller pins one
         `search: false`            the per-surface off switch
         `$context.search`          the role — the normal path
         nothing resolves           no magnifier, honestly
       Never a capability sniff: measured 2026-08-09, native Sonos and
       Music Assistant BOTH advertise SEARCH_MEDIA while behaving
       completely differently, and every browse node reports
       `can_search: false` on a player that answers 521 results. */
    let sQ = t.search;
    if (sQ === false) sQ = null;
    else if (!sQ) sQ = t.search_entity ? { entity: t.search_entity } : {};
    const sRef = sQ ? (sQ.entity || "$context.search") : null;
    B.qmp = sRef ? resolveEntity(sRef) : null;
    B.qclasses = (sQ && sQ.classes) ||
      ["artist", "album", "track", "playlist"];
    B.qlimit = (sQ && +sQ.limit) || 0;
    /* DEPTH IS DECLARED (v0.67.3): `config_entry` names WHICH Music
       Assistant to ask directly — its own service takes a `limit`,
       HA's generic search_media does not and stops at 5 per class.
       v0.69: it no longer has to be AUTHORED. HA's entity registry
       maps an entity to both its `config_entry_id` and its `platform`,
       so one lookup answers "which MA" and "is this MA at all" — the
       last instance-specific string leaves the config. An explicit
       key still wins, and the standard contract still runs while the
       lookup is in flight or if it comes back empty. */
    B.qentry = (sQ && sQ.config_entry) || "";
    B.qengine = (sQ && sQ.engine) || "";
    if (B.qmp && (!B.qentry || !B.qengine)) {
      const reg = brRegistry(B.qmp);
      if (reg) {
        if (!B.qentry && reg.platform === "music_assistant")
          B.qentry = reg.config_entry_id || "";
        if (!B.qengine) B.qengine = reg.platform || "";
      } else if (!B.qengine) {
        /* pre-v0.69 default while the registry is unknown */
        B.qengine = B.qentry ? "music_assistant" : "";
      }
    }
    if (!B.qmp && B.qon) { B.qon = false; B.q = ""; B.qres = null; }
    B._active = true;
    const loading = [{ type: "preset", id: t.id + "_ld", span: 2, brw: true,
      icon: "material:hourglass_empty", label: "Loading library…", action: {} }];
    const L0 = B.nodes[browseKey(mp, null)];
    /* SEARCH DOES NOT WAIT FOR THE TREE (v0.68.1). This gate returned
       "Loading library…" until the browse ROOT came back — and search
       needs none of it: it has its own engine, its own player and its
       own results. Opening the library and typing straight away meant
       waiting out a fetch whose answer was never going to be used,
       with an empty bar (B.ui = null renders NOTHING) while you did.
       The fetch still starts, because closing search lands you in the
       tree; it just no longer blocks the door. */
    if (!L0) {
      browseFetch(mp, null);
      if (!B.qon) { B.ui = null; return loading; }
    }
    /* ROOT CURATION (v0.49.1, a setting not a hardcode): HA's
       media-source:// plumbing hides by default (`media_sources:
       true` keeps it); `include: [titles]` narrows — advisory. */
    let roots = L0 ? L0.children : [];
    if (!t.media_sources)
      roots = roots.filter(c =>
        !String(c.media_content_id || "").startsWith("media-source://"));
    if (Array.isArray(t.include) && t.include.length) {
      const want = t.include.map(x => String(x).toLowerCase());
      const m = roots.filter(c =>
        want.includes(String(c.title || "").toLowerCase()));
      if (m.length) roots = m;
    }
    /* the tree's own favourites root, when it has one (Sonos does) —
       the seed of the v0.72 amalgam and the mirror the old promotion
       kept duplicating. The empty-roots error moved below the synth
       attempt: a player with no tree but live favourite sensors still
       has something to show. */
    const favRoot = roots.find(c => brDir(c) &&
      /favou?rite/i.test(String(c.title || ""))) || null;
    /* a Sonos-shaped tree keeps its INDEX warm (v0.73): crawled via
       the same browse contract, cached in localStorage, stale after a
       day, self-healing after a cache-clear — brIdxEnsure no-ops when
       fresh or already crawling */
    if (favRoot) brIdxEnsure(mp);
    /* WHICH PLAYER GETS THE PLAY (v0.66), now ROUTED (v0.70 —
       design-library-ui.md §5). Browsing: the tree's own player, as
       always — its ids are the cast player's own, native by
       construction. Searching: brRoute judges each id. `bridged`
       rewrites to a Spotify share link and plays on the CAST player —
       one entity to look at, Sonos streams with the HA box out of the
       audio path. `fallback` hands off to the engine's player, which
       EVICTS the cast player's queue — so it carries a two-press
       confirm and is never silent (the pre-v0.70 behaviour, and "the
       cardinal sin of the system happening invisibly"). `none` yields
       no action at all; mkItems suppresses the tile. */
    const playOf = (c, viaMa, route) => {
      route = route || brRoute(c, mp, viaMa);
      if (route === "none") return null;
      if (route === "bridged")
        return { service: "media_player.play_media", target: mp,
          data: { media_content_id: brSpotifyUri(c.media_content_id),
                  media_content_type: "music" } };
      if (route === "fallback")
        return { service: "media_player.play_media", target: viaMa,
          data: { media_content_id: c.media_content_id,
                  media_content_type: c.media_content_type },
          confirm: { key: "brfb:" + c.media_content_id,
            msg: "Takes over " + ((st(mp).a || {}).friendly_name || "the speaker")
              + " — press again to play" } };
      return { service: "media_player.play_media", target: mp,
        data: { media_content_id: c.media_content_id,
                media_content_type: c.media_content_type } };
    };
    const mkItems = (node, out) => {
      /* LIST VIEW (v0.71): the view toggle redraws this grid as dense
         one-column rows — the shape a D-pad wants (one axis) and the
         right shape for 697 artists sorted by name with art the
         source often doesn't have. Chassis row mode does the work;
         the section render narrows to one column when it sees rows. */
      const listv = brView() === "list";
      /* grid2 (v0.83.1): same cards, TWO columns — brCols narrows the
         section host (render.js) without touching the screen's grid */
      const g2 = brView() === "grid2";
      if (node.error)
        out.push({ type: "preset", id: t.id + "_err", span: 2, brw: true,
          icon: "material:error_outline", label: node.error, action: {} });
      node.children.forEach((c, i) => {
        /* a child may carry its OWN hand-off player (v0.72): amalgam
           lists mix Sonos-native items with MA-sensor items, and each
           routes against its own via — `_viaMa` beats the node's */
        const via = c._viaMa !== undefined ? c._viaMa : node.viaMa;
        const route = brRoute(c, mp, via);
        /* `none` is not a result (v0.70): a tile that cannot reach
           the speaker is suppressed, not offered-and-disabled */
        if (route === "none") return;
        const play = playOf(c, via, route);
        out.push({
          type: "preset", id: t.id + "_" + i, label: c.title, brw: true,
          ...(listv ? { brRow: true } : g2 ? { brCols: 2 } : {}),
          icon: BROWSE_ICON[c.media_class] || "material:library_music",
          /* the badge is set only where the kind ISN'T implied by the
             chip you're standing on — i.e. the All grid */
          ...(node.badges && node.badges[i] ? { badge: node.badges[i] } : {}),
          ...(c._thumb ? { icon_image: c._thumb, icontain: true } : {}),
          /* the routing MARK (v0.70): playing this hands the speaker
             to another entity. Only when the tile can actually PLAY —
             an expandable artist drills via the engine harmlessly and
             its albums come back with routes of their own. */
          ...(route === "fallback" && c.can_play
            ? { mark: "material:swap_horiz" } : {}),
          /* provenance, split (v0.73.2): SYSTEM mini badge (SO/MA/HA,
             bottom right) + SERVICE badge (deezer/spotify/…, top
             right) when the uri prefix or artwork CDN names it */
          ...(brSysOf(c.media_content_id)
            ? { src: brSysOf(c.media_content_id) } : {}),
          ...(brSvcOf(c.media_content_id, c._thumb || c.thumbnail)
            ? { svc: brSvcOf(c.media_content_id, c._thumb || c.thumbnail) }
            : {}),
          action: c.can_expand
            ? { browse: { id: c.media_content_id, type: c.media_content_type,
                          title: c.title, play: !!c.can_play } }
            : play,
          ...(c.can_expand && c.can_play
            ? { trailing: { icon: "material:play_arrow", action: play } } : {}),
        });
      });
      if (!node.children.length && !node.error)
        out.push({ type: "preset", id: t.id + "_mt", span: 2, brw: true,
          icon: "material:music_off", label: "Nothing here", action: {} });
      /* SAY WHEN YOU TRUNCATE (v0.62): silence here reads as "that is
         everything", which is the one thing it isn't */
      /* a STRING more says it in words (search knows there is deeper
         water but not how deep); a number counts what was withheld */
      if (node.more)
        out.push({ type: "preset", id: t.id + "_more", span: 2, brw: true,
          icon: "material:more_horiz",
          label: typeof node.more === "string" ? node.more
            : node.children.length + " shown · " + node.more + " more",
          action: {} });
      return out;
    };
    /* THE UP ROW, SPLIT (v0.70.1 — Suresh: "on that child screen, we
       can shrink the back button by 50% and add an equally sized play
       button!"). Drilling into an album or playlist used to spend a
       full-width tile on ‹ Back; now Back keeps half and the other
       half PLAYS the container you are standing in — the single most
       likely intent on that screen. The container's own id is routed
       like any other playable: a bridged Spotify album one-taps on
       the cast player, a fallback container is marked and confirmed,
       `none` grows no play tile at all. Refs pushed before v0.70.1
       carry no `play` flag and simply render Back alone. */
    const upRow = (top, Ln, viaMa) => {
      const listv = brView() === "list";
      const row = [{ type: "preset", id: t.id + "_up", brw: true,
        ...(listv ? { brRow: true } : {}),
        icon: "material:arrow_back",
        label: Ln && Ln.title ? "‹ " + Ln.title : "‹ Back",
        action: { browse: "__up" } }];
      if (top && top.play) {
        const c = { media_content_id: top.id, media_content_type: top.type,
          can_play: true };
        const route = brRoute(c, mp, viaMa);
        if (route !== "none") row.push({ type: "preset", id: t.id + "_pl",
          brw: true, ...(listv ? { brRow: true } : {}),
          icon: "material:play_arrow", label: "Play",
          ...(route === "fallback" ? { mark: "material:swap_horiz" } : {}),
          ...(brSysOf(top.id) ? { src: brSysOf(top.id) } : {}),
          ...(brSvcOf(top.id) ? { svc: brSvcOf(top.id) } : {}),
          action: playOf(c, viaMa, route) });
      }
      return row;
    };
    /* the explicit context the extracted views take (they read like
       the closures they were — see gen-browse-amalgam.js) */
    const bx = { t, mp, B, roots, favRoot, loading, mkItems, playOf, upRow };
    if (B.qon) return brSearchResults(bx);
    let gridNode = null;
    /* THE SYNTHETIC PAIR IS PRIMARY (v0.72): whenever ANY favourites
       source exists — the tree's own favourites root, the MA sensors,
       or both — the library lands on ★/♫, always the same two bands,
       regardless of which tree node happened to answer first. The
       raw-tree branches below only run when nothing favourites-like
       exists at all. */
    {
      const fc = brFavSensors();
      if (fc.length || favRoot) {
        const r = brSynthView(bx, fc);
        if (r === loading) return loading;
        if (Array.isArray(r)) return r;
        if (r) gridNode = r;
        /* r === null → nothing favourites-like after all: tree mode */
      }
    }
    if (!gridNode && !roots.length) {
      B.ui = null;
      return [{ type: "preset", id: t.id + "_err", span: 2, brw: true,
        icon: "material:error_outline",
        label: (L0 && L0.error) || "Nothing to browse on this player",
        action: {} }];
    }
    if (!gridNode) {
      /* selected ROOT: sticky → tile default_root (title, advisory) →
         first expandable → first. */
      let selRoot = roots.find(c => brSame(c, B.root)) || null;
      if (!selRoot && t.default_root)
        selRoot = roots.find(c => String(c.title || "").toLowerCase() ===
          String(t.default_root).toLowerCase()) || null;
      selRoot = selRoot || roots.find(c => c.can_expand) || roots[0];
      B.root = brRef(selRoot);
      if (!selRoot.can_expand) {         /* playable-only root: no grid */
        B.ui = { roots, cats: null };
        return [];
      }
      const L1 = B.nodes[browseKey(mp, B.root)];
      /* while L1 loads, DON'T flash the raw tree roots into band 1
         (v0.51 — Suresh: "a row of folders pops onto the top row for
         a second"): keep the previous bar (or none on first load) —
         the real shape decides once L1 lands */
      if (!L1) { browseFetch(mp, B.root); return loading; }
      /* CATEGORY STRIP (v0.50.2): two tree shapes, one look.
         DEEP (Sonos): roots hold a layer of pure directories → roots
         row + those directories as chips. FLAT (Music Assistant): the
         top level IS the categories → chips (favorites-promoted when
         the sensors are live, plain otherwise). */
      if (L1.children.length && L1.children.every(brDir)) {
        const real = brOrder(L1.children, t.categories);
        /* THE "ALL" CHIP (v0.62 — Suresh: "what Sonos is returning is
           ALL favorites and then we're slicing them by category, which
           is useful, but sometimes artificial. What's the difference
           between a coffee shop playlist and coffee shop radio?").
           So when this root is the only one — i.e. the categories ARE
           the whole library — offer the unsliced view first. Each item
           carries a badge naming the folder it came from, which is the
           thing the slicing was for. */
        const wantAll = roots.length === 1 && real.length > 1 &&
          t.all !== false;
        const cats = wantAll ? [BR_ALL].concat(real) : real;
        const selCat = cats.find(c => brSame(c, B.cat)) || cats[0];
        B.cat = brRef(selCat);
        B.ui = { roots, cats };
        if (B.cat.type === BR_ALL.media_content_type) {
          const keys = real.map(c => browseKey(mp, brRef(c)));
          const missing = real.filter((c, i) => !B.nodes[keys[i]]);
          if (missing.length) {
            missing.forEach(c => browseFetch(mp, brRef(c)));
            return loading;
          }
          /* badges ride ALONGSIDE the children, never ON them: the
             child objects are the shared node cache, and stamping
             them would leave badges behind in the single-category
             grids once you had visited All */
          const kids = [], badges = [];
          let more = 0;
          real.forEach((c, i) => {
            const n = B.nodes[keys[i]];
            more += n.more || 0;
            (n.children || []).forEach(k => {
              kids.push(k);
              badges.push(brBadge(c.title, k));
            });
          });
          gridNode = { title: "All", children: kids, more: more, badges: badges };
        } else {
          const L2 = B.nodes[browseKey(mp, B.cat)];
          if (!L2) { browseFetch(mp, B.cat); return loading; }
          gridNode = L2;
        }
      } else if (roots.length > 1 && roots.every(brDir)) {
        /* FLAT tree, no favourites anywhere (synthView already ran
           and declined): the top level IS the categories */
        B.ui = { roots: [], cats: brOrder(roots, t.categories), flat: true };
        gridNode = L1;
      } else {
        B.ui = { roots, cats: null };
        gridNode = L1;
      }
    }
    if (gridNode === loading) return loading;
    /* deep drill below the bands (artist → albums → tracks …) */
    const out = [];
    if (B.sub.length) {
      const top = B.sub[B.sub.length - 1];
      const Ln = B.nodes[browseKey(mp, top)];
      if (!Ln) { browseFetch(mp, top); return loading; }
      upRow(top, Ln).forEach(x => out.push(x));
      gridNode = Ln;
    }
    return mkItems(gridNode, out);
}


