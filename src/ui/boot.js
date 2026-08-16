/* ================================================================
   Auth overlay + boot
   ================================================================ */
/* FLEX-GAP PROBE (compat): Chromium < 84 silently ignores `gap` on a
   flex container — controls render flush together. Detect it once and
   mark the document; styles/compat.css carries margin fallbacks scoped
   under html.nogap, so a modern engine (Astrion, Haptique, desktop)
   never matches a single one of them and renders exactly as before.
   Deliberately ES5 — this must run on the oldest webview we support. */
(function () {
  try {
    var p = document.createElement("div");
    /* NB: no height:0 — it clamps scrollHeight to 0 and the probe then
       reports "unsupported" on every engine, including modern ones. */
    p.style.cssText = "display:flex;flex-direction:column;row-gap:1px;" +
                      "position:absolute;visibility:hidden;top:-9999px";
    p.appendChild(document.createElement("div"));
    p.appendChild(document.createElement("div"));
    (document.body || document.documentElement).appendChild(p);
    var supported = p.scrollHeight === 1;
    p.parentNode.removeChild(p);
    if (!supported) document.documentElement.classList.add("nogap");
  } catch (e) { /* probe must never break boot */ }
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
    if (!iHeld) navigate(S.screen === "diag:" ? (CONFIG.home_screen || "") : "diag:");
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
    if (!host) { $("authErr").textContent = "Host required (e.g. 192.168.1.87:8123)"; return; }
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
      } catch { return; }               /* transient — keep polling */
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
     .../index.html#host=192.168.1.87:8123&token=LLAT
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
    PREVIEW = clean(prov.get("preview")) === "1";
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
    history.replaceState(null, "", loaded.ws + "/index.html");
  applyConfig(loaded.cfg, localStorage.getItem("hakr_device"));
  if (loaded.missed)
    flashBar("Workspace '" + loaded.missed + "' not deployed — using main", "off");
  connect();
})();
