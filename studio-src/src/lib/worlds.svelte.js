/* Workspaces & porting — the worlds layer.

   Roster CRUD against /api/harmonium/workspaces, the workspace
   switch (with its in-memory draft stash so unsaved edits survive
   the trip), and config export/import: single-file with the
   `_workspace` stamp, the all-workspaces bundle, and the
   ImportDialog's resolve flow. Split out of state.svelte.js
   (v0.83.11 round 2); state re-exports everything here. */
import { app, api, setStatus, selectSlice, pushPreview, rebaseline,
  roomIds, normalizeConfig, starterConfig, previewGoto, token } from "./state.svelte.js";

const WS_API = "/api/harmonium/workspaces";

const wsStash = {};

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
  previewGoto(app.draft.home_screen);
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
