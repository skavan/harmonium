/* ================================================================
   Rendering
   ================================================================ */
const grid = document.getElementById("grid");

function iconHtml(t, row) {
  let inner;
  if (t.icon_image) inner = `<img src="${t.icon_image}" alt=""${t.icontain ? ' class="contain"' : ""}>`;
  else if (t.icon && t.icon.startsWith("material:"))
    inner = `<span class="ic material-symbols-outlined">${t.icon.slice(9)}</span>`;
  else inner = `<span class="ic">${t.icon || "•"}</span>`;
  return row ? `<div class="icwrap">${inner}</div>` : inner;
}

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
function buildHeroNav(jumps, strip) {
  S.heroJumps = jumps;
  S.heroAt = null;   // fresh page: stepping re-seeds from the spy
  const bn = document.getElementById("banner");
  bn.querySelectorAll(".hstrip").forEach(x => x.remove());
  grid.onscroll = null;
  if (!strip || bn.classList.contains("hidden") || !jumps.length) return;
  const stripEl = document.createElement("div");
  stripEl.className = "hstrip";
  jumps.forEach((j, i) => {
    const el = document.createElement("div");
    el.className = "hjump";
    el.dataset.fid = "hero_" + i;
    el.textContent = j.label;
    el.addEventListener("click", ev => { ev.stopPropagation(); heroGo(i); });
    stripEl.appendChild(el);
    j.btn = el;
  });
  bn.appendChild(stripEl);
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
  j.anchorEl.scrollIntoView({ block: "start" });
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
const REF_W = 480;        /* the panel this layout was authored on */
const GRID_PAD = 24;      /* #grid padding, both sides */
const GRID_GAP = 10;      /* --grid-gap default */
const MAX_COLS = 12;      /* a 4K monitor is not an invitation */
function isWide() { return document.documentElement.classList.contains("wide"); }
/* the tile size a declared column count implies at the reference
   width — or an explicit `tile_width`, which always wins */
function tileWidthOf(cols, declared) {
  const w = +declared;
  if (w > 0) return w;
  return (REF_W - GRID_PAD - (cols - 1) * GRID_GAP) / Math.max(1, cols);
}
/* the CONTENT width a grid has to fill — the viewport less padding,
   or the declared cap, whichever is smaller */
function usableWidth(maxW) {
  const vw = (window.innerWidth || REF_W) - GRID_PAD;
  return maxW > 0 ? Math.min(maxW, vw) : vw;
}
function colsFor(cols, declaredTileW, usable) {
  if (!isWide()) return cols;
  const tw = tileWidthOf(cols, declaredTileW);
  const u = usable || usableWidth(0);
  const n = Math.floor((u + GRID_GAP) / (tw + GRID_GAP));
  return Math.max(cols, Math.min(n, MAX_COLS));
}
/* SPAN IS A PROPORTION, NOT A COUNT (v0.68). `span: 2` was authored in
   a 2-column world, where it plainly meant "the whole row" — 39 tiles
   in the live config say so. Read literally at 5 columns it would mean
   "two fifths", which nobody wrote. So a span scales: span N of a
   declared C covers the same FRACTION of the real count, and N >= C
   means full width at any size. span 1 is never scaled — an ordinary
   tile is one column everywhere. */
function spanOf(t, declaredCols, actualCols) {
  const n = +t.span;
  if (!(n >= 2)) return 1;
  if (!isWide() || actualCols === declaredCols) return Math.min(n, actualCols);
  if (n >= declaredCols) return actualCols;              /* was full width */
  return Math.max(2, Math.min(actualCols,
    Math.round(n / declaredCols * actualCols)));
}
function makeTile(t, row, spanCols) {
  const el = document.createElement("div");
  const sp = spanCols || 1;
  el.className = "tile wgt-" + t.type + (row ? " row" : "") + (!row && sp === 2 ? " span2" : "") +
    (t.color ? " tacc" : "") + (t.brw ? " brw" : "") +
    /* chassis-level class passthrough (v0.68.1): a generator that needs
       one specific look — the search "Searching…" line — says so once
       instead of earning a widget type */
    (typeof t.cls === "string" && /^[\w -]+$/.test(t.cls) ? " " + t.cls : "");
  /* .span2 carries the common case in CSS so compact output is
     unchanged; any other width is stated inline */
  if (!row && sp > 2) el.style.gridColumn = "span " + sp;
  el.id = "tile_" + t.id;
  /* per-tile accent (v0.48.3): the activity's ACCENT paints its icon
     circle — see grid.css .tacc */
  if (t.color) el.style.setProperty("--tacc", t.color);
  const w = WIDGETS[t.type] || {};
  const extra = w.body ? w.body(t) : `<div class="meter hidden"><i></i></div>`;
  const body = `<div class="lbl">${t.label}</div>
    <div class="sub"></div>${extra}<div class="hint"></div>`;
  /* inline sub: value rides the title line (right-aligned) instead of
     burning a second line — widgets opt in via inlineSub (bool or fn) */
  const inline = !row && (w.inlineSub === true ||
    (typeof w.inlineSub === "function" && w.inlineSub(t)));
  el.innerHTML = row
    ? iconHtml(t, true) + `<div class="txt">${body}</div>`
    : `<div class="top">${iconHtml(t, false)}<span class="lbl">${t.label}</span>${
        inline ? '<span class="sub subin"></span>' : ""}</div>
       ${inline ? "" : '<div class="sub"></div>'}${extra}<div class="hint"></div>`;
  /* CORNER BADGE (v0.62): a tiny mark naming what a tile IS, for grids
     that MIX kinds — the browse "All" view sets it, and nothing else
     does yet. Chassis level, so any tile may declare one. */
  if (typeof t.badge === "string" && t.badge.startsWith("material:")) {
    const bd = document.createElement("span");
    bd.className = "bdg material-symbols-outlined";
    bd.textContent = t.badge.slice(9);
    el.appendChild(bd);
  }
  el.addEventListener("click", () => {
    if (el._heldFired) { el._heldFired = false; return; }
    setFocus(t.id); act("select");
  });
  /* touch LONG-PRESS: widgets that declare hold() get a 550ms pointer
     timer (a TOUCH gesture on the panel — the physical-remote hold
     doctrine, KeyMapper-owned, is untouched) */
  if (w.hold) {
    let hT = null, hX = 0, hY = 0;
    const clear = () => { if (hT) { clearTimeout(hT); hT = null; } };
    el.addEventListener("pointerdown", ev => {
      hX = ev.clientX; hY = ev.clientY; el._heldFired = false;
      clear();
      hT = setTimeout(() => { hT = null; el._heldFired = true; w.hold(t.entity, t); }, 550);
    });
    el.addEventListener("pointermove", ev => {
      if (hT && Math.hypot(ev.clientX - hX, ev.clientY - hY) > 12) clear();
    });
    el.addEventListener("pointerup", clear);
    el.addEventListener("pointercancel", clear);
    el.addEventListener("pointerleave", clear);
  }
  if (w.wire) w.wire(el, t);
  /* trailing action slot: chassis-level, any tile may declare one.
     Device tiles (detailable widgets whose entity has a detail
     generator) get an implicit settings trail → detail screen;
     set trailing: false in config to suppress it. */
  const trailing = trailingOf(t);
  if (trailing) {
    /* PROMINENCE IS DECLARED (v0.68.1 — Suresh, of the library button
       on Now Playing: "Lets try inverting the library launch button,
       to make it more prominent. And give it just a little more
       width."). A trail is a chassis slot used by every device tile's
       quiet ⚙ chevron, so inverting THE class would shout everywhere.
       `trailing.emphasis: "accent"` says which one earns it. */
    const acc = trailing.emphasis === "accent";
    el.classList.add("has-trail");
    if (acc) el.classList.add("has-trail-acc");
    const tr = document.createElement("button");
    tr.className = "trail" + (acc ? " tracc" : "");
    tr.dataset.fid = t.id + TRAIL;
    tr.innerHTML = iconHtml({ icon: trailing.icon || "material:chevron_right" }, false);
    tr.addEventListener("click", ev => {
      ev.stopPropagation();
      runAction(trailing.action);
    });
    el.appendChild(tr);
  }
  return el;
}

function navigate(screenId, isBack) {
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
  const maxW = isWide() && sc.grid && +sc.grid.max_width > 0
    ? +sc.grid.max_width : 0;
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
  const decl = (sc.grid && sc.grid.columns) || 2;
  const cols = colsFor(decl, sc.grid && sc.grid.tile_width, usable);
  /* minmax(0,1fr): columns may shrink below content min-width, so a
     wide tile (trail + long label) can never burst the viewport */
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
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
  const row = rowOf(sc.grid && sc.grid.tile_style, decl);
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
    const vis = secTiles.flatMap(expandTile).filter(visibleTile);
    if (!vis.length) return;
    let anchorEl = null;
    if (sec.title) {
      const h = document.createElement("div");
      h.className = "shead"; h.textContent = sec.title;
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
    if (sec.columns) {
      host = document.createElement("div");
      host.className = "secgrid";
      host.style.gridTemplateColumns = `repeat(${secCols}, minmax(0, 1fr))`;
      grid.appendChild(host);
      anchorEl = anchorEl || host;
    }
    vis.forEach(t => {
      const el = makeTile(t, secRow, spanOf(t, secDecl, secCols));
      host.appendChild(el);
      anchorEl = anchorEl || el;
    });
    if (sec.hero_label)
      heroJumps.push({ label: sec.hero_label, firstId: vis[0].id, anchorEl });
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
  setFocus(sc.initial_focus || (all[0] && all[0].id));
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
  if (S.connected) subscribeFor(screenId);
}

/* app-level bar chrome (v0.48.1 — Suresh: "In a browser, how do I turn
   off the activity? Or Go Back a page? Or go home?"): Home + End live
   in the title bar on TOUCH clients; physical-key remotes have real
   keys, so the bar stays clean there. End shows while an activity is
   current (select or pending) and rides the standard confirm flow. */
function updateBarChrome() {
  const touchOnly = !CAPS.has("physical_dpad");
  const home = document.getElementById("homeBtn");
  const end = document.getElementById("endBtn");
  if (!home || !end) return;
  home.classList.toggle("hidden",
    !touchOnly || S.screen === CONFIG.home_screen);
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
  if (sig !== S.tileSig) { S.tileSig = sig; navigate(S.screen, true); return; }
  tilesOf(sc).forEach(t => {
    const el = document.getElementById("tile_" + t.id);
    const w = WIDGETS[t.type];
    if (!el || !w) return;
    const eid = resolveEntity(t.entity);
    el.querySelector(".sub").textContent =
      typeof w.sub === "function" ? w.sub(eid, t) : "";
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
}

/* the ⓘ icon replaces the always-on perf clutter in the bar —
   tap it for boot/msgs/device/connection details (v0.32) */
function perfInfo() {
  flashBar((S.bootMs != null ? S.bootMs : Math.round(performance.now() - T0)) + "ms boot · " +
    S.msgCount + " msgs · device " + (S.deviceName || "default") +
    " · " + (S.connected ? "connected" : "offline"));
}
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
function flashBar(msg, tone, ms) {
  const el = document.getElementById("screenName");
  el.textContent = msg;
  cfmClear();
  if (tone) {
    cfmTone(el, tone);
    flashBar._tile = grid.querySelector(".tile");
    cfmTone(flashBar._tile, tone);
  }
  clearTimeout(flashBar._t);
  flashBar._t = setTimeout(() => {
    cfmClear();
    const sc = screenOf(S.screen);
    el.textContent = sc ? barTitle(sc) : "";
  }, ms || 3000);
}
