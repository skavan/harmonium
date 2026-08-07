/* ================================================================
   MEDIA BROWSE (v0.50 — Suresh's mock: "90% of the time the user
   wants Favorites >> Something"): the STANDARD HA contract
   (media_player/browse_media + media_player.play_media — no service
   hardcoding), presented as THREE BANDS instead of a page-per-level
   crawl:

     band 1 — ROOTS: the tree's curated top level (Favorites, Music
              Library…) + the section's other tiles (Pull Music Here),
              one tight fixed row
     band 2 — CATEGORIES: the selected root's children WHEN they are
              all pure directories (Sonos: Playlists/Albums/Tracks) —
              a thin horizontally-scrollable chip strip. When they
              aren't (Music Assistant's root children ARE categories,
              their children are items), the strip simply doesn't
              appear — the rule generalizes across services.
     grid   — ITEMS: auto-descended on open, scrolls; expandables
              drill in place (‹ up tile), playables play.

   Navigation: tap roots/chips · CH▲▼ steps categories (wraps) ·
   horizontal SWIPE on the grid steps categories too.
   ================================================================ */
S.browse = { mp: null, root: null, cat: null, sub: [], nodes: {}, signed: {},
  busy: {}, ui: null, barTiles: [], _active: false,
  /* SEARCH (v0.65): q = what's typed, qon = the mode, qres = the last
     answer, qcat = which media_class chip filters it */
  q: "", qon: false, qres: null, qbusy: false, qerr: "", qcat: "",
  qmp: null, qseq: 0, qclasses: null, qengine: "",
  /* qkb — is the on-screen keyboard down? (v0.67.2 — Suresh: "I need
     a way to hide/show the keyboard. We can use the input line.") The
     tablet has room for it; once you've typed, the results want the
     space back. Sticky for the session: decided once, not per search. */
  qkb: true };

/* the on-screen keyboard. Deliberately a GRID (Chromium 75 has grid
   gap; flex gap is 84 — see compat.css) and deliberately made of
   buttons, so touch and the D-pad's pointer both just work. */
const KB_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
/* what the result KINDS are called on the chip strip */
const BR_KIND_NAME = {
  artist: "Artists", album: "Albums", track: "Tracks",
  playlist: "Playlists", genre: "Genres", podcast: "Podcasts",
  channel: "Radio", directory: "More", movie: "Films", tv_show: "Shows",
};

/* per-node child cap — the tree can be enormous, the grid cannot */
const BROWSE_CAP = 200;
/* the integration's own per-category favourites cap (sensor.py LIMIT) —
   mirrored here only so the grid can SAY when it has been reached */
const FAV_SENSOR_CAP = 100;

const BROWSE_ICON = {
  playlist: "material:queue_music", album: "material:album",
  artist: "material:person", track: "material:music_note",
  directory: "material:folder", genre: "material:category",
  podcast: "material:podcasts", channel: "material:radio",
  tv_show: "material:tv", movie: "material:movie",
  app: "material:apps", url: "material:link",
  fav_root: "material:star", lib_root: "material:library_music",
};

/* THE BADGE (v0.62 — Suresh: "in All, we could have a tiny badge
   indicating playlist, album, artist, radio, track"). Keyed on the
   FOLDER an item came from, not its media_class: Sonos reports its
   radio favorites as media_class "genre", so the folder is the more
   truthful label. media_class is the fallback. */
const BADGE_BY_CAT = {
  playlists: "material:queue_music", playlist: "material:queue_music",
  albums: "material:album", album: "material:album",
  artists: "material:person", artist: "material:person",
  tracks: "material:audiotrack", track: "material:audiotrack",
  radio: "material:radio", stations: "material:radio",
  podcasts: "material:podcasts", genres: "material:category",
  folders: "material:folder",
};
const brBadge = (catTitle, c) =>
  BADGE_BY_CAT[String(catTitle || "").toLowerCase()] ||
  BROWSE_ICON[c.media_class] || "material:library_music";

/* CHIP ORDER (v0.62 — Suresh: "Can we change the order of the media
   sections"). Until now the SOURCE decided: Sonos hands back Albums /
   Playlists / Radio / Tracks and we never sorted, so that is what you
   saw. `categories: [titles]` on the browse tile reorders AND filters
   by title, case-insensitively; anything unlisted drops. Absent — or
   matching nothing — leaves the source order untouched, so no
   existing tile changes behaviour. */
function brOrder(cats, want) {
  if (!Array.isArray(cats) || !Array.isArray(want) || !want.length) return cats;
  const rank = {};
  want.forEach((w, i) => { rank[String(w).toLowerCase()] = i; });
  const key = c => String(c.title || "").toLowerCase();
  const out = cats.filter(c => rank[key(c)] != null)
    .sort((a, b) => rank[key(a)] - rank[key(b)]);
  return out.length ? out : cats;
}

/* ---- SEARCH (v0.65) ------------------------------------------------
   HA's `media_player/search_media` is the whole backend — no service
   hardcoding, same doctrine as browse. The catch, found by asking the
   house rather than the docs: **Sonos answers an empty list.** Sonos
   has no search; MUSIC ASSISTANT does, and the MA player drives the
   same physical speaker. So search runs against a player that can,
   named by the tile (`search_entity`), and its results play there too
   — the content ids it returns are MA's and mean nothing to Sonos. */
/* the query is USER TEXT going into innerHTML — escape it */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/* MA → SONOS (v0.66 — Suresh: "The sonos player is the target!").
   MA hands back `spotify--<instance>://track/<id>`; the tail is a real
   Spotify base-62 id, so a canonical `spotify:track:<id>` falls out —
   and HA's Sonos integration checks `share_link.is_share_link(media_id)`
   BEFORE any media_type branch, so Sonos takes it as-is. Verified
   against SoCo's SpotifyShare regex,
       spotify.*[:/](album|episode|playlist|show|track)[:/](\w+)
   which is also why ARTIST is absent below: Sonos cannot share-link an
   artist. Those (and MA's own `library://…`) fall back to the MA
   player, which can always play its own ids. */
const SPOTIFY_SHARE_KINDS = { album: 1, episode: 1, playlist: 1, show: 1, track: 1 };
function brSpotifyUri(id) {
  if (typeof id !== "string") return null;
  let m = /^spotify[^:]*:\/\/([a-z]+)\/([A-Za-z0-9]+)/.exec(id);   /* MA */
  if (!m) m = /^spotify:([a-z]+):([A-Za-z0-9]+)/.exec(id);            /* canonical */
  if (!m) m = /open\.spotify\.com\/([a-z]+)\/([A-Za-z0-9]+)/.exec(id);  /* share URL */
  if (!m || !SPOTIFY_SHARE_KINDS[m[1]]) return null;
  return "spotify:" + m[1] + ":" + m[2];
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
    brThumbs(items, () => {
      if (seq !== B.qseq) return;
      B.qres = { q: q, items: items, capped: capped || [] };
      if (S.screen) navigate(S.screen, true);
    });
  };
  const fail = msg => {
    if (seq !== B.qseq) return;
    B.qbusy = false; B.qres = { q: q, items: [] }; B.qerr = msg;
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
    let pending = want.length * 2, failed = 0;
    const paint = () => {
      const items = [];
      want.forEach(c2 => {
        if (acc[c2]) items.push.apply(items, acc[c2]);
      });
      B.qres = { q: q, items: items.slice(0, BROWSE_CAP), capped: capped };
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
              const it = maItem(o, cls);
              acc[cls].push(it); fresh.push(it);
            });
            if (!libraryOnly && bucket.length >= lim &&
                capped.indexOf(cls) < 0) capped.push(cls);
          }
        }
        if (!pending) { B.qbusy = false; brBusy(false); }
        if (!pending && failed === want.length * 2)
          return fail("Music Assistant didn't answer");
        /* repaint when there is something new to show — or at the end,
           so the "Searching…" line always gets cleared */
        if (!fresh.length && pending) return;
        brThumbs(fresh, () => { if (seq === B.qseq) paint(); });
      });
    };
    want.forEach(cls => { wave(cls, true); wave(cls, false); });
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
function brEcho() {
  const B = S.browse;
  const bar = document.getElementById("brbar");
  const el = bar && bar.querySelector(".brqt");
  if (!el) return false;
  el.innerHTML = B.q ? esc(B.q)
    : `<i class="brqp">${B.qkb ? "type to search…" : "tap to type…"}</i>`;
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
/* the query line IS the keyboard's switch (v0.67.2) */
function brKbToggle() {
  S.browse.qkb = !S.browse.qkb;
  navigate(S.screen, true);
}

/* the synthetic first chip: every category at once, unsliced */
const BR_ALL = {
  title: "All", media_content_id: "__all", media_content_type: "__brall",
  media_class: "directory", can_expand: true, can_play: false,
};

/* a PURE DIRECTORY — expandable, not playable. Bands are built from
   these; anything else is an item. */
const brDir = c => !!c.can_expand && !c.can_play;
const brRef = c => ({ id: c.media_content_id, type: c.media_content_type,
  title: c.title });
const brSame = (c, sel) => !!sel && c.media_content_id === sel.id &&
  c.media_content_type === sel.type;

/* the key carries TYPE and id — Sonos's Favorites / Music Library
   root children have an EMPTY media_content_id (v0.49.1): an empty
   id is NOT the root; only a null node is. */
function browseKey(mp, node) {
  return mp + "|" + (node ? (node.type || "") + ":" + (node.id != null ? node.id : "") : "");
}

function browseFetch(mp, node) {
  const key = browseKey(mp, node);
  if (S.browse.nodes[key] || S.browse.busy[key]) return;
  S.browse.busy[key] = true;
  const msg = { type: "media_player/browse_media", entity_id: mp };
  if (node) {
    msg.media_content_id = node.id != null ? node.id : "";
    msg.media_content_type = node.type;
  }
  send(msg, m => {
    delete S.browse.busy[key];
    if (!m.success) {
      S.browse.nodes[key] = {
        title: "Library", children: [],
        error: (m.error && m.error.message) || "This player can't browse media",
      };
      if (S.screen) navigate(S.screen, true);
      return;
    }
    const r = m.result || {};
    /* NO SILENT TRUNCATION (v0.62): the cap has always been here; what
       was missing was saying so. `more` counts what this node holds
       and we don't show — our own slice plus whatever HA already
       withheld (not_shown) — and mkItems prints a final row. */
    const all = r.children || [];
    const kids = all.slice(0, BROWSE_CAP);
    const more = (all.length - kids.length) + (r.not_shown || 0);
    /* thumbnails via brThumbs (v0.67.3 — the same pass search now
       uses; it was inline here and search had none at all) */
    brThumbs(kids, () => {
      S.browse.nodes[key] = { title: r.title, children: kids, more: more };
      if (S.screen) navigate(S.screen, true);
    });
  });
}

/* ---- selection (each re-renders the screen) ---- */
function brSelRoot(c) {
  S.browse.root = brRef(c);
  S.browse.cat = null; S.browse.sub = [];
  navigate(S.screen, true);
}
function brSelCat(c) {
  S.browse.cat = brRef(c);
  S.browse.sub = [];
  navigate(S.screen, true);
}
function brStepCat(dir) {
  const ui = S.browse.ui;
  if (!ui || !ui.cats || ui.cats.length < 2) return false;
  /* the placeholder strip drawn before an answer exists (v0.68.1) is a
     LABEL, not a control — CH▲▼ and swipe must not step it */
  if (ui.cats.some(c => c.disabled)) return false;
  /* SEARCH CHIPS STEP TOO (v0.68.1): in search mode the strip filters
     results by media_class and the selection lives in `qcat`, so the
     tree's root/cat refs never matched and CH▲▼ silently did nothing */
  if (S.browse.qon) {
    const cats = ui.cats;
    const at = cats.findIndex(c => (c.qclass || "") === (S.browse.qcat || ""));
    const nx = cats[((at < 0 ? 0 : at) + dir + cats.length) % cats.length];
    S.browse.qcat = nx.qclass || "";
    flashBar(nx.title);
    navigate(S.screen, true);
    return true;
  }
  const cur = ui.flat ? S.browse.root : S.browse.cat;
  const i = ui.cats.findIndex(c => brSame(c, cur));
  const n = ui.cats[((i < 0 ? 0 : i) + dir + ui.cats.length) % ui.cats.length];
  if (ui.flat) brSelRoot(n); else brSelCat(n);
  flashBar(n.title);
  return true;
}
/* in-grid drill below the bands (deep trees: artist → albums → …) */
function browseGo(ref) {
  if (ref === "__up") S.browse.sub.pop();
  else S.browse.sub.push(ref);
  navigate(S.screen, true);
}

/* ---- THE BAR (#brbar): bands 1+2, fixed above the grid ---- */
function browseBar() {
  const bar = document.getElementById("brbar");
  if (!bar) return;
  const B = S.browse;
  if (!B._active || !B.ui) {
    bar.classList.remove("onbar"); bar.innerHTML = ""; return;
  }
  bar.classList.add("onbar");
  const ic = c => c._thumb
    ? `<img src="${c._thumb}" alt="">`
    : `<span class="material-symbols-outlined">${
        (BROWSE_ICON[c.media_class] || "material:library_music").slice(9)}</span>`;
  /* FLAT TREES (v0.50.2 — Suresh: "Sonos is better"): when the top
     level IS the categories (Music Assistant), the chips carry the
     selection and the roots row shrinks to the section's own tiles
     (Pull Music Here) — or disappears entirely. */
  let html = "";
  /* A CONTROL WITH ONE OPTION IS NOT A CONTROL (v0.62 — Suresh, of
     the lone Sonos "Favorites" badge: "What does the favorite icon at
     the top do?"). Nothing: it selects the only root there is, because
     the other eight are media-source:// and hidden. So the row only
     renders when it carries a real choice — or a tile of its own. It
     comes back by itself the moment a second root exists. */
  if (B.barTiles.length || B.ui.roots.length > 1) {
    html += `<div class="brrow">`;
    B.barTiles.forEach((t, i) => {
      html += `<button class="brroot" data-brt="${i}">` +
        (t.icon && t.icon.startsWith("material:")
          ? `<span class="material-symbols-outlined">${t.icon.slice(9)}</span>` : "") +
        `<span class="brl">${t.label || ""}</span></button>`;
    });
    B.ui.roots.forEach((c, i) => {
      html += `<button class="brroot${brSame(c, B.root) ? " on" : ""}" data-brr="${i}">` +
        ic(c) + `<span class="brl">${c.title}</span></button>`;
    });
    html += `</div>`;
  }
  /* SEARCH (v0.65): the query line + keyboard sit ABOVE the chips, so
     the chips keep meaning "which slice of what I'm looking at" in
     both modes — categories while browsing, result KINDS while
     searching. */
  if (B.qon) {
    const shown = B.q ? esc(B.q)
      : `<i class="brqp">${B.qkb ? "type to search…" : "tap to type…"}</i>`;
    /* THE LINE IS THE SWITCH (v0.67.2): tapping anywhere on the query
       line that isn't ⌫ or ✕ raises/lowers the keyboard. The trailing
       chevron button says so out loud for anyone who wouldn't guess. */
    html += `<div class="brq" data-brkb="1">` +
      `<span class="material-symbols-outlined brqi">search</span>` +
      `<span class="brqt">${shown}</span>` +
      `<span class="brqs${B.qbusy ? "" : " hidden"}">…</span>` +
      `<button class="brqb" data-brk="&lt;" title="Backspace">⌫</button>` +
      /* clear-text only exists while there IS text — so the ✕ next to
         the close button is never ambiguous (v0.68.1) */
      (B.q ? `<button class="brqb" data-brk="!" title="Clear">✕</button>` : "") +
      `<button class="brqb brqk" data-brkb="1" title="${
        B.qkb ? "Hide keyboard" : "Show keyboard"}">` +
      `<span class="material-symbols-outlined">${
        B.qkb ? "keyboard_hide" : "keyboard"}</span></button>` +
      /* LEAVING SEARCH NEEDS A DOOR (v0.68.1 — Suresh: "Clicking the
         magnifying glass takes me out of search mode, but its not
         obvious. Maybe we have a close icon after the keyboard icon").
         The magnifier chip still toggles; this is the obvious way. */
      `<button class="brqb brqx" data-brqx="1" title="Close search">` +
      `<span class="material-symbols-outlined">close</span></button></div>`;
    if (B.qkb)
      html += `<div class="brkb">` + KB_ROWS.map(r =>
        `<div class="brkr">` + r.split("").map(ch =>
          `<button class="brk" data-brk="${ch}">${ch}</button>`).join("") + `</div>`
      ).join("") +
        `<div class="brkr"><button class="brk brksp" data-brk="_">space</button></div>` +
        `</div>`;
  }
  if (B.ui.cats || B.qmp) {
    const sel = B.ui.flat ? B.root : B.cat;
    /* WHICH CHIP AM I ON? (v0.67.5 — Suresh: "when I click a tab like
       Tracks in search mode, that should highlight"). The tree's chips
       are compared by media id; the SEARCH chips are synthetic and the
       selection lives in `qcat` (a media_class), so brSame() looked at
       B.cat — never set in search mode — and nothing ever lit up. */
    const onChip = c => B.qon
      ? (c.qclass || "") === (B.qcat || "")
      : brSame(c, sel);
    html += `<div class="brchips">`;
    /* the magnifier is a CHIP: the strip is already where you choose
       what you're looking at, and a lone root row may not exist */
    if (B.qmp)
      html += `<button class="brchip brchipq${B.qon ? " on" : ""}" data-brq="1"` +
        ` title="Search the library"><span class="material-symbols-outlined">search</span></button>`;
    html += (B.ui.cats || []).map((c, i) =>
      `<button class="brchip${onChip(c) ? " on" : ""}" data-brc="${i}"${
        c.disabled ? " disabled" : ""}>${c.title}</button>`
    ).join("") + `</div>`;
  }
  bar.innerHTML = html;
  bar.querySelectorAll("[data-brt]").forEach(b =>
    b.addEventListener("click", () => {
      const t = B.barTiles[+b.dataset.brt];
      const w = WIDGETS[t.type];
      if (w && w.select) w.select(resolveEntity(t.entity), t);
    }));
  bar.querySelectorAll("[data-brr]").forEach(b =>
    b.addEventListener("click", () => {
      const c = B.ui.roots[+b.dataset.brr];
      /* an expandable root selects; a playable-only root just PLAYS
         (a favorite station pinned at the top level) */
      if (c.can_expand) brSelRoot(c);
      else callService("media_player", "play_media",
        { media_content_id: c.media_content_id,
          media_content_type: c.media_content_type }, B.mp);
    }));
  bar.querySelectorAll("[data-brc]").forEach(b =>
    b.addEventListener("click", () => {
      const c = B.ui.cats[+b.dataset.brc];
      /* in search mode the chips filter the RESULTS by media_class */
      if (B.qon) { B.qcat = c.qclass || ""; navigate(S.screen, true); return; }
      if (B.ui.flat) brSelRoot(c); else brSelCat(c);
    }));
  bar.querySelectorAll("[data-brq]").forEach(b =>
    b.addEventListener("click", brSearchToggle));
  bar.querySelectorAll("[data-brk]").forEach(b =>
    b.addEventListener("click", ev => {
      ev.stopPropagation();       /* ⌫/✕ sit INSIDE the toggling line */
      brKey(b.dataset.brk);
    }));
  bar.querySelectorAll("[data-brkb]").forEach(b =>
    b.addEventListener("click", ev => { ev.stopPropagation(); brKbToggle(); }));
  bar.querySelectorAll("[data-brqx]").forEach(b =>
    b.addEventListener("click", ev => { ev.stopPropagation(); brSearchToggle(); }));
  /* horizontal SWIPE on the grid steps categories (touch) */
  if (!browseBar._swipe) {
    browseBar._swipe = true;
    const g = document.getElementById("grid");
    let sx = 0, sy = 0, st = 0;
    g.addEventListener("pointerdown", e => {
      sx = e.clientX; sy = e.clientY; st = Date.now();
    }, { passive: true });
    g.addEventListener("pointerup", e => {
      if (!S.browse._active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Date.now() - st < 600 && Math.abs(dx) > 70 && Math.abs(dy) < 50)
        brStepCat(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
}
