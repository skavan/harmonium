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
  /* PER-SCREEN SIZE KNOBS (v0.75 — Suresh: "We should have a setting
     somewhere for grid size and tile mode size"). `columns` says how
     MANY; these say how TALL: grid.tile_h re-pins --tile-h (cards)
     and grid.row_h re-pins --tile-row-h (list rows) for THIS screen
     only. Inline on #grid so the theme's global knobs keep every
     other screen; removed when absent so a size can never leak into
     the next page. The band-1 bar (#brbar) sits outside #grid and is
     deliberately untouched. */
  const gTileH = sc.grid && parseInt(sc.grid.tile_h);
  const gRowH = sc.grid && parseInt(sc.grid.row_h);
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
    /* BROWSE LIST VIEW (v0.71): a generator may stamp `brRow` on its
       tiles (the browse view toggle does). Rows want ONE column —
       a dense list is one axis, which is also what a D-pad wants —
       so the section gets its own single-column host, leaving every
       other section's layout untouched. */
    const brList = vis.some(x => x.brRow);
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
    if (sec.columns || brList) {
      host = document.createElement("div");
      host.className = "secgrid";
      host.style.gridTemplateColumns =
        `repeat(${brList ? 1 : secCols}, minmax(0, 1fr))`;
      grid.appendChild(host);
      anchorEl = anchorEl || host;
    }
    vis.forEach(t => {
      const el = makeTile(t, t.brRow != null ? !!t.brRow : secRow,
        spanOf(t, secDecl, secCols));
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

