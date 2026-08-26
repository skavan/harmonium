/* STOCK LOCK (v0.84.5 — Suresh: "stock things should be locked; if
   users want to edit it should be on local copies"). The lock's whole
   promise: a user's fork of a stock controller is THEIRS and survives
   an update. duplicateController now stamps variant_of on a named-stock
   copy (tested in the Studio); this pure probe guards the other half —
   healStockGen must refresh the behind stock in place while leaving the
   variant_of fork untouched, byte for byte. */
import { STOCK_MUSIC, healStockGen } from "../studio-src/src/lib/stocklib.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const errs = [];
const here = dirname(fileURLToPath(import.meta.url));
/* v0.85.7: the referee heals by FINGERPRINT, not by gen alone — the
   behind-stock fixture must be a shape we actually shipped, so it
   comes from the real v0.84.1 starter (tools/starter-history/). A
   fabricated "old" shape is exercised at the bottom: it now gets
   PRESERVED (legitimized as the user's fork), never overwritten. */
const v0841music = JSON.parse(readFileSync(
  join(here, "../tools/starter-history/starter-v0.84.1.json"), "utf8"))
  .controllers.music;

/* a workspace with the stock music behind (real v0.84.1 shape), plus
   the user's fork of it (what Duplicate-to-edit mints). */
const fork = {
  variant_of: "music",
  name: "Music variant",
  gen: 0,
  class: "activity", view_kind: "controller", type: "controller",
  sections: [{ tiles: [{ id: "mine", type: "media", label: "MY EDIT" }] }],
};
const cfg = { controllers: {
  music: Object.assign(JSON.parse(JSON.stringify(v0841music)), { parent: "porch" }),
  music_variant: JSON.parse(JSON.stringify(fork)),
} };

const forkBefore = JSON.stringify(cfg.controllers.music_variant);
healStockGen(cfg);

const stock = cfg.controllers.music;
const healed = (stock.gen || 0) === STOCK_MUSIC.gen &&
  JSON.stringify(stock).includes('"speakers"');   // current shape landed
const parentKept = stock.parent === "porch";
const forkUntouched = JSON.stringify(cfg.controllers.music_variant) === forkBefore;
const forkKeepsEdit = JSON.stringify(cfg.controllers.music_variant).includes("MY EDIT");

/* the improved promise: an UNRECOGNIZED shape under a stock id is a
   pre-lock user edit — it is preserved and legitimized, never nuked */
const cfg2 = { controllers: { music: { gen: 1, name: "their rework",
  class: "activity", view_kind: "controller", type: "controller",
  sections: [{ tiles: [{ id: "x", type: "media", label: "THEIR TILE" }] }] } } };
healStockGen(cfg2);
const kept = cfg2.controllers.music;
if (kept.variant_of !== "music") errs.push("edited-in-place stock was not legitimized");
if (!JSON.stringify(kept).includes("THEIR TILE")) errs.push("edited-in-place content was lost");
if (!kept.forked_by_update) errs.push("legitimized fork missing its note");

if (!healed) errs.push("stock music did not heal to current shape/gen");
if (!parentKept) errs.push("heal dropped the stock's content-graph parent");
if (!forkUntouched) errs.push("heal MUTATED the user's fork — the lock's promise is broken");
if (!forkKeepsEdit) errs.push("the user's edit was lost from the fork");

console.log(JSON.stringify({ healed, parentKept, forkUntouched, forkKeepsEdit,
  ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
