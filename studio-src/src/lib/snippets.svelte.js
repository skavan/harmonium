/* Snippets — reusable config blocks with metadata (v0.33,
   Suresh's spec). The store is localStorage; the types registry says
   what each block re-enters as. Split out of state.svelte.js
   (v0.83.11 round 2). */
import { setStatus } from "./state.svelte.js";

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

