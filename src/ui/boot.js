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
    if (pHost) localStorage.setItem("hakr_host", pHost);
    if (pTok) localStorage.setItem("hakr_token", pTok);
    if (pDev) localStorage.setItem("hakr_device", pDev);
    if (pDbg === "1") localStorage.setItem("hakr_debug", "1");
    else if (pDbg === "0") localStorage.removeItem("hakr_debug");
    if (pHost || pTok || pDev || pDbg) history.replaceState(null, "", location.pathname);
  }
  try {
    CONFIG = await loadConfig();
  } catch (err) {
    document.getElementById("screenName").textContent = "⚠ " + err.message;
    return;
  }
  /* device profile: ?device=<name> > Fully-kiosk sniff > "default" */
  let devName = localStorage.getItem("hakr_device");
  if (!devName && window.fully && CONFIG.devices)
    devName = Object.keys(CONFIG.devices).find(k => CONFIG.devices[k].fully) || null;
  DEVICE = (CONFIG.devices || {})[devName] || (CONFIG.devices || {}).default || {};
  S.deviceName = devName || "default";
  CAPS = new Set(DEVICE.capabilities || ["touch", "pointer"]);
  KEYMAP = DEVICE.keymap || CONFIG.keymap || KEYMAP;
  applyTheme(CONFIG.theme);
  dbgInit();
  navigate(CONFIG.home_screen);
  connect();
})();
