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
const ENGINE_V = "0.83.8";

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
  const panel = [
    diagRow("dg_vp", "aspect_ratio", "Viewport " + window.innerWidth + " × " + window.innerHeight,
      "CSS px · the number a Studio skin's viewport wants"),
    diagRow("dg_dpr", "grid_4x4", "Pixel ratio " + dpr,
      "physical " + (scr.width != null ? scr.width + " × " + scr.height : "unknown") +
      " · " + (window.innerWidth > window.innerHeight ? "landscape" : "portrait")),
  ];

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

  return {
    name: "Diagnostics", class: "group", view_kind: "diag",
    grid: { columns: 1, max_width: 760 },
    sections: [
      { title: "The panel", hero_label: "The panel", tiles: panel },
      { title: "The build", hero_label: "The build", tiles: build },
      { title: "Home Assistant", hero_label: "Home Assistant", tiles: link },
      { title: "Tools", hero_label: "Tools", tiles: tools },
    ],
  };
}
