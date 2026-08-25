/* ================================================================
   TILES — the chassis

   One tile chassis for every widget: icon slot, label, sub, badge
   corners (kind / service / routing mark / system), trailing action
   zone, touch long-press, span arithmetic and column fitting. The
   per-domain widget adapters (widgets/*.js) fill the slots; nothing
   in here knows what a light or a Sonos is.
   ================================================================ */
function iconHtml(t, row) {
  let inner;
  if (t.icon_image) {
    /* ARTWORK FALLS BACK TO THE ICON (v0.68.7). Cover art is a REMOTE
       url — a Spotify CDN, a Sonos coordinator, an MA thumbnail. The
       panel is a wall tablet: the internet drops, a favorite is
       re-added under a new id, a coordinator reboots. A broken-image
       glyph where the album art was is the same failure as a blank
       panel, so the declared `icon` stays on the tile as the
       understudy — see the delegated error handler below. */
    const fb = t.icon && t.icon.startsWith("material:") ? t.icon.slice(9) : "";
    inner = `<img src="${t.icon_image}" alt=""` +
      (t.icontain ? ' class="contain"' : "") +
      (fb ? ` data-fbk="${fb}"` : "") + ">";
  } else if (t.icon && t.icon.startsWith("material:"))
    inner = `<span class="ic material-symbols-outlined">${t.icon.slice(9)}</span>`;
  else inner = `<span class="ic">${t.icon || "•"}</span>`;
  return row ? `<div class="icwrap">${inner}</div>` : inner;
}
/* `error` does not bubble, but it DOES capture — one document-level
   listener covers every tile ever rendered, with no per-image wiring
   and nothing to clean up on re-render. */
document.addEventListener("error", ev => {
  const im = ev.target;
  if (!im || im.tagName !== "IMG" || !im.parentNode) return;
  const fbk = im.getAttribute("data-fbk");
  if (!fbk) return;
  const s = document.createElement("span");
  s.className = "ic material-symbols-outlined";
  s.textContent = fbk;
  im.parentNode.replaceChild(s, im);
}, true);

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
  /* PER-TILE HEIGHT (v0.84.7 — forum request: "on the Watch TV
     controller pages I'd like to have a nearly full screen
     visualization with artwork for what's currently playing but I
     don't see a way to adjust just that card's height"). `span` said
     how WIDE a tile is; nothing said how TALL — height was a
     per-SCREEN knob (grid.tile_h / row_h), so one big Now Playing card
     beside normal ones was literally unsayable. `h` states it for THIS
     tile: a number = px, or a css length ("40vh", "12rem"). The
     per-screen knobs still carry every tile that stays silent. */
  var th = t.h;
  if (th != null && th !== "") {
    var hv = typeof th === "number" || /^\d+$/.test(String(th))
      ? parseInt(th, 10) + "px" : String(th);
    if (/^[\d.]+(px|vh|vw|rem|em|%)$/.test(hv)) {
      el.style.height = hv;
      el.style.setProperty("--tile-h", hv);   /* row-mode + inner sizing */
    }
  }
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
  /* ROUTING MARK (v0.70 — design-library-ui.md §5): a tiny amber
     hand-off glyph. This tile plays by EVICTING the cast player's
     queue; the mark is the visible half of the rule whose other half
     is the two-press confirm. Chassis-level like the badge; browse
     fallback results are the only setter today. */
  if (typeof t.mark === "string" && t.mark.startsWith("material:")) {
    const mk = document.createElement("span");
    mk.className = "mrk material-symbols-outlined";
    mk.textContent = t.mark.slice(9);
    el.appendChild(mk);
  }
  /* PROVENANCE, SPLIT (v0.73.2 — Suresh: "split this into two
     badges"): `src` = the SYSTEM that owns the id (SO/MA/HA, a
     two-letter mini badge, bottom-right); `svc` = the SERVICE the
     content came from (deezer/spotify/…, top-right, sliding inboard
     of a trailing ▶ when one occupies the corner). Chassis-level
     like the kind badge and the routing mark. */
  if (typeof t.src === "string" && /^[a-z]{1,3}$/.test(t.src)) {
    const sb = document.createElement("span");
    sb.className = "srcb";
    sb.textContent = t.src;
    el.appendChild(sb);
  }
  if (typeof t.svc === "string" && /^[a-z0-9]{1,10}$/.test(t.svc)) {
    const sv = document.createElement("span");
    sv.className = "svcb";
    sv.textContent = t.svc;
    el.appendChild(sv);
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
      /* the parent tile is the confirm cue for a routed play (v0.70.1) */
      runAction(trailing.action, el);
    });
    el.appendChild(tr);
  }
  return el;
}

