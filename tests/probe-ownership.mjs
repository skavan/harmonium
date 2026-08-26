/* THE OWNERSHIP REFEREE (v0.85.7 — "bucket every part into stock /
   variant / user, and handle all 3 like grown-ups"). This pins the
   contract that replaces blind gen-healing:

     pristine (fingerprint matches ANY shipped shape) → repo wins,
       silent heal to current;
     edited-in-place (unknown fingerprint under a stock id) → the
       USER wins: legitimized as their fork (variant_of + note),
       never healed again, Reset to built-in offered in the Studio;
     fork (variant_of) → untouched, always;
     and the failure direction: an unrecognized-but-pristine shape
       costs a notice, never data, never a stranding.

   Fixtures are REAL: the v0.84.1 starter as extracted from the git
   tag (tools/starter-history/), i.e. the exact config every beta
   install was born with. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureStockControllers, STOCK_MUSIC, STOCK_TV, STOCK_DIALECTS,
  STOCK_REMOTE_PROFILES, currentStockController }
  from "../studio-src/src/lib/stocklib.js";
import { controllerFp, unitFp, classifyController, stableStringify, sha1hex }
  from "../studio-src/src/lib/ownership.js";
import HISTORY from "../studio-src/src/lib/stock-history.js";

const here = dirname(fileURLToPath(import.meta.url));
const v0841 = () => JSON.parse(readFileSync(
  join(here, "../tools/starter-history/starter-v0.84.1.json"), "utf8"));
const errs = [];
const ck = (name, cond) => { if (!cond) errs.push(name); };
const tilesOf = c => (c.tiles || [])
  .concat(...(c.sections || []).map(s => s.tiles || []));

/* --- fingerprint machinery is deterministic and order-blind --- */
ck("stable stringify ignores key order",
  stableStringify({ a: 1, b: [{ y: 2, x: 3 }] }) ===
  stableStringify({ b: [{ x: 3, y: 2 }], a: 1 }));
ck("sha1 of empty string is the known constant",
  sha1hex("") === "da39a3ee5e6b4b0d3255bfef95601890afd80709");
ck("fp blind to gen/parent/variant bookkeeping",
  controllerFp(STOCK_MUSIC) ===
  controllerFp(Object.assign(JSON.parse(JSON.stringify(STOCK_MUSIC)),
    { gen: 3, parent: "porch" })));

/* --- history sanity: every current shape is in its own history --- */
for (const cid of ["music", "tv", "apps", "music_library", "media"])
  ck("history includes current " + cid,
    (HISTORY.controllers[cid] || []).indexOf(
      controllerFp(currentStockController(cid))) >= 0);

/* --- classification on the real v0.84.1 shapes --- */
const base = v0841();
ck("v0.84.1 music classifies pristine",
  classifyController(base.controllers.music, STOCK_MUSIC,
    HISTORY.controllers.music) === "pristine");
ck("current music classifies current",
  classifyController(JSON.parse(JSON.stringify(STOCK_MUSIC)), STOCK_MUSIC,
    HISTORY.controllers.music) === "current");
{
  const edited = JSON.parse(JSON.stringify(base.controllers.music));
  tilesOf(edited)[0].label = "MINE";
  ck("edited v0.84.1 music classifies edited",
    classifyController(edited, STOCK_MUSIC, HISTORY.controllers.music) === "edited");
}

/* --- 1. a pristine v0.84.1 install heals wholesale, silently --- */
{
  const cfg = v0841();
  ensureStockControllers(cfg);
  ck("pristine: music healed to current gen", cfg.controllers.music.gen === STOCK_MUSIC.gen);
  ck("pristine: music gained the band sections", (cfg.controllers.music.sections || []).length > 1);
  ck("pristine: tv healed + transport gated",
    cfg.controllers.tv.gen === STOCK_TV.gen &&
    tilesOf(cfg.controllers.tv).some(t => t.unless === "physical_transport"));
  ck("pristine: nothing was legitimized",
    !cfg.controllers.music.variant_of && !cfg.controllers.tv.variant_of);
  ck("pristine: astrion keymap refreshed to current",
    unitFp(cfg.remotes.astrion.keymap) ===
    unitFp(STOCK_REMOTE_PROFILES.astrion.keymap));
  ck("pristine: all four stock dialects present",
    ["firetv", "tizen", "googletv", "appletv"].every(d => cfg.dialects[d]));
}

/* --- 2. an edited-in-place v0.84.1 music is the USER'S: preserved,
       legitimized, unlocked — and never healed again --- */
{
  const cfg = v0841();
  tilesOf(cfg.controllers.music)[0].label = "MY LABEL";
  cfg.controllers.music.parent = "porch";
  ensureStockControllers(cfg);
  const m = cfg.controllers.music;
  ck("edited: content preserved verbatim", tilesOf(m)[0].label === "MY LABEL");
  ck("edited: legitimized as their fork", m.variant_of === "music");
  ck("edited: carries the note", m.forked_by_update &&
    m.forked_by_update.stock_gen === STOCK_MUSIC.gen);
  ck("edited: parent (content graph) kept", m.parent === "porch");
  ck("edited: no stock gen left behind", !("gen" in m));
  ck("edited: the REST of the install still healed",
    cfg.controllers.tv.gen === STOCK_TV.gen);
  const once = JSON.stringify(cfg);
  ensureStockControllers(cfg);
  ck("edited: heal is idempotent (never re-fought)", JSON.stringify(cfg) === once);
}

/* --- 3. a real fork (⧉ duplicate) is untouched, always --- */
{
  const cfg = v0841();
  cfg.controllers.my_music = { variant_of: "music", name: "Mine", tiles: [] };
  ensureStockControllers(cfg);
  ck("fork: duplicate untouched", cfg.controllers.my_music.tiles.length === 0 &&
    !cfg.controllers.my_music.forked_by_update);
}

/* --- 4. per-key referees: keymap and dialect dpad_commands --- */
{
  const cfg = v0841();
  cfg.remotes.astrion.keymap.F9 = "my_custom";          // one remapped key
  ensureStockControllers(cfg);
  ck("keymap: remapped map is theirs, kept verbatim",
    cfg.remotes.astrion.keymap.F9 === "my_custom" &&
    unitFp(cfg.remotes.astrion.keymap) !==
    unitFp(STOCK_REMOTE_PROFILES.astrion.keymap));
}
{
  const cfg = v0841();
  ensureStockControllers(cfg);                          // plants appletv
  cfg.dialects.appletv.dpad_commands.back = "my_back";  // user override
  ensureStockControllers(cfg);
  ck("dpad: edited commands are theirs",
    cfg.dialects.appletv.dpad_commands.back === "my_back");
  const cfg2 = v0841();
  ensureStockControllers(cfg2);
  ck("dpad: pristine commands track current",
    unitFp(cfg2.dialects.appletv.dpad_commands) ===
    unitFp(STOCK_DIALECTS.appletv.dpad_commands));
}

/* --- 5. reset-to-built-in semantics (the un-fork the Studio offers):
       current stock shape, bookkeeping cleared --- */
{
  const cfg = v0841();
  tilesOf(cfg.controllers.music)[0].label = "MY LABEL";
  ensureStockControllers(cfg);
  const fresh = currentStockController("music");
  if (cfg.controllers.music.parent) fresh.parent = cfg.controllers.music.parent;
  cfg.controllers.music = fresh;                        // what the button does
  ck("reset: back to current stock",
    classifyController(cfg.controllers.music, STOCK_MUSIC,
      HISTORY.controllers.music) === "current");
  const before = JSON.stringify(cfg.controllers.music);
  ensureStockControllers(cfg);
  ck("reset: stays locked-current afterwards",
    JSON.stringify(cfg.controllers.music) === before);
}

/* --- 6. whole-dialect tracking (Suresh: "stock dialects; if edited
       that becomes a user dialect — revert or copy-paste any time"):
       pristine shipped shape → tracks stock WHOLESALE (new apps
       arrive); one edit (a deletion counts) → theirs, untouched --- */
{
  const old835 = JSON.parse(readFileSync(
    join(here, "../tools/starter-history/starter-v0.83.5.json"), "utf8"));
  const cfg = { controllers: {},
    dialects: { googletv: JSON.parse(JSON.stringify(old835.dialects.googletv)) } };
  ensureStockControllers(cfg);
  ck("dialect: pristine old shape tracks stock wholesale",
    unitFp(cfg.dialects.googletv) === unitFp(STOCK_DIALECTS.googletv));

  const cfg2 = { controllers: {},
    dialects: { googletv: JSON.parse(JSON.stringify(STOCK_DIALECTS.googletv)) } };
  delete cfg2.dialects.googletv.apps[Object.keys(cfg2.dialects.googletv.apps)[0]];
  const theirFp = unitFp(cfg2.dialects.googletv);
  ensureStockControllers(cfg2);
  ck("dialect: a curated deletion makes it theirs — untouched",
    unitFp(cfg2.dialects.googletv) === theirFp);
}

console.log(JSON.stringify({
  historyUnits: Object.keys(HISTORY.controllers).length,
  ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
