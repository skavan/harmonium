/* the pure half of the state layer — stock shapes, healers, the
   starter, the normalize chain (2026-08-17 split; see stocklib.js) */
import {
  GENERIC_MEDIA_CONTROLLER, DOMAIN_STOCKS, STOCK_APPS_DRAWER,
  STOCK_MUSIC_LIBRARY, STOCK_MUSIC, healStockGen, ensureStockControllers,
  starterConfig as starterConfigLib, normalizeNavTiles, stampHost,
  normalizeHosts, normalizeOffActivity, normalizeApps, ROLE_KEYS,
  isCastGroup, SHOWS_KINDS, SHOWS_NONE, showsForDomain, showsForRoles,
  ADAPTERS, variantOptions, VARIANT_HINTS, NORMALIZE_REPORT,
  buildAuditFindings,
  compileContext, recompileContext,
  normalizeDevices, normalizeSelect as normalizeSelectLib,
  normalizeConfig as normalizeConfigLib, currentStockController } from "./stocklib.js";
export {
  GENERIC_MEDIA_CONTROLLER, DOMAIN_STOCKS, STOCK_APPS_DRAWER,
  STOCK_MUSIC_LIBRARY, STOCK_MUSIC, normalizeNavTiles, stampHost,
  normalizeHosts, normalizeOffActivity, normalizeApps, ROLE_KEYS,
  isCastGroup, SHOWS_KINDS, SHOWS_NONE, showsForDomain, showsForRoles,
  ADAPTERS, variantOptions, VARIANT_HINTS,
  compileContext, recompileContext,
  normalizeDevices,
};
/* wrappers close over live state so every caller keeps its
   original signature */
export const starterConfig = () =>
  starterConfigLib($state.snapshot(app.draft) || {}, app.workspace);
export const normalizeSelect = (cfg) => normalizeSelectLib(cfg, app.workspace);
export const normalizeConfig = (cfg) => normalizeConfigLib(cfg, app.workspace);

/* Harmonium Studio v2 — shared reactive state (Svelte 5 runes).
   Truth lives server-side (the integration's store); `draft` is the
   working copy; the PREVIEW is the real engine in #preview=1 mode and
   follows the draft on every valid edit. */

const API = "/api/harmonium/config";

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
  pvLock: false,    // 🔒 (round 9 — "so the preview doesn't keep jumping
                    // around, when I'm playing with colors"): context
                    // steering ignored; the Showing select still jumps
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
/* ---- the split satellites (v0.83.11 round 2) — imported for our own
   use AND re-exported, so every component keeps importing from state:
   one door, unchanged surface ---- */
import { loadWorkspaces, switchWorkspace, createWorkspace, renameWorkspace,
  deleteWorkspace, exportConfig, exportAllConfigs, importConfig,
  resolveImport, cancelImport } from "./worlds.svelte.js";
export { loadWorkspaces, switchWorkspace, createWorkspace, renameWorkspace,
  deleteWorkspace, exportConfig, exportAllConfigs, importConfig,
  resolveImport, cancelImport };
import { snips, SNIPPET_TYPES, actionSnippetSeq, presetSnippetTile,
  saveSnippet, renameSnippet, deleteSnippet, snippetsOf } from "./snippets.svelte.js";
export { snips, SNIPPET_TYPES, actionSnippetSeq, presetSnippetTile,
  saveSnippet, renameSnippet, deleteSnippet, snippetsOf };
import { loadEntities, loadRegistry, loadServices, entitiesFor, platformOf,
  impliedStem, seedDeviceFromEntity, impliedGroups } from "./registry.svelte.js";
export { loadEntities, loadRegistry, loadServices, entitiesFor, platformOf,
  impliedStem, seedDeviceFromEntity, impliedGroups };
import { pairs, pollPairs, approvePair, denyPair, version, loadVersion }
  from "./pairing.svelte.js";
export { pairs, pollPairs, approvePair, denyPair, version, loadVersion };


export const showsRole = (shows) =>
  SHOWS_KINDS.find((k) => k.value === (shows || "device"))?.role || null;

/* THE LADDER PINS, GENERALIZED (entity-controls Phase 1, decision 9:
   "any editor writing rung 2 or 3 must display rung-1 pins that
   override it, each with a one-tap clear" — the 0.86.0 volume "⚙
   pinned" readout, promoted from ControllerTab-local to the shared
   layer). Returns one activity's rung-1 pins for one adapter:
   [{k, via, value}] — `present` pins (canonical `variant`, legacy
   `style`) and, for volume, the read-only legacy device_options
   rung. New adapters with variants plug in HERE, not in the tabs. */
export function ladderPins(a, adapter) {
  const out = [];
  const pres = a?.present || {};
  for (const k in pres) {
    const v = pres[k] && (pres[k].variant || pres[k].style);
    if (v) out.push({ k, via: "present", value: v });
  }
  if (adapter === "volume") {
    const dops = a?.device_options || {};
    for (const k in dops)
      if (dops[k] && dops[k].volume_style)
        out.push({ k, via: "device_options", value: dops[k].volume_style });
  }
  return out;
}
export function clearLadderPin(a, pin) {
  if (pin.via === "present") {
    delete a.present[pin.k].variant;
    delete a.present[pin.k].style;
    if (!Object.keys(a.present[pin.k]).length) delete a.present[pin.k];
    if (!Object.keys(a.present).length) delete a.present;
  } else {
    delete a.device_options[pin.k].volume_style;
    if (!Object.keys(a.device_options[pin.k]).length) delete a.device_options[pin.k];
    if (!Object.keys(a.device_options).length) delete a.device_options;
  }
}

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


export function clearCurrent() {
  /* pass the live draft + workspace: starterConfig KEEPS the system
     layer (remotes, keymaps, theme, devices, input policy) and mints
     the workspace's own select — called bare (the bug this replaces,
     2026-08-30) it wiped all of that and minted main's select id,
     contradicting its own tooltip. */
  app.draft = starterConfig(
    JSON.parse(JSON.stringify($state.snapshot(app.draft))), app.workspace);
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
export const STUDIO_V = "0.87.0 b56";

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
  /* THE PICKER REFUSES STOCK (v0.84.6): 403 is a refusal, not a
     collision — there is no "overwrite anyway" to offer, because the
     next deploy would restore the stock file regardless. Surfaced as
     its own outcome so the caller never prompts. */
  if (r.status === 403)
    return { refused: true,
      message: (j && (j.message || j.error)) || "stock files are locked" };
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

/* LIVE ICON LOOKUP (2026-09-01 — Suresh: "live preview in the
   studio and then mint into the deployed artifacts"): one call to
   /api/harmonium/icons per unseen ref, answered by the SAME resolver
   the deploy minting uses — preview and remote can never disagree.
   Cache entries: {viewBox, path} | "missing" | "no_source". */
const _iconCache = new Map();
const _iconAuth = () => ({ headers: { Authorization: "Bearer " + token() } });
export async function lookupSetIcon(ref) {
  if (_iconCache.has(ref)) return _iconCache.get(ref);
  try {
    const r = await fetch("/api/harmonium/icons?names=" +
      encodeURIComponent(ref), _iconAuth());
    if (!r.ok) return null;              /* transient — don't cache */
    const rep = await r.json();
    if (rep.found?.[ref]) {
      _iconCache.set(ref, rep.found[ref]);
      return rep.found[ref];
    }
    /* the server can't answer — a pack the integration has no
       parser for may still answer through ITS OWN registered
       resolver (the custom-set bridge below); a hit is saved back
       so next time the server answers directly */
    const i = ref.indexOf(":");
    const cv = await resolveCustom(ref.slice(0, i), ref.slice(i + 1));
    if (cv) return cv;
    const v = rep.no_source?.length ? "no_source" : "missing";
    _iconCache.set(ref, v);
    return v;
  } catch {
    return null;
  }
}

/* AUTOCOMPLETE, HA's model (2026-09-02 — his tile-card screenshot;
   the old whole-pack pull moved ~2MB for mdi's 7,400 paths and the
   dropdown sat EMPTY meanwhile). Never move a pack: 60 rows per
   keystroke, per-(set, fragment) cached, previews seeded. */
const _listCache = new Map();  /* set|frag -> {icons, no_source} | Promise */
export function iconList(set, frag) {
  const key = set + "|" + (frag || "");
  const hit = _listCache.get(key);
  if (hit) return hit;
  const pr = (async () => {
    try {
      const r = await fetch("/api/harmonium/icons?list=" +
        encodeURIComponent(set) + "&q=" + encodeURIComponent(frag || ""),
        _iconAuth());
      if (!r.ok) { _listCache.delete(key); return null; }
      const rep = await r.json();
      for (const it of rep.icons || [])
        _iconCache.set(set + ":" + it.name,
          { viewBox: it.viewBox, path: it.path });
      _listCache.set(key, rep);
      return rep;
    } catch { _listCache.delete(key); return null; }
  })();
  _listCache.set(key, pr);
  return pr;
}

/* CROSS-SET SEARCH — one query, every installed set (the server
   interleaves so mdi can't drown the small packs) */
const _searchCache = new Map();    /* frag -> rows | Promise */
export function iconSearch(frag) {
  const key = (frag || "").toLowerCase();
  const hit = _searchCache.get(key);
  if (hit) return hit;
  const pr = (async () => {
    try {
      const r = await fetch("/api/harmonium/icons?search=" +
        encodeURIComponent(frag || ""), _iconAuth());
      if (!r.ok) { _searchCache.delete(key); return null; }
      const rep = await r.json();
      const rows = rep.icons || [];
      for (const it of rows)
        _iconCache.set(it.set + ":" + it.name,
          { viewBox: it.viewBox, path: it.path });
      _searchCache.set(key, rows);
      return rows;
    } catch { _searchCache.delete(key); return null; }
  })();
  _searchCache.set(key, pr);
  return pr;
}

/* THE CUSTOM-SET BRIDGE (2026-09-02 — "anything HA has installed",
   made literal): icon packs the integration cannot parse register
   THEMSELVES with the HA frontend (window.customIcons /
   window.customIconsets — developers.home-assistant.io 2020-05-09).
   The Studio loads the same lovelace resource modules HA's own
   frontend loads, asks each pack's registered resolver, and hands
   every answer back to the integration (POST /api/harmonium/icons),
   where it becomes a distilled file — so the set previews, searches,
   and MINTS server-side from then on, browser no longer required. */
/* a promise that CANNOT hang the caller: value, or fallback at ms.
   Round 2 (his report: "Sat there for ages with a spinning wheel and
   thereafter stopped doing anything") — a real HA's resource list is
   dozens of heavy frontend modules, and one pack's never-resolving
   getIconList held the whole picker hostage. Nothing in the bridge
   is awaited without a deadline any more. */
const _tmo = (pr, ms, fallback) => Promise.race([
  Promise.resolve(pr).catch(() => fallback),
  new Promise((res) => setTimeout(() => res(fallback), ms))]);

/* the imports run in a hidden SAME-ORIGIN IFRAME: a pack module that
   expects the full HA frontend can throw, patch globals, register
   clashing custom elements, or start timers — whatever it does stays
   in the sandbox and the Studio page cannot be broken by it. The
   iframe stays alive (the packs' resolver closures live in its
   realm); its window is where customIcons/customIconsets appear. */
let _sandboxWin = null;
async function _importInSandbox(urls) {
  const fr = document.createElement("iframe");
  fr.style.display = "none";
  fr.setAttribute("aria-hidden", "true");
  document.body.appendChild(fr);
  const win = fr.contentWindow;
  await _tmo(new Promise((res) => {
    win.__hkDone = res;
    const s = win.document.createElement("script");
    s.type = "module";
    s.textContent = "await Promise.allSettled(" + JSON.stringify(urls) +
      ".map((u) => import(u))); window.__hkDone();";
    win.document.head.appendChild(s);
  }), 6000, null);          /* slow packs: take whatever registered */
  return win;
}

/* THE DECLARATION GATE (2026-09-02 ruling: "ask users to add the
   icon prefixes they care about" — System → Icon sets, stored as
   global.icon_sets). A prefix cannot name its module (packs only
   announce themselves by running), so declaring one still means
   loading the resource list on first use — but with NOTHING
   declared, the bridge is inert: no imports, no sandbox, no cost.
   Banked (distilled) icons are server-owned and unaffected. */
export function declaredIconSets() {
  let v = app.draft?.global?.icon_sets;
  if (typeof v === "string") v = v.split(",");        /* liberal reader */
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s).trim().replace(/:$/, "").toLowerCase())
    .filter(Boolean);
}

let _customPr = null;              /* Promise<{set: {get, names}}> */
export function loadCustomSets() {
  if (_customPr) return _customPr;
  _customPr = (async () => {
    let urls = [];
    try {
      const r = await _tmo(
        fetch("/api/harmonium/icons?resources=1", _iconAuth()), 4000, null);
      if (r && r.ok) urls = (await r.json()).resources || [];
    } catch { /* no resources — bare install */ }
    let win = window;
    if (urls.length) {
      try { win = (_sandboxWin = await _importInSandbox(urls)); }
      catch { win = window; }
    }
    const out = {};
    const ci = win.customIcons || {};
    for (const k in ci)
      out[k] = { get: (n) => ci[k].getIcon(n), listFn: ci[k].getIconList };
    const cs = win.customIconsets || {};
    for (const k in cs) if (!out[k]) out[k] = { get: cs[k], listFn: null };
    /* name lists in parallel, each with its own deadline — a set
       whose listing hangs still resolves single icons by name */
    await Promise.all(Object.keys(out).map(async (k) => {
      out[k].names = [];
      if (!out[k].listFn) return;
      const l = await _tmo(
        (async () => out[k].listFn())(), 2500, null);
      if (l) out[k].names = (l || []).map((i) => i.name).filter(Boolean);
    }));
    return out;
  })();
  return _customPr;
}

/* resolved custom icons flow back to the server, batched */
const _saveQueue = new Map();
let _saveTimer = null;
function queueIconSave(ref, v) {
  _saveQueue.set(ref, v);
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const body = Object.fromEntries(_saveQueue);
    _saveQueue.clear();
    try {
      await fetch("/api/harmonium/icons", { method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json",
          Authorization: "Bearer " + token() } });
    } catch { /* next resolve re-queues */ }
  }, 1200);
}

/* DISCOVERY (Theme → "Find installed packs"): the one place the
   bridge runs WITHOUT a declaration — an explicit settings click.
   Same sandbox, same deadlines. Answers BOTH halves (round 4):
   `live` — sets the server already speaks for (activated
   hass-custom_icons prefixes: first-class, no declaration needed) —
   and `packs` — set prefixes the frontend modules registered, the
   Add offers. */
export async function discoverIconSets() {
  let live = [];
  try {
    const r = await _tmo(
      fetch("/api/harmonium/icons?sets=1", _iconAuth()), 4000, null);
    if (r && r.ok) live = (await r.json()).sets || [];
  } catch { /* older integration — no ?sets yet */ }
  const sets = await loadCustomSets();
  return { live, packs: Object.keys(sets).sort() };
}

export async function resolveCustom(set, name) {
  const ref = set + ":" + name;
  const c = _iconCache.get(ref);
  if (c && typeof c === "object") return c;
  if (!declaredIconSets().includes(set.toLowerCase())) return null;
  const sets = await loadCustomSets();
  const s = sets[set];
  if (!s) return null;
  try {
    const v = await _tmo((async () => s.get(name))(), 1500, null);
    if (!v || !v.path) return null;
    const out = { viewBox: v.viewBox || "0 0 24 24", path: v.path };
    _iconCache.set(ref, out);
    queueIconSave(ref, out);
    return out;
  } catch { return null; }
}

/* search the browser-side sets (names from getIconList); the ≤N
   matches resolve to path data before returning, so rows preview */
export async function customSearch(frag, onlySet = null, cap = 16) {
  const declared = declaredIconSets();
  if (!declared.length ||
      (onlySet && !declared.includes(onlySet.toLowerCase())))
    return [];                     /* the gate: undeclared = inert */
  const sets = await loadCustomSets();
  const canon = (n) => n.toLowerCase().replace(/[ _]/g, "-");
  const f = canon(frag || "");
  const rows = [];
  for (const k of Object.keys(sets).sort()) {
    if (onlySet && k !== onlySet) continue;
    if (!declared.includes(k.toLowerCase())) continue;
    const names = sets[k].names.filter((n) => canon(n).includes(f));
    names.sort((a, b) => (canon(a).startsWith(f) === canon(b).startsWith(f))
      ? (a.length - b.length || (a < b ? -1 : 1))
      : (canon(a).startsWith(f) ? -1 : 1));
    for (const n of names.slice(0, cap)) rows.push({ set: k, name: n });
  }
  const done = await Promise.all(rows.slice(0, cap * 2).map(async (row) => {
    const v = await resolveCustom(row.set, row.name);
    return v ? { ...row, viewBox: v.viewBox, path: v.path } : null;
  }));
  return done.filter(Boolean);
}

export async function api(method, body, query = "") {
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
  /* VIEWS — a real TREE (v0.85.7 — Suresh: "child pages should be
     slightly indented"; "I don't think we should use the word rooms
     hub... I don't even know what hub means"). The Home hub leads,
     then every top-level page, each with its `parent` children
     indented beneath it — the same nesting the Keys tab's parent
     selector creates. Badges say something true in ENGLISH or say
     nothing: an activities count when a page owns any, "overview"
     on the Home hub, blank otherwise — the old "hub"/"rooms hub"
     was the minted view_kind leaking into the UI. */
  const hub = d.global?.main_home;
  const roomSet = new Set(roomIds());
  const isNavPage = (id) => !!d.screens?.[id] &&
    !isControllerScreen(d.screens[id]) && !d.screens[id].drawer;
  const childrenOf = (id) => Object.keys(d.screens || {})
    .filter((c) => c !== id && isNavPage(c) && d.screens[c].parent === id);
  const pageSub = (id) => {
    const n = roomSet.has(id) ? ownedActivities(id).length : 0;
    if (n) return n + (n > 1 ? " activities" : " activity");
    if (id === hub) return "overview";
    return "";
  };
  const pushPage = (id, depth) => {
    if (claimed.has(id)) return;                    // cycle/dupe guard
    claimed.add(id);
    /* `deep` is the DEPTH now, not a flag (2026-09-02 — his Screens
       page under Deck under Home rendered at Deck's own indent: "I
       created what I thought was a child of Deck — but it shows as
       a peer"). The nav indents per level; truthiness keeps every
       existing deep-consumer working. */
    s.push({ key: (roomSet.has(id) && id !== hub ? "view." : "screens.") + id,
      label: d.screens[id].name || id, sub: pageSub(id), group: "Views",
      deep: depth || false });
    for (const c of childrenOf(id)) pushPage(c, (depth || 0) + 1);
  };
  if (hub && d.screens[hub]) pushPage(hub, 0);
  for (const r of roomIds())
    if (!claimed.has(r) && (!d.screens[r].parent || !isNavPage(d.screens[r].parent)))
      pushPage(r, 0);
  for (const id of Object.keys(d.screens || {}))
    if (isNavPage(id) && !claimed.has(id) &&
        (!d.screens[id].parent || !isNavPage(d.screens[id].parent)))
      pushPage(id, 0);
  for (const id of Object.keys(d.screens || {}))   // orphans (broken parents)
    if (isNavPage(id) && !claimed.has(id)) pushPage(id, 0);
  /* CONTROLLERS — DEFAULTS (the stock library) then CUSTOM (activity
     copies + custom controller pages); drawers/libraries nest ⌞ */
  const ctrls = Object.entries(d.controllers || {});
  const stock = ctrls.filter(([, c]) => !c.variant_of);
  const custom = ctrls.filter(([, c]) => c.variant_of);
  if (stock.length) s.push({ subhead: "Defaults", group: "Controllers", key: "_sh_def" });
  for (const [cid, c] of stock) {
    /* DEVICE PAGES WEAR IT (2026-09-06 — Suresh: "if the controller
       is a $device controller, we should clear flag that both in the
       controllers tree and the controller edit page") */
    s.push({ key: "controller." + cid, label: c.name || cid,
      sub: "stock", group: "Controllers", device: !!c.domain });
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
      sub: "copy of " + (d.controllers[c.variant_of]?.name || c.variant_of), group: "Controllers",
      device: !!(c.domain || d.controllers[c.variant_of]?.domain) });
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
  s.push({ key: "apps", label: "Platforms",
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
  key === "remotes" ||
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
  /* THE APPS PAGE IS TWO KEYS (v0.84.9 — Suresh: "the code button only
     shows me the master list json, not the entire apps key"). The
     visual editor on that page edits BOTH the master list and the
     dialects, so the escape hatch has to show both or the dialects —
     launch grammar, wake, D-pad commands — are invisible and
     un-copyable exactly where a user goes looking for them. Composite,
     like the "view." slice. */
  if (key === "apps") return { apps: d.apps || {}, dialects: d.dialects || {} };
  if (key === "startup") return {
    home_screen: d.home_screen, main_home: d.global?.main_home,
    screen_order: d.screen_order,
    activity_select: d.global?.activity_select, buttons: d.global?.buttons };
  return d[key];
}
export function setSlice(key, value) {
  const d = app.draft;
  if (key === "apps" && value && typeof value === "object" &&
      ("apps" in value || "dialects" in value)) {
    if (value.apps) d.apps = value.apps;
    if (value.dialects) d.dialects = value.dialects;
    schedulePreview();
    return;
  }
  if (key === "startup" && value && typeof value === "object") {
    if ("home_screen" in value) d.home_screen = value.home_screen;
    if ("screen_order" in value) d.screen_order = value.screen_order;
    if (!d.global) d.global = {};
    if ("main_home" in value) d.global.main_home = value.main_home;
    if ("activity_select" in value) d.global.activity_select = value.activity_select;
    if ("buttons" in value) d.global.buttons = value.buttons;
    schedulePreview();
    return;
  }
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
  /* a LEGITIMIZED fork (v0.85.7: an update found a pre-lock in-place
     edit and preserved it as the user's copy) points variant_of at
     ITSELF — reset means "become the built-in again": current stock
     shape, lock restored, note cleared. */
  if (inst?.variant_of === iid) {
    const fresh = currentStockController(iid);
    if (!fresh) return false;
    if (inst.parent) fresh.parent = inst.parent;
    d.controllers[iid] = fresh;
    schedulePreview();
    setStatus("reset to the built-in — updates keep it current again", "ok");
    return true;
  }
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
  /* template naming (2026-09-05, feedback-1 #3: a copy is
     "(primarily) a template … Custom Media Device 01" — never the
     source's bare name with "variant" glued on) */
  let n = 1, nid = cid + "_custom_1";
  while (d.controllers[nid]) nid = cid + "_custom_" + ++n;
  const copy = JSON.parse(JSON.stringify($state.snapshot(src)));
  copy.name = "Custom " + (copy.name || cid) + " " + String(n).padStart(2, "0");
  /* OWNERSHIP (v0.84.5 — the stock lock): a copy of a NAMED stock
     surface is the user's own — stamp variant_of so it reads as theirs
     (Edited badge, ↺ Reset to stock, and heal keeps its hands off).
     A copy of a custom copy already carries the root variant_of; a
     domain stock's per-device copy has its own door (entity picker),
     so only claim the named-stock case here. */
  if (!copy.variant_of && !copy.domain) copy.variant_of = cid;
  d.controllers[nid] = copy;
  selectSlice("controller." + nid);
  setStatus("editable copy '" + nid + "' created — the stock stays locked", "ok");
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

/* ---- THE DEVICE-PAGE PICTURE (2026-09-04, Media Device round 3 —
   Suresh: "the entry door to this setting should be in an activities
   device page and a page's device page" and "it only shows Customize
   its page, not select one"). One resolver, used by every door
   (DevicePageDoor.svelte): given an entity, what page would the
   engine open, what could be assigned instead, and where would the
   assignment live. Mirrors the engine's detailDef ladder exactly:
   the device's `page` pick → the entity-bound copy → the stock. ---- */
export function devicePageInfo(eid) {
  const d = app.draft;
  if (!d || !eid || typeof eid !== "string" || eid.startsWith("$")) return null;
  const dom = eid.split(".")[0];
  const stock = d.controllers?.[dom];
  if (!stock || stock.domain !== dom) return null;
  let devId = null, dev = null;
  for (const [k, v] of Object.entries(d.devices || {}))
    if (Object.values(v?.roles || {}).includes(eid)) { devId = k; dev = v; break; }
  const variants = Object.entries(d.controllers)
    .filter(([, c]) => c?.variant_of === dom && c.domain === dom)
    .map(([k, c]) => ({ id: k, name: c.name || k, entity: c.entity || null }));
  const ownCopy = variants.find((v) => v.entity === eid) || null;
  const assigned = dev && typeof dev.page === "string"
    ? dev.page.replace(/^controller:/, "") : null;
  const effective =
    assigned && d.controllers[assigned]?.domain === dom ? assigned
    : ownCopy ? ownCopy.id : dom;
  return { dom, stockName: stock.name || dom, devId, dev,
    variants, ownCopy, assigned, effective };
}
/* the pre-wired device's own pick — `page`, stored beside `dialect` */
export function setDevicePage(devId, cid) {
  const dev = app.draft?.devices?.[devId];
  if (!dev) return;
  if (cid) dev.page = cid; else delete dev.page;
  schedulePreview();
}
/* which of a device's role entities carries its page — the entity
   people actually tap (media_player first, then any role whose
   entity's domain has a stock page); null = no page to speak of */
export function devicePageEntity(roles) {
  const r = roles || {};
  const order = ["media_player", ...Object.keys(r).filter((k) => k !== "media_player")];
  for (const k of order) {
    const e = r[k];
    if (typeof e !== "string" || !e || e.startsWith("$")) continue;
    const dom = e.split(".")[0];
    if (app.draft?.controllers?.[dom]?.domain === dom) return e;
  }
  return null;
}

/* ---- per-device custom copy of a DOMAIN stock (Cover for the
   backwards MaestroScreen) — exactly the Media Player lifecycle */
export function instantiateDeviceController(dom, eid, asTemplate) {
  const d = app.draft;
  const tpl = d?.controllers?.[dom];
  if (!tpl?.domain || (!eid && !asTemplate)) return null;
  if (!asTemplate)
    for (const [k, c] of Object.entries(d.controllers))
      if (c.variant_of === dom && c.entity === eid) { selectSlice("controller." + k); return k; }
  const copy = JSON.parse(JSON.stringify($state.snapshot(tpl)));
  copy.variant_of = dom;
  copy.domain = dom;
  let iid;
  if (asTemplate) {
    /* A TEMPLATE, NOT A BINDING (2026-09-05, feedback-1: "its not
       custom copy for that device, its a custom copy for any
       compatible device" and "the default should be Custom Media
       Device 01"): no entity — nothing routes here until a device
       adopts it (its card's page pick, where it lists as shared) —
       and the name says template, never a device. The editor lends
       it a preview device via the device impersonation. */
    let n = 1;
    iid = dom + "_custom_1";
    while (d.controllers[iid]) iid = dom + "_custom_" + ++n;
    copy.name = "Custom " + (tpl.name || dom) + " " + String(n).padStart(2, "0");
    delete copy.entity;
  } else {
    iid = dom + "__" + eid.split(".")[1];
    let n = 2;
    while (d.controllers[iid]) iid = dom + "__" + eid.split(".")[1] + "_" + n++;
    copy.entity = eid;
    copy.name = app.entities.find((e) => e.entity_id === eid)?.name || eid;
    /* BAKE THE VOLUME WIRING (2026-09-05 drift round — Suresh:
       "Volume shows stepper in config, but compact (correct) in ui…
       Why do they drift?"): the engine used to rewrite the stock
       stepper at render when the owning device wires volume /
       volume_level — right on screen, invisible in the config, so
       the editor showed a stepper that never rendered. An
       entity-bound copy knows its device at CREATION, so the ARC
       split is written into the copy itself (canonical spelling —
       exactly the shape the old rewrite produced), and the engine
       now leaves an authored pick (variant / level_entity) alone.
       Templates and the shared stock keep the render-time upgrade:
       they serve many devices and can only resolve wiring then. */
    const ownDev = Object.values(d.devices || {}).find((v) =>
      Object.values(v?.roles || {}).includes(eid));
    const vr = ownDev?.roles?.volume, vl = ownDev?.roles?.volume_level;
    if (vr || vl) {
      const allTiles = [
        ...(copy.tiles || []),
        ...(copy.sections || []).flatMap((s) => s.tiles || []),
      ];
      for (const t of allTiles) {
        if (t.id !== "ds" || (t.kind !== "volume" && t.type !== "volume")) continue;
        if (vl) {
          t.type = "volume"; t.variant = "compact";
          t.level_entity = vl;
          /* $device stays $device when the buttons target the copy's
             own entity — the symbolic binding keeps preview-another-
             device honest; only a DIFFERENT volume role retargets */
          if (vr && vr !== eid) t.entity = vr;
          delete t.kind; delete t.slider;
        } else if (vr && vr !== eid) t.entity = vr;
      }
    }
  }
  d.controllers[iid] = copy;
  selectSlice("controller." + iid);
  schedulePreview();
  setStatus(asTemplate
    ? copy.name + " created — assign it to devices from their cards"
    : "custom " + (tpl.name || dom) + " for " + copy.name + " — the stock is untouched", "ok");
  return iid;
}

/* ---- preview plumbing ---- */
let pvWindow = null; // set by PreviewPane
export function bindPreview(win) { pvWindow = win; }
/* PREVIEW IMPERSONATION (v0.46.1): while an activity card is open the
   preview renders AS that activity — its cast, its dialect's keys,
   its apps — instead of whatever the live select holds. */
export function previewActivity(id, rolesOnly, force, bare) {
  /* MIRRORED for the editors (2026-09-05, feedback-2 follow-up:
     "$device attributes should load the relevant attributes of the
     preview device. Same for $context") — TileRow's token resolver
     reads the live pick */
  app.pvAsActivity = id || null;
  if (!pvWindow) return;
  /* the lock freezes PASSIVE impersonation (expanding a card must
     not yank a locked preview) — an EXPLICIT pick forces through
     (2026-09-06 — Suresh: "selecting an entry does nothing!": his
     padlock was honored so silently the select read as broken) */
  if (app.pvLock && !force) return;
  /* rolesOnly (2026-09-05, feedback-1): the CONTROLLER editor's
     preview-as narrows the cast to role-fillers; the activity card
     never passes it — its riders are what's being edited there */
  /* bare (2026-09-07, the ruling: activity overrides "should stay
     as is... but not permeate into a controller preview"): the
     CONTROLLER editor sends it for its whole visit; the engine then
     renders the controller's own settings with the pick's cast. The
     activity card never sends it — there the overrides are edited. */
  pvWindow.postMessage({ type: "harmonium_preview_activity",
    activity: id || null, roles_only: !!rolesOnly, bare: !!bare }, location.origin);
}
/* DEVICE impersonation (2026-09-05, feedback-1): an unbound domain
   template renders through a lent device — the engine binds its
   $device tiles from this while previewing. null clears. */
export function previewDevice(entity, force) {
  app.pvEntity = entity || null;   /* mirrored — see previewActivity */
  if (!pvWindow) return;
  if (app.pvLock && !force) return;   /* explicit picks force — see above */
  pvWindow.postMessage({ type: "harmonium_preview_device", entity: entity || null }, location.origin);
}
export function previewGoto(screen, force) {
  if (!pvWindow || !screen) return;
  /* the LOCK (round 9): while locked, only an EXPLICIT jump — the
     Showing select — moves the preview; context steering (selecting
     a page, opening a card, ⋯ Preview it) is ignored */
  if (app.pvLock && !force) return;
  pvWindow.postMessage({ type: "harmonium_navigate", screen }, location.origin);
}

/* PREVIEW ICONS (2026-09-01 — Suresh's img: a phu: icon previews in
   the field but not on the remote): the deployed file gets its
   icon_paths MINTED server-side, but the preview posts the raw
   draft — so the engine had nothing to draw. Mint here too, from
   the same resolver via the icons API: collect the draft's set
   refs, resolve the ones the cache lacks, attach icon_paths, and
   re-push when an async answer lands. */
const ICON_REF = /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;
function draftIconRefs(node, out) {
  if (Array.isArray(node)) { node.forEach((v) => draftIconRefs(v, out)); return out; }
  if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      if (k === "icon" && typeof v === "string" && ICON_REF.test(v) &&
          !v.startsWith("material:")) out.add(v);
      else draftIconRefs(v, out);
    }
  return out;
}
let _pvIconsInflight = false;
function previewIconPaths(cfg) {
  const refs = [...draftIconRefs(cfg, new Set())];
  if (!refs.length) return null;
  const out = {};
  const misses = [];
  for (const r of refs) {
    const hit = _iconCache.get(r);
    if (hit && typeof hit === "object") out[r] = hit;
    else if (hit === undefined) misses.push(r);
  }
  if (misses.length && !_pvIconsInflight) {
    _pvIconsInflight = true;
    Promise.all(misses.map((r) => lookupSetIcon(r)))
      .then(() => { _pvIconsInflight = false; schedulePreview(false); })
      .catch(() => { _pvIconsInflight = false; });
  }
  return Object.keys(out).length ? out : null;
}
export function pushPreview() {
  if (!app.pvReady || !app.draft || !pvWindow) return;
  const config = $state.snapshot(app.draft);
  const ip = previewIconPaths(config);
  if (ip) config.icon_paths = ip;
  pvWindow.postMessage(
    { type: "harmonium_config", config,
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
  /* CONTROLLERS TOO (2026-09-04, the Media Device stock round):
     the baseline read screens only, so every controller tile wore
     the EDITED chip forever — invisible while controller tiles
     weren't editable rows, loud the day they became the point.
     Same sets, same doctrine. */
  const surfaces = [
    ...Object.values(cfg.screens || {}),
    ...Object.values(cfg.controllers || {}),
  ];
  for (const scr of surfaces) {
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
  /* FAN-OUT FIRST (design-remote-fleet, 2026-09-02 — Suresh: reload
     ALL of a workspace's wired remotes, not one): one `reload` on
     the command bus reaches every ONLINE unit in this workspace over
     the subscription it already holds. The Fully-button path below
     survives as the fallback for engines older than the bus (they
     have never helloed, so `online` counts none of them). */
  try {
    const r = await fetch("/api/harmonium/command", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify({ verb: "reload", workspace: app.workspace }),
    });
    if (r.ok) {
      const b = await r.json();
      if (b.online > 0) {
        setStatus("saved, deployed — reloading " + b.online + " remote" +
          (b.online === 1 ? "" : "s"), "ok");
        return;
      }
    }
  } catch { /* integration predates the bus — the button path answers */ }
  /* WHICH BUTTONS (v0.86 — beta report: the hardcoded astrion1 names
     made this silently do nothing on any remote named differently,
     and nothing said so). Resolution ladder: the workspace's own
     wiring (map → Startup & Home → Remote reload buttons) → the old
     localStorage escape hatch → the legacy astrion1 defaults. */
  const g = app.draft?.global || {};
  const cacheBtn = g.fully_cache_button ||
    localStorage.getItem("hakr_cachebtn") || "button.astrion1_clear_browser_cache";
  const reloadBtn = g.fully_reload_button ||
    localStorage.getItem("hakr_reloadbtn") || "button.astrion1_load_start_url";
  const hdrs = { Authorization: "Bearer " + token(), "Content-Type": "application/json" };
  /* FAIL LOUDLY: HA "presses" a nonexistent button without complaint
     (the service call succeeds against no target), which is exactly
     how this failed silently. Verify both entities exist first — a
     miss names the missing id and where to wire the right one. */
  for (const eid of [cacheBtn, reloadBtn]) {
    let ok = false;
    try { ok = (await fetch("/api/states/" + eid, { headers: hdrs })).ok; } catch { }
    if (!ok) {
      setStatus("saved & deployed — but '" + eid + "' doesn't exist, so the remote was NOT reloaded. Wire your remote's Fully buttons in map → Startup & Home → Remote reload buttons.", "err");
      return;
    }
  }
  const press = (eid) =>
    fetch("/api/services/button/press", {
      method: "POST", headers: hdrs,
      body: JSON.stringify({ entity_id: eid }),
    });
  try {
    await press(cacheBtn);
    await press(reloadBtn);
    setStatus("saved, deployed, remote reloading", "ok");
  } catch (e) {
    setStatus("saved — but the remote reload failed: " + e.message, "err");
  }
}

/* Test a building block: the EDITOR'S copy runs, unsaved edits and
   all (2026-09-02 ruling: "logically, Test should run the unsaved
   version which is why someone wants to test it in the first
   place") \u2014 harmonium.run takes the draft's actions verbatim, with
   the id as the label. Saving is still needed for the remote. */
export async function testSequence(id) {
  setStatus("running '" + id + "'\u2026");
  try {
    const seq = (app.draft.sequences || {})[id];
    const body = { sequence: id,
      actions: JSON.parse(JSON.stringify(seq?.actions || [])) };
    if (app.workspace !== "main") body.workspace = app.workspace;
    const r = await fetch("/api/services/harmonium/run", {
      method: "POST",
      headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    setStatus("sequence '" + id + "' ran AS EDITED (Save & Deploy so the remote gets it too)", "ok");
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
/* THE UPGRADE AUDIT (2026-09-06, design-upgrade-audit.md — "never
   overwrite, always disclose"): once per load, after normalize/heal
   have filed their receipts, stamp the version pair and assemble the
   findings. Written to SAVED and DRAFT alike (the normalize doctrine:
   shape changes ride the next Save & Deploy without reading as an
   edit); dismissing later touches the draft only, so it persists on
   deploy. First sight of a version (fresh install, first audit) just
   writes the stamp — a report about nothing trains people to dismiss
   reports. */
async function assembleUpgradeAudit() {
  try {
    if (!app.saved || app.sandbox) return;
    const r = await fetch("/api/harmonium/engine_version", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    const to = j.integration || "";
    if (!to) return;
    const from = app.saved.last_audited_version || null;
    if (from === to) return;
    const findings = from ? buildAuditFindings(app.draft || app.saved) : [];
    for (const cfg of [app.saved, app.draft]) {
      if (!cfg) continue;
      cfg.last_audited_version = to;
      if (from && findings.length)
        cfg.audit = { from, to, at: new Date().toISOString(),
          findings: JSON.parse(JSON.stringify(findings)), dismissed: false };
      else delete cfg.audit;
    }
  } catch { /* silent — the audit never blocks a load */ }
}

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
  assembleUpgradeAudit();
  /* THE UPGRADE SUMMARY (entity-controls Phase 4): when the load
     healed legacy spellings, say so before the first post-migration
     Save & Deploy — the config changes shape once, on purpose,
     and silently would be the wrong way to do it. */
  const healed = (NORMALIZE_REPORT.variants > 0
    ? " · modernized " + NORMALIZE_REPORT.variants + " legacy spelling" +
      (NORMALIZE_REPORT.variants === 1 ? "" : "s") +
      " (style/shows → variant/type; Save & Deploy makes it permanent)"
    : "") +
    /* the pinned-dialect heal says what it moved — and names any pin
       it could NOT move, so the leftover is a visible loose end */
    (NORMALIZE_REPORT.pins > 0
      ? " · moved " + NORMALIZE_REPORT.pins + " pinned dialect" +
        (NORMALIZE_REPORT.pins === 1 ? "" : "s") + " onto the device"
      : "") +
    (NORMALIZE_REPORT.pinsKept > 0
      ? " · " + NORMALIZE_REPORT.pinsKept + " legacy dialect pin" +
        (NORMALIZE_REPORT.pinsKept === 1 ? "" : "s") +
        " kept (ambiguous — see the Roles tab)"
      : "") +
    /* the one-ordered-cast migration (feedback-3 round 3) says what
       it folded, same doctrine: shape changes once, out loud */
    (NORMALIZE_REPORT.castMerged > 0
      ? " · folded " + NORMALIZE_REPORT.castMerged + " loose entit" +
        (NORMALIZE_REPORT.castMerged === 1 ? "y" : "ies") +
        " into the cast order (Save & Deploy makes it permanent)"
      : "") +
    /* the template unbind (2026-09-06): a legacy device-bound copy
       becomes a template, its device adopting it via page: */
    (NORMALIZE_REPORT.templatesFreed > 0
      ? " · released " + NORMALIZE_REPORT.templatesFreed +
        " device controller cop" +
        (NORMALIZE_REPORT.templatesFreed === 1 ? "y" : "ies") +
        " into a template (the device keeps it via its page pick)"
      : "") +
    /* the tuner flag → chips heal (2026-09-06): one spelling */
    (NORMALIZE_REPORT.tunerChips > 0
      ? " · " + NORMALIZE_REPORT.tunerChips + " TV-tuner flag" +
        (NORMALIZE_REPORT.tunerChips === 1 ? "" : "s") +
        " became ch_up / ch_down in the passed keys"
      : "") +
    (NORMALIZE_REPORT.npDefaults > 0
      ? " · " + NORMALIZE_REPORT.npDefaults + " custom-copy Now Playing default" +
        (NORMALIZE_REPORT.npDefaults === 1 ? "" : "s") + " caught up to the stock's"
      : "");
  setStatus(
    app.virgin
      ? "fresh install — starter workspace loaded (a draft). Look around, " +
        "then Save & Deploy to create your config; remotes can load it after that"
      : (app.sandbox ? "SANDBOX (integration not installed — Save disabled) — " : "loaded — ") +
        Object.keys(app.draft.screens).length + " views, " +
        Object.keys(app.draft.activities || {}).length + " activities" + healed,
    app.sandbox ? "err" : "ok",
  );
}

