/* the pure half of the state layer — stock shapes, healers, the
   starter, the normalize chain (2026-08-17 split; see stocklib.js) */
import {
  GENERIC_MEDIA_CONTROLLER, DOMAIN_STOCKS, STOCK_APPS_DRAWER,
  STOCK_MUSIC_LIBRARY, STOCK_MUSIC, healStockGen, ensureStockControllers,
  starterConfig as starterConfigLib, normalizeNavTiles, stampHost,
  normalizeHosts, normalizeOffActivity, normalizeApps, ROLE_KEYS,
  isCastGroup, SHOWS_KINDS, compileContext, recompileContext,
  normalizeDevices, normalizeSelect as normalizeSelectLib,
  normalizeConfig as normalizeConfigLib,
} from "./stocklib.js";
export {
  GENERIC_MEDIA_CONTROLLER, DOMAIN_STOCKS, STOCK_APPS_DRAWER,
  STOCK_MUSIC_LIBRARY, STOCK_MUSIC, normalizeNavTiles, stampHost,
  normalizeHosts, normalizeOffActivity, normalizeApps, ROLE_KEYS,
  isCastGroup, SHOWS_KINDS, compileContext, recompileContext,
  normalizeDevices,
};
/* wrappers close over live state so every caller keeps its
   original signature */
export const starterConfig = () =>
  starterConfigLib($state.snapshot(app.draft) || {}, app.workspace);
export const normalizeSelect = (cfg) => normalizeSelectLib(cfg, app.workspace);
const normalizeConfig = (cfg) => normalizeConfigLib(cfg, app.workspace);

/* Harmonium Studio v2 — shared reactive state (Svelte 5 runes).
   Truth lives server-side (the integration's store); `draft` is the
   working copy; the PREVIEW is the real engine in #preview=1 mode and
   follows the draft on every valid edit. */

const API = "/api/harmonium/config";
const WS_API = "/api/harmonium/workspaces";

export const app = $state({
  saved: null,        // last server copy OF THE CURRENT WORKSPACE
  draft: null,        // working copy (deep-reactive; forms bind into it)
  selKey: null,       // selected nav slice ("room", "screens.tv", "activities", …)
  sandbox: false,     // integration absent → read-only fallback
  status: { msg: "loading…", cls: "" },
  problems: [],
  pvReady: false,
  device: "",         // preview-as device profile
  authOpen: false,
  authErr: "",
  unsaved: false,   // draft differs from last saved copy
  virgin: false,    // fresh install: store empty, editor holds the minted starter
  /* COLLAPSIBLE COLUMNS (s0.83.10 — Suresh: "hide/collapse columns…
     optimize workspace"): the nav and preview columns fold away so
     the editor gets the width. Header toggles, remembered per
     browser. The preview is HIDDEN, never unmounted — the engine
     iframe keeps its state. */
  navHide: localStorage.getItem("hakr_studio_nav_hide") === "1",
  pvHide: localStorage.getItem("hakr_studio_pv_hide") === "1",
  pvPulse: 0,       // bumps on every preview push (sync indicator)
  pvScreen: "",     // the screen the preview is showing (engine-reported)
  entities: [],       // live HA states for pickers: {entity_id, name, state}
  registry: {},       // entity_id → integration platform (WS entity registry)
  services: [],       // HA service catalog for pickers: {id, name}
  tab: "visual",      // central pane: "visual" | "code"
  /* WORKSPACES (v0.34): every server workspace is one remote's whole
     world, all live at once (main = the repo-built config.json; others
     deploy to config.<ws>.json). (v0.53: the browser-local "scratch"
     sandbox is gone — drafts + duplication cover it.) */
  workspace: "main",  // current workspace id
  workspaces: {},     // id → {name, file} from the server roster
  wsOrder: [],
  /* IMPORT ASKS FIRST (v0.83.8 follow-up — Suresh: "When I import a
     workspace it overrites main. It should give the choice."). A
     parsed import parks here and the dialog decides where it lands:
     { kind: "single", config, stamp, fname } or
     { kind: "bundle", order, workspaces: {id: {name, config}} } */
  importAsk: null,
  prevKey: null,      // last slice before the current one (Back on model pages)
  pending: null,      // in-flight ＋-minted action draft {seqId, kind, activityId, originKey}
  focusActivity: null, // activity card to re-open after returning from a draft
  focusDevice: null,  // device row the library page opens on arrival — the
                      // cast is a doorway (v0.60, Suresh: "If I click on a
                      // pre-wired item in the cast section, I should go to
                      // its editing page in Pre-Wired Devices")
  deviceReturn: null, // {key, label, activityId} — the way BACK out of that
                      // doorway. A shortcut you can't undo is a detour
                      // (v0.61, Suresh: "We need a *prominent* return to
                      // Bar>Activity Name … then it will feel like a
                      // shortcut")
  /* ADVANCED MODE (redesign): the generalized machinery — raw widget
     types, JSON escape hatches — lives behind this switch (NavPane
     bottom). Persisted per browser. */
  advanced: typeof localStorage !== "undefined" &&
    localStorage.getItem("hakr_studio_adv") === "1",
  toast: null,        // undo toast {msg} — see showUndo()
  baseVer: 0,         // bumps on rebaseline() so ● Edited chips re-check
});

export function toggleAdvanced() {
  app.advanced = !app.advanced;
  localStorage.setItem("hakr_studio_adv", app.advanced ? "1" : "0");
}

/* in-memory homes for drafts while another workspace is on stage:
   ws id → {draft, saved}. Scratch persists to localStorage instead. */
const wsStash = {};

export const showsRole = (shows) =>
  SHOWS_KINDS.find((k) => k.value === (shows || "device"))?.role || null;

/* the cast is a DOORWAY: open this device in the library, and carry
   the way back with you. `back` = {key, label, activityId} — the slice
   to return to, what to call it, and the activity card to re-open when
   we land (app.focusActivity, the same mechanism a minted action draft
   uses). Without the return trip this reads as losing your place. */
export function openDeviceEditor(devId, back) {
  app.focusDevice = devId || null;
  app.deviceReturn = back || null;
  selectSlice("devices");
}
export function returnFromDevice() {
  const b = app.deviceReturn;
  if (!b) return;
  app.deviceReturn = null;
  if (b.activityId) app.focusActivity = b.activityId;
  selectSlice(b.key);
}

function stashCurrent() {
  if (!app.draft) return;
  wsStash[app.workspace] = {
    draft: $state.snapshot(app.draft),
    saved: $state.snapshot(app.saved),
  };
}

/* v0.53: the SCRATCH workspace is gone (Suresh: "no point to it") —
   drafts already sandbox every workspace, and duplication covers the
   rest. Old hakr_scratch localStorage entries are simply ignored. */
export async function switchWorkspace(ws) {
  if (ws === app.workspace || !app.draft) return;
  stashCurrent();
  if (wsStash[ws]) {
    /* resume the in-memory draft (unsaved edits survive the trip) */
    app.saved = wsStash[ws].saved;
    app.draft = wsStash[ws].draft;
  } else {
    setStatus("loading workspace…");
    try {
      const r = await api("GET", null, "?ws=" + encodeURIComponent(ws));
      if (!r.ok) throw new Error("HTTP " + r.status);
      app.saved = normalizeConfig(await r.json());
      app.draft = JSON.parse(JSON.stringify(app.saved));
    } catch (e) {
      setStatus("couldn't load workspace '" + ws + "': " + e.message, "err");
      return;
    }
  }
  app.workspace = ws;
  localStorage.setItem("hakr_studio_ws", ws);
  rebaseline();
  /* every workspace opens on its MAP (Suresh); the hidden preview
     still follows to the workspace's home so it's warm when a real
     editor is opened */
  selectSlice("map");
  pushPreview();
  if (pvWindow)
    pvWindow.postMessage({ type: "harmonium_navigate",
      screen: app.draft.home_screen }, location.origin);
  setStatus("workspace: " + (app.workspaces[ws]?.name || ws) +
    (ws === "main" ? " (repo-built — deploys to config.json)"
      : " (deploys to config." + ws + ".json)"), "ok");
}

/* ---- workspace roster (server CRUD) ---- */
export async function loadWorkspaces() {
  try {
    const r = await fetch(WS_API, { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const body = await r.json();
    app.workspaces = body.workspaces || {};
    app.wsOrder = body.order || Object.keys(app.workspaces);
    return true;
  } catch {
    /* older integration (or sandbox): pretend a main-only roster */
    app.workspaces = { main: { name: "Main", file: "config.json" } };
    app.wsOrder = ["main"];
    return false;
  }
}

async function wsAction(body) {
  const r = await fetch(WS_API, {
    method: "POST",
    headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let out = {};
  try { out = await r.json(); } catch { /* non-JSON error body */ }
  if (!r.ok) throw new Error(out.message || out.problems?.join("; ") || "HTTP " + r.status);
  return out;
}

/* Create a workspace: source = "blank" (starter), "duplicate"
   (server-side copy of the current server ws), or "draft" (publish
   the CURRENT draft). The server retargets minted-select refs and
   mints the routing selects. */
export async function createWorkspace(name, source) {
  if (app.sandbox) return;
  const from = app.workspace;
  const body = { action: "create", name };
  if (source === "duplicate") {
    body.action = "duplicate";
    body.from = from;
  } else {
    body.config = source === "draft"
      ? $state.snapshot(app.draft) : starterConfig();
    body.from = source === "draft" ? from : "main";
  }
  try {
    const out = await wsAction(body);
    await loadWorkspaces();
    setStatus("workspace '" + name + "' created → " + (out.file || ""), "ok");
    await switchWorkspace(out.workspace);
  } catch (e) {
    setStatus("create failed: " + e.message, "err");
  }
}

export async function renameWorkspace(id, name) {
  if (app.sandbox || !name.trim()) return;
  try {
    await wsAction({ action: "rename", id, name: name.trim() });
    await loadWorkspaces();
    setStatus("renamed", "ok");
  } catch (e) {
    setStatus("rename failed: " + e.message, "err");
  }
}

export async function deleteWorkspace(id) {
  if (app.sandbox || id === "main") return;
  try {
    await wsAction({ action: "delete", id });
    delete wsStash[id];
    await loadWorkspaces();
    setStatus("workspace deleted (its remotes fall back to main)", "ok");
    if (app.workspace === id) await switchWorkspace("main");
  } catch (e) {
    setStatus("delete failed: " + e.message, "err");
  }
}

export function exportConfig() {
  /* the export KNOWS which workspace it is (v0.83.8 follow-up —
     Suresh: "We don't actually store the workspace name in the
     json, which is a mistake"): a `_workspace` stamp rides along so
     a later import can offer the right destination. Stripped on
     import; the engine never sees it. */
  const out = $state.snapshot(app.draft);
  out._workspace = { id: app.workspace,
    name: app.workspaces[app.workspace]?.name || app.workspace };
  const blob = new Blob([JSON.stringify(out, null, 2)],
    { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "harmonium-" + app.workspace + "-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("exported " + app.workspace + " config (full fidelity)", "ok");
}

/* EXPORT ALL (v0.83.2 — statusreview follow-up: "does Export export
   all workspaces or just current?" — it was just-current, invisibly).
   One JSON bundle: every workspace's CURRENT truth — the live draft
   for the workspace you're standing in, the stored config for the
   rest (fetched fresh; nobody holds other worlds client-side). */
export async function exportAllConfigs() {
  const order = app.wsOrder.filter((w) => app.workspaces[w]);
  const out = { harmonium_export: "workspaces",
    exported: new Date().toISOString().slice(0, 10),
    order, workspaces: {} };
  for (const id of order) {
    let config;
    if (id === app.workspace) config = JSON.parse(JSON.stringify($state.snapshot(app.draft)));
    else {
      const r = await api("GET", null, "?ws=" + encodeURIComponent(id));
      config = await r.json();
    }
    out.workspaces[id] = { name: app.workspaces[id].name, config };
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "harmonium-all-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("exported " + order.length + " workspace" + (order.length === 1 ? "" : "s"), "ok");
}

/* IMPORT, REWORKED (v0.83.8 follow-up — Suresh: "When I import a
   workspace it overrites main. It should give the choice. … and we
   don't allow the import of the full workspace (it should, and which
   workspaces to import)"). importConfig now only PARSES and parks
   the result on app.importAsk; the dialog picks the destination and
   resolveImport() does the landing:
   - single config → this workspace's draft (safe, Save & Deploy to
     keep) · REPLACE another workspace (stored + deployed, now) ·
     a NEW workspace;
   - a whole-house bundle → tick which workspaces to import; existing
     ids are replaced, missing ids created. */
export async function importConfig(file) {
  try {
    const cfg = JSON.parse(await file.text());
    if (cfg.harmonium_export === "workspaces") {
      const order = (cfg.order || Object.keys(cfg.workspaces || {}))
        .filter((id) => cfg.workspaces?.[id]?.config?.screens);
      if (!order.length)
        throw new Error("bundle holds no importable workspaces");
      app.importAsk = { kind: "bundle", fname: file.name, order,
        workspaces: cfg.workspaces };
      return;
    }
    const stamp = cfg._workspace || null;   /* older exports have none */
    delete cfg._workspace;
    if (!cfg.screens) throw new Error("no screens — not a Harmonium config");
    app.importAsk = { kind: "single", fname: file.name, config: cfg, stamp };
  } catch (e) {
    setStatus("import failed: " + e.message, "err");
  }
}

/* land an import into THIS workspace's draft — the v0.75 rule holds:
   one config door, one normalizer (ensureStockControllers, heals) */
function importIntoDraft(cfg) {
  app.draft = normalizeConfig(JSON.parse(JSON.stringify(cfg)));
  const rooms = roomIds();
  selectSlice(rooms.length ? "view." + rooms[0] : "screens." + cfg.home_screen);
  pushPreview();
  setStatus("imported into " + app.workspace + " (draft — Save & Deploy to keep)", "ok");
}

/* REPLACE a workspace's stored config outright (validate + store +
   deploy server-side). The current workspace refreshes in place;
   any stale stash of the target is dropped. */
async function importReplaceWs(ws, cfg) {
  const r = await api("POST", cfg, "?ws=" + encodeURIComponent(ws));
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.problems?.join("; ") || out.message || "HTTP " + r.status);
  delete wsStash[ws];
  if (ws === app.workspace) {
    app.saved = normalizeConfig(JSON.parse(JSON.stringify(cfg)));
    app.draft = JSON.parse(JSON.stringify(app.saved));
    rebaseline();
    selectSlice("map");
    pushPreview();
  }
}

export async function resolveImport(opt) {
  const ask = app.importAsk;
  if (!ask) return;
  try {
    if (ask.kind === "single") {
      if (opt.dest === "draft") {
        importIntoDraft(ask.config);
      } else if (opt.dest === "replace") {
        if (!opt.ws) throw new Error("pick a workspace to replace");
        await importReplaceWs(opt.ws, ask.config);
        setStatus("replaced workspace '" + (app.workspaces[opt.ws]?.name || opt.ws) +
          "' (stored + deployed)", "ok");
      } else if (opt.dest === "new") {
        const name = (opt.name || "").trim();
        if (!name) throw new Error("name the new workspace");
        const out = await wsAction({ action: "create", name,
          /* keep the stamped id when it's free (a restore keeps its
             address); a taken id lets the server slug the name */
          ...(ask.stamp?.id && ask.stamp.id !== "main" &&
            !app.workspaces[ask.stamp.id] ? { id: ask.stamp.id } : {}),
          config: JSON.parse(JSON.stringify(ask.config)),
          from: ask.stamp?.id || app.workspace });
        await loadWorkspaces();
        setStatus("workspace '" + name + "' created from the import", "ok");
        await switchWorkspace(out.workspace);
      }
    } else {
      /* bundle: each ticked workspace lands where its id says */
      const picked = ask.order.filter((id) => opt.ticks?.[id]);
      if (!picked.length) throw new Error("nothing ticked");
      let replaced = 0, created = 0;
      for (const id of picked) {
        const entry = ask.workspaces[id];
        if (app.workspaces[id]) {
          await importReplaceWs(id, entry.config);
          replaced++;
        } else {
          await wsAction({ action: "create", name: entry.name || id, id,
            config: JSON.parse(JSON.stringify(entry.config)), from: "main" });
          created++;
        }
      }
      await loadWorkspaces();
      setStatus("bundle imported — " + replaced + " replaced, " + created +
        " created (stored + deployed)", "ok");
    }
    app.importAsk = null;
  } catch (e) {
    setStatus("import failed: " + e.message, "err");
  }
}

export function cancelImport() { app.importAsk = null; }

export function clearCurrent() {
  app.draft = starterConfig();
  selectSlice("room.home");
  pushPreview();
  setStatus("cleared " + app.workspace + " draft to a clean start (nothing saved yet)", "ok");
}

/* the Studio's OWN build stamp (v0.83.3 — the "is my push actually
   running?" question kept costing rounds: HA serves studio.html with
   hard cache headers, so a stale tab looks exactly like a bad fix).
   Bump on EVERY Studio build. Format since v0.83.8 (Suresh: "Why is
   it 0.83.30 when my release seems to want to be 0.83.8?"):
   "<release> b<build>" — the release the build belongs to, then a
   build counter that never resets (b30 continues the old 0.83.NN
   line, so history stays ordered). The footer reads s0.83.8 b30:
   release first, fingerprint after. */
export const STUDIO_V = "0.83.11 b35";

export const token = () => localStorage.getItem("hakr_token") || "";

/* STUDIO IMAGE UPLOAD (v0.83.8 — beta-gaps P1 #7, the .88 stranger
   test: "install Samba just to get a hero picture onto the box").
   POST a picture to the integration; heroes land in the house's own
   www/images/ (OUTSIDE the wipeable harmonium tree — his call:
   "Are you sure we want our uploaded hero images inside
   harmonium?"), skins in www/harmonium/skins/; the /local/… path
   comes back, ready for the field. A 409 means a file of that
   name already exists — the caller confirms, then retries with
   overwrite. Never silently stomps a user's picture. */
export async function uploadImage(file, kind = "image", overwrite = false) {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("kind", kind);
  if (overwrite) fd.append("overwrite", "1");
  const r = await fetch("/api/harmonium/upload", {
    method: "POST",
    headers: { Authorization: "Bearer " + token() },
    body: fd,
  });
  if (r.status === 401) {
    app.authOpen = true;
    app.authErr = "Token rejected — paste a fresh one.";
    throw new Error("unauthorized");
  }
  let j = null;
  try { j = await r.json(); } catch { /* error bodies may be text */ }
  if (r.status === 409) return { exists: true, path: (j && j.path) || "" };
  if (!r.ok || !j || !j.ok)
    throw new Error((j && (j.message || j.error)) || "upload failed (" + r.status + ")");
  return j;   /* { ok: true, path: "/local/harmonium/images/…" } */
}

/* column toggles (s0.83.10) — flip + persist */
export function toggleNav() {
  app.navHide = !app.navHide;
  localStorage.setItem("hakr_studio_nav_hide", app.navHide ? "1" : "0");
}
export function togglePv() {
  app.pvHide = !app.pvHide;
  localStorage.setItem("hakr_studio_pv_hide", app.pvHide ? "1" : "0");
}

export function setStatus(msg, cls = "") {
  app.status = { msg, cls };
}

async function api(method, body, query = "") {
  const r = await fetch(API + query, {
    method,
    headers: {
      Authorization: "Bearer " + token(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    app.authOpen = true;
    app.authErr = "Token rejected — paste a fresh one.";
    throw new Error("unauthorized");
  }
  return r;
}

/* ---- rooms own activities ----
   The registry stays flat (the engine wants ids), but every activity
   has an OWNER room via room_view. Rooms are room-class views, minus
   the main_home hub. */
export function roomIds() {
  const d = app.draft;
  if (!d) return [];
  const hub = d.global?.main_home;
  return Object.keys(d.screens || {}).filter(
    (id) => (d.screens[id].class === "room" || d.screens[id].view_kind === "room") && id !== hub,
  );
}
export function roomOf(viewId) {
  const d = app.draft;
  if (!d) return null;
  const rooms = new Set(roomIds());
  let cur = viewId, guard = 0;
  while (cur && guard++ < 20) {
    if (rooms.has(cur)) return cur;
    cur = d.screens[cur]?.parent;
  }
  return null;
}
export function subordinateScreens() {
  const d = app.draft;
  if (!d) return new Set();
  const sub = new Set();
  for (const [sid, scr] of Object.entries(d.screens || {})) {
    if (scr.drawer) sub.add(sid);
    const groups = [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])];
    for (const g of groups)
      for (const t of g)
        /* a nav card's target lives "inside" its card — unless the
           target is itself a room (nav cards may point ACROSS too) */
        if (t.type === "nav" && t.target) {
          const tgt = d.screens[t.target];
          if (tgt && !tgt.room && tgt.class !== "room" && tgt.view_kind !== "room")
            sub.add(t.target);
        }
  }
  return sub;
}

export function viewsOfRoom(r) {
  return Object.keys(app.draft?.screens || {}).filter((id) => roomOf(id) === r);
}
export function ownedActivities(r) {
  const a = app.draft?.activities || {};
  return Object.keys(a).filter((id) => (a[id]?.room_view || null) === r);
}
export function unassignedActivities() {
  const d = app.draft;
  const a = d?.activities || {};
  return Object.keys(a).filter((id) => !d?.screens?.[a[id]?.room_view]);
}
/* every hub that currently owns activities (any hub may) */
export function ownerHubs() {
  const d = app.draft;
  const seen = [];
  for (const act of Object.values(d?.activities || {}))
    if (act?.room_view && d.screens[act.room_view] && !seen.includes(act.room_view))
      seen.push(act.room_view);
  return seen;
}

/* ---- slices ----
   Suresh's sidebar: VIEWS (Home, then each room view with its pages
   nested) / CONTROLLERS (control surfaces + their libraries) /
   MODEL (Actions · Apps · All activities) / SYSTEM. */
export const isControllerScreen = (scr) =>
  scr?.type === "controller" || scr?.class === "activity" ||
  scr?.class === "detail" || scr?.view_kind === "controller";

export function slices() {
  const d = app.draft;
  if (!d) return [];
  const s = [];
  const claimed = new Set();
  /* VIEWS — the rooms hub ("Home") leads, then each room view with
     its non-controller pages nested ⌞ */
  const hub = d.global?.main_home;
  if (hub && d.screens[hub]) {
    claimed.add(hub);
    s.push({ key: "screens." + hub, label: d.screens[hub].name || hub,
      sub: "rooms hub", group: "Views" });
  }
  for (const r of roomIds()) {
    claimed.add(r);
    s.push({ key: "view." + r, label: d.screens[r].name || r,
      sub: "view · " + ownedActivities(r).length + " activities", group: "Views" });
    for (const v of viewsOfRoom(r)) {
      /* drawers/libraries nest under their CONTROLLER, not the room */
      if (v === r || claimed.has(v) || isControllerScreen(d.screens[v]) ||
        d.screens[v].drawer) continue;
      claimed.add(v);
      s.push({ key: "screens." + v, label: d.screens[v].name || v,
        sub: d.screens[v].view_kind || "page", group: "Views", deep: true });
    }
  }
  for (const id of Object.keys(d.screens || {}))
    if (!claimed.has(id) && !isControllerScreen(d.screens[id]) && !d.screens[id].drawer) {
      claimed.add(id);
      s.push({ key: "screens." + id, label: d.screens[id].name || id,
        sub: d.screens[id].view_kind || d.screens[id].class || "page", group: "Views" });
    }
  /* CONTROLLERS — DEFAULTS (the stock library) then CUSTOM (activity
     copies + custom controller pages); drawers/libraries nest ⌞ */
  const ctrls = Object.entries(d.controllers || {});
  const stock = ctrls.filter(([, c]) => !c.variant_of);
  const custom = ctrls.filter(([, c]) => c.variant_of);
  if (stock.length) s.push({ subhead: "Defaults", group: "Controllers", key: "_sh_def" });
  for (const [cid, c] of stock) {
    s.push({ key: "controller." + cid, label: c.name || cid,
      sub: "stock", group: "Controllers" });
    for (const dr of Object.keys(d.screens || {}))
      if (d.screens[dr].parent === "controller:" + cid && d.screens[dr].drawer && !claimed.has(dr)) {
        claimed.add(dr);
        s.push({ key: "screens." + dr, label: d.screens[dr].name || dr,
          sub: d.screens[dr].view_kind || "library", group: "Controllers", deep: true });
      }
  }
  const legacyCtrl = Object.keys(d.screens || {}).filter(
    (id) => !claimed.has(id) && isControllerScreen(d.screens[id]) && !d.screens[id].drawer);
  if (custom.length || legacyCtrl.length)
    s.push({ subhead: "Custom", group: "Controllers", key: "_sh_cus" });
  for (const [cid, c] of custom)
    s.push({ key: "controller." + cid, label: c.name || cid,
      sub: "copy of " + (d.controllers[c.variant_of]?.name || c.variant_of), group: "Controllers" });
  for (const id of legacyCtrl) {
    claimed.add(id);
    s.push({ key: "screens." + id, label: d.screens[id].name || id,
      sub: "custom page", group: "Controllers" });
    for (const c of Object.keys(d.screens))
      if (d.screens[c].parent === id && d.screens[c].drawer && !claimed.has(c)) {
        claimed.add(c);
        s.push({ key: "screens." + c, label: d.screens[c].name || c,
          sub: d.screens[c].view_kind || "library", group: "Controllers", deep: true });
      }
  }
  for (const id of Object.keys(d.screens || {}))   /* stray drawers */
    if (!claimed.has(id))
      s.push({ key: "screens." + id, label: d.screens[id].name || id,
        sub: d.screens[id].view_kind || "library", group: "Controllers", deep: true });
  s.push({ key: "sequences", label: "Actions",
    sub: Object.keys(d.sequences || {}).length + " sequences", group: "Model" });
  s.push({ key: "apps", label: "Apps",
    sub: Object.keys(d.apps || {}).length + " apps · " +
      Object.keys(d.dialects || {}).length + " dialects", group: "Model" });
  s.push({ key: "snippets", label: "Snippets",
    sub: Object.keys(snips.items).length + " saved blocks", group: "Model" });
  s.push({ key: "activities", label: "All activities",
    sub: Object.keys(d.activities || {}).length + " across rooms", group: "Model" });
  s.push({ key: "devices", label: "Pre-wired Devices",
    sub: Object.keys(d.devices || {}).length + " defined", group: "Model" });
  s.push({ key: "spkgroups", label: "Speaker Groups",
    sub: Object.keys(d.speaker_groups || {}).length + " groups", group: "Model" });
  s.push({ key: "input", label: "Input policy", sub: "tap/hold ownership", group: "System" });
  s.push({ key: "remotes", label: "Remotes & keymaps", sub: "profiles", group: "System" });
  s.push({ key: "theme", label: "Theme", sub: "colors · layout · type", group: "System" });
  s.push({ key: "workspaces", label: "Workspaces",
    sub: Object.keys(app.workspaces).length + " active", group: "System" });
  return s;
}

/* which slices have a visual editor */
export const hasVisual = (key) =>
  (key || "").startsWith("view.") || key === "activities" || key === "sequences" ||
  key === "apps" || key === "theme" || key === "snippets" || key === "workspaces" ||
  key === "map" || key === "devices" || key === "spkgroups" ||
  (key || "").startsWith("screens.") || (key || "").startsWith("controller.");

export function getSlice(key) {
  const d = app.draft;
  if (!d || !key) return null;
  if (key.startsWith("view.")) {
    const r = key.slice(5);
    return {
      global: d.global,
      home_screen: d.home_screen,
      screen_order: d.screen_order,
      view: d.screens[r],
      activities: Object.fromEntries(ownedActivities(r).map((id) => [id, d.activities[id]])),
      sequences: Object.fromEntries(
        Object.entries(d.sequences || {}).filter(([, s]) => s.room === r)),
    };
  }
  if (key.startsWith("screens.")) return d.screens[key.slice(8)];
  if (key.startsWith("controller.")) return d.controllers?.[key.slice(11)];
  return d[key];
}
export function setSlice(key, value) {
  const d = app.draft;
  if (key.startsWith("view.")) {
    const r = key.slice(5);
    d.global = value.global;
    d.home_screen = value.home_screen;
    d.screen_order = value.screen_order;
    if (value.view) d.screens[r] = value.view;
    if (value.activities) {
      for (const id of ownedActivities(r))
        if (!(id in value.activities)) delete d.activities[id];
      for (const [id, a] of Object.entries(value.activities))
        d.activities[id] = { ...a, room_view: r };
    }
    if (value.sequences) {
      if (!d.sequences) d.sequences = {};
      for (const [id, s] of Object.entries(d.sequences))
        if (s.room === r && !(id in value.sequences)) delete d.sequences[id];
      for (const [id, s] of Object.entries(value.sequences))
        d.sequences[id] = { ...s, room: r };
    }
  } else if (key.startsWith("screens.")) d.screens[key.slice(8)] = value;
  else if (key.startsWith("controller.")) {
    if (!d.controllers) d.controllers = {};
    d.controllers[key.slice(11)] = value;
  } else d[key] = value;
}

/* Rename a SCREEN's id (the page key) and walk every reference:
   screens registry, home_screen, screen_order, parents, hero refs,
   tile targets/rooms, navigate actions (global + per-screen + input
   policy), activity room_view/screen, sequence room stamps — and the
   current nav selection, so the editor stays put. The minted
   select.harmonium_<room>_activity follows this id, which is exactly
   why it must be editable. */
export function renameScreen(oldId, newId) {
  const d = app.draft;
  newId = (newId || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!d?.screens?.[oldId] || !newId || newId === oldId || d.screens[newId]) return false;
  const rebuilt = {};
  for (const [k, v] of Object.entries(d.screens)) rebuilt[k === oldId ? newId : k] = v;
  d.screens = rebuilt;
  if (d.home_screen === oldId) d.home_screen = newId;
  if (d.screen_order) d.screen_order = d.screen_order.map((s) => (s === oldId ? newId : s));
  const KEYS = new Set(["navigate", "target", "parent", "room", "room_view", "screen",
    "overview_view", "rooms_screen", "main_home"]);
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === "object")
      for (const [k, v] of Object.entries(node)) {
        if (v === oldId && KEYS.has(k)) node[k] = newId;
        else walk(v);
      }
  };
  walk(d.screens);
  walk(d.controllers || {});
  walk(d.activities || {});
  walk(d.global || {});
  walk(d.input || {});
  walk(d.remotes || {});
  /* sequences: only the top-level room stamp — never dig into HA
     action syntax, where key names are HA's business */
  for (const s of Object.values(d.sequences || {})) if (s.room === oldId) s.room = newId;
  /* THE MINTED SELECT follows the room id (v0.47.2 — Suresh's deck
     split-brain: rename home→deck left activity_select pointing at
     select.…_home_activity while the integration wrote truth to
     …_deck_activity). The entity id EMBEDS the room id — the KEYS
     walk can't see it, so rewrite the suffix explicitly. */
  const tail = "_" + oldId + "_activity";
  const g2 = d.global || {};
  if (typeof g2.activity_select === "string" && g2.activity_select.endsWith(tail))
    g2.activity_select = g2.activity_select.slice(0, -tail.length) + "_" + newId + "_activity";
  for (const scr2 of Object.values(d.screens || {}))
    if (typeof scr2.activity_state === "string" && scr2.activity_state.endsWith(tail))
      scr2.activity_state = scr2.activity_state.slice(0, -tail.length) + "_" + newId + "_activity";
  if (app.selKey === "view." + oldId) app.selKey = "view." + newId;
  else if (app.selKey === "screens." + oldId) app.selKey = "screens." + newId;
  /* an in-flight page DRAFT follows its own rename (the page id
     auto-follows the name while drafting) */
  if (app.pending?.kind === "page" && app.pending.sid === oldId) app.pending.sid = newId;
  schedulePreview();
  return true;
}

/* Delete a SCREEN — guarded: refuses while anything still points at
   it (children, group/nav tiles, activity screens or ownership, home
   anchors) and names the blockers; on success it also leaves
   screen_order and selects a surviving slice. */
export function deleteScreen(id) {
  const d = app.draft;
  if (!d?.screens?.[id]) return ["no such page"];
  const blockers = [];
  if (d.home_screen === id) blockers.push("it is the home screen");
  if (d.global?.main_home === id) blockers.push("it is the rooms hub (global.main_home)");
  for (const [sid, scr] of Object.entries({ ...d.screens, ...(d.controllers || {}) })) {
    if (sid === id) continue;
    if (scr.parent === id) blockers.push(`page '${sid}' has it as parent`);
    for (const g of [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])])
      for (const t of g)
        if (t.target === id) blockers.push(`tile '${t.id}' on '${sid}' opens it`);
  }
  for (const [aid, a] of Object.entries(d.activities || {})) {
    if (a.screen === id) blockers.push(`activity '${aid}' navigates to it`);
    if (a.room_view === id) blockers.push(`activity '${aid}' is owned by it`);
  }
  if (blockers.length) return blockers;
  delete d.screens[id];
  if (d.screen_order) d.screen_order = d.screen_order.filter((s) => s !== id);
  const rooms = roomIds();
  if (app.selKey === "screens." + id || app.selKey === "view." + id)
    selectSlice(rooms.length ? "view." + rooms[0] : "screens." + d.home_screen);
  schedulePreview();
  return true;
}

/* ---- ＋-minted action DRAFT flow (Suresh: "no way of getting
   back... auto populates the parent Start Action"). The mint creates
   the sequence and jumps to the Actions editor, but NOTHING is
   linked until Confirm; Discard deletes the draft. Either way you
   land back on the exact view (and activity card) you left. */
export function beginSeqDraft(seqId, kind, activityId) {
  app.pending = { seqId, kind, activityId, originKey: app.selKey };
  selectSlice("sequences");
}
export function confirmSeqDraft() {
  const p = app.pending;
  if (!p) return;
  const a = app.draft?.activities?.[p.activityId];
  if (a) a[p.kind] = "sequence:" + p.seqId;
  app.pending = null;
  app.focusActivity = p.activityId;
  selectSlice(p.originKey);
  setStatus("linked '" + p.seqId + "' as " + p.activityId + " " + p.kind, "ok");
}
export function discardSeqDraft() {
  const p = app.pending;
  if (!p) return;
  delete app.draft?.sequences?.[p.seqId];
  app.pending = null;
  app.focusActivity = p.activityId;
  selectSlice(p.originKey);
  setStatus("draft discarded — nothing linked", "ok");
}

/* ---- ＋ Add view (sidebar): a free-standing page, born a plain hub.
   Name it (the id follows the slug); add an activity to make it a
   place where things run. Deliberate creation — no draft banner. */
export function addView() {
  const d = app.draft;
  if (!d) return;
  let sid = "new_view", n = 2;
  while (d.screens[sid]) sid = "new_view_" + n++;
  d.screens[sid] = { name: "New View", class: "group", view_kind: "hub", type: "hub", sections: [],
    /* hero on by default (Suresh v0.43.9) — the page's face: title + clock */
    banner: { image: "", image_opacity: 0.5, height: "230px", min_height: "150px", show_time: true } };
  selectSlice("screens." + sid);
  schedulePreview();
  setStatus("view created — name it (the id follows); add an activity to make it a place where things run", "ok");
}

/* ---- ＋-minted PAGE draft flow — the SAME contract, generalized to
   pages (Suresh: "Jumping is what we do for ＋ on Start Action and
   it's what we should do here"). The mint creates the page, links it
   (so the preview is live while drafting), and jumps into its editor
   with a draft banner. Keep = done; Discard unwinds the link and
   deletes the page — you land back exactly where you left.
   opts: { ownerScreen, tileId }       — a nav card's ＋
         { activityId, prevScreen }    — an activity's control-page ＋ */
export function beginPageDraft(sid, opts = {}) {
  app.pending = { kind: "page", sid, ...opts, originKey: app.selKey };
  selectSlice("screens." + sid);
}
export function confirmPageDraft() {
  const p = app.pending;
  if (!p) return;
  app.pending = null;
  if (p.activityId) app.focusActivity = p.activityId;
  selectSlice(p.originKey);
  schedulePreview();
  setStatus("page kept" + (p.tileId ? " — its nav card opens it" : ""), "ok");
}
export function discardPageDraft() {
  const p = app.pending;
  if (!p) return;
  app.pending = null;
  const d = app.draft;
  /* unwind the links first, then the page */
  if (p.tileId && p.ownerScreen) {
    const scr = d?.screens?.[p.ownerScreen] || d?.controllers?.[p.ownerScreen];
    for (const g of [scr?.tiles || [], ...(scr?.sections || []).map((s) => s.tiles || [])])
      for (const t of g)
        if (t.id === p.tileId && t.target === p.sid) delete t.target;
  }
  if (p.activityId) {
    const a = d?.activities?.[p.activityId];
    if (a && a.screen === p.sid) a.screen = p.prevScreen || "";
    app.focusActivity = p.activityId;
  }
  const r = deleteScreen(p.sid);
  selectSlice(p.originKey);
  schedulePreview();
  setStatus(r === true ? "draft page discarded" : "couldn't remove the page: " + r.join(" · "),
    r === true ? "ok" : "err");
}

/* ---- library-controller registry ops ---- */
/* CREATE CUSTOM (lazy instancing — Suresh 2026-07-23): copy the stock
   controller as this activity's own editable instance ("Porch Watch
   Fire TV"), stamp the cast generator with the activity, and relink.
   The stock stays pristine; ↺ Use stock reverses it. */
export function instantiateController(templateId, activityId) {
  const d = app.draft;
  const tpl = d?.controllers?.[templateId];
  const act = d?.activities?.[activityId];
  if (!tpl || !act) return null;
  const cur = (act.screen || "").startsWith("controller:") ? act.screen.slice(11) : null;
  if (cur && d.controllers[cur]?.variant_of === templateId) return cur; // already custom
  let iid = templateId + "__" + activityId, n = 2;
  while (d.controllers[iid]) iid = templateId + "__" + activityId + "_" + n++;
  const copy = JSON.parse(JSON.stringify($state.snapshot(tpl)));
  copy.variant_of = templateId;
  const room = d.screens?.[act.room_view]?.name || "";
  copy.name = (room + " " + (act.name || activityId)).trim();
  for (const g of [copy.tiles || [], ...(copy.sections || []).map((x) => x.tiles || [])])
    for (const t of g)
      if (t.type === "devices" && !t.activity) t.activity = activityId;
  d.controllers[iid] = copy;
  act.screen = "controller:" + iid;
  schedulePreview();
  setStatus("custom copy '" + copy.name + "' created — the stock is untouched", "ok");
  return iid;
}
export function revertToStock(activityId) {
  const d = app.draft;
  const act = d?.activities?.[activityId];
  const cur = (act?.screen || "").startsWith("controller:") ? act.screen.slice(11) : null;
  const inst = cur && d.controllers?.[cur];
  if (!inst || !inst.variant_of) return;
  act.screen = "controller:" + inst.variant_of;
  const used = Object.values(d.activities || {}).some((a) => a.screen === "controller:" + cur);
  if (!used) {
    delete d.controllers[cur];
    if (d.screen_order) d.screen_order = d.screen_order.filter((x) => x !== "controller:" + cur);
  }
  schedulePreview();
  setStatus("back on the stock controller" + (used ? "" : " — custom copy removed"), "ok");
}
export function resetControllerToStock(iid) {
  const d = app.draft;
  const inst = d?.controllers?.[iid];
  const tpl = inst?.variant_of && d.controllers[inst.variant_of];
  if (!tpl) return false;
  const fresh = JSON.parse(JSON.stringify($state.snapshot(tpl)));
  fresh.variant_of = inst.variant_of;
  fresh.name = inst.name;
  if (inst.entity) fresh.entity = inst.entity;
  if (inst.domain) fresh.domain = inst.domain;
  /* re-stamp the cast generator with this instance's activity */
  const aid = Object.entries(d.activities || {})
    .find(([, a]) => a.screen === "controller:" + iid)?.[0];
  if (aid)
    for (const g of [fresh.tiles || [], ...(fresh.sections || []).map((x) => x.tiles || [])])
      for (const t of g)
        if (t.type === "devices" && !t.activity) t.activity = aid;
  d.controllers[iid] = fresh;
  schedulePreview();
  setStatus("reset to the stock surface", "ok");
  return true;
}

export function renameController(oldId, newId) {
  const d = app.draft;
  newId = (newId || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!d?.controllers?.[oldId] || !newId || newId === oldId || d.controllers[newId]) return false;
  const rebuilt = {};
  for (const [k, v] of Object.entries(d.controllers)) rebuilt[k === oldId ? newId : k] = v;
  d.controllers = rebuilt;
  const oldRef = "controller:" + oldId, newRef = "controller:" + newId;
  for (const a of Object.values(d.activities || {}))
    if (a.screen === oldRef) a.screen = newRef;
  if (d.screen_order) d.screen_order = d.screen_order.map((x) => (x === oldRef ? newRef : x));
  for (const scr of Object.values(d.screens || {}))
    if (scr.parent === oldRef) scr.parent = newRef;
  if (app.selKey === "controller." + oldId) app.selKey = "controller." + newId;
  schedulePreview();
  return true;
}
export function duplicateController(cid) {
  const d = app.draft;
  const src = d?.controllers?.[cid];
  if (!src) return null;
  let nid = cid + "_variant", n = 2;
  while (d.controllers[nid]) nid = cid + "_variant" + n++;
  const copy = JSON.parse(JSON.stringify($state.snapshot(src)));
  copy.name = (copy.name || cid) + " variant";
  d.controllers[nid] = copy;
  selectSlice("controller." + nid);
  setStatus("variant '" + nid + "' created — rename and prune away", "ok");
  return nid;
}
export function deleteController(cid) {
  const d = app.draft;
  if (!d?.controllers?.[cid]) return ["no such controller"];
  const ref = "controller:" + cid;
  const blockers = [];
  for (const [aid, a] of Object.entries(d.activities || {}))
    if (a.screen === ref) blockers.push(`activity '${aid}' navigates to it`);
  for (const [sid, scr] of Object.entries(d.screens || {}))
    if (scr.parent === ref) blockers.push(`page '${sid}' has it as parent`);
  if (blockers.length) return blockers;
  delete d.controllers[cid];
  if (d.screen_order) d.screen_order = d.screen_order.filter((x) => x !== ref);
  if (app.selKey === "controller." + cid) {
    const rooms = roomIds();
    selectSlice(rooms.length ? "view." + rooms[0] : "screens." + d.home_screen);
  }
  schedulePreview();
  return true;
}

export function selectSlice(key) {
  /* the return trip belongs to ONE visit to the library — leave by any
     other road and it is stale, so drop it */
  if (key !== "devices" && app.deviceReturn) app.deviceReturn = null;
  if (key !== app.selKey) app.prevKey = app.selKey;
  app.selKey = key;
  app.tab = hasVisual(key) ? "visual" : "code";
  /* the preview follows the selection: room slice -> the room view,
     view slice -> that view */
  const scr = key?.startsWith("screens.") ? key.slice(8)
    : key?.startsWith("view.") ? key.slice(5)
    : key?.startsWith("controller.") ? controllerPreviewTarget(key.slice(11)) : null;
  if (scr && pvWindow)
    pvWindow.postMessage({ type: "harmonium_navigate", screen: scr }, location.origin);
}

/* a domain stock (or per-device copy) previews as a REAL device's
   generated page — the surface itself, not dead $device tiles */
function controllerPreviewTarget(cid) {
  const c = app.draft?.controllers?.[cid];
  if (c?.entity) return "detail:" + c.entity;
  if (c?.domain) {
    const first =
      app.entities.find((e) => e.entity_id.startsWith(c.domain + "."))?.entity_id ||
      Object.keys(app.draft?.entity_options || {}).find((x) => x.startsWith(c.domain + "."));
    if (first) return "detail:" + first;
  }
  return "controller:" + cid;
}

/* ---- per-device custom copy of a DOMAIN stock (Cover for the
   backwards MaestroScreen) — exactly the Media Player lifecycle */
export function instantiateDeviceController(dom, eid) {
  const d = app.draft;
  const tpl = d?.controllers?.[dom];
  if (!tpl?.domain || !eid) return null;
  for (const [k, c] of Object.entries(d.controllers))
    if (c.variant_of === dom && c.entity === eid) { selectSlice("controller." + k); return k; }
  let iid = dom + "__" + eid.split(".")[1], n = 2;
  while (d.controllers[iid]) iid = dom + "__" + eid.split(".")[1] + "_" + n++;
  const copy = JSON.parse(JSON.stringify($state.snapshot(tpl)));
  copy.variant_of = dom;
  copy.entity = eid;
  copy.domain = dom;
  copy.name = app.entities.find((e) => e.entity_id === eid)?.name || eid;
  d.controllers[iid] = copy;
  selectSlice("controller." + iid);
  schedulePreview();
  setStatus("custom " + (tpl.name || dom) + " for " + copy.name + " — the stock is untouched", "ok");
  return iid;
}

/* ---- SNIPPETS (v0.33, Suresh's spec): reusable config blocks with
   metadata, grouped by TYPE ("setup" = devices & roles, "state" =
   state rules). Stored in localStorage — genuinely global across
   workspaces AND immune to reseeds (they're authoring material, not
   remote config). Export from a block's title bar; Insert offers
   compatible snippets. */
export const snips = $state({
  items: JSON.parse(localStorage.getItem("hakr_snippets") || "{}"),
});
function persistSnips() {
  localStorage.setItem("hakr_snippets", JSON.stringify($state.snapshot(snips.items)));
}
export const SNIPPET_TYPES = {
  setup: "Setup — devices & roles",
  state: "State rules",
  /* v0.79.1 — Suresh: "I'd like to be able to export (and import) a
     Preset to snippets": one preset tile, saved whole (minus its id),
     insertable on any page's Presets fold or any activity's Presets
     tab — across workspaces, like every snippet. */
  preset: "Presets — one-touch shortcuts",
  /* v0.83.1 — statusreview: "Should actions be global in scope (or
     copy to snippets if not)". They ARE global within a workspace
     (any page/preset/activity may reference any sequence; the room
     stamp is filing, not scope) — what they could not do was TRAVEL.
     Now a sequence exports whole and reinserts in any workspace. */
  action: "Actions — HA-side sequences",
};
/* a fresh sequence from a saved action snippet (null if it isn't
   one) — the room stamp is dropped on the way out AND in: it names
   the source house's rooms, which mean nothing at the destination */
export function actionSnippetSeq(sid) {
  const sn = snips.items[sid];
  if (!sn || sn.type !== "action") return null;
  const d = JSON.parse(JSON.stringify(sn.data));
  delete d.room;
  return d;
}
/* a fresh preset tile from a saved snippet (null if it isn't one) —
   the ONE inserter both doors share, so id-minting never forks */
export function presetSnippetTile(sid) {
  const sn = snips.items[sid];
  if (!sn || sn.type !== "preset") return null;
  const t = JSON.parse(JSON.stringify(sn.data));
  t.type = "preset";
  t.id = "tile_" + Math.random().toString(36).slice(2, 6);
  return t;
}
export function saveSnippet(type, name, data) {
  const base = (name || type).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || type;
  let id = base, n = 2;
  while (snips.items[id]) id = base + "_" + n++;
  snips.items[id] = { name: name || id, type,
    data: JSON.parse(JSON.stringify(data)), saved: new Date().toISOString().slice(0, 10) };
  persistSnips();
  setStatus("snippet “" + (name || id) + "” saved — Model → Snippets", "ok");
  return id;
}
export function renameSnippet(id, name) {
  if (snips.items[id]) { snips.items[id].name = name; persistSnips(); }
}
export function deleteSnippet(id) {
  delete snips.items[id];
  persistSnips();
}
export function snippetsOf(type) {
  return Object.entries(snips.items).filter(([, x]) => x.type === type);
}

/* ---- preview plumbing ---- */
let pvWindow = null; // set by PreviewPane
export function bindPreview(win) { pvWindow = win; }
/* PREVIEW IMPERSONATION (v0.46.1): while an activity card is open the
   preview renders AS that activity — its cast, its dialect's keys,
   its apps — instead of whatever the live select holds. */
export function previewActivity(id) {
  if (!pvWindow) return;
  pvWindow.postMessage({ type: "harmonium_preview_activity", activity: id || null }, location.origin);
}
export function previewGoto(screen) {
  if (!pvWindow || !screen) return;
  pvWindow.postMessage({ type: "harmonium_navigate", screen }, location.origin);
}

export function pushPreview() {
  if (!app.pvReady || !app.draft || !pvWindow) return;
  pvWindow.postMessage(
    { type: "harmonium_config", config: $state.snapshot(app.draft),
      device: app.device, workspace: app.workspace },
    location.origin,
  );
  app.pvPulse++;
}

let debounce = null;
export function schedulePreview(statusMsg) {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    pushPreview();
    if (statusMsg !== false) setStatus("draft edited — preview updated (unsaved)");
  }, 300);
}

export function sendKey(k) {
  if (pvWindow) pvWindow.postMessage({ type: "harmonium_key", key: k }, location.origin);
}

window.addEventListener("message", (ev) => {
  if (ev.origin !== location.origin) return;
  const m = ev.data || {};
  if (m.type === "harmonium_ready") { app.pvReady = true; pushPreview(); }
  else if (m.type === "harmonium_error") setStatus("preview: " + m.message, "err");
  /* the preview reports every landing (v0.79.1) so the soft remote
     can wash the keys the CURRENT page actually answers */
  else if (m.type === "harmonium_screen") app.pvScreen = m.screen || "";
  else if (m.type === "harmonium_applied") app.pvScreen = m.screen || app.pvScreen;
});

/* ---- entity registry for pickers (live HA states) ---- */
export async function loadEntities() {
  try {
    const r = await fetch("/api/states", { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) return;
    const states = await r.json();
    app.entities = states
      .map((s) => ({
        entity_id: s.entity_id,
        name: s.attributes?.friendly_name || s.entity_id,
        state: s.state,
        source_list: s.attributes?.source_list || null,
        /* attribute NAMES only (v0.79.1): the ⚙ Status-line "+" picker
           offers {token}s from these — values stay on the wire, the
           engine reads them live. Without this the picker knew only
           "state" (loadEntities had dropped attributes wholesale). */
        attrs: Object.keys(s.attributes || {}),
        device_class: s.attributes?.device_class || null,
      }))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  } catch { /* pickers degrade to free text */ }
}
/* THE PLATFORM FACT (v0.45.2, Suresh: "too much guesswork"): which
   integration owns an entity is the TRUE discriminator for channel
   claims (androidtv = the ADB command channel; androidtv_remote = the
   push-state twin) — never the entity NAME. /api/states doesn't carry
   platform, so fetch the entity registry once over the websocket.
   Failure degrades silently: platformOf() returns null and callers
   fall back to their old heuristics. */
export async function loadRegistry() {
  try {
    const ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/websocket");
    const done = new Promise((resolve) => {
      const bail = setTimeout(() => { try { ws.close(); } catch {} resolve(); }, 6000);
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "auth_required")
          ws.send(JSON.stringify({ type: "auth", access_token: token() }));
        else if (m.type === "auth_ok")
          ws.send(JSON.stringify({ id: 7, type: "config/entity_registry/list" }));
        else if (m.type === "result" && m.id === 7) {
          const map = {};
          for (const e of m.result || [])
            if (e.entity_id && e.platform) map[e.entity_id] = e.platform;
          app.registry = map;
          clearTimeout(bail);
          try { ws.close(); } catch {}
          resolve();
        }
      };
      ws.onerror = () => { clearTimeout(bail); resolve(); };
    });
    await done;
  } catch { /* no registry — heuristics carry on */ }
}
export const platformOf = (entId) => app.registry[entId] || null;

/* IMPLIED DEVICES (v0.45.2 — the library is a BYPRODUCT, not a
   prerequisite): integration siblings share the object stem
   (media_player.X + remote.X + media_player.X_adb_…). Group by stem,
   seed claims by PLATFORM FACT where the registry has one (androidtv
   = the ADB commands channel), name-regex only as the fallback. */
export function impliedStem(entId) {
  return (entId.split(".")[1] || "")
    .replace(/_adb(_\d+){0,4}$/, "").replace(/(_\d+){1,4}$/, "");
}
const isAdbEnt = (e) => {
  const pf = platformOf(e);
  return pf ? pf === "androidtv" : /_adb(_|$)/.test(e);
};
export function seedDeviceFromEntity(fromEnt) {
  const stem = impliedStem(fromEnt) || "new_device";
  const dev = { name: stem.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: "material:tv", roles: {} };
  const sibs = app.entities.filter((e) => impliedStem(e.entity_id) === stem)
    .map((e) => e.entity_id);
  const list = sibs.length ? sibs : [fromEnt];
  const applyClaims = (e) => {
    const dom = e.split(".")[0];
    if (dom === "media_player") {
      dev.roles.media_player ||= e;
      dev.roles.power ||= e;
      dev.roles.volume ||= e;
      dev.roles.volume_level ||= e;
      if ((app.entities.find((x) => x.entity_id === e)?.source_list || []).length)
        dev.roles.source_select ||= e;
      dev.roles.commands ||= e;
    }
    if (dom === "remote") dev.roles.dpad ||= e;
  };
  /* preferred pass: the push-state twins (androidtv_remote, tizen, …) */
  for (const e of list.filter((e) => !isAdbEnt(e))) applyClaims(e);
  /* the ADB media_player IS the commands channel — hard assignment */
  for (const e of list.filter(isAdbEnt))
    if (e.startsWith("media_player.")) dev.roles.commands = e;
  /* gap-fill: single-integration devices (Fire TV is androidtv-only) */
  for (const e of list.filter(isAdbEnt)) applyClaims(e);
  /* (v0.48.3's MA-twin claim swap was REVERTED in v0.49 before it
     ever deployed — wrong layer. The music library now speaks the
     STANDARD media_player/browse_media + play_media contract, so the
     NATIVE player is the right claim; no ma_ name heuristics.) */
  /* SEARCH, THE ONE PLACE THE TWIN IS RIGHT (v0.69). Playback stays
     native — that is settled. But searching is the job the native
     player usually cannot do, and its Music Assistant twin can. This
     is a SUGGESTION IN AN EDITOR, not an inference in the engine:
     seeded here as a default the user can see and change, never
     guessed at runtime. That distinction is what separates it from
     the v0.49 revert. Claimed by PLATFORM (the registry knows), with
     the ma_ name only as the fallback the registry makes unnecessary. */
  if (!dev.roles.search && dev.roles.media_player) {
    const twin = app.entities
      .map((x) => x.entity_id)
      .find((e) => e.startsWith("media_player.") &&
        (platformOf(e) === "music_assistant" ||
         (!platformOf(e) && /^media_player\.ma_/.test(e))) &&
        impliedStem(e).replace(/^ma_/, "") === stem.replace(/^ma_/, ""));
    if (twin) dev.roles.search = twin;
    else if (platformOf(dev.roles.media_player) === "music_assistant")
      dev.roles.search = dev.roles.media_player;
  }
  return { stem, dev };
}
/* stem groups not yet represented in the library — the ⊞ rows the
   unified cast picker offers (≥2 members; singles cast directly) */
export function impliedGroups() {
  const lib = app.draft?.devices || {};
  const claimed = new Set();
  for (const d of Object.values(lib))
    for (const ent of Object.values(d.roles || {})) claimed.add(ent);
  const groups = {};
  for (const e of app.entities) {
    const dom = e.entity_id.split(".")[0];
    if (dom !== "media_player" && dom !== "remote") continue;
    if (claimed.has(e.entity_id)) continue;
    const stem = impliedStem(e.entity_id);
    if (!stem) continue;
    (groups[stem] ||= []).push(e.entity_id);
  }
  return Object.entries(groups).filter(([, ents]) => ents.length >= 2)
    .map(([stem, ents]) => ({ stem, ents }));
}

/* HA SERVICE CATALOG (v0.47.6 — Suresh: "can I get a drop down of
   what I can choose (with Search)?"): /api/services once at load;
   pickers degrade to free text when it's unreachable. */
export async function loadServices() {
  try {
    const r = await fetch("/api/services", { headers: { Authorization: "Bearer " + token() } });
    if (!r.ok) return;
    const doms = await r.json();
    const out = [];
    for (const d of doms)
      for (const [svc, meta] of Object.entries(d.services || {}))
        out.push({ id: d.domain + "." + svc, name: meta?.name || "" });
    app.services = out.sort((a, b) => a.id.localeCompare(b.id));
  } catch { /* free text carries on */ }
}

export function entitiesFor(domains) {
  if (!domains || !domains.length) return app.entities;
  return app.entities.filter((e) => domains.includes(e.entity_id.split(".")[0]));
}

/* ---- UNDO TOAST (redesign §7.1): nothing is destructive until
   Save & Deploy, and even in the draft a Remove gets 10 seconds of
   regret. One toast at a time — a new one replaces the old. ---- */
let undoFn = null;
let toastTimer = null;
export function showUndo(msg, fn) {
  clearTimeout(toastTimer);
  undoFn = fn;
  app.toast = { msg };
  toastTimer = setTimeout(() => { app.toast = null; undoFn = null; }, 10000);
}
export function undoToast() {
  clearTimeout(toastTimer);
  undoFn?.();
  undoFn = null;
  app.toast = null;
  schedulePreview();
}
export function dismissToast() {
  clearTimeout(toastTimer);
  undoFn = null;
  app.toast = null;
}

/* ---- DIRTY STATE (redesign §7.2): "green means you did this".
   The baseline is the last-saved copy, held as canonical-JSON sets —
   an item edited BACK to its saved shape reads clean again, and
   reordering alone doesn't mark anything. Rebuilt on load, save,
   and workspace switch (revert needs nothing: baseline is vs saved). */
const baseline = { tiles: new Set(), acts: new Map() };
export function rebaseline() {
  app.baseVer++;
  baseline.tiles.clear();
  baseline.acts.clear();
  const cfg = app.saved;
  if (!cfg) return;
  for (const scr of Object.values(cfg.screens || {})) {
    for (const t of scr.tiles || []) baseline.tiles.add(JSON.stringify(t));
    for (const s of scr.sections || [])
      for (const t of s.tiles || []) baseline.tiles.add(JSON.stringify(t));
  }
  for (const [id, a] of Object.entries(cfg.activities || {}))
    baseline.acts.set(id, JSON.stringify(a));
}
export function tileDirty(tile) {
  void app.baseVer;   /* reactive dep: chips re-check after save */
  if (!baseline.tiles.size && !baseline.acts.size) return false;
  return !baseline.tiles.has(JSON.stringify($state.snapshot(tile)));
}
export function actDirty(id, a) {
  void app.baseVer;
  if (!baseline.acts.size && !baseline.tiles.size) return false;
  const b = baseline.acts.get(id);
  return b === undefined || b !== JSON.stringify($state.snapshot(a));
}

/* ---- toolbar actions ---- */
export function revert() {
  app.draft = JSON.parse(JSON.stringify(app.saved));
  pushPreview();
  setStatus("reverted to saved config", "ok");
}

export async function save() {
  if (app.sandbox) return false;
  app.problems = [];
  setStatus("saving…");
  const r = await api("POST", $state.snapshot(app.draft),
    /* main omits the query — byte-compatible with the pre-workspace
       API during the restart window */
    app.workspace === "main" ? "" : "?ws=" + encodeURIComponent(app.workspace));
  const body = await r.json();
  if (r.status === 422) {
    app.problems = body.problems || [];
    setStatus("validation failed — nothing deployed", "err");
    return false;
  }
  if (!r.ok) { setStatus("save failed: HTTP " + r.status, "err"); return false; }
  app.saved = JSON.parse(JSON.stringify($state.snapshot(app.draft)));
  rebaseline();
  app.virgin = false;   // the store exists now — no longer a fresh install
  setStatus("saved & deployed — remotes pick it up on next reload", "ok");
  return true;
}

export async function saveAndReload() {
  if (!(await save())) return;
  const press = (eid) =>
    fetch("/api/services/button/press", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: eid }),
    });
  try {
    await press(localStorage.getItem("hakr_cachebtn") || "button.astrion1_clear_browser_cache");
    await press(localStorage.getItem("hakr_reloadbtn") || "button.astrion1_load_start_url");
    setStatus("saved, deployed, Astrion reloading", "ok");
  } catch (e) {
    setStatus("saved — but Astrion reload failed: " + e.message, "err");
  }
}

/* Test a building block: harmonium.run executes the SAVED copy
   (the store), so unsaved edits need a Save & Deploy first. */
export async function testSequence(id) {
  setStatus("running '" + id + "'\u2026");
  try {
    const r = await fetch("/api/services/harmonium/run", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify(app.workspace === "main"
        ? { sequence: id }
        : { sequence: id, workspace: app.workspace }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    setStatus("sequence '" + id + "' ran (note: Test runs the last SAVED copy)", "ok");
  } catch (e) {
    setStatus("test failed: " + e.message +
      (app.sandbox ? " \u2014 install the integration to run sequences" : ""), "err");
  }
}

export function connectToken(t) {
  localStorage.setItem("hakr_token", t.trim());
  localStorage.setItem("hakr_host", location.host);
  app.authOpen = false;
  boot();
}

/* ---- boot ---- */
export async function boot() {
  if (!token()) { app.authOpen = true; return; }
  await loadWorkspaces();
  /* land on the workspace this browser was last editing (if it still
     exists) */
  const last = localStorage.getItem("hakr_studio_ws");
  const startWs = last && app.workspaces[last] ? last : "main";
  app.workspace = startWs;
  let r;
  try {
    r = await api("GET", null,
      startWs === "main" ? "" : "?ws=" + encodeURIComponent(startWs));
  } catch { return; }
  if (r.status === 404 && startWs !== "main") {
    /* stale pin — fall back to main */
    app.workspace = "main";
    try { r = await api("GET"); } catch { return; }
  }
  if (r.status === 404) {
    /* Integration not installed (or store empty): fall back to the
       deployed config read-only. Everything works except Save. */
    try {
      const d = await fetch("/local/harmonium/config.json?ts=" + Date.now());
      if (!d.ok) throw new Error("HTTP " + d.status);
      app.sandbox = true;
      app.saved = await d.json();
    } catch (e) {
      /* VIRGIN INSTALL (v0.83.9, the first .88 HACS test): the API is
         ALIVE (it answered the 404 itself) and /local has nothing —
         that's a fresh install with an empty store, not a broken one.
         Mint the starter into the editor; the first Save & Deploy
         creates the store AND deploys config.json (a remote that
         pairs before that will 404 until the first save). */
      void e;
      app.saved = starterConfig();
      app.virgin = true;
    }
  } else if (!r.ok) {
    setStatus("load failed: HTTP " + r.status, "err");
    return;
  } else {
    app.saved = await r.json();
  }
  /* ONE config door, ONE normalizer (v0.79.1): this boot path had
     hand-rolled the chain and drifted — normalizeSectionOrder (the
     liturgy heal) never ran on the config you actually boot into.
     Same unification importConfig got in v0.75. */
  normalizeConfig(app.saved);
  app.draft = JSON.parse(JSON.stringify(app.saved));
  rebaseline();
  const devs = Object.keys(app.draft.remotes || {});
  app.device = devs.includes("astrion") ? "astrion" : devs[0] || "default";
  /* the WORKSPACE MAP is the landing slice (redesign §6.11 —
     Suresh: default = yes): the whole workspace at a glance, every
     card an Edit → doorway into the real editors */
  selectSlice("map");
  pushPreview();
  loadEntities();
  loadRegistry();
  loadServices();
  setStatus(
    app.virgin
      ? "fresh install — starter workspace loaded (a draft). Look around, " +
        "then Save & Deploy to create your config; remotes can load it after that"
      : (app.sandbox ? "SANDBOX (integration not installed — Save disabled) — " : "loaded — ") +
        Object.keys(app.draft.screens).length + " views, " +
        Object.keys(app.draft.activities || {}).length + " activities",
    app.sandbox ? "err" : "ok",
  );
}

/* ---- PAIRING, THE STUDIO SIDE (v0.81 — beta-gaps §1) ----
   The remote shows a code; we show the SAME code (polled from the
   integration's broker); the human compares and clicks Approve. THE
   STUDIO MINTS THE TOKEN — auth/long_lived_access_token on our own
   authenticated websocket, the documented path — so every paired
   remote is a NAMED token in this user's HA profile, individually
   revocable there. The broker only ferries it, once. */
export const pairs = $state({ pending: [], busy: "", err: "" });

/* a tab whose token is absent or revoked must NOT hammer pair_admin —
   HA's http.ban logs every 401 as a login attempt and will eventually
   BAN the IP (v0.81.2 — measured: a stale Studio tab produced a 401
   every 10s at 16:44). No token = skip; a real 401 = stop for good
   (reload after fixing the token). */
let pairPollDead = false;

export async function pollPairs() {
  if (pairPollDead || !token()) return;
  try {
    const r = await fetch("/api/harmonium/pair_admin",
      { headers: { Authorization: "Bearer " + token() }, cache: "no-store" });
    if (r.status === 401 || r.status === 403) { pairPollDead = true; return; }
    if (!r.ok) return;
    pairs.pending = (await r.json()).pending || [];
  } catch { /* offline / sandbox — banner just stays empty */ }
}

function mintPairToken(clientName) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/websocket");
    const bail = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("timeout")); }, 8000);
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "auth_required")
        ws.send(JSON.stringify({ type: "auth", access_token: token() }));
      else if (m.type === "auth_ok")
        ws.send(JSON.stringify({ id: 9, type: "auth/long_lived_access_token",
          client_name: clientName, lifespan: 3650 }));
      else if (m.type === "result" && m.id === 9) {
        clearTimeout(bail);
        try { ws.close(); } catch {}
        if (m.success && m.result) resolve(m.result);
        else reject(new Error(m.error?.message || "mint refused"));
      }
    };
    ws.onerror = () => { clearTimeout(bail); reject(new Error("websocket error")); };
  });
}

export async function approvePair(p) {
  pairs.busy = p.session; pairs.err = "";
  try {
    /* THE CODE IS THE SUFFIX (v0.81.2 — field day one: "clicking
       approve isn't doing anything", and the HA log said why four
       times over: `ValueError: Harmonium astrion already exists`.
       async_create_refresh_token refuses duplicate client_names, so
       a re-paired remote could never approve twice. The offer's code
       is random per pairing — a collision-proof, human-readable
       suffix. Retired tokens still deserve deleting in the profile,
       but they no longer BLOCK. */
    const name = "Harmonium " + (p.name || "remote") + " " + p.code;
    const minted = await mintPairToken(name);
    const r = await fetch("/api/harmonium/pair_admin", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify({ session: p.session, token: minted }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    setStatus("remote paired — token “" + name + "” (revocable in your HA profile)", "ok");
  } catch (e) {
    /* loud, IN the banner — the status line whispers (v0.81.2) */
    pairs.err = "Pairing failed: " + e.message +
      (/already exists/.test(e.message)
        ? " — delete the old token in your HA profile (Security → long-lived tokens) and approve again"
        : "");
    setStatus("pairing failed: " + e.message, "err");
  }
  pairs.busy = "";
  await pollPairs();
}

export async function denyPair(p) {
  try {
    await fetch("/api/harmonium/pair_admin", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify({ session: p.session, deny: true }),
    });
  } catch { /* it expires on its own */ }
  await pollPairs();
}

pollPairs();
setInterval(pollPairs, 10000);

/* ---- VERSION & UPDATE CHECK (v0.82 — the HACS story; the in-app
   update checker is the one trick worth stealing from the dckiller51
   fork, beta-gaps §2). The integration reports its manifest version
   on the unauthenticated engine_version endpoint; GitHub's latest
   release says whether a newer one exists. Silent on every failure —
   including "repo not published yet", which is today's state. ---- */
export const version = $state({ integration: "", engine: "", latest: "", url: "" });

function verNewer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

export async function loadVersion() {
  try {
    const r = await fetch("/api/harmonium/engine_version", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    version.integration = j.integration || "";
    version.engine = j.v || "";
  } catch { return; }
  if (!version.integration) return;
  try {
    const g = await fetch(
      "https://api.github.com/repos/skavan/harmonium/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } });
    if (!g.ok) return;
    const rel = await g.json();
    const tag = String(rel.tag_name || "").replace(/^v/, "");
    if (tag && verNewer(tag, version.integration)) {
      version.latest = tag;
      version.url = rel.html_url || "";
    }
  } catch { /* offline or repo not public yet — say nothing */ }
}

loadVersion();
