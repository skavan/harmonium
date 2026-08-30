/* STOCK HISTORY GENERATOR (v0.85.7 — the ownership referee's memory).

   Emits studio-src/src/lib/stock-history.js: for every stock unit, the
   fingerprint of every shape we EVER shipped — one entry per tagged
   starter-config.json plus the current truth. ownership.js classifies
   an install's copy against this list: fp in the list = pristine (the
   repo may refresh it); fp not in the list = the user edited it (it
   becomes their fork). Same canonicalization as the runtime — this
   script imports ownership.js, so generator and referee can never
   disagree.

   HOW TO REGENERATE (needed whenever a release changes a stock shape):
     1. refresh the snapshots (one line, from the repo root):
          for t in $(git tag); do git show $t:custom_components/harmonium/starter-config.json > tools/starter-history/starter-$t.json 2>/dev/null; done
     2. node tools/gen-stock-history.mjs
   probe-stock-sync fails the battery if the emitted file is missing
   the current shapes, so a forgotten regen cannot ship silently. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { controllerFp, unitFp } from "../studio-src/src/lib/ownership.js";
import { STOCK_MUSIC, STOCK_APPS_DRAWER, STOCK_MUSIC_LIBRARY, STOCK_TV,
  GENERIC_MEDIA_CONTROLLER, DOMAIN_STOCKS, STOCK_DIALECTS,
  STOCK_REMOTE_PROFILES, STOCK_INPUT_POLICY } from "../studio-src/src/lib/stocklib.js";

const here = dirname(fileURLToPath(import.meta.url));
const snapDir = join(here, "starter-history");
const snaps = readdirSync(snapDir).filter(f => f.endsWith(".json")).sort();

const CURRENT_CONTROLLERS = {
  music: STOCK_MUSIC, apps: STOCK_APPS_DRAWER,
  music_library: STOCK_MUSIC_LIBRARY, tv: STOCK_TV,
  media: GENERIC_MEDIA_CONTROLLER,
};
for (const [dom, stock] of Object.entries(DOMAIN_STOCKS))
  CURRENT_CONTROLLERS[dom] = Object.assign({}, stock,
    { domain: dom, class: "activity", view_kind: "controller", type: "controller" });

const add = (map, id, fp) => {
  (map[id] = map[id] || []);
  if (map[id].indexOf(fp) < 0) map[id].push(fp);
};

const controllers = {}, remoteKeymaps = {}, dialects = {}, dialectDpad = {},
  inputPolicy = {};

/* every tagged starter: the shapes as shipped */
for (const f of snaps) {
  const cfg = JSON.parse(readFileSync(join(snapDir, f), "utf8"));
  for (const cid of Object.keys(CURRENT_CONTROLLERS)) {
    const c = (cfg.controllers || {})[cid];
    if (c) add(controllers, cid, controllerFp(c));
  }
  for (const rid of Object.keys(STOCK_REMOTE_PROFILES)) {
    const r = (cfg.remotes || {})[rid];
    if (r && r.keymap) add(remoteKeymaps, rid, unitFp(r.keymap));
  }
  for (const did of Object.keys((cfg.dialects || {}))) {
    const d = cfg.dialects[did];
    add(dialects, did, unitFp(d));
    if (d.dpad_commands) add(dialectDpad, did, unitFp(d.dpad_commands));
  }
  /* v0.85.7 round 2: the input policy is a fingerprinted unit too */
  if (cfg.input && cfg.input.physical_buttons)
    add(inputPolicy, "physical_buttons", unitFp(cfg.input.physical_buttons));
}

/* the current truth (stocklib) — always in the list */
for (const [cid, c] of Object.entries(CURRENT_CONTROLLERS))
  add(controllers, cid, controllerFp(c));
for (const [rid, p] of Object.entries(STOCK_REMOTE_PROFILES))
  if (p.keymap) add(remoteKeymaps, rid, unitFp(p.keymap));
for (const [did, d] of Object.entries(STOCK_DIALECTS)) {
  add(dialects, did, unitFp(d));
  if (d.dpad_commands) add(dialectDpad, did, unitFp(d.dpad_commands));
}
add(inputPolicy, "physical_buttons", unitFp(STOCK_INPUT_POLICY));

/* ---- CATALOG HISTORY (v0.86.0, layered catalogs) ------------------
   Per-ENTRY fingerprints for the lift-out migration, python-readable
   (custom_components/harmonium/catalog-history.json): every shape a
   catalog entry ever shipped as, plus the "__absent__" marker when a
   generation LACKED the key — so a config missing that key reads as
   "older than the key", not as a curated deletion, and no tombstone
   is written. Consumed by catalogs.py (unit_fp parity: same
   normalization, same stable stringify, same sha1[:12]). */
const ABSENT = "__absent__";
const CATALOG_SUBCATS = ["apps", "keys"];
const currentStarter = JSON.parse(readFileSync(
  join(here, "../custom_components/harmonium/starter-config.json"), "utf8"));
const catalogGens = snaps.map(f =>
  JSON.parse(readFileSync(join(snapDir, f), "utf8"))).concat([currentStarter]);
const catAdd = (map, k, fp) => {
  (map[k] = map[k] || []);
  if (map[k].indexOf(fp) < 0) map[k].push(fp);
};
const catApps = {}, catDialApps = {}, catDialKeys = {}, catDialFields = {},
  catDialPresence = {};
/* unions first: every key any generation ever carried */
const allAppIds = new Set(), allDialIds = new Set();
for (const g of catalogGens) {
  for (const a of Object.keys(g.apps || {})) allAppIds.add(a);
  for (const d of Object.keys(g.dialects || {})) allDialIds.add(d);
}
for (const did of allDialIds) {
  catDialApps[did] = {}; catDialKeys[did] = {}; catDialFields[did] = {};
  for (const g of catalogGens) {
    const d = (g.dialects || {})[did];
    if (!d) continue;
    for (const k of Object.keys(d.apps || {})) catDialApps[did][k] = [];
    for (const k of Object.keys(d.keys || {})) catDialKeys[did][k] = [];
    for (const k of Object.keys(d))
      if (CATALOG_SUBCATS.indexOf(k) < 0) catDialFields[did][k] = [];
  }
}
/* then walk each generation, recording shape or absence per key */
for (const g of catalogGens) {
  for (const aid of allAppIds)
    catAdd(catApps, aid, (g.apps || {})[aid] != null
      ? unitFp(g.apps[aid]) : ABSENT);
  for (const did of allDialIds) {
    const d = (g.dialects || {})[did];
    catAdd(catDialPresence, did, d ? unitFp(d) : ABSENT);
    if (!d) continue;
    for (const k of Object.keys(catDialApps[did]))
      catAdd(catDialApps[did], k, (d.apps || {})[k] != null
        ? unitFp(d.apps[k]) : ABSENT);
    for (const k of Object.keys(catDialKeys[did]))
      catAdd(catDialKeys[did], k, (d.keys || {})[k] != null
        ? unitFp(d.keys[k]) : ABSENT);
    for (const k of Object.keys(catDialFields[did]))
      catAdd(catDialFields[did], k, d[k] !== undefined
        ? unitFp(d[k]) : ABSENT);
  }
}
const catalogHistory = { apps: catApps, dialect_apps: catDialApps,
  dialect_keys: catDialKeys, dialect_fields: catDialFields,
  dialects_presence: catDialPresence };
writeFileSync(join(here, "../custom_components/harmonium/catalog-history.json"),
  JSON.stringify(catalogHistory, null, 1) + "\n");
console.log("catalog-history.json written:",
  Object.keys(catApps).length, "apps,", allDialIds.size, "dialects");

const out = { controllers, remoteKeymaps, dialects, dialectDpad, inputPolicy };
const body =
`/* GENERATED by tools/gen-stock-history.mjs — do not hand-edit.
   Fingerprints of every stock shape ever shipped (tagged starters +
   current stocklib), consumed by ownership.js via stocklib's healers.
   Snapshots: ${snaps.join(", ")} */
export default ${JSON.stringify(out, null, 1)};
`;
writeFileSync(join(here, "../studio-src/src/lib/stock-history.js"), body);
console.log("stock-history.js written:",
  Object.fromEntries(Object.entries(out).map(([k, v]) =>
    [k, Object.fromEntries(Object.entries(v).map(([id, a]) => [id, a.length]))])));
