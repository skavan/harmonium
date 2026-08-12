/* ================================================================
   SEARCH — the query, the engines, the answer

   brSearchRun asks up to three wells at once: the LOCAL Sonos index
   (instant, forgiving), Music Assistant's own service (deep, two
   waves: library then providers), and HA's generic search_media
   contract (any player, five per class). The query line, on-screen
   keyboard and scope switch live here too; the BAR that hosts them
   is browse.js's browseBar.
   ================================================================ */
/* ---- SEARCH (v0.65) ------------------------------------------------
   HA's `media_player/search_media` is the whole backend — no service
   hardcoding, same doctrine as browse. The catch, found by asking the
   house rather than the docs: **Sonos answers an empty list.** Sonos
   has no search; MUSIC ASSISTANT does, and the MA player drives the
   same physical speaker. So search runs against a player that can,
   named by the tile (`search_entity`), and its results play there too
   — the content ids it returns are MA's and mean nothing to Sonos. */
/* ENTITY REGISTRY LOOKUP (v0.69) — one call per entity, cached for
   the session, and it answers two questions at once: WHICH config
   entry owns this entity (Music Assistant's own service needs it to
   lift HA's 5-per-class ceiling) and WHICH platform it belongs to (so
   an MA player is told apart from a native one by provenance rather
   than by a capability flag — measured 2026-08-09, both flavours set
   SEARCH_MEDIA and every browse node claims can_search: false).
   Returns null while unknown; the answer re-renders the page once. */
function brRegistry(eid) {
  const B = S.browse;
  if (B.reg[eid] !== undefined) return B.reg[eid];
  if (!S.connected || B.regReq[eid]) return null;
  B.regReq[eid] = 1;
  send({ type: "config/entity_registry/get", entity_id: eid }, m => {
    B.reg[eid] = (m && m.success && m.result) ? m.result : null;
    if (S.screen && B._active) navigate(S.screen, true);
  });
  return null;
}

/* the query is USER TEXT going into innerHTML — escape it */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/* ================================================================
   FIVE IS NOT A SEARCH (v0.67.3 — Suresh: "Type 'Love' into search.
   We get 18 result tiles. It should show that there are more, must be
   thousands! Now tap Tracks… I get 5.")

   He read it as a rescope to favourites. It isn't — measured on his
   own box, `media_player/search_media` for "love" returns exactly 5
   per class, and asking for `media_filter_classes: ["track"]` ALONE
   still returns 5. The cap is HA's generic search-media contract and
   it exposes no `limit`. So the tile filter wasn't lying; the well
   was only ever five deep.

   Music Assistant's OWN service does take one:

       music_assistant.search {config_entry_id, name, media_type[],
                               limit, library_only}

   Same query, limit 25 → 23 tracks, mixing `library://` (his ripped
   CDs) with `spotify--<instance>://` (the catalogue) — which is also
   the direct disproof of "scoped to favourites". So when the tile
   DECLARES which Music Assistant answers (`search.config_entry`), we
   ask MA properly and adapt its reply into browse items; without that
   declaration the standard contract still runs, five-deep, unchanged.
   The engine stays dumb: it knows the shape of MA's answer, not which
   MA, nor how deep to dig.
   ================================================================ */
const MA_SEARCH_LIMIT = 25;
/* our browse media_class → MA's media_type argument */
const MA_TYPE = { artist: "artist", album: "album", track: "track",
  playlist: "playlist", channel: "radio", podcast: "podcast",
  audiobook: "audiobook" };
/* …and the bucket MA answers in, per class */
const MA_BUCKET = { artist: "artists", album: "albums", track: "tracks",
  playlist: "playlists", channel: "radio", podcast: "podcasts",
  audiobook: "audiobooks" };
/* MA's image is a URL string on current builds and an object on older
   ones — take either, refuse to care which */
function maImage(o) {
  const im = o && o.image;
  if (!im) return null;
  if (typeof im === "string") return im;
  return im.path || null;
}
/* one MA object → one browse item, so mkItems / brSpotifyUri / the
   badge / the play path all keep working with no idea where it came
   from. `uri` IS a media_content_id: spotify--<inst>://track/<id> is
   exactly what v0.66 already rewrites into a Sonos share link. */
function maItem(o, cls) {
  const who = (Array.isArray(o.artists) ? o.artists : [])
    .map(a => a && a.name).filter(Boolean).join(", ");
  const nm = o.name || "";
  return {
    title: (cls === "album" || cls === "track") && who ? who + " - " + nm : nm,
    media_class: cls, media_content_type: "music",
    media_content_id: o.uri, thumbnail: maImage(o),
    can_play: true, can_expand: cls !== "track", children: [],
  };
}

/* HA-relative thumbnails need auth/sign_path (what the HA frontend
   does); absolute URLs pass straight through. Shared by the tree and
   — new in v0.67.3 — by search results, which never had artwork. */
function brThumbs(list, done) {
  let waiting = 0;
  list.forEach(c => {
    const t = c.thumbnail;
    if (!t || typeof t !== "string") return;
    if (!t.startsWith("/")) { c._thumb = t; return; }
    if (S.browse.signed[t]) { c._thumb = S.browse.signed[t]; return; }
    waiting++;
    send({ type: "auth/sign_path", path: t }, sm => {
      if (sm.success && sm.result && sm.result.path)
        c._thumb = S.browse.signed[t] = sm.result.path;
      if (--waiting === 0) done();
    });
  });
  if (!waiting) done();
}

function brSearchRun(q) {
  const B = S.browse;
  const mp = B.qmp;
  q = (q || "").trim();
  if (!mp || q.length < 2) { B.qres = null; B.qbusy = false; brBusy(false); return; }
  const seq = ++B.qseq;
  B.qbusy = true; B.qerr = "";
  /* THE INDEX ANSWERS FIRST (v0.73): local, instant, forgiving — and
     still alive when every remote engine is down (the 2026-08-10
     Spotify outage, measured). With a deep MA engine the index
     contributes only the favourites/saved-queue wells nothing else
     can see; without one it answers every crawled category. Engine
     results arriving later DEDUP AGAINST it by folded name+class —
     the index copy is native to the cast player and wins. */
  const idxHits = B.mp ? brIdxSearch(B.mp, q, {
    favOnly: !!(B.qengine === "music_assistant" && B.qentry) }) : [];
  const idxKeys = {};
  idxHits.forEach(c => {
    idxKeys[brFold(c.title) + "|" + (c.media_class || "")] = 1;
  });
  const idxDup = (name, cls) => !!idxKeys[brFold(name) + "|" + (cls || "")];
  /* PAINT THE WAIT (v0.68.3 — Suresh: "As soon as we fire off any
     search, it should display a line searching for… all i get is a
     blank screen for 30+ seconds").

     v0.68.1 shipped TWO fixes that cancelled each other and I did not
     notice, because I tested them one at a time. The speed fix made
     typing repaint only the query TEXT (brEcho) instead of the whole
     page — right, and it stands. But "Searching…" lives in the GRID,
     and the grid is only built by navigate(). So the one render that
     would have drawn it was the render I had just removed: qbusy went
     true, brBusy() lit the little dot in the bar, and the grid kept
     the empty-query [] it was already showing. Thirty seconds of
     nothing, exactly as reported.

     One render HERE, when a search actually begins — after the 350ms
     debounce, so it is once per query and not once per keystroke. The
     per-keystroke win is untouched. */
  brBusy(true);
  /* index hits paint in the SAME render that says "Searching…" —
     instant local answers above, the busy dot still promising more */
  if (idxHits.length) B.qres = { q: q, items: idxHits, capped: [] };
  if (S.screen) navigate(S.screen, true);
  const want = (Array.isArray(B.qclasses) && B.qclasses.length)
    ? B.qclasses : ["artist", "album", "track", "playlist"];
  /* `capped` names the kinds that came back FULL — the well is deeper
     than what's on screen, and saying so is the v0.62 no-silent-
     truncation rule applied to search (his "It should show that there
     are more, must be thousands!") */
  const land = (items, capped) => {
    if (seq !== B.qseq) return;             /* a later keystroke won */
    B.qbusy = false;
    items = items.filter(c => !idxDup(c.title, c.media_class));
    brThumbs(items, () => {
      if (seq !== B.qseq) return;
      B.qres = { q: q, items: idxHits.concat(items), capped: capped || [] };
      if (S.screen) navigate(S.screen, true);
    });
  };
  const fail = msg => {
    if (seq !== B.qseq) return;
    /* an engine failure with LOCAL answers on screen is not an empty
       page: keep the index hits, surface the message only when there
       is truly nothing (context.js gates the error tile on that) */
    B.qbusy = false; B.qres = { q: q, items: idxHits }; B.qerr = msg;
    if (S.screen) navigate(S.screen, true);
  };

  /* ---- MA's own search: LOCAL FIRST, THEN THE WORLD ----
     v0.68.3 — Suresh, still: "Still takes a long time for anything to
     display… As soon as we fire off any search, it should display a
     line searching for."

     v0.68.1 split one four-kind call into one call per kind so the
     first kind could paint alone. It helped, but every one of those
     calls still had to go out to Spotify, so the floor was whatever
     the slowest provider round-trip cost — tens of seconds on a bad
     day. Measured on his box: the SAME query with `library_only: true`
     comes back with his own ripped tracks essentially instantly.

     So each kind is now asked TWICE: his library first (local, fast,
     painted the moment it lands) and the providers second (slow,
     merged in as they arrive). Deduped per kind by `uri`, which also
     puts HIS music above the catalogue's — the right order anyway.
     `capped` is judged on the provider wave only; the library wave is
     not the deep well the note is about. */
  if (B.qengine === "music_assistant" && B.qentry) {
    const lim = B.qlimit || MA_SEARCH_LIMIT;
    const acc = {}, seen = {}, capped = [];
    const wide = B.qscope !== "lib";
    const waves = wide ? 2 : 1;
    let pending = want.length * waves, failed = 0;
    const paint = () => {
      const items = [];
      want.forEach(c2 => {
        if (acc[c2]) items.push.apply(items, acc[c2]);
      });
      B.qres = { q: q,
        items: idxHits.concat(items).slice(0, BROWSE_CAP), capped: capped };
      if (S.screen) navigate(S.screen, true);
    };
    const wave = (cls, libraryOnly) => {
      callServiceResp("music_assistant", "search", {
        config_entry_id: B.qentry, name: q,
        media_type: [MA_TYPE[cls] || cls], limit: lim,
        library_only: !!libraryOnly,
      }, null, m => {
        if (seq !== B.qseq) return;             /* a later keystroke won */
        pending--;
        const fresh = [];
        if (!m.success) { failed++; }
        else {
          const r = (m.result && m.result.response) || m.result || {};
          const bucket = r[MA_BUCKET[cls] || cls];
          if (Array.isArray(bucket)) {
            if (!acc[cls]) { acc[cls] = []; seen[cls] = {}; }
            bucket.forEach(o => {
              if (!o || !o.uri || seen[cls][o.uri]) return;
              seen[cls][o.uri] = 1;
              /* an index hit already covers this name — and plays
                 NATIVELY on the cast player, so it wins (v0.73) */
              if (idxDup(o.name, cls)) return;
              const it = maItem(o, cls);
              acc[cls].push(it); fresh.push(it);
            });
            if (!libraryOnly && bucket.length >= lim &&
                capped.indexOf(cls) < 0) capped.push(cls);
          }
        }
        if (!pending) { B.qbusy = false; brBusy(false); }
        if (!pending && failed === want.length * waves)
          return fail("Music Assistant didn't answer");
        /* repaint when there is something new to show — or at the end,
           so the "Searching…" line always gets cleared */
        if (!fresh.length && pending) return;
        brThumbs(fresh, () => { if (seq === B.qseq) paint(); });
      });
    };
    want.forEach(cls => { wave(cls, true); if (wide) wave(cls, false); });
    return;
  }

  /* ---- the standard contract: any player, five deep ---- */
  const msg = { type: "media_player/search_media", entity_id: mp,
    search_query: q };
  if (want.length) msg.media_filter_classes = want;
  send(msg, m => {
    if (seq !== B.qseq) return;
    if (!m.success)
      return fail((m.error && m.error.message) || "This player can't search");
    /* HA's generic search caps at 5 per class and never says so —
       declare `search.config_entry` to get MA's deeper answer */
    const got = (((m.result || {}).result) || []).slice(0, BROWSE_CAP);
    const cnt = {};
    got.forEach(c => { const k = c.media_class || "item";
      cnt[k] = (cnt[k] || 0) + 1; });
    land(got, Object.keys(cnt).filter(k => cnt[k] >= 5));
  });
}
let brQT = null;
function brSearchSoon() {
  clearTimeout(brQT);
  brQT = setTimeout(() => brSearchRun(S.browse.q), TIMING.searchDebounce || 350);
}
/* TYPING MUST NOT REBUILD THE PAGE (v0.67.5 — Suresh: "Its a bit
   slow"). Every keystroke was calling navigate(), which tears the grid
   down, re-runs every generator, rebuilds up to 200 tiles, re-focuses,
   repaints all states AND does an unsubscribe/subscribe round trip on
   the socket. One more letter in the query changes NONE of that. So
   when the only thing that moved is the text, repaint the text —
   ~200 DOM nodes and a websocket exchange per keypress become one
   assignment. Returns false if the line isn't on screen, so the
   caller can fall back to a real render. */
/* the query line's content — text + a blinking CARET (v0.71): the
   affordance that says "your typing lands here" without needing a
   real <input>. (When the native-input work lands for touch
   profiles, it brings a real caret and this one hides.) Shared by
   the full bar render and the per-keystroke echo. */
function brQHtml() {
  const B = S.browse;
  return (B.q ? esc(B.q) : "") + `<span class="brqc"></span>` +
    (B.q ? "" : `<i class="brqp">${
      B.qkb ? "type to search…" : "tap to type…"}</i>`);
}
function brEcho() {
  const bar = document.getElementById("brbar");
  const el = bar && bar.querySelector(".brqt");
  if (!el) return false;
  el.innerHTML = brQHtml();
  return true;
}
/* the busy dot lives in the DOM permanently now (hidden when idle) so
   it can be toggled without a re-render */
function brBusy(on) {
  const bar = document.getElementById("brbar");
  const el = bar && bar.querySelector(".brqs");
  if (el) el.classList.toggle("hidden", !on);
}
/* every key the search bar can send: a character, ⌫, or clear */
function brKey(ch) {
  const B = S.browse;
  if (!B.qon) return;
  /* a filter or a drill-in that has to be dropped DOES change the
     grid — that one needs the full render */
  const gridMoves = !!B.qcat || B.sub.length > 0 || ch === "!";
  if (ch === "<") B.q = B.q.slice(0, -1);
  else if (ch === "!") { B.q = ""; B.qres = null; B.qerr = ""; }
  else if (ch === "_") B.q += " ";
  else B.q += ch;
  B.qcat = "";
  B.sub = [];                 /* a new query leaves any drill behind */
  brSearchSoon();
  if (gridMoves || !brEcho()) navigate(S.screen, true);
}
function brSearchToggle() {
  const B = S.browse;
  B.qon = !B.qon;
  B.sub = [];
  /* opening search always opens the keyboard — you came here to type */
  if (B.qon) B.qkb = true;
  else { B.q = ""; B.qres = null; B.qerr = ""; B.qcat = ""; }
  navigate(S.screen, true);
}
/* SCOPE SWITCH (v0.69): re-asks the same question with a different
   reach. Results are dropped rather than filtered — the library wave
   is a strict subset of the wide one, so narrowing could be done in
   place, but widening cannot, and one rule is easier to trust. */
function brScope(v) {
  const B = S.browse;
  if (!v || B.qscope === v) return;
  B.qscope = v;
  B.qres = null; B.qerr = ""; B.qcat = "";
  if (B.q.trim()) brSearchRun(B.q);
  navigate(S.screen, true);
}
/* the query line IS the keyboard's switch (v0.67.2) */
function brKbToggle() {
  S.browse.qkb = !S.browse.qkb;
  navigate(S.screen, true);
}

