/* ================================================================
   Auth overlay + boot
   ================================================================ */
function showAuth(err) {
  document.getElementById("auth").classList.remove("hidden");
  document.getElementById("authErr").textContent = err || "";
  const hostIn = document.getElementById("hostIn");
  hostIn.value = localStorage.getItem("hakr_host") ||
    (location.protocol.startsWith("http") ? location.host : "");
}
document.getElementById("backBtn").addEventListener("click", () => act("back"));
document.getElementById("connectBtn").addEventListener("click", () => {
  const host = document.getElementById("hostIn").value.trim();
  const token = document.getElementById("tokenIn").value.trim();
  if (!host || !token) return showAuth("Host and token required");
  localStorage.setItem("hakr_host", host);
  localStorage.setItem("hakr_token", token);
  document.getElementById("auth").classList.add("hidden");
  connect();
});

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
  if (!devName && window.fully && CONFIG.devices)
    devName = Object.keys(CONFIG.devices).find(k => CONFIG.devices[k].fully) || null;
  DEVICE = (CONFIG.devices || {})[devName] || (CONFIG.devices || {}).default || {};
  S.deviceName = devName || "default";
  CAPS = new Set(DEVICE.capabilities || ["touch", "pointer"]);
  KEYMAP = DEVICE.keymap || CONFIG.keymap || KEYMAP;
  applyTheme(CONFIG.theme);
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
  applyConfig(loaded.cfg, localStorage.getItem("hakr_device"));
  if (loaded.missed)
    flashBar("Workspace '" + loaded.missed + "' not deployed — using main", "off");
  connect();
})();
