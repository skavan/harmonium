/* THE TWO-TRUTHS GUARD (v0.85.8). starter-config.json and stocklib.js
   both describe the stock shapes, and every drift between them has
   produced a REAL field bug:
     · the appletv dialect shipped in the starter only — no healer, so
       no existing install ever saw it;
     · the transport gate (unless: physical_transport) lived in the
       starter only — so gen-heal WROTE THE UNGATED SHAPE BACK over
       every install, deleting the fix on every load;
     · the starter's music controller was an ancient 5-tile flat shape
       stamped with a CURRENT gen — so virgin installs never healed and
       were born without the speakers/groups/presets/devices bands
       (a beta user's literal first bug report).
   This probe fails the battery if the two files disagree about any
   stock controller or dialect. probe-stock-skins-sync is its skin
   twin. Rule: change a stock shape in stocklib, regenerate the starter
   from it — never hand-edit both. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STOCK_MUSIC, STOCK_APPS_DRAWER, STOCK_MUSIC_LIBRARY,
  DOMAIN_STOCKS, STOCK_DIALECTS, STOCK_APP_IDENTITIES,
  GENERIC_MEDIA_CONTROLLER, STOCK_REMOTE_PROFILES, STOCK_SKINS }
  from "../studio-src/src/lib/stocklib.js";

const here = dirname(fileURLToPath(import.meta.url));
const starter = JSON.parse(readFileSync(
  join(here, "../custom_components/harmonium/starter-config.json"), "utf8"));
const errs = [];
const strip = (o, keys) => {
  const c = JSON.parse(JSON.stringify(o));
  for (const k of keys) delete c[k];
  return c;
};

/* controllers: the starter must BE the stocklib shape (parent is a
   content-graph edge the starter may carry; domain stocks gain their
   routing extras from ensureStockControllers) */
const pairs = [
  ["music", STOCK_MUSIC, []],
  ["apps", STOCK_APPS_DRAWER, []],
  ["music_library", STOCK_MUSIC_LIBRARY, []],
];
for (const [dom, stock] of Object.entries(DOMAIN_STOCKS))
  pairs.push([dom, Object.assign({}, stock,
    { domain: dom, class: "activity", view_kind: "controller", type: "controller" }), []]);
for (const [cid, stock] of pairs) {
  const st = starter.controllers[cid];
  if (!st) { errs.push("starter has no controller '" + cid + "'"); continue; }
  if (JSON.stringify(strip(st, ["parent"])) !== JSON.stringify(strip(stock, ["parent"])))
    errs.push("controllers." + cid + " drifted between starter and stocklib" +
      ((st.gen !== stock.gen) ? " (gen " + st.gen + " vs " + stock.gen + ")" : ""));
}
/* a starter gen may NEVER exceed its stock's — that combination means
   virgin installs are born broken and can never heal */
for (const [cid, stock] of pairs) {
  const st = starter.controllers[cid];
  if (st && (st.gen || 0) > (stock.gen || 0))
    errs.push("controllers." + cid + ": starter gen AHEAD of stocklib — unhealable virgin installs");
}

/* dialects: every stock dialect must match the starter's verbatim */
for (const id of Object.keys(STOCK_DIALECTS)) {
  const st = (starter.dialects || {})[id];
  if (!st) { errs.push("starter has no dialect '" + id + "'"); continue; }
  if (JSON.stringify(st) !== JSON.stringify(STOCK_DIALECTS[id]))
    errs.push("dialects." + id + " drifted between starter and stocklib");
}

/* stock-dialect app identities must exist in the starter's master
   list and match — and every stock dialect app id must resolve */
for (const [aid, ident] of Object.entries(STOCK_APP_IDENTITIES)) {
  const st = (starter.apps || {})[aid];
  if (!st) errs.push("starter master list lacks app '" + aid + "'");
  else if (JSON.stringify(st) !== JSON.stringify(ident))
    errs.push("apps." + aid + " identity drifted between starter and stocklib");
}
for (const id of Object.keys(STOCK_DIALECTS))
  for (const aid of Object.keys(STOCK_DIALECTS[id].apps || {}))
    if (!(starter.apps || {})[aid])
      errs.push("dialect " + id + " launches '" + aid + "' — not in the master list");

/* stock REMOTE PROFILES: the starter's astrion/astrion2/rs90 must BE
   stocklib's profile + STOCK_SKINS skin — the rs90 profile shipping in
   the starter ONLY is exactly how the .88 box updated and "didn't even
   show the RS90" (starter is virgin-only; healStockRemotes now plants
   these into existing installs). */
for (const [id, prof] of Object.entries(STOCK_REMOTE_PROFILES)) {
  const st = (starter.remotes || {})[id];
  if (!st) { errs.push("starter lacks stock remote profile '" + id + "'"); continue; }
  const expect = JSON.parse(JSON.stringify(prof));
  if (STOCK_SKINS[id]) expect.skin = JSON.parse(JSON.stringify(STOCK_SKINS[id]));
  const stStrip = JSON.parse(JSON.stringify(st));
  if (stStrip.skin) delete stStrip.skin.gen;      // starter skins carry no gen
  if (expect.skin) delete expect.skin.gen;
  if (JSON.stringify(stStrip) !== JSON.stringify(expect))
    errs.push("remotes." + id + " drifted between starter and stocklib");
}

/* the tv controller has NO stocklib twin (known gap, never gen-healed);
   say so if that ever changes so this probe gets extended */
if (typeof GENERIC_MEDIA_CONTROLLER === "undefined")
  errs.push("stocklib no longer exports GENERIC_MEDIA_CONTROLLER");

console.log(JSON.stringify({
  checked: pairs.map(p => p[0]).concat(Object.keys(STOCK_DIALECTS).map(d => "dialect:" + d))
    .concat(Object.keys(STOCK_REMOTE_PROFILES).map(r => "remote:" + r)),
  ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
