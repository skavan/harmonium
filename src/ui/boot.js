/* ================================================================
   Auth overlay + boot
   ================================================================ */
/* FLEX-GAP PROBE (compat): Chromium < 84 silently ignores `gap` on a
   flex container — controls render flush together. Detect it once and
   mark the document; styles/compat.css carries margin fallbacks scoped
   under html.nogap, so a modern engine (Astrion, Haptique, desktop)
   never matches a single one of them and renders exactly as before.
   Deliberately ES5 — this must run on the oldest webview we support. */
/* THE OVAL PLAY BUTTON, SOLVED (v0.83.8 — P1 #9, Suresh's DevTools
   dig: "html.nogap .trow > * + * { margin-left: 26px }" live on a
   modern Chrome). The old probe measured two ZERO-height divs with
   row-gap:1px and read scrollHeight===1 as "supported". But an
   iframe inside a display:none subtree gets NO LAYOUT AT ALL —
   scrollHeight 0 — which is exactly where the Studio's preview
   engine boots on a hard refresh (the pane starts hidden). 0 ≠ 1 →
   "unsupported" → nogap forever → margin fallbacks stacked ON TOP
   of the working gap → the transport row overflowed and the play
   circle squashed (71×84, no flex-shrink guard). A preview ↻
   reloads with the pane visible, the probe reads 1, and the oval
   "fixes itself" — the whole two-week ghost. Now the divs have real
   heights so the three states are distinguishable: 3 = gap works ·
   2 = gap ignored (genuine old webview) · 0 = no layout yet — in
   which case we RETRY until layout exists instead of guessing wrong
   once and forever. */
(function () {
  function measure() {
    try {
      var p = document.createElement("div");
      p.style.cssText = "display:flex;flex-direction:column;row-gap:1px;" +
                        "position:absolute;visibility:hidden;top:-9999px";
      var a = document.createElement("div");
      var b = document.createElement("div");
      a.style.height = "1px";
      b.style.height = "1px";
      p.appendChild(a);
      p.appendChild(b);
      (document.body || document.documentElement).appendChild(p);
      var h = p.scrollHeight;
      p.parentNode.removeChild(p);
      return h;
    } catch (e) { return 3; }   /* probe must never break boot */
  }
  var tries = 0;
  (function run() {
    var h = measure();
    if (h === 0) {              /* hidden — no layout to measure yet */
      if (tries++ < 600) setTimeout(run, 100);
      return;                   /* give up silently = modern default */
    }
    if (h < 3) document.documentElement.classList.add("nogap");
  })();
})();

/* ================================================================
   THE SIZE CLASS (v0.68 — Suresh: "A simple way to handle landscape
   mode tablets where we have a lot of real estate that is unused.")

   ONE gate, TWO dimensions. Width alone is not enough: a phone in
   landscape is ~844×390 and would sail past any width-only test, then
   be handed a layout meant for 800px of height.

       wide = width >= 840 AND height >= 600

   Measured against the hardware that matters: the **Astrion and the
   Haptique are both 480×800 portrait**, so they miss on width by
   360px — not a near thing, a chasm. Landscape phones miss on height.
   A 1280×800 tablet clears both, as does every iPad in landscape.

   And note what 480×800 vs 1280×800 means: the panels are the SAME
   HEIGHT. Nothing vertical changes — not the hero, not the tile
   height, not the fold. This whole feature is horizontal.

   Deliberately ES5 and deliberately tolerant: a panel that can't
   answer the question keeps today's layout, which is the right
   failure. */
function wideProbe() {
  try {
    var w = window.innerWidth || 0, h = window.innerHeight || 0;
    return w >= 840 && h >= 600;
  } catch (e) { return false; }
}
(function () {
  var apply = function () {
    var el = document.documentElement;
    var on = wideProbe();
    if (on === el.classList.contains("wide")) return;    /* no churn */
    if (on) el.classList.add("wide"); else el.classList.remove("wide");
    /* the column count is computed in JS (colsFor), so crossing the
       gate must re-render — CSS alone cannot do it */
    if (typeof CONFIG !== "undefined" && CONFIG &&
        typeof S !== "undefined" && S.screen &&
        typeof navigate === "function") navigate(S.screen, true);
  };
  apply();
  var t = null;
  var soon = function () { clearTimeout(t); t = setTimeout(apply, 150); };
  window.addEventListener("resize", soon);
  window.addEventListener("orientationchange", soon);
})();

/* STRETCHED-FIRST-PAINT HEDGE (v0.83.7 — beta-gaps P1 #9, never
   reproduced headless: "Still getting stretched transport bar").
   Whatever the trigger is, a refresh cures it — which points at
   layout measured BEFORE late-arriving resources (fonts) settle.
   One forced re-render when the font set is done loading costs
   nothing and covers that whole class. */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () {
    setTimeout(function () {
      if (typeof CONFIG !== "undefined" && CONFIG &&
          typeof S !== "undefined" && S.screen &&
          typeof navigate === "function") navigate(S.screen, true);
    }, 50);
  });
}

function showAuth(err) {
  document.getElementById("auth").classList.remove("hidden");
  document.getElementById("authErr").textContent = err || "";
  const hostIn = document.getElementById("hostIn");
  hostIn.value = localStorage.getItem("hakr_host") ||
    (location.protocol.startsWith("http") ? location.host : "");
}
document.getElementById("backBtn").addEventListener("click", () => act("back"));
/* browser chrome (v0.48.1): app-level Home + End-activity in the bar */
document.getElementById("homeBtn").addEventListener("click", () => act("home"));
/* the §7 TV Back/Home strip (2026-08-24): Harmonium's own back/home on
   TV pages, where the physical pair now drives the device. Touch only —
   act(..., false) takes the Harmonium (UI) path, never the device. */
document.getElementById("tvBack").addEventListener("click", () => act("back", false));
document.getElementById("tvHome").addEventListener("click", () => act("home", false));

/* EDGE-SWIPE DEPTH NAVIGATION (spec §8, 2026-08-24): left edge → right
   = up to the parent; right edge → left = down into the page's detail.
   Vertical is always scroll. Touch/pen only, and EDGE-ANCHORED so a
   swipe never fights a slider drag or the vertical scroll. Swipes are
   always Harmonium's — never routed to the device (touch drives the UI,
   even on TV passthrough pages). No target → a rubber-band, so a swipe
   into nothing springs back instead of reading as a missed gesture. */
(function () {
  var sx = 0, sy = 0, edge = 0, tracking = false;
  var EDGE = 28, DIST = 55, RATIO = 1.4;
  function detailTarget(sc) {
    if (!sc) return null;
    if (sc.detail) return sc.detail;                 // explicit key wins
    /* else derive from the first tile's trailing navigate — stock TV
       (→ apps) and music (→ library) get swipe-left for free */
    var secs = sc.sections || (sc.tiles ? [{ tiles: sc.tiles }] : []);
    for (var i = 0; i < secs.length; i++) {
      var ts = secs[i].tiles || [];
      for (var j = 0; j < ts.length; j++) {
        var tr = ts[j] && ts[j].trailing;
        if (tr && tr.action && tr.action.navigate) return tr.action.navigate;
      }
    }
    return null;
  }
  function rubber(sign) {
    var g = document.getElementById("grid");
    if (!g) return;
    g.classList.remove("rubber-l", "rubber-r");
    void g.offsetWidth;                               // restart the animation
    g.classList.add(sign > 0 ? "rubber-r" : "rubber-l");
  }
  document.addEventListener("pointerdown", function (e) {
    tracking = false;
    if (e.pointerType === "mouse") return;            // gestures are touch/pen
    var w = window.innerWidth;
    edge = (e.clientX <= EDGE) ? 1 : (e.clientX >= w - EDGE) ? -1 : 0;
    if (!edge) return;
    sx = e.clientX; sy = e.clientY; tracking = true;
  }, true);
  document.addEventListener("pointerup", function (e) {
    if (!tracking) return;
    tracking = false;
    if (!CONFIG || !S.screen) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < DIST || Math.abs(dx) < Math.abs(dy) * RATIO) return; // vertical = scroll
    var sc = screenOf(S.screen) || {};
    if (edge === 1 && dx > 0) {                        // left edge → right: parent
      var par = (sc.parent && screenOf(sc.parent)) ? sc.parent
        : (S.screen !== CONFIG.home_screen ? CONFIG.home_screen
          : (CONFIG.global && CONFIG.global.main_home));
      if (par && screenOf(par) && par !== S.screen) { S.stack = []; navigate(par, true); }
      else rubber(1);
    } else if (edge === -1 && dx < 0) {                // right edge → left: detail
      var d = detailTarget(sc);
      if (d && screenOf(d)) navigate(d); else rubber(-1);
    }
  }, true);
})();
document.getElementById("endBtn").addEventListener("click", () => {
  endCurrentActivity();
  renderStates();
});
/* ⓘ: tap = the DIAGNOSTICS page (v0.80.5 — the perf flash grew up:
   viewport/dpr ground truth, build, connection, all on one D-pad
   scrollable screen; also nav target diag:) · HOLD 550ms = the KEY
   CAPTURE screen (v0.55 — also reachable as nav target keys:) */
{
  const info = document.getElementById("info");
  let iT = null, iHeld = false;
  info.addEventListener("pointerdown", () => {
    iHeld = false;
    clearTimeout(iT);
    iT = setTimeout(() => { iHeld = true; navigate("keys:"); }, 550);
  });
  const iEnd = () => clearTimeout(iT);
  info.addEventListener("pointerup", iEnd);
  info.addEventListener("pointercancel", iEnd);
  info.addEventListener("pointerleave", iEnd);
  info.addEventListener("click", () => {
    if (!iHeld) {
      /* tap on diag toggles back home; tap elsewhere snapshots THIS
         page's key map (spec §10.1) then opens the diag/key-map card */
      if (S.screen === "diag:") navigate(CONFIG.home_screen || "");
      else if (typeof openKeymapCard === "function") openKeymapCard();
      else navigate("diag:");
    }
    iHeld = false;
  });
}
document.getElementById("connectBtn").addEventListener("click", () => {
  const host = document.getElementById("hostIn").value.trim();
  const token = document.getElementById("tokenIn").value.trim();
  if (!host || !token) return showAuth("Host and token required");
  localStorage.setItem("hakr_host", host);
  localStorage.setItem("hakr_token", token);
  document.getElementById("auth").classList.add("hidden");
  connect();
});

/* ---- PAIRING (v0.81 — beta-gaps §1: "The best way would be like
   bluetooth pairing. Does this code on screen match"). The remote
   opens an offer with the integration's unauthenticated broker,
   displays the code BIG, and polls. The STUDIO (an authenticated
   browser) shows the same code; on Approve it mints a long-lived
   token via auth/long_lived_access_token on its own websocket and
   hands it to the broker; our next poll collects it exactly once.
   Zero typing on this screen; the token lands in localStorage on
   the same shelf the manual path uses. ---- */
{
  const $ = id => document.getElementById(id);
  let pairSid = null, pairTimer = null, pairHost = "";
  const pairStop = () => { clearInterval(pairTimer); pairTimer = null; };
  const pairBack = msg => {
    pairStop();
    if (pairSid && pairHost)
      fetch(pairHost + "/api/harmonium/pair/" + pairSid, { method: "DELETE" })
        .catch(() => {});
    pairSid = null;
    $("pairWait").classList.add("hidden");
    $("authForm").classList.remove("hidden");
    $("authErr").textContent = msg || "";
  };
  const baseOf = host => {
    if (!host) return "";
    if (/^https?:\/\//.test(host)) return host.replace(/\/+$/, "");
    /* bare host:port — match the page's scheme so LAN http and
       proxied https both work */
    const scheme = location.protocol === "https:" ? "https" : "http";
    return scheme + "://" + host;
  };
  $("pairBtn").addEventListener("click", async () => {
    const host = $("hostIn").value.trim();
    if (!host) { $("authErr").textContent = "Host required (e.g. homeassistant.local:8123)"; return; }
    pairHost = baseOf(host);
    $("authErr").textContent = "";
    let made;
    try {
      const r = await fetch(pairHost + "/api/harmonium/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: S.deviceName || "remote" }),
      });
      if (r.status === 429) { $("authErr").textContent = "Pairing is busy — try again in a minute"; return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      made = await r.json();
    } catch (err) {
      $("authErr").textContent = "Can't reach " + host +
        " — is the Harmonium integration installed? (" + err.message + ")";
      return;
    }
    pairSid = made.session;
    $("authForm").classList.add("hidden");
    $("pairWait").classList.remove("hidden");
    $("pairCode").textContent = made.code;
    $("pairHint").textContent = "Waiting for approval…";
    pairTimer = setInterval(async () => {
      let out;
      try {
        const r = await fetch(pairHost + "/api/harmonium/pair/" + pairSid,
          { cache: "no-store" });
        out = await r.json();
      } catch (e) { return; }           /* transient — keep polling.
           NOTE the binding: bare `catch {` is ES2019 (Chromium 66+)
           and the SYNTAX FLOOR is Chromium 61 — the stock Astrion
           webview (61.0.3163.98, fleet-verified 2026-08-21). One
           bare catch = white screen on a virgin unit. */
      if (out.status === "approved") {
        pairStop(); pairSid = null;
        localStorage.setItem("hakr_host", host);
        localStorage.setItem("hakr_token", out.token);
        $("pairHint").textContent = "Paired ✓";
        $("auth").classList.add("hidden");
        connect();
      } else if (out.status === "denied") {
        pairBack("Pairing was denied in the Studio");
      } else if (out.status === "gone") {
        pairBack("The offer expired — pair again");
      }
    }, 2000);
  });
  $("pairCancel").addEventListener("click", () => pairBack(""));
}

/* ---- Studio preview mode (v0.14) ----------------------------------
   #preview=1 puts the engine under a PARENT'S control (the Harmonium
   Studio): the config arrives by postMessage instead of fetch, and can
   be re-injected on every edit for a live WYSIWYG preview. Messages
   are same-origin only. The kiosk never sets the flag — inert there.
     parent → engine:
       { type: "harmonium_config", config, device? }   apply + render
       { type: "harmonium_key", key }                  synthetic keydown/up
     engine → parent:
       { type: "harmonium_ready" }                     listener installed
       { type: "harmonium_applied", screen }           config rendered */
let PREVIEW = false;
let WS_PEEK = null;   // #ws=<id>&pin=0 — this load only, no pinning
let PAGE_JUMP = null; // #page=<id> — deep link, this load only
let BOOT_V = null;    // the ?v= engine hash this load booted with

/* ENGINE SELF-UPDATE (v0.85.7 — Suresh: "Are you sure about your
   never reload again? I find I have to clear cache and reload from
   fully in HA, to get it to stick."). The versioned stub address
   guarantees a fresh engine on every pass through the Start URL —
   but it never made a RUNNING webview take that pass, and Fully's
   plain Reload reloads the current page, not the Start URL. So the
   engine closes the loop itself: whenever the socket (re)connects or
   the page wakes from hidden, ask the integration for the deployed
   engine's fingerprint (no-store, same endpoint the stub uses) and,
   if it differs from the hash this page booted with, re-enter
   through the stub. The canonical-address rewrite below already
   makes location.reload() re-enter the stub, so the reload IS the
   upgrade. Guards: never in the PREVIEW (the Studio version-busts
   its own iframe); only when this load carried a ?v= (a bare boot
   has nothing to compare — and note every STUB boot is a pin=0
   "peek", so WS_PEEK must NOT gate this); one attempt per target
   hash (sessionStorage) so a racing deploy can never loop the
   page; checked at most once a minute. */
function engineUpdateCheck() {
  if (PREVIEW || !BOOT_V) return;
  const now = Date.now();
  if (engineUpdateCheck._t && now - engineUpdateCheck._t < 60000) return;
  engineUpdateCheck._t = now;
  const x = new XMLHttpRequest();
  x.open("GET", "/api/harmonium/engine_version?t=" + now, true);
  x.timeout = 5000;
  x.onreadystatechange = () => {
    if (x.readyState !== 4 || x.status !== 200) return;
    let v = null;
    try { v = JSON.parse(x.responseText).v; } catch (e) { return; }
    if (!v || v === BOOT_V) return;
    let tried = null;
    try { tried = sessionStorage.getItem("hakr_upg"); } catch (e) {}
    if (tried === v) return;   /* already went once for this target */
    try { sessionStorage.setItem("hakr_upg", v); } catch (e) {}
    location.reload();         /* the address bar is the stub — this
                                  re-resolves ?v= and boots the new engine */
  };
  try { x.send(); } catch (e) {}
}
function applyConfig(cfg, devName) {
  CONFIG = cfg;
  if (!devName) devName = localStorage.getItem("hakr_device");
  // v0.45: hardware profiles renamed devices -> remotes (devices is now
  // the bundle library); read remotes with a legacy-config fallback
  const REMOTES = CONFIG.remotes || CONFIG.devices || {};
  if (!devName && window.fully)
    devName = Object.keys(REMOTES).find(k => REMOTES[k].fully) || null;
  DEVICE = REMOTES[devName] || REMOTES.default || {};
  S.deviceName = devName || "default";
  CAPS = new Set(DEVICE.capabilities || ["touch", "pointer"]);
  KEYMAP = DEVICE.keymap || CONFIG.keymap || KEYMAP;
  /* HOLD-CH BACKSTOP (2026-08-19 — found the hard way: his house
     config's astrion profile predates the hold keys, and a profile
     keymap REPLACES the default wholesale, so KeyMapper's ' and /
     arrived to… nothing). ch_up_hold/ch_down_hold are ENGINE
     vocabulary tied to the shipped KeyMapper recipe — every profile
     gets them unless it says otherwise (only-if-absent: a profile
     that maps ' or / to something else keeps its mapping). */
  if (!("'" in KEYMAP)) KEYMAP["'"] = "ch_up_hold";
  if (!("/" in KEYMAP)) KEYMAP["/"] = "ch_down_hold";
  /* same story one day later for hold-◀/hold-▶ (the music field
     flip made them the track-skip keys): , and . are the shipped
     KeyMapper keycodes — COMMA/PERIOD — and every profile gets them
     unless it claims those keys itself. */
  if (!("," in KEYMAP)) KEYMAP[","] = "left_hold";
  if (!("." in KEYMAP)) KEYMAP["."] = "right_hold";
  /* v0.58: the REMOTE PROFILE may override presentation tokens on top
     of the theme — remotes.<id>.style is a plain map of CSS custom
     properties ({"bar-h":"100px"}). Same mechanism as the theme, one
     layer down, so a wall tablet and a hardware remote can disagree
     about chrome without forking a config. Applied AFTER the theme so
     the profile wins; an un-styled profile changes nothing. */
  applyTheme(Object.assign({}, CONFIG.theme || {}, DEVICE.style || {}));
  dbgInit();
  S.stack = [];
  /* preview re-injection keeps the screen being edited (falls back to
     home when it no longer exists); kiosk boot always lands home */
  const keep = PREVIEW && S.screen && screenOf(S.screen);
  navigate(keep ? S.screen : CONFIG.home_screen, true);
  if (S.connected) subscribeFor(S.screen);
}
function previewListen() {
  window.addEventListener("message", ev => {
    if (ev.origin !== location.origin) return;
    const m = ev.data || {};
    if (m.type === "harmonium_config" && m.config) {
      try {
        /* the Studio says which workspace the preview IS — service
           calls from the preview then run that workspace's sequences */
        WS = m.workspace || "main";
        applyConfig(m.config, m.device);
        parent.postMessage({ type: "harmonium_applied", screen: S.screen }, location.origin);
      } catch (err) {
        parent.postMessage({ type: "harmonium_error", message: String(err) }, location.origin);
      }
    } else if (m.type === "harmonium_navigate" && m.screen) {
      if (CONFIG && screenOf(m.screen)) {
        S.stack = [];
        navigate(m.screen, true);
      }
    } else if (m.type === "harmonium_preview_activity") {
      /* impersonate the activity being edited (null clears) */
      S.pvActivity = m.activity || null;
      if (CONFIG && S.screen) { navigate(S.screen, true); subscribeFor(S.screen); }
    } else if (m.type === "harmonium_key" && m.key) {
      const opts = { key: m.key, bubbles: true, cancelable: true };
      document.dispatchEvent(new KeyboardEvent("keydown", opts));
      document.dispatchEvent(new KeyboardEvent("keyup", opts));
    }
  });
  parent.postMessage({ type: "harmonium_ready" }, location.origin);
}

(async () => {
  /* one-time provisioning for kiosk devices — open:
     .../index.html#host=homeassistant.local:8123&token=LLAT
     (also accepted as ?host=…&token=… for loaders that drop fragments)
     Credentials are trimmed, stored to localStorage, and stripped from
     the URL, so you never type a token on a remote's keyboard. */
  {
    const prov = new URLSearchParams(
      (location.hash.length > 1 ? location.hash.slice(1) : "") + "&" +
      (location.search.length > 1 ? location.search.slice(1) : ""));
    const clean = v => (v || "").trim().replace(/^["']+|["']+$/g, "");
    const pHost = clean(prov.get("host")), pTok = clean(prov.get("token"));
    const pDev = clean(prov.get("device")), pDbg = clean(prov.get("debug"));
    const pWs = clean(prov.get("ws"));   // workspace pin (v0.34), like device
    /* pin=0 (v0.37): PEEK at a workspace without pinning this browser
       to it — the Studio's "open the running app" link uses it, so
       looking at Bedroom doesn't silently make this THE Bedroom
       remote. The hash stays put so a refresh stays on the peek. */
    const pPeek = clean(prov.get("pin")) === "0";
    /* DEEP LINK (v0.85.7 — forum: "is there a way to open subpages by
       URL? I have a main page that links to the different rooms"):
       #page=<page id> jumps to that page after load, THIS load only —
       nothing is pinned, so a bookmark per room just works in a
       browser and a kiosk stays on its normal flow. Composable with
       the other params (#ws=…&page=…). The id is the page id shown in
       the Studio; unknown ids flash a notice and land on home. */
    PAGE_JUMP = clean(prov.get("page")) || null;
    PREVIEW = clean(prov.get("preview")) === "1";
    BOOT_V = clean(prov.get("v")) || null;   /* the stub's ?v= — self-update baseline */
    if (pHost) localStorage.setItem("hakr_host", pHost);
    if (pTok) localStorage.setItem("hakr_token", pTok);
    if (pDev && !PREVIEW) localStorage.setItem("hakr_device", pDev);
    if (pWs && !PREVIEW && !pPeek) {
      if (pWs === "main") localStorage.removeItem("hakr_ws");
      else localStorage.setItem("hakr_ws", pWs);
    }
    if (pWs && pPeek) WS_PEEK = pWs;
    if (pDbg === "1") localStorage.setItem("hakr_debug", "1");
    else if (pDbg === "0") localStorage.removeItem("hakr_debug");
    if ((pHost || pTok || pDev || pDbg || (pWs && !pPeek)) && !PREVIEW)
      history.replaceState(null, "", location.pathname);
    if (PREVIEW) {
      /* Studio drives everything from here; still connect() so the
         preview renders LIVE states (token shared via same-origin
         localStorage with the sidebar remote) */
      document.getElementById("screenName").textContent = "waiting for Studio…";
      previewListen();
      connect();
      return;
    }
  }
  let loaded;
  try {
    loaded = await loadConfig(WS_PEEK || localStorage.getItem("hakr_ws"));
  } catch (err) {
    document.getElementById("screenName").textContent = "⚠ " + err.message;
    return;
  }
  WS = loaded.ws;
  /* CANONICAL ADDRESS v2 (v0.48.3 — Suresh: "it should be
     workspacename/index.html everywhere"): whatever door you came in
     through — bare engine path, stub, hidden pin — the address bar
     ends at <ws>/index.html, MAIN INCLUDED (main gets its own stub
     dir server-side). The bar always tells the truth about which
     world you're in; a refresh re-enters through the stub. Rewrite
     only when the loaded workspace is certain (never on fallback). */
  if (/\/index\.html$/.test(location.pathname) &&
      !location.pathname.endsWith("/" + loaded.ws + "/index.html") &&
      (!WS_PEEK || loaded.ws === WS_PEEK))
    history.replaceState(null, "", loaded.ws + "/index.html" +
      (PAGE_JUMP ? "#page=" + encodeURIComponent(PAGE_JUMP) : ""));
  applyConfig(loaded.cfg, localStorage.getItem("hakr_device"));
  if (PAGE_JUMP) {
    if ((CONFIG.screens || {})[PAGE_JUMP]) navigate(PAGE_JUMP);
    else flashBar("No page '" + PAGE_JUMP + "'", "off");
  }
  if (loaded.missed)
    flashBar("Workspace '" + loaded.missed + "' not deployed — using main", "off");
  /* THE BACK-KEY MOAT (v0.85.7 — Suresh: "On the Astrion, long press
     back seems to reload the page"). When a long-press falls through
     the shell's key mapping, the OS delivers a NATIVE Back — the
     webview pops browser history and the page unloads (a "reload"
     from the couch). Arm one sentinel entry so history-back always
     lands somewhere that is still us: the popstate re-arms itself
     and runs the panel's own Back instead. Desktop browser-back
     inside the remote does the same, which is what a remote wants. */
  try {
    history.pushState({ hakr: 1 }, "", location.href);
    window.addEventListener("popstate", function () {
      try { history.pushState({ hakr: 1 }, "", location.href); } catch (e2) {}
      if (typeof act === "function") act("back", true);
    });
  } catch (e3) {}
  connect();
})();
