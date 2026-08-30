/* ================================================================
   DIAGNOSTICS — the diag: virtual screen (v0.80.5 — Suresh, after
   three rounds of scrcpy-vs-preview viewport triangulation and a
   chrome://inspect that refused to discover the remote: "Should we
   use this moment to create a diagnostics page?"). Yes. The device
   answers for itself, on its own screen — no adb, no DevTools, no
   screenshots. Tap ⓘ in the bar (hold ⓘ stays Key capture); also
   reachable as nav target `diag:` and from the Studio's Showing
   dropdown. For the beta this is the page a stranger reads back to
   us; for the skin it is ground truth: the PANEL band's viewport
   line is the number `remotes.<id>.skin.viewport` wants.
   Readout tiles are the keycap hint-tile shape (preset, no-op
   action); Refresh re-navigates in place.
   ================================================================ */

/* the engine's own version — bump alongside PROJECT.md's changelog
   (the config carries its own version; the ENGINE never had one on
   screen until the diag page needed a place to say it) */
const ENGINE_V = "0.85.8";

function diagRow(id, icon, label, sub) {
  return { id, type: "preset", span: 2, icon: "material:" + icon,
    label, sub_label: sub, action: {} };
}

/* the sign-out widget: first select ARMS (standard confirm chrome +
   window), second select within TIMING.confirm burns the token and
   reloads — which boots the Pair screen. The host is KEPT so the
   pair form comes prefilled. Registered LAZILY from diagScreen():
   core/ files load before widgets/registry.js in the build order,
   so WIDGETS does not exist yet at this file's parse time. */
function diagRegisterWidgets() {
  if (WIDGETS.diagout) return;
  WIDGETS.diagout = {
    sub: (e, t) => S.confirmTile === t.id
      ? "tap again to sign out" : (t.sub_label || ""),
    select: (e, t) => {
      if (!localStorage.getItem("hakr_token")) {
        flashBar("No token stored — already signed out");
        return;
      }
      if (S.confirmTile !== t.id) {
        S.confirmTile = t.id;
        clearTimeout(S.confirmTimer);
        S.confirmTimer = setTimeout(() => {
          S.confirmTile = null; renderStates();
        }, TIMING.confirm);
        renderStates();
        return;
      }
      clearTimeout(S.confirmTimer); S.confirmTile = null;
      localStorage.removeItem("hakr_token");
      location.reload();
    },
  };
}

function diagScreen() {
  diagRegisterWidgets();
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  const scr = (window.screen || {});
  const cfg = (typeof CONFIG !== "undefined" && CONFIG) || {};
  const host = localStorage.getItem("hakr_host") || location.host || "(same origin)";
  const tok = !!localStorage.getItem("hakr_token");

  /* --- band 1: THE PANEL — the skin's ground truth --- */
  /* THIS REMOTE'S IP first (v0.85.7 — Suresh: "Put the ip address in
     the page (near the top)"). A webview can't learn its own LAN
     address, but HA sees the caller on every request — the
     integration's /api/harmonium/whoami just says it back. Fetched
     once per boot, cached on S; the row re-renders when it lands.
     The sub-line is the practical reason the number is here: Fully's
     remote admin (the sanctioned door to its settings) lives at
     http://<this ip>:2323. */
  if (S.myIp === undefined) {
    S.myIp = null;                                  // fetch in flight
    const base = localStorage.getItem("hakr_host")
      ? location.protocol + "//" + localStorage.getItem("hakr_host") : "";
    fetch(base + "/api/harmonium/whoami", {
      headers: { Authorization: "Bearer " + (localStorage.getItem("hakr_token") || "") },
      cache: "no-store",
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        S.myIp = (j && j.ip) || "";
        if (S.screen === "diag:") navigate("diag:", true);
      })
      .catch(function () { S.myIp = ""; });
  }
  /* THE ADDRESS THIS REMOTE SHOULD BOOT (v0.85.7 — Suresh: "what is
     the correct url for the astrion? where in the app do we show
     it?"). A kiosk has no address bar, so ⓘ says it: the workspace
     STUB path, main included — it version-checks on every boot, so
     a webview never wakes up on a stale cached engine. */
  const engUrl = (localStorage.getItem("hakr_host")
    ? location.protocol + "//" + localStorage.getItem("hakr_host")
    : (location.origin && location.origin !== "null" ? location.origin : "")) +
    "/local/harmonium/" +
    ((typeof WS !== "undefined" && WS) || "main") + "/index.html" +
    /* round 2 (Suresh: "previously you told me the url should append
       the device — is this no longer the case?"): both are true —
       #device= is a provisioning pin (stored, then stripped), so the
       bare stub works once pinned. Showing the FULL form here makes
       the ⓘ row copy-paste complete: configured in a kiosk it
       re-pins every boot and survives cleared storage. */
    (S.deviceName && S.deviceName !== "default"
      ? "#device=" + encodeURIComponent(S.deviceName) : "");
  const panel = [
    diagRow("dg_ip", "lan",
      "This remote · " + (S.myIp ? S.myIp : S.myIp === null ? "…" : "unknown"),
      S.myIp ? "Fully remote admin: http://" + S.myIp + ":2323"
             : "asking Home Assistant for this device's address"),
    diagRow("dg_url", "link", "This page · " + engUrl,
      "point a kiosk/webview at exactly this address — it re-checks the engine version on every boot"),
    diagRow("dg_vp", "aspect_ratio", "Viewport " + window.innerWidth + " × " + window.innerHeight,
      "CSS px · the number a Studio skin's viewport wants"),
    diagRow("dg_dpr", "grid_4x4", "Pixel ratio " + dpr,
      "physical " + (scr.width != null ? scr.width + " × " + scr.height : "unknown") +
      " · " + (window.innerWidth > window.innerHeight ? "landscape" : "portrait")),
    /* the RUNTIME's version (2026-08-22, Suresh: a sideloaded webview
       is invisible — "make it writ large... else new users are DOA"):
       the UA names the Chromium the webview really is. Stock Astrion
       = 61 (the engine's syntax floor); a sideloaded Android System
       WebView shows its own number here. */
    diagRow("dg_wv", "public",
      "WebView Chromium " + ((navigator.userAgent.match(/Chrom(e|ium)\/([0-9.]+)/) || [])[2] || "unknown"),
      "the engine's runtime · stock Astrion ships 61 · see hardware-keys"),
  ];

  /* --- BATTERY (v0.84.8 — Suresh: "can we build battery level into
     our info page"). The number comes from HOME ASSISTANT, not from
     the webview: Fully's JS interface is deliberately off in our own
     Fully profile (remotes/fully/README — "the engine talks to HA
     directly"), and navigator.getBattery() needs a secure context,
     which a plain http:// LAN install is not. The Fully Kiosk HA
     integration already publishes both facts, and the battery-alerts
     blueprint already consumes them — so this reads the SAME source
     the alert does rather than inventing a second truth.
       remotes.<id>.battery_sensor   e.g. sensor.<device>_battery
       remotes.<id>.charging_sensor  e.g. binary_sensor.<device>_plugged_in
     Naming the entities on the TILE subscribes them through the normal
     entitiesFor path, and diagScreen re-runs on every renderStates, so
     the row is live rather than a snapshot. Silent when unconfigured —
     a remote with no sensor simply has no row. */
  const prof = (cfg.remotes || {})[S.deviceName] || {};
  if (prof.battery_sensor) {
    const braw = st(prof.battery_sensor).s;
    const pct = braw != null && braw !== "" && !isNaN(+braw)
      ? Math.round(+braw) : null;
    const charging = prof.charging_sensor
      ? st(prof.charging_sensor).s === "on" : false;
    const icon = charging ? "battery_charging_full"
      : pct == null ? "battery_unknown"
      : pct <= 15 ? "battery_alert"
      : pct <= 50 ? "battery_5_bar" : "battery_full";
    const row = diagRow("dg_batt", icon,
      "Battery " + (pct == null ? "—" : pct + "%") +
        (charging ? " · charging" : ""),
      pct == null ? prof.battery_sensor + " · no reading yet"
        : prof.battery_sensor);
    row.entity = prof.battery_sensor;
    if (prof.charging_sensor) row.entities = [prof.charging_sensor];
    panel.push(row);
  }

  /* --- band 2: THE BUILD --- */
  const build = [
    diagRow("dg_ver", "conveyor_belt", "Engine v" + ENGINE_V,
      (S.bootMs != null ? S.bootMs : Math.round(performance.now() - T0)) + "ms boot"),
    diagRow("dg_cfg", "description", "Config v" + (cfg.version != null ? cfg.version : "?") +
      " · workspace " + (typeof WS !== "undefined" ? WS : "main"),
      Object.keys(cfg.screens || {}).length + " pages · " +
      Object.keys(cfg.controllers || {}).length + " controllers · " +
      Object.keys(cfg.activities || {}).length + " activities"),
    diagRow("dg_dev", "settings_remote", "Profile '" + (S.deviceName || "default") + "'",
      [...(typeof CAPS !== "undefined" ? CAPS : [])].join(" · ") +
      " · " + Object.keys(typeof KEYMAP !== "undefined" ? KEYMAP : {}).length + " keys mapped"),
  ];

  /* --- band 3: THE LINK --- */
  const link = [
    diagRow("dg_ha", S.connected ? "cloud_done" : "cloud_off",
      S.connected ? "Connected" : "Offline",
      host + " · " + S.msgCount + " msgs · token " + (tok ? "stored" : "MISSING")),
  ];

  /* --- band 4: tools --- */
  const tools = [
    { id: "dg_refresh", type: "preset", span: 2, icon: "material:refresh",
      label: "Refresh", sub_label: "re-read every number on this page",
      action: {}, navigate: "diag:" },
    { id: "dg_keys", type: "preset", span: 2, icon: "material:keyboard",
      label: "Key capture", sub_label: "learn what the physical buttons send",
      action: {}, navigate: "keys:" },
    /* SIGN OUT & RE-PAIR (v0.81.1 — Suresh, testing pairing: "the
       astrion seems to be authed!" — of course: a provisioned kiosk
       carries its token in localStorage and never sees the overlay.
       This is the door OUT: two-tap confirm — the engine's standard
       confirm chrome — then the token burns and the reload boots to
       the Pair screen. Pairs with revoking the old token in the HA
       profile for a full de-authorization.) */
    { id: "dg_out", type: "diagout", span: 2, icon: "material:logout",
      label: "Sign out & re-pair",
      sub_label: tok ? "forgets this remote's token · tap twice"
        : "no token stored — already signed out" },
    diagRow("dg_ua", "public", "Browser",
      (navigator.userAgent || "").slice(0, 120)),
  ];

  /* --- band 0: THE KEY-MAP CARD (spec §10.1) — what the physical
     buttons do on the page you came from, snapshotted at ⓘ-tap time
     (openKeymapCard in input.js). Present only when entered via ⓘ. --- */
  const kc = (typeof S !== "undefined" && S.keymapCard) || null;
  const keys = kc && kc.rows && kc.rows.length
    ? kc.rows.map((r, i) => diagRow("dg_k" + i, "keyboard_command_key", r.k, r.d))
    : null;

  /* section order (v0.85.7 — Suresh: "The info page has got
     annoying. Move all the keys to the bottom"): status first, the
     key map LAST — it is the longest band and it was burying
     everything else on every ⓘ tap. */
  const sections = [
    { title: "The panel", hero_label: "The panel", tiles: panel },
    { title: "The build", hero_label: "The build", tiles: build },
    { title: "Home Assistant", hero_label: "Home Assistant", tiles: link },
    { title: "Tools", hero_label: "Tools", tiles: tools }];
  if (keys) sections.push({ title: "Keys on " + kc.page,
    hero_label: "Keys here", tiles: keys });

  return {
    name: "Diagnostics", class: "group", view_kind: "diag",
    grid: { columns: 1, max_width: 760 },
    sections: sections,
  };
}
