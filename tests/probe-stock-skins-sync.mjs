/* STOCK-SKIN RESILIENCE (v0.84.4). Two guards:
   1. DRIFT — stocklib's STOCK_SKINS geometry must match the bundled
      starter-config.json (they are two copies of the same truth; this
      test fails if a skin is updated in one place and not the other).
   2. HEAL — healStockSkins refreshes a stock-image skin whose gen is
      behind, stamps the gen, and NEVER touches a profile pointing at a
      user's own photo. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STOCK_SKINS, healStockSkins } from "../studio-src/src/lib/stocklib.js";

const here = dirname(fileURLToPath(import.meta.url));
const starter = JSON.parse(readFileSync(
  join(here, "../custom_components/harmonium/starter-config.json"), "utf8"));

const errs = [];
const stripGen = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.gen; return c; };

// 1. DRIFT GUARD
for (const id of Object.keys(STOCK_SKINS)) {
  const a = stripGen(STOCK_SKINS[id]);
  const b = starter.remotes?.[id]?.skin;
  if (!b) { errs.push(`starter has no skin for ${id}`); continue; }
  if (JSON.stringify(a) !== JSON.stringify(stripGen(b)))
    errs.push(`STOCK_SKINS.${id} drifted from starter-config`);
}

// 2. HEAL BEHAVIOR
// a) stock-image skin with no gen → healed to current geometry + gen
const cfgA = { remotes: { rs90: { skin: { gen: 0,
  image: "/local/harmonium/skins/rs90.png",
  screen: { x: 99, y: 99, w: 1, h: 1 }, buttons: [] } } } };
healStockSkins(cfgA);
const healed = cfgA.remotes.rs90.skin;
const healOk = healed.gen === STOCK_SKINS.rs90.gen &&
  healed.screen.w === STOCK_SKINS.rs90.screen.w &&
  healed.buttons.length === STOCK_SKINS.rs90.buttons.length;

// b) user's OWN photo (non-stock image path) → left untouched
const cfgB = { remotes: { rs90: { skin: { gen: 0,
  image: "/local/images/my-remote.png", screen: { x: 5, y: 5, w: 5, h: 5 }, buttons: [] } } } };
healStockSkins(cfgB);
const userKept = cfgB.remotes.rs90.skin.image === "/local/images/my-remote.png" &&
  cfgB.remotes.rs90.skin.screen.w === 5 && !cfgB.remotes.rs90.skin.gen;

// c) already-current gen → no change (idempotent)
const cfgC = { remotes: { rs90: { skin: JSON.parse(JSON.stringify(STOCK_SKINS.rs90)) } } };
const before = JSON.stringify(cfgC);
healStockSkins(cfgC);
const idempotent = JSON.stringify(cfgC) === before;

if (!healOk) errs.push("healStockSkins did not refresh a behind stock skin");
if (!userKept) errs.push("healStockSkins clobbered a user's own photo");
if (!idempotent) errs.push("healStockSkins not idempotent on a current skin");

console.log(JSON.stringify({
  driftChecked: Object.keys(STOCK_SKINS), healOk, userKept, idempotent,
  ok: errs.length === 0, errs,
}, null, 1));
if (errs.length) process.exit(1);
