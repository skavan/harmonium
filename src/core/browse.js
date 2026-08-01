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
  busy: {}, ui: null, barTiles: [], _active: false };

const BROWSE_ICON = {
  playlist: "material:queue_music", album: "material:album",
  artist: "material:person", track: "material:music_note",
  directory: "material:folder", genre: "material:category",
  podcast: "material:podcasts", channel: "material:radio",
  tv_show: "material:tv", movie: "material:movie",
  app: "material:apps", url: "material:link",
  fav_root: "material:star", lib_root: "material:library_music",
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
  return mp + "|" + (node ? (node.type || "") + ":" + (node.id ?? "") : "");
}

function browseFetch(mp, node) {
  const key = browseKey(mp, node);
  if (S.browse.nodes[key] || S.browse.busy[key]) return;
  S.browse.busy[key] = true;
  const msg = { type: "media_player/browse_media", entity_id: mp };
  if (node) {
    msg.media_content_id = node.id ?? "";
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
    const kids = (r.children || []).slice(0, 200);
    /* thumbnails: HA-relative paths need auth/sign_path (exactly what
       the HA frontend does); absolute URLs pass straight through */
    let waiting = 0;
    const done = () => {
      S.browse.nodes[key] = { title: r.title, children: kids };
      if (S.screen) navigate(S.screen, true);
    };
    kids.forEach(c => {
      const t = c.thumbnail;
      if (!t) return;
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
  if (B.barTiles.length || B.ui.roots.length) {
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
  if (B.ui.cats) {
    const sel = B.ui.flat ? B.root : B.cat;
    html += `<div class="brchips">` + B.ui.cats.map((c, i) =>
      `<button class="brchip${brSame(c, sel) ? " on" : ""}" data-brc="${i}">${c.title}</button>`
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
      if (B.ui.flat) brSelRoot(c); else brSelCat(c);
    }));
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
