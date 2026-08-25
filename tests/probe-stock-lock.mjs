/* STOCK LOCK (v0.84.5 — Suresh: "stock things should be locked; if
   users want to edit it should be on local copies"). The lock's whole
   promise: a user's fork of a stock controller is THEIRS and survives
   an update. duplicateController now stamps variant_of on a named-stock
   copy (tested in the Studio); this pure probe guards the other half —
   healStockGen must refresh the behind stock in place while leaving the
   variant_of fork untouched, byte for byte. */
import { STOCK_MUSIC, healStockGen } from "../studio-src/src/lib/stocklib.js";

const errs = [];

/* a workspace with the stock music behind a gen, plus the user's fork
   of it (what Duplicate-to-edit mints) sitting at gen 0. */
const fork = {
  variant_of: "music",
  name: "Music variant",
  gen: 0,
  class: "activity", view_kind: "controller", type: "controller",
  sections: [{ tiles: [{ id: "mine", type: "media", label: "MY EDIT" }] }],
};
const cfg = { controllers: {
  music: { variant_of: undefined, gen: 1, name: "old", parent: "porch",
    class: "activity", view_kind: "controller", type: "controller", sections: [] },
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

if (!healed) errs.push("stock music did not heal to current shape/gen");
if (!parentKept) errs.push("heal dropped the stock's content-graph parent");
if (!forkUntouched) errs.push("heal MUTATED the user's fork — the lock's promise is broken");
if (!forkKeepsEdit) errs.push("the user's edit was lost from the fork");

console.log(JSON.stringify({ healed, parentKept, forkUntouched, forkKeepsEdit,
  ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
