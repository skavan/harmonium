/* ================================================================
   Rendering
   ================================================================ */
const grid = document.getElementById("grid");

function iconHtml(t, row) {
  let inner;
  if (t.icon_image) inner = `<img src="${t.icon_image}" alt="">`;
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
  if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 4)
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

function makeTile(t, row) {
  const el = document.createElement("div");
  el.className = "tile wgt-" + t.type + (row ? " row" : "") + (!row && +t.span === 2 ? " span2" : "");
  el.id = "tile_" + t.id;
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
    el.classList.add("has-trail");
    const tr = document.createElement("button");
    tr.className = "trail";
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
  const sc = screenOf(screenId);           // config screen or detail:<entity>
  if (!sc) return;
  if (S.screen && !isBack && screenId !== S.screen) S.stack.push(S.screen);
  releaseCapture(); clearConfirm();
  S.screen = screenId;
  document.getElementById("screenName").textContent = barTitle(sc);
  /* (the v0.35 title-bar input button lived one day — a bar icon is a
     fingertip-hostile target on a remote. The source_select ROLE +
     Source tile replaced it, v0.36.) */
  renderBanner(sc);
  const cols = (sc.grid && sc.grid.columns) || 2;
  /* minmax(0,1fr): columns may shrink below content min-width, so a
     wide tile (trail + long label) can never burst the viewport */
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  const row = cols === 1;
  grid.innerHTML = "";
  const sections = sc.sections || [{ tiles: sc.tiles || [] }];
  const heroJumps = [];
  sections.forEach(sec => {
    const vis = sec.tiles.flatMap(expandTile).filter(visibleTile);
    if (!vis.length) return;
    let anchorEl = null;
    if (sec.title) {
      const h = document.createElement("div");
      h.className = "shead"; h.textContent = sec.title;
      grid.appendChild(h);
      anchorEl = h;
    }
    const secCols = sec.columns || cols;
    const secRow = secCols === 1;
    let host = grid;
    if (sec.columns) {
      host = document.createElement("div");
      host.className = "secgrid";
      host.style.gridTemplateColumns = `repeat(${sec.columns}, minmax(0, 1fr))`;
      grid.appendChild(host);
      anchorEl = anchorEl || host;
    }
    vis.forEach(t => {
      const el = makeTile(t, secRow);
      host.appendChild(el);
      anchorEl = anchorEl || el;
    });
    if (sec.hero_label)
      heroJumps.push({ label: sec.hero_label, firstId: vis[0].id, anchorEl });
  });
  /* jumps ALWAYS register (CH▲▼/MENU step them even bannerless —
     the Apps drawer); the visible strip needs a banner with tabs on */
  buildHeroNav(heroJumps, !!(sc.banner && sc.banner.enabled !== false &&
    sc.banner.tabs !== false));
  const all = tilesOf(sc);
  setFocus(sc.initial_focus || (all[0] && all[0].id));
  S.tileSig = tileSig(sc);          // set BEFORE renderStates (see below)
  renderStates();
  scheduleFit();
  /* global back affordance: chevron in the status bar iff history */
  document.getElementById("backBtn").classList.toggle("hidden", !S.stack.length);
  /* passthrough cue: accent rule + gamepad glyph while the physical
     D-pad drives the device (and hold-Back/Home send device keys) */
  const pt = passthroughActive();
  document.getElementById("bar").classList.toggle("pt", pt);
  document.getElementById("ptIc").classList.toggle("hidden", !pt);
  if (S.connected) subscribeFor(screenId);
}

function renderStates() {
  const sc = screenOf(S.screen);
  if (!sc) return;
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
  flashBar((S.bootMs ?? Math.round(performance.now() - T0)) + "ms boot · " +
    S.msgCount + " msgs · device " + (S.deviceName || "default") +
    " · " + (S.connected ? "connected" : "offline"));
}
function perf() {
  /* boot time is FROZEN at first paint (it's a boot metric, not an
     uptime counter); msgs and device stay live */
  document.getElementById("perf").textContent =
    (S.bootMs ?? Math.round(performance.now() - T0)) + "ms · " +
    S.msgCount + " msgs · " + (S.deviceName || "");
}
setInterval(() => { if (S.painted) perf(); }, 5000);
function dot(ok) { document.getElementById("dot").classList.toggle("ok", ok); }

function barTitle(sc) {
  const room = (CONFIG.global || {}).room;
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
