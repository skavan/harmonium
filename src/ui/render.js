/* ================================================================
   Rendering
   ================================================================ */
const grid = document.getElementById("grid");

function renderBanner(sc) {
  const bn = document.getElementById("banner");
  /* hero off: missing OR enabled:false (settings survive the toggle) */
  if (!sc.banner || sc.banner.enabled === false) {
    bn.classList.add("hidden"); bn.innerHTML = ""; return;
  }
  const b = sc.banner;
  const overlay = 1 - (b.image_opacity != null ? b.image_opacity : 0.55);
  bn.style.height = b.height || "180px";
  bn.style.backgroundImage = b.image
    ? `linear-gradient(rgba(13,15,18,${overlay}), rgba(13,15,18,${overlay})), url('${b.image}')`
    : "none";
  const roomsLink = b.rooms_screen && CONFIG.screens[b.rooms_screen];
  bn.innerHTML = `<div class="btitle${roomsLink ? " link" : ""}"${roomsLink ? ' data-fid="hero_rooms"' : ""}>${b.title || sc.name}</div>` +
    (b.show_time === false ? "" : `<div class="btime" id="btime"></div>`);
  if (roomsLink) bn.querySelector(".btitle").addEventListener("click", ev => {
    ev.stopPropagation(); heroActivate("hero_rooms");
  });
  bn.classList.remove("hidden");
  /* tabs:false hides the section jump strip; the title re-centers
     (padding reserved for the strip is dropped) */
  bn.classList.toggle("notabs", b.tabs === false);
  updateClock();
}

/* ---- hero nav: section jump labels + scroll-spy ---- */
/* Scroll the GRID and nothing else (v0.83.11 — Suresh: "If I Click
   presets the entire remote scrolls down"): scrollIntoView propagates
   to every scrollable ancestor — ACROSS the preview iframe boundary,
   where it slid the whole Studio pane (the clip guard of v0.83.7
   only protects the clip itself). Manual scrollTop math touches one
   scroller, full stop. mode "nearest" mirrors scrollIntoView's:
   already visible = no move. */
/* the grid's USABLE bottom edge (v0.85.7 — Suresh, Fire TV: "when I
   scroll using channel buttons, we are not measuring the viewport
   with the back home strip. So a selected tile that sits underneath
   that strip gets clipped"): the TV back/home strip and the
   pad-borrow strip are position:fixed OVER the grid's bottom, so
   the grid's own rect lies about where content is visible.
   Subtract whichever overlay is showing — the scroll math reads
   this, never gr.bottom, and a small breath keeps the tile's edge
   off the strip's shadow. */
function gridVisBottom(gr) {
  let b = gr.bottom;
  const ts = document.getElementById("tvstrip");
  if (ts && !ts.classList.contains("hidden")) {
    const t = ts.getBoundingClientRect().top;
    if (t < b) b = t - 4;
  }
  const ps = document.getElementById("padstrip");
  if (ps && !ps.classList.contains("hidden")) {
    const t = ps.getBoundingClientRect().top;
    if (t < b) b = t - 4;
  }
  return b;
}
/* SCROLL CUE (v0.85.8 — Suresh: "a small filled, orange triangle at
   the very bottom of the screen (centered)" whenever items sit below
   the fold). A pure hint: accent-colored, pointer-events none, floats
   2px under the visible grid bottom — which rides it up above the
   tv/pad strips through the same math gridVisBottom gives every other
   scroll consumer — and goes away at the end of the scroll. Driven by
   the grid's scroll event plus a slow tick, because the layout can
   grow without a scroll ever firing (re-renders, strip toggles,
   artwork arriving late and stretching the page). */
function updateScrollCue() {
  let cue = document.getElementById("scrollcue");
  if (!cue) {
    cue = document.createElement("div");
    cue.id = "scrollcue";
    document.body.appendChild(cue);
  }
  const more = grid.scrollHeight - grid.scrollTop - grid.clientHeight > 6;
  if (!more) { cue.classList.remove("on"); return; }
  const vb = gridVisBottom(grid.getBoundingClientRect());
  cue.style.bottom = Math.max(2, Math.round(window.innerHeight - vb + 2)) + "px";
  cue.classList.add("on");
}
grid.addEventListener("scroll", updateScrollCue);
setInterval(updateScrollCue, 600);
function gridScrollTo(el, mode) {
  const gr = grid.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (mode === "nearest") {
    const vb = gridVisBottom(gr);
    if (r.top < gr.top) grid.scrollTop += r.top - gr.top;
    else if (r.bottom > vb) grid.scrollTop += r.bottom - vb;
    return;
  }
  /* "context" (v0.85.7 — Suresh, the queue: "why is [it] scrolled so
     that Now Playing is at the bottom and clipped? best practice
     would be… the third element, so we see two before and like 4
     after"): the anchor lands as roughly the THIRD visible row —
     two rows of what already played above, the upcoming list below.
     The browser clamps a negative result to 0, so a row near the
     top just shows the top. */
  if (mode === "context") {
    grid.scrollTop += r.top - gr.top - 2 * (r.height + 10) - 10;
    return;
  }
  /* "start" keeps a breath of air above the anchor (v0.85.7 — Suresh:
     "the first tile is pressed against the hero tile instead of
     showing its normal little padding") — the browser clamps a
     negative result to 0, so the top of the page is unhurt */
  grid.scrollTop += r.top - gr.top - 10;
}
/* keep an active chip visible in a horizontal strip (2026-08-20 —
   Suresh: "When I change tabs in the library, an off screen tab
   doesn't scroll into view"). Manual scrollLeft math, same doctrine
   as gridScrollTo: one scroller, no scrollIntoView, "nearest"
   semantics (already visible = no move). */
function stripScrollTo(strip, el) {
  if (!strip || !el) return;
  const sr = strip.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.left < sr.left) strip.scrollLeft += r.left - sr.left - 12;
  else if (r.right > sr.right) strip.scrollLeft += r.right - sr.right + 12;
}
function buildHeroNav(jumps, strip) {
  S.heroJumps = jumps;
  S.heroAt = null;   // fresh page: stepping re-seeds from the spy
  S.heroPin = null;  // and no tap-pinned chip survives a page change
  const bn = document.getElementById("banner");
  bn.querySelectorAll(".hstrip").forEach(x => x.remove());
  grid.onscroll = null;
  if (!strip || bn.classList.contains("hidden") || !jumps.length) return;
  const stripEl = document.createElement("div");
  stripEl.className = "hstrip";
  jumps.forEach((j, i) => {
    if (j.chip === false) return;   // CH stop only — no banner tab
    const el = document.createElement("div");
    el.className = "hjump";
    el.dataset.fid = "hero_" + i;
    el.textContent = j.label;
    el.addEventListener("click", ev => { ev.stopPropagation(); heroGo(i); });
    stripEl.appendChild(el);
    j.btn = el;
  });
  if (stripEl.children.length) bn.appendChild(stripEl);
  grid.onscroll = updateSpy;
  updateSpy();
}
/* CH▲▼ / MENU category stepping (v0.31): jump to the next/prev
   labeled section with a named flash. Works bannerless too (the
   strip is just the visible face; anchors always exist). MENU tours
   with wrap; CH clamps at the ends. */
function heroCycle(dir, wrap) {
  const js = S.heroJumps || [];
  if (js.length < 2) return false;
  /* stepping REMEMBERS its own position (S.heroAt) — short sections
     can't always scroll to the top, so the scroll-spy misreads them;
     the spy (with its bottom rule) only seeds the first step */
  let active = S.heroAt;
  if (active == null) {
    const top = grid.getBoundingClientRect().top + 48;
    active = 0;
    js.forEach((j, i) => { if (j.anchorEl.getBoundingClientRect().top <= top) active = i; });
    /* (no bottom rule here — that's a chips-highlight nicety; the
       stepper seeds from what's at the TOP of the viewport) */
  }
  let next = active + dir;
  if (wrap) next = (next + js.length) % js.length;
  else next = Math.min(js.length - 1, Math.max(0, next));
  if (next === active) return false;
  S.heroAt = next;
  heroGo(next);
  flashBar(js[next].label);
  return true;
}
function heroGo(i) {
  const j = (S.heroJumps || [])[i];
  if (!j) return;
  gridScrollTo(j.anchorEl, "start");
  /* THE TAP'S INTENT WINS THE CHIPS (v0.83.11 — Suresh: "presets is
     not selected (devices is)"): a short page can't always bring the
     section to the top, so the jump bottoms the grid out and the
     spy's bottom rule lit the LAST chip. Pin the tapped chip for as
     long as the scroll stays where the tap left it; scrolling away
     hands the chips back to the spy. */
  S.heroPin = { i, top: grid.scrollTop };
  S.heroAt = i;         // CH▲▼ stepping continues from here
  updateSpy();
  setFocus(j.firstId);
}
function heroActivate(fid) {
  if (fid === "hero_rooms") {
    const b = (screenOf(S.screen) || {}).banner || {};
    if (b.rooms_screen && CONFIG.screens[b.rooms_screen]) navigate(b.rooms_screen);
    return;
  }
  heroGo(parseInt(fid.slice(5), 10) || 0);
}
function updateSpy() {
  const js = S.heroJumps || [];
  if (!js.length) return;
  if (S.heroPin) {
    if (Math.abs(grid.scrollTop - S.heroPin.top) < 4) {
      js.forEach((j, i) =>
        j.btn && j.btn.classList.toggle("active", i === S.heroPin.i));
      return;
    }
    S.heroPin = null;   // the user scrolled away — the spy takes over
  }
  const top = grid.getBoundingClientRect().top + 48;
  let active = 0;
  js.forEach((j, i) => { if (j.anchorEl.getBoundingClientRect().top <= top) active = i; });
  /* the bottom rule only means something on a page that SCROLLS
     (v0.68): when everything fits — common once a wide panel lays the
     same tiles out in 5 columns — scrollHeight === clientHeight, so
     this fired at rest and lit the LAST section while you were looking
     at the first. Latent on a 480 panel, where pages usually overflow. */
  if (grid.scrollHeight > grid.clientHeight + 4 &&
      grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 4)
    active = js.length - 1;             // scrolled to bottom → last section
  js.forEach((j, i) => j.btn && j.btn.classList.toggle("active", i === active));
}

function updateClock() {
  const el = document.getElementById("btime");
  if (el) el.textContent =
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
setInterval(updateClock, 20000);

/* Self-fitting hero: banner renders at its configured height, then
   shrinks (down to banner.min_height, default 96) to absorb grid
   overflow — so a whole number of tiles fits on any screen size. */
function fitBanner(sc) {
  if (!sc || !sc.banner) return;
  const bn = document.getElementById("banner");
  if (bn.classList.contains("hidden")) return;
  const maxH = parseInt(sc.banner.height) || 180;
  const minH = parseInt(sc.banner.min_height) || 120;
  bn.style.height = maxH + "px";
  /* fit:false = EXACT height, no tile-boundary snapping (the fold may
     cut a tile; scrolling reveals it) */
  if (sc.banner.fit === false) return;
  /* Align the fold to a tile boundary: if a tile straddles the bottom
     edge of the viewport, shrink the hero just enough to reveal that
     one tile fully — never collapse further than that. */
  const gb = grid.getBoundingClientRect().bottom;
  let delta = 0;
  grid.querySelectorAll(".tile").forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < gb && r.bottom > gb) delta = Math.max(delta, r.bottom - gb);
  });
  if (delta > 0)
    bn.style.height = Math.max(minH, maxH - Math.ceil(delta) - 6) + "px";
}
function scheduleFit() {
  const sc = () => CONFIG && screenOf(S.screen);
  requestAnimationFrame(() => fitBanner(sc()));
  setTimeout(() => fitBanner(sc()), 400);   // re-fit after fonts settle
}
window.addEventListener("resize", () => scheduleFit());

/* STATUS-LINE TOKENS (v0.79 — review: "the Status Line can be
   smarter. A text box with a drop down of available attributes"):
   {curly} tokens in a sub_text substitute the tile entity's LIVE
   attributes — "{media_title}" follows the track, "{state}" the
   state — and re-render with every state diff like any sub. Plain
   text passes through untouched. */
function subTextOf(txt, eid) {
  if (txt.indexOf("{") < 0) return txt;
  const s2 = st(eid);
  return txt.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => {
    if (k === "state") return s2.s == null ? "" : String(s2.s);
    const v = s2.a[k];
    return v == null ? "" : String(v);
  });
}

/* ================================================================
   WIDE LAYOUT (v0.68). The rule in one sentence: a screen's declared
   `columns` is a statement about how big a TILE is, not a count to
   obey at every width.

   THE HARDWARE is the reference, not the old 520 cap: the Astrion and
   the Haptique are 480 wide, so that is the width every tile size in
   this config was actually judged at. 480 minus 24px of grid padding
   and a 10px gap is 223px per tile in a 2-column grid — the size the
   whole design is tuned to and the size a fingertip expects. Hand that
   same tile size a 1280-wide tablet and you get 5 columns: identical
   physical tiles, more of them. A room page (declared `columns: 1`,
   tiles ~456px) becomes 2 columns of rows — exactly the landscape
   layout that was previously unsayable.

   Using 520 here instead costs real quality at 1024: a room page lands
   one pixel-pair short of two columns and renders a single 1000px row.
   Measured, not guessed.

   Nothing here runs unless html.wide is set, so compact panels — both
   remotes, every phone, any window under the gate — take the original
   path and render byte-identically.

   Why the count is computed here and not by CSS `auto-fill`: (1)
   `minmax(0, 1fr)` has to survive or a long label bursts the viewport
   (v0.27), and auto-fill needs a real px minimum instead; (2) the span
   rule below needs to KNOW the count. */
function navigate(screenId, isBack) {
  /* leaving the screen ends the pad borrow (padClear lives in
     input.js — later in the build, hence the guard) */
  if (typeof padClear === "function") padClear();
  /* CROSS-WORKSPACE DOORWAY (v0.50.2 — Suresh: "a nav tile on main
     porch page that takes me to deck and vice versa"): a `ws:<id>`
     target switches WORLDS by canonical address — the browser leaves
     for /local/harmonium/<id>/index.html (a peek: nothing pinned).
     In the Studio preview, changing the iframe's world would desync
     the editor — flash instead. */
  if (typeof screenId === "string" && screenId.startsWith("ws:")) {
    const w = screenId.slice(3).trim();
    if (!w) return;
    if (typeof PREVIEW !== "undefined" && PREVIEW) {
      flashBar("Opens workspace '" + w + "' on the real remote");
      return;
    }
    const tail = new RegExp("/" + WS + "/index\\.html$");
    location.href = tail.test(location.pathname)
      ? location.pathname.replace(tail, "/" + w + "/index.html")
      : location.pathname.replace(/index\.html$/, w + "/index.html");
    return;
  }
  /* LIBRARY CANONICALIZATION (v0.47.4 — Suresh: "The apps drawer
     doesn't work"): a bare ref to a screen that now lives in the
     controller LIBRARY (the apps drawer moved there so it travels
     into every workspace) resolves to its controller: address —
     heals every stale {navigate: apps} in deployed configs. */
  if (!screenOf(screenId) && screenOf("controller:" + screenId))
    screenId = "controller:" + screenId;
  const sc = screenOf(screenId);           // config screen or detail:<entity>
  if (!sc) return;
  if (S.screen && !isBack && screenId !== S.screen) S.stack.push(S.screen);
  releaseCapture(); clearConfirm();
  S.screen = screenId;
  /* THE REVIEW PANEL FOLLOWS (v0.79.1 — Suresh: "add a light, but
     visible wash to the soft remote keys that are active on the
     page"): in the Studio preview, every landing is reported to the
     parent, so the soft remote can wash the keys THIS page answers.
     One postMessage per navigation; kiosks never set PREVIEW. */
  if (typeof PREVIEW !== "undefined" && PREVIEW)
    parent.postMessage({ type: "harmonium_screen", screen: screenId },
      location.origin);
  document.getElementById("screenName").textContent = barTitle(sc);
  /* (the v0.35 title-bar input button lived one day — a bar icon is a
     fingertip-hostile target on a remote. The source_select ROLE +
     Source tile replaced it, v0.36.) */
  /* MUSIC TYPE SCOPE (v0.52.1 — Suresh: "set Primary and Secondary
     font for the music player separately"): screens declaring
     font_scope: music read --font-m1/--font-m2 (they follow the
     global pair unless the theme sets them) */
  document.getElementById("app").classList.toggle("scr-music",
    (sc.font_scope || "") === "music");
  renderBanner(sc);
  /* DECLARED vs RENDERED columns (v0.68). `decl` is what the config
     says — the author's statement of tile size, and the thing ROW-NESS
     and SPAN are measured against. `cols` is what actually fits. On a
     compact panel they are always equal and this is the old code. */
  /* NOT EVERY PAGE WANTS THE WHOLE TABLE (v0.68). A controller is a
     STACK of full-width bands — now playing, transport, volume — and
     scaling it faithfully just yields a stretched stack: 1256px of
     band, 84px tall, around a play button. `max_width` lets such a
     page say so and stay a centred column, while the room pages and
     the library take everything they can get. Declared, because only
     the page knows whether its width means "a wall" or "a column".
     Applied BEFORE the count, because it IS the width tiles fit into. */
  /* VIEW TUNING (v0.85.8 — Suresh: "I don't want to fork the base.
     This should be a run-time knob I can tune… even if for now it's a
     json setting in advanced on the activity"). An activity may carry
       "views": { "<page id>": { "columns": 3, "tile_width": 150 } }
     — grid keys spread OVER the page's own grid block whenever this
     page draws as that activity. The stock page is never edited: no
     fork, no heal fight, no lock. Per-activity by nature — the same
     shared apps drawer can be 2-up for the TV and 3-up elsewhere.
     Any grid key works: columns, tile_width, tile_h, row_h,
     tile_style, max_width. */
  const vAid = renderActivityId();
  const vAll = (vAid && (CONFIG.activities[vAid] || {}).views) || {};
  /* the key is the page id as the Studio shows it — accept the
     canonical controller: spelling too */
  const vTune = vAll[S.screen] ||
    vAll[String(S.screen).replace(/^controller:/, "")];
  const g = vTune ? Object.assign({}, sc.grid || {}, vTune) : (sc.grid || {});
  const maxW = isWide() && +g.max_width > 0 ? +g.max_width : 0;
  /* PADDING, NOT max-width + auto MARGINS. Measured, and it cost an
     hour: #grid is a flex item in a COLUMN flex container, where auto
     margins on the cross axis OVERRIDE align-items: stretch — the grid
     stopped filling its parent and collapsed to its own content width
     (320px inside a 1280px page) instead of capping at 760. Symmetric
     padding caps the content column while the element still stretches,
     and it leaves the scroll track at the screen edge where a thumb
     expects it. */
  const pad = maxW
    ? Math.max(12, Math.round(((window.innerWidth || REF_W) - maxW) / 2)) : 0;
  grid.style.paddingLeft = grid.style.paddingRight = pad ? pad + "px" : "";
  const usable = usableWidth(maxW);
  const decl = g.columns || 2;
  const cols = colsFor(decl, g.tile_width, usable);
  /* minmax(0,1fr): columns may shrink below content min-width, so a
     wide tile (trail + long label) can never burst the viewport */
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  /* PER-SCREEN SIZE KNOBS (v0.75 — Suresh: "We should have a setting
     somewhere for grid size and tile mode size"). `columns` says how
     MANY; these say how TALL: grid.tile_h re-pins --tile-h (cards)
     and grid.row_h re-pins --tile-row-h (list rows) for THIS screen
     only. Inline on #grid so the theme's global knobs keep every
     other screen; removed when absent so a size can never leak into
     the next page. The band-1 bar (#brbar) sits outside #grid and is
     deliberately untouched. */
  const gTileH = parseInt(g.tile_h);
  const gRowH = parseInt(g.row_h);
  if (gTileH > 0) grid.style.setProperty("--tile-h", gTileH + "px");
  else grid.style.removeProperty("--tile-h");
  if (gRowH > 0) grid.style.setProperty("--tile-row-h", gRowH + "px");
  else grid.style.removeProperty("--tile-row-h");
  /* ROW-NESS IS DECLARED, NOT ARITHMETIC (v0.68). It used to be
     `cols === 1`, which made "two columns of rows" — the obvious
     landscape layout for a room page — literally unsayable: asking for
     a second column silently converted the rows to cards. Row-ness is
     a TILE STYLE decision; the column count is a fitting decision.
     They were the same expression by accident. `tile_style: row|card`
     states it outright, and the fallback reads the DECLARED count so
     every existing page keeps its look at any width. */
  const rowOf = (styleDecl, declCols) =>
    styleDecl ? styleDecl === "row" : declCols === 1;
  const row = rowOf(g.tile_style, decl);
  grid.innerHTML = "";
  const sections = sc.sections || [{ tiles: sc.tiles || [] }];
  const heroJumps = [];
  /* BROWSE BANDS (v0.50): a section containing a browse tile sends
     its OTHER tiles to the fixed bar (band 1) — the grid carries
     items only. _active re-arms per render via the generator. */
  S.browse._active = false;
  S.browse.barTiles = [];
  sections.forEach(sec => {
    if (sec.enabled === false) return;   // switched off in the Studio
    let secTiles = sec.tiles;
    if (secTiles.some(x => x.type === "browse")) {
      S.browse.barTiles = secTiles.filter(x => x.type !== "browse");
      secTiles = secTiles.filter(x => x.type === "browse");
    }
    /* sectionDressTile FIRST (v0.85.7): the section's style defaults
       (h / css_vars / label_pos / style) reach every tile that stays
       silent — this render walk AND rawTilesOf both dress, so the
       DOM build and the renderStates re-derivation agree. */
    const vis = surfOrderTiles(secTiles.map(t => sectionDressTile(t, sec)))
      .reduce((a, t) => a.concat(expandTile(t)), [])   /* no flatMap: floor 61 */
      .map(surfDressTile).filter(visibleTile);
    if (!vis.length) return;
    /* BROWSE LIST VIEW (v0.71): a generator may stamp `brRow` on its
       tiles (the browse view toggle does). Rows want ONE column —
       a dense list is one axis, which is also what a D-pad wants —
       so the section gets its own single-column host, leaving every
       other section's layout untouched. */
    const brList = vis.some(x => x.brRow);
    /* grid2 (v0.83.1): browse tiles may ask for a TWO-wide host —
       the list's one-column narrowing trick, one notch looser */
    const brCols = !brList && ((vis.find(x => x.brCols) || {}).brCols || 0);
    let anchorEl = null;
    /* SECTION-HEADING BANDS (v0.83.7 — "Presets should also have a
       label field (PRESETS) as should DEVICES"): those two bands ARE
       their section headings, so the Controller tab's label override
       lands on the heading — typed text renames it, "" removes it. */
    let secTitle = sec.title;
    {
      const scB = screenOf(S.screen);
      if (scB && (scB.class === "activity" || scB.type === "controller")) {
        const curB = renderActivityId();
        const actB = curB && (CONFIG.activities || {})[curB];
        const blB = actB && actB.surface && actB.surface.band_labels;
        if (blB) {
          const bandB = secTiles.some(x => x.type === "presets") ? "presets"
            : secTiles.some(x => x.type === "devices") ? "devices" : null;
          if (bandB && typeof blB[bandB] === "string") secTitle = blB[bandB];
        }
      }
    }
    if (secTitle) {
      const h = document.createElement("div");
      h.className = "shead"; h.textContent = secTitle;
      grid.appendChild(h);
      anchorEl = h;
    }
    /* a section may declare its own tile size; absent, it inherits the
       screen's — declared AND rendered, so spans scale consistently */
    const secDecl = sec.columns || decl;
    const secCols = sec.columns
      ? colsFor(sec.columns, sec.tile_width, usable) : cols;
    const secRow = rowOf(sec.tile_style || (sec.columns ? null :
      (sc.grid && sc.grid.tile_style)), secDecl);
    let host = grid;
    if (sec.columns || brList || brCols) {
      host = document.createElement("div");
      host.className = "secgrid";
      host.style.gridTemplateColumns =
        `repeat(${brList ? 1 : brCols || secCols}, minmax(0, 1fr))`;
      grid.appendChild(host);
      anchorEl = anchorEl || host;
    }
    /* CARD GROUPS (entity-controls Phase 3 — design-card-group-focus):
       members sharing a non-empty card_group in THIS rendered section
       merge into one .cardgrp wrapper — first member anchors (its
       span is the card's footprint), authored order holds, later
       same-group tiles join the card at the anchor's position. The
       wrapper is presentation only: each member keeps its #tile_<id>
       element, so the focus walk, ring, and capture see ordinary
       tiles. An adapter with no row form renders standalone. */
    const cgHosts = {};
    vis.forEach(t => {
      const sp = spanOf(t, secDecl, secCols);
      const el = makeTile(t, t.brRow != null ? !!t.brRow : secRow, sp);
      const gid = typeof t.card_group === "string" && t.card_group &&
        tileGroupable(t) ? t.card_group : null;
      if (!gid) {
        host.appendChild(el);
        anchorEl = anchorEl || el;
        return;
      }
      let g = cgHosts[gid];
      if (!g) {
        g = cgHosts[gid] = document.createElement("div");
        g.className = "cardgrp" + (sp >= 2 ? " span2" : "");
        if (sp > 2) g.style.gridColumn = "span " + sp;
        host.appendChild(g);
      }
      g.appendChild(el);
      anchorEl = anchorEl || g;
    });
    /* v0.85.7 (Suresh: "ChUp and ChDn should jump sections. Since we
       have them."): a TITLED section is a jump stop too — CH▲▼ can
       step it. Only hero_label sections become visible chips in the
       banner strip (chip: false rides along so buildHeroNav skips
       the tab without breaking the shared index space). */
    if (sec.hero_label || secTitle)
      heroJumps.push({ label: sec.hero_label || secTitle,
        firstId: vis[0].id, anchorEl, chip: !!sec.hero_label });
  });
  /* EMPTY-PAGE HINT (v0.47.1 — Suresh: "blank controller in browser"):
     a page with nothing to render says WHY instead of showing void —
     a pure controller waits for an activity; a hub waits for content.
     …except when the BROWSE BAR is up (v0.67.2): search with nothing
     typed yet is an empty grid ON PURPOSE — the query line and the
     keyboard above it ARE the page, and "add tiles in the Studio"
     would be a lie. */
  if (!grid.children.length && !(S.browse && S.browse._active)) {
    const hint = document.createElement("div");
    const isCtrl = sc.class === "activity" || sc.type === "controller" ||
      sc.view_kind === "controller";
    hint.textContent = isCtrl
      ? "No activity is active — start one from its room page and this player fills in."
      : "Nothing here yet — add activities or tiles to this page in the Studio, then Save & Deploy.";
    hint.style.cssText = "grid-column:1/-1;padding:36px 16px;text-align:center;" +
      "opacity:.45;font-size:14px;line-height:1.5;";
    grid.appendChild(hint);
  }
  /* jumps ALWAYS register (CH▲▼/MENU step them even bannerless —
     the Apps drawer); the visible strip needs a banner with tabs on */
  buildHeroNav(heroJumps, !!(sc.banner && sc.banner.enabled !== false &&
    sc.banner.tabs !== false));
  /* fresh page = top of page (v0.53 — the grid keeps its scrollTop
     across innerHTML swaps, so the PREVIOUS page's scroll position
     leaked into this one, eating the top padding); initial_focus
     deeper in the page still scrolls to itself via setFocus */
  grid.scrollTop = 0;
  const all = tilesOf(sc);
  /* NO DEFAULT FOCUS ON TV PAGES (2026-08-24 — Suresh: "On TV we
     should default to no tile selected. Because there is no OK until
     we engage the channel buttons"). On a passthrough page the dpad
     drives the television, so OK does nothing to a panel tile — a
     focus ring there would be a lie. The ring appears only when Ch±
     lends the pad to the panel (padArm reveals it) and clears when the
     borrow lapses (padStrip). Ring visible ⇔ claim active, on TV pages.
     Guarded: padOwner/padLatched live in input.js, later in the build. */
  const tvNoFocus = typeof padOwner === "function" && padOwner() === "device"
    && !(typeof padLatched === "function" && padLatched());
  setFocus(tvNoFocus ? null : (sc.initial_focus || (all[0] && all[0].id)));
  /* focus_context (v0.85.7 — the queue's ask): a screen whose
     initial_focus is deep in a list positions it as ~the third
     visible row instead of "nearest" (which parked the playing
     track at the bottom edge, clipped by the strips). */
  if (sc.focus_context && S.focusId) {
    const cel = focusEl(S.focusId);
    if (cel && cel.closest("#grid")) gridScrollTo(cel, "context");
  }
  S.tileSig = tileSig(sc);          // set BEFORE renderStates (see below)
  renderStates();
  scheduleFit();
  /* global back affordance: chevron in the status bar iff history */
  document.getElementById("backBtn").classList.toggle("hidden", !S.stack.length);
  updateBarChrome();
  if (typeof browseBar === "function") browseBar();
  /* passthrough cue: accent rule + gamepad glyph while the physical
     D-pad drives the device (and hold-Back/Home send device keys) */
  const pt = passthroughActive();
  document.getElementById("bar").classList.toggle("pt", pt);
  document.getElementById("ptIc").classList.toggle("hidden", !pt);
  /* §7 TV Back/Home strip: rides the same passthrough gate — on a TV
     page the physical Back/Home drive the device, so Harmonium's pair
     lives on this pinned strip. Absent on non-TV pages (the physical
     buttons and the touch bar chrome already do that job). */
  const tvstrip = document.getElementById("tvstrip");
  if (tvstrip) {
    tvstrip.classList.toggle("hidden", !pt);
    document.getElementById("app").classList.toggle("tvstrip-on", pt);
  }
  if (S.connected) subscribeFor(screenId);
}

/* app-level bar chrome (v0.48.1 — Suresh: "In a browser, how do I turn
   off the activity? Or Go Back a page? Or go home?"): Home + End live
   in the title bar on TOUCH clients; physical-key remotes have real
   keys, so the bar stays clean there. End shows while an activity is
   current (select or pending) and rides the standard confirm flow.
   (2026-08-26: a "show on any touch-capable remote" variant was
   tried and REVERTED at Suresh's call — hardware remotes keep the
   clean bar; ending there is hold-Power or hold on the tile.) */
function updateBarChrome() {
  const touchOnly = !CAPS.has("physical_dpad");
  const home = document.getElementById("homeBtn");
  const end = document.getElementById("endBtn");
  if (!home || !end) return;
  /* THE HOME BUTTON FOLLOWS THE HOME WALK (v0.86 — Suresh: porch is
     the BOOT VIEW, the overview "home" page is HOME — FINAL STOP; the
     old test hid the button on the boot view, so a browser standing
     on porch had no way UP to the overview it had just built). Hide
     it only where the walk itself has nowhere to go: standing on
     main_home (the final stop), or a workspace with no higher stop —
     the same parent → boot-view → main_home ladder the physical Home
     key and the edge swipe already walk. A config with no main_home
     behaves exactly as before (hidden on the boot view). */
  const scr = screenOf(S.screen) || {};
  const mh = (CONFIG.global || {}).main_home;
  const hdest = (mh && S.screen === mh) ? null
    : (scr.parent && screenOf(scr.parent)) ? scr.parent
    : S.screen !== CONFIG.home_screen ? CONFIG.home_screen
    : mh;
  const canHome = !!(hdest && screenOf(hdest) && hdest !== S.screen);
  home.classList.toggle("hidden", !touchOnly || !canHome);
  end.classList.toggle("hidden", !(touchOnly && currentActivityId()));
}

function renderStates() {
  const sc = screenOf(S.screen);
  if (!sc) return;
  updateBarChrome();
  /* generated tiles (presets_from) are STRUCTURAL: when their source
     attribute changes the tile set itself changes, so patch-in-place
     isn't enough — re-render the grid. Rare (favorites edit), cheap. */
  const sig = tileSig(sc);
  if (sig !== S.tileSig) {
    S.tileSig = sig;
    /* KEEP THE FOCUS through a structural re-render (2026-08-20 —
       caught on the new spkgrp tiles: unjoining a member hid the
       Group Volume tile, the sig changed, and the walk snapped back
       to the first row mid-interaction). Same screen, same tile
       still present → the highlight stays put; a tile that vanished
       falls back to initial_focus as before. */
    const keep = S.focusId;
    navigate(S.screen, true);
    const sc2 = screenOf(S.screen);
    if (keep && sc2 && tilesOf(sc2).some(t => t.id === keep)) setFocus(keep);
    return;
  }
  tilesOf(sc).forEach(t => {
    const el = document.getElementById("tile_" + t.id);
    const w = WIDGETS[t.type];
    if (!el || !w) return;
    const eid = resolveEntity(t.entity);
    /* STATUS LINE OVERRIDE (v0.78.2 — Suresh, of his favorites
       button: "I don't [want] it to say Pressed 5 min ago, at least
       not in this case"): a tile-level sub_text beats the widget's
       smart summary — "" included, which means "no status line".
       Presentation (presApply) is the setter today. */
    el.querySelector(".sub").textContent =
      typeof t.sub_text === "string" ? subTextOf(t.sub_text, eid)
        : typeof w.sub === "function" ? w.sub(eid, t) : "";
    el.classList.toggle("on", !!(w.isOn && w.isOn(eid, t)));
    el.classList.toggle("confirm", S.confirmTile === t.id);
    const m = el.querySelector(".meter");
    if (m && w.meter && eid) {
      m.classList.remove("hidden");
      m.firstElementChild.style.width = Math.round(w.meter(eid, t) * 100) + "%";
    }
    el.querySelector(".hint").textContent = w.captureHint || "";
    if (w.render) w.render(el, eid, t);   // widget-managed dynamic body
  });
  /* a card group whose members are ALL hidden is chrome — hide the
     wrapper too, so it neither draws an empty skin nor traps the
     walk's geometry (design-card-group-focus §5) */
  grid.querySelectorAll(".cardgrp").forEach(g => {
    let any = false;
    for (let i = 0; i < g.children.length; i++)
      if (g.children[i].classList.contains("tile") &&
          !g.children[i].classList.contains("hidden")) { any = true; break; }
    g.classList.toggle("hidden", !any);
  });
}

/* (v0.32's perfInfo flash retired v0.80.5 — ⓘ now opens the diag:
   PAGE, which carries everything the flash said plus the viewport
   ground truth the flash never could. See core/diag.js.) */
function perf() {
  /* boot time is FROZEN at first paint (it's a boot metric, not an
     uptime counter); msgs and device stay live */
  document.getElementById("perf").textContent =
    (S.bootMs != null ? S.bootMs : Math.round(performance.now() - T0)) + "ms · " +
    S.msgCount + " msgs · " + (S.deviceName || "");
}
setInterval(() => { if (S.painted) perf(); }, 5000);
function dot(ok) { document.getElementById("dot").classList.toggle("ok", ok); }

function barTitle(sc) {
  /* v0.67: the ROOM name follows the room you are in — a screen may
     name its own, and a shared controller inherits it from the
     activity that sent you there. `global.room` is the fallback, so a
     one-room workspace reads exactly as before. */
  const aidR = renderActivityId();
  const aR = aidR && CONFIG.activities[aidR];
  const rvS = aR && aR.room_view && (CONFIG.screens || {})[aR.room_view];
  const room = sc.room_name || (rvS && rvS.room_name) || (CONFIG.global || {}).room;
  /* a screen the ACTIVE activity navigates to titles by the activity
     ("Watch Fire TV"), not the library label ("TV Media Player") */
  let name = sc.name;
  const aid = currentActivityId();
  const a = aid && CONFIG.activities[aid];
  if (a && a.screen === S.screen) name = a.name || name;
  return room && name !== room ? room + " · " + name : name;
}
/* flashBar(msg)            — 3s neutral notice
   flashBar(msg, tone, ms)  — confirm prompt: tone "off" pulses red
   (something is about to turn OFF), "on" pulses accent (about to
   turn ON / start); ms matches the confirm window. The bar title is
   too small to carry a warning on a remote, so the tone ALSO pulses
   the screen's MAJOR tile — the first tile in the grid. */
function cfmTone(el, tone) {
  if (!el) return;
  el.classList.remove("cfm-off", "cfm-on");
  if (tone) el.classList.add("cfm-" + tone);
}
function cfmClear() {
  cfmTone(document.getElementById("screenName"), null);
  cfmTone(flashBar._tile, null);
  flashBar._tile = null;
}
function flashBar(msg, tone, ms, tile) {
  const el = document.getElementById("screenName");
  el.textContent = msg;
  cfmClear();
  if (tone) {
    cfmTone(el, tone);
    /* WHICH tile pulses (v0.70.1): the one the caller names — the
       tile UNDER THE FINGER for a routed-play confirm. The old
       first-tile default stands for status-bar confirms (power),
       where "the screen's major tile" is the right cue; for a browse
       result mid-scroll it pulsed something off-screen and the tap
       read as dead (field report: "clicking doesn't do anything"). */
    flashBar._tile = tile || grid.querySelector(".tile");
    cfmTone(flashBar._tile, tone);
  }
  clearTimeout(flashBar._t);
  flashBar._t = setTimeout(() => {
    cfmClear();
    const sc = screenOf(S.screen);
    el.textContent = sc ? barTitle(sc) : "";
  }, ms || 3000);
}

