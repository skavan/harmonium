/* ================================================================
   SEARCH RESULTS, RENDERED — the grid while B.qon (v0.65+)

   brSearchResults draws the search grid: the drilled result view,
   the kind chips, the Searching…/error/empty states, the routed
   result tiles (badges + marks via mkItems) and the index-age
   refresh row (v0.73). The QUERY machinery lives in core/search.js;
   this is only its face.

   `bx` is genBrowse's explicit context — see gen-browse-amalgam.js.
   ================================================================ */
    /* SEARCH MODE (v0.65) short-circuits the tree entirely: the bands
       become the query + keyboard, and the chips become the KINDS the
       answer contains. Everything below (roots, categories, drill)
       resumes untouched the moment search closes. */
function brSearchResults(bx) {
  const { t, mp, B, loading, mkItems, upRow } = bx;
      /* DRILLING A RESULT (v0.66): an artist can't be share-linked to
         Sonos, but MA marks it expandable — so stepping into one lists
         their albums FROM MA, and those albums play on Sonos like any
         other result. The fetch has to use the ENGINE's player: the
         ids are its own and the tree's player has never heard of them. */
      if (B.sub.length) {
        const top = B.sub[B.sub.length - 1];
        const Ln = B.nodes[browseKey(B.qmp, top)];
        B.ui = { roots: [], cats: null, search: true };
        if (!Ln) { browseFetch(B.qmp, top); return loading; }
        Ln.viaMa = B.qmp;
        return mkItems(Ln, upRow(top, Ln, B.qmp));
      }
      const items = (B.qres && B.qres.items) || [];
      const kinds = [];
      items.forEach(c => {
        const k = c.media_class || "item";
        if (!kinds.some(x => x.qclass === k))
          kinds.push({ title: BR_KIND_NAME[k] || k, qclass: k,
            media_content_id: "__q:" + k, media_content_type: "__qkind" });
      });
      /* SHOW THE SLICES BEFORE THERE IS ANYTHING TO SLICE (v0.68.1 —
         Suresh: "Its not obvious what Im looking at, I think we should
         have the tab bar (artists/playlists etc..) shown. Not just the
         magnifying icon. If there is no search text, the tabs are
         disabled."). With no results the strip collapsed to a lone
         magnifier, which says nothing about what search even DOES.
         The declared `classes` already name the answer's shape, so
         draw them — greyed and unpressable until an answer exists. */
      const cats = items.length
        ? [{ title: "All", qclass: "", media_content_id: "__q:",
             media_content_type: "__qkind" }].concat(kinds)
        : [{ title: "All", qclass: "", disabled: true,
             media_content_id: "__q:", media_content_type: "__qkind" }].concat(
            (B.qclasses || []).map(k => ({
              title: BR_KIND_NAME[k] || k, qclass: k, disabled: true,
              media_content_id: "__q:" + k, media_content_type: "__qkind" })));
      B.ui = { roots: [], cats: cats, search: true };
      /* SAY THAT WE ARE LOOKING (v0.68.1 — "there is no visual
         feedback"). A centred line, not the library's hourglass tile:
         this is a search in flight, not a page loading. */
      if (B.qbusy && !items.length)
        return [{ type: "preset", id: t.id + "_qw", brw: true,
          /* no `span`: .brwait takes 1/-1 in CSS, and an inline span
             from the v0.68 proportional rule would out-specify it */
          cls: "brwait", icon: "material:search",
          label: "Searching…", action: {} }];
      /* an engine failure only OWNS the page when there is nothing
         else on it — with index hits standing (v0.73) the flashBar
         carried the message and the local answers stay useful */
      if (B.qerr && !items.length)
        return [{ type: "preset", id: t.id + "_qe", span: 2, brw: true,
          icon: "material:error_outline", label: B.qerr, action: {} }];
      /* AN EMPTY QUERY SHOWS NOTHING (v0.67.2 — Suresh, of the tile
         that used to sit here: "What is the point of that great big
         button? Type to search ma bar?"). None: the query line right
         above it already says "type to search", and a tile that does
         nothing when tapped is furniture. Silence is the answer. */
      if (!B.q.trim()) return [];
      const shown = B.qcat
        ? items.filter(c => (c.media_class || "item") === B.qcat) : items;
      if (!shown.length)
        return [{ type: "preset", id: t.id + "_qn", span: 2, brw: true,
          icon: "material:search_off",
          label: "Nothing for “" + B.q.trim() + "”", action: {} }];
      /* SAY THAT THE WELL IS DEEPER (v0.67.3 — "It should show that
         there are more, must be thousands!"), and SAY WHICH (v0.67.5 —
         "The There's more should appear in the tab results too, if
         true"). It always did appear in a tab whose kind was capped —
         but an unnamed note in All that vanishes on a tab reads as a
         bug rather than as an answer. Naming the kinds makes the rule
         visible: the limit is PER KIND, so All can be deep in artists
         while tracks are exhausted. */
      const cap = (B.qres && B.qres.capped) || [];
      const capShown = B.qcat
        ? (cap.indexOf(B.qcat) >= 0 ? [B.qcat] : []) : cap;
      const deep = capShown.length
        ? "More " + capShown.map(k =>
            (BR_KIND_NAME[k] || k).toLowerCase()).join(" · ") +
          " — add a word to narrow it down"
        : 0;
      /* the SAME item renderer the tree uses — thumbnails, play,
         drill-in and the ▶ badge all come along. Results MIX kinds by
         nature, which is exactly what the v0.62 badge is for. */
      const qOut = mkItems({ title: "Search", children: shown, viaMa: B.qmp,
        more: deep,
        badges: shown.map(c => BROWSE_ICON[c.media_class] ||
          "material:library_music") }, []);
      /* THE SEARCH HEARTBEAT (v0.75 — Suresh: "When I do a search
         everything it can take a while for the results to fill in.
         Maybe we have a placeholder first tile, that is a spinner?").
         Once the first results paint, qbusy only lit the tiny bar dot
         — the page looked FINISHED while provider waves were still
         out. A pulsing tail row under the live results says the well
         is still filling. Tail, not head as suggested: the first tile
         is where D-pad focus lands, and .brwait deliberately hides
         the focus ring — a dead, invisibly-focused first tile would
         be the v0.70 "clicking does nothing" bug reborn. It vanishes
         in the same render that clears qbusy. */
      if (B.qbusy)
        qOut.push({ type: "preset", id: t.id + "_qs", brw: true,
          cls: "brwait qtail", icon: "material:search",
          label: "Searching for more…", action: {} });
      /* INDEX AGE, VISIBLE (v0.73 — "why isn't my new playlist here"
         must be answerable by looking): a quiet tail row naming when
         the local index was built, tap to rebuild. Only when the
         index actually served this page. */
      const idxD = B.mp && shown.some(c => c._idx) && brIdx(B.mp);
      if (idxD && idxD.built_at) {
        const mins = Math.max(0, Math.round((Date.now() - idxD.built_at) / 60000));
        const ago = mins < 2 ? "just now" : mins < 120 ? mins + " min ago"
          : Math.round(mins / 60) + " h ago";
        qOut.push({ type: "preset", id: t.id + "_idx", span: 2, brw: true,
          icon: "material:sync", label: "Sonos index · updated " + ago +
            " — tap to refresh",
          action: { browse: "__idxr" } });
      }
      return qOut;
}

