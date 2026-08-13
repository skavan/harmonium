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
  /* entity-registry cache (v0.69): entity → its registry row, so
     `config_entry_id` and `platform` stop having to be authored */
  reg: {}, regReq: {},
  /* SCOPE (v0.69) — "lib" = his own library only, "all" = library then
     the providers. The two waves have run this way since v0.68.3; what
     was missing was any way to SEE or CHOOSE it, so "why isn't my CD in
     here" had no answer. Sticky for the session, like qkb. */
  qscope: "all",
  /* qkb — is the on-screen keyboard down? (v0.67.2 — Suresh: "I need
     a way to hide/show the keyboard. We can use the input line.") The
     tablet has room for it; once you've typed, the results want the
     space back. Sticky for the session: decided once, not per search. */
  qkb: true,
  /* VIEW (v0.71 — design-library-ui.md §2): grid or a dense one-column
     LIST, remembered PER CATEGORY (grid for Albums, list for Artists
     is what people converge on) and persisted per REMOTE PROFILE —
     the tablet and the Astrion want different defaults. Lazy-loaded
     from localStorage into this map. */
  views: null };

/* the view choice: which key identifies "here" */
function brViewKey() {
  const B = S.browse;
  if (B.qon) return "q:" + (B.qcat || "all");
  const sel = (B.ui && B.ui.flat) ? B.root : (B.cat || B.root);
  return (sel && String(sel.title || sel.id || "").toLowerCase()) || "root";
}
function brViews() {
  const B = S.browse;
  if (!B.views) {
    try { B.views = JSON.parse(localStorage.getItem(
      "hakr_views_" + (S.deviceName || "default"))) || {}; }
    catch (e) { B.views = {}; }
  }
  return B.views;
}
/* three views (v0.83.1 — statusreview: "maybe a third mode, with
   2 x 2 tiles so we can see more text"): grid (the screen's own
   columns) → list (dense one-column rows) → grid2 (two-wide cards —
   half the density, double the label room). Unknown stored values
   fall back to grid, so old localStorage entries stay valid. */
function brView() {
  const v = brViews()[brViewKey()];
  return v === "list" || v === "grid2" ? v : "grid";
}
function brViewToggle() {
  const v = brViews();
  v[brViewKey()] = { grid: "list", list: "grid2", grid2: "grid" }[brView()];
  try { localStorage.setItem("hakr_views_" + (S.deviceName || "default"),
    JSON.stringify(v)); } catch (e) { /* storage full/blocked: session-only */ }
  navigate(S.screen, true);
}

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
/* REFRESH EVERYTHING (v0.74.1 — Suresh: "remind me how I force a
   refresh of the music library?" … the honest answer was three
   different levers, which is two too many). One control now empties
   all three wells:
     1. the session TREE cache (S.browse.nodes — no TTL by design;
        the re-render refetches whatever the screen needs)
     2. the SONOS INDEX (re-crawl; the search tail row shows its age)
     3. the MA FAVOURITES sensors (a best-effort update_entity poke —
        sent raw so a house without the integration doesn't flash an
        error for an optional nicety; the hourly cadence still stands)
   Signed-thumbnail paths are kept: they are auth artifacts, not
   content, and re-signing them would just burn round trips. */
function brLibRefresh() {
  const B = S.browse;
  flashBar("Refreshing library…");
  B.nodes = {}; B.busy = {};
  B.qres = null;
  brIdxCrawl(B.mp);
  send({ type: "call_service", domain: "homeassistant",
    service: "update_entity", service_data: { entity_id: [
      "sensor.harmonium_music_playlists", "sensor.harmonium_music_artists",
      "sensor.harmonium_music_albums", "sensor.harmonium_music_tracks",
      "sensor.harmonium_music_radio",
    ] } }, () => { /* best-effort */ });
  if (B.qon && B.q.trim()) brSearchSoon();
  navigate(S.screen, true);
}
function browseGo(ref) {
  /* both refresh doors — the band-1 button and the search tail row —
     open onto the same full refresh: one control, one meaning */
  if (ref === "__idxr" || ref === "__libr") { brLibRefresh(); return; }
  if (ref === "__up") S.browse.sub.pop();
  else S.browse.sub.push(ref);
  navigate(S.screen, true);
}

/* ---- THE BAR (#brbar): bands 1+2, fixed above the grid ---- */
function browseBar() {
  const bar = document.getElementById("brbar");
  if (!bar) return;
  const B = S.browse;
  /* SEARCH MUST NOT WAIT FOR THE TREE, IN THE BAR EITHER (v0.69).
     v0.68.1 stopped the GRID gating on the browse root, but this
     early return still emptied the whole bar until `ui` existed —
     and `ui` is only set once the auto-descent finishes, two or three
     round trips deep. So on a slow or unreachable library the
     magnifier never appeared, and search was unreachable precisely
     when it was the fastest way to find something. The bar now
     renders whenever there is EITHER a tree to show or an engine that
     can answer; every `ui` read below is guarded. */
  if (!B._active || (!B.ui && !B.qmp)) {
    bar.classList.remove("onbar"); bar.innerHTML = ""; return;
  }
  const UI = B.ui || { roots: [], cats: null };
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
  /* THE MAGNIFIER LIVES IN BAND 1 (v0.71 — design-library-ui.md §2).
     It used to head the chip strip, which read as "search is a
     category". It isn't — it is a MODE, a sibling of Favorites and
     Music Library: a different answer to "where am I looking", not
     "which slice of here". Moving it up is also free chip width
     exactly where the chips overflow. The row therefore renders
     whenever search exists, even for a lone-root tree whose roots
     are hidden (v0.62's one-option rule still hides THOSE). */
  if (B.barTiles.length || UI.roots.length > 1 || B.qmp) {
    html += `<div class="brrow">`;
    B.barTiles.forEach((t, i) => {
      html += `<button class="brroot" data-brt="${i}">` +
        (t.icon && t.icon.startsWith("material:")
          ? `<span class="material-symbols-outlined">${t.icon.slice(9)}</span>` : "") +
        `<span class="brl">${t.label || ""}</span></button>`;
    });
    if (UI.roots.length > 1)
      UI.roots.forEach((c, i) => {
        html += `<button class="brroot${brSame(c, B.root) ? " on" : ""}" data-brr="${i}">` +
          ic(c) + `<span class="brl">${c.title}</span></button>`;
      });
    if (B.qmp)
      html += `<button class="brroot brrootq${B.qon ? " on" : ""}" data-brq="1"` +
        ` title="Search the library">` +
        `<span class="material-symbols-outlined">search</span>` +
        `<span class="brl">Search</span></button>`;
    /* the one-tap FULL refresh (v0.74.1): tree + index + favourites.
       Icon-only — it is a janitor, not a destination. */
    if (B.mp)
      html += `<button class="brroot brrootr" data-brlr="1"` +
        ` title="Refresh library (tree · index · favourites)">` +
        `<span class="material-symbols-outlined">sync</span></button>`;
    html += `</div>`;
  }
  /* SEARCH (v0.65): the query line + keyboard sit ABOVE the chips, so
     the chips keep meaning "which slice of what I'm looking at" in
     both modes — categories while browsing, result KINDS while
     searching. */
  if (B.qon) {
    /* TWO TARGETS, TWO MEANINGS (v0.71 — design-library-ui.md §3).
       The row held four small icons — ⌫, clear-✕, ⌨, close-✕ — on a
       surface driven by a thumb or a D-pad, two of them ambiguous.
       Now: a CARET says where typing lands (a 2px accent bar,
       CSS-blinking — costs nothing, works with the button grid), ⌫
       moved onto the keyboard where every phone puts it (hold =
       clear all, which retires the clear-✕), and the row keeps
       exactly two controls — keyboard show/hide, and ONE ✕ that
       means close search and nothing else. */
    html += `<div class="brq" data-brkb="1">` +
      `<span class="material-symbols-outlined brqi">search</span>` +
      `<span class="brqt">${brQHtml()}</span>` +
      `<span class="brqs${B.qbusy ? "" : " hidden"}">…</span>` +
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
    /* SCOPE, MADE VISIBLE (v0.69 — Suresh's own split: "Search all
       music known to man" vs "Search my Library"). Both already ran;
       only the merge was visible. Shown solely on the deep MA path —
       the generic contract has no library_only to offer, and a control
       with one option is not a control (v0.62). */
    if (B.qengine === "music_assistant" && B.qentry)
      html += `<div class="brsc">` +
        [["lib", "My library"], ["all", "Everything"]].map(o =>
          `<button class="brscb${B.qscope === o[0] ? " on" : ""}"` +
          ` data-brsc="${o[0]}">${o[1]}</button>`).join("") + `</div>`;
    if (B.qkb)
      html += `<div class="brkb">` + KB_ROWS.map(r =>
        `<div class="brkr">` + r.split("").map(ch =>
          `<button class="brk" data-brk="${ch}">${ch}</button>`).join("") + `</div>`
      ).join("") +
        /* ⌫ lives beside space (v0.71), where a thumb already is and
           where every phone keyboard puts it. HOLD = clear all. */
        `<div class="brkr"><button class="brk brksp" data-brk="_">space</button>` +
        `<button class="brk brkbs" data-brbs="1"` +
        ` title="Backspace — hold to clear">⌫</button></div>` +
        `</div>`;
  }
  if (UI.cats || B.qmp) {
    const sel = UI.flat ? B.root : B.cat;
    /* WHICH CHIP AM I ON? (v0.67.5 — Suresh: "when I click a tab like
       Tracks in search mode, that should highlight"). The tree's chips
       are compared by media id; the SEARCH chips are synthetic and the
       selection lives in `qcat` (a media_class), so brSame() looked at
       B.cat — never set in search mode — and nothing ever lit up. */
    const onChip = c => B.qon
      ? (c.qclass || "") === (B.qcat || "")
      : brSame(c, sel);
    html += `<div class="brchips">`;
    /* the VIEW TOGGLE takes the slot the magnifier vacated (v0.71).
       Right home: the chips choose which slice you look at, this
       chooses how the slice is DRAWN — a per-category control sitting
       next to the categories. It cycles, and that is honest here:
       tap it and the whole screen redraws — the state is visible in
       the thing it controls (unlike scope, which must never cycle).
       The icon names where the tap TAKES you. */
    html += `<button class="brchip brchipv" data-brv="1" title="${
      { grid: "List view", list: "Two-wide grid", grid2: "Grid view" }[brView()]}">` +
      `<span class="material-symbols-outlined">${
        { grid: "view_list", list: "grid_view", grid2: "apps" }[brView()]}</span></button>`;
    html += (UI.cats || []).map((c, i) =>
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
  bar.querySelectorAll("[data-brlr]").forEach(b =>
    b.addEventListener("click", ev => { ev.stopPropagation(); brLibRefresh(); }));
  bar.querySelectorAll("[data-brk]").forEach(b =>
    b.addEventListener("click", ev => {
      ev.stopPropagation();
      brKey(b.dataset.brk);
    }));
  /* ⌫: tap = backspace, HOLD (550ms, same threshold as tile holds)
     = clear all — which is why the clear-✕ could retire (v0.71) */
  bar.querySelectorAll("[data-brbs]").forEach(b => {
    let hT = null, held = false;
    b.addEventListener("pointerdown", () => {
      held = false;
      clearTimeout(hT);
      hT = setTimeout(() => { held = true; brKey("!"); }, 550);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev =>
      b.addEventListener(ev, () => clearTimeout(hT)));
    b.addEventListener("click", ev => {
      ev.stopPropagation();
      if (held) { held = false; return; }   /* the hold already fired */
      brKey("<");
    });
  });
  bar.querySelectorAll("[data-brv]").forEach(b =>
    b.addEventListener("click", ev => {
      ev.stopPropagation();
      brViewToggle();
    }));
  bar.querySelectorAll("[data-brsc]").forEach(b =>
    b.addEventListener("click", ev => {
      ev.stopPropagation();
      brScope(b.dataset.brsc);
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

