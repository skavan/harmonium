/* STOCK REMOTE PROFILE HEALING (v0.85.3 — the .88 box: "updated via
   HACS and it doesn't even show the RS90"). The rs90 profile was born
   in starter-config.json, which only a VIRGIN install reads — so no
   existing house ever gained it. healStockRemotes is the dialect cure
   applied to profiles: PLANT-IF-ABSENT, never overwrite. This pins:
     1. a config without rs90 gains the full profile — keymap,
        capabilities, and the CURRENT stock skin (gen included, so the
        planted profile is born healed);
     2. an existing profile is never touched, however customised;
     3. idempotent — a second run changes nothing;
     4. a config with no remotes at all gets the stock set. */
import { STOCK_REMOTE_PROFILES, STOCK_SKINS, healStockRemotes }
  from "../studio-src/src/lib/stocklib.js";

const errs = [];
const ck = (name, cond) => { if (!cond) errs.push(name); };

/* --- 1. plant into an existing house (the .88 case) --- */
const cfgA = { remotes: {
  default: { capabilities: ["touch", "pointer"], keymap: {} },
  astrion: { capabilities: ["touch"], keymap: { F9: "custom" } },   // theirs, remapped (old caps)
} };
healStockRemotes(cfgA);
ck("rs90 planted", !!cfgA.remotes.rs90);
ck("rs90 keymap complete",
  Object.keys(cfgA.remotes.rs90.keymap).length ===
  Object.keys(STOCK_REMOTE_PROFILES.rs90.keymap).length);
ck("rs90 capabilities complete",
  JSON.stringify(cfgA.remotes.rs90.capabilities) ===
  JSON.stringify(STOCK_REMOTE_PROFILES.rs90.capabilities));
ck("rs90 skin planted from STOCK_SKINS (single skin truth)",
  cfgA.remotes.rs90.skin &&
  cfgA.remotes.rs90.skin.image === STOCK_SKINS.rs90.image);
ck("rs90 skin born current (gen stamped)",
  cfgA.remotes.rs90.skin.gen === STOCK_SKINS.rs90.gen);
ck("astrion2 planted too", !!cfgA.remotes.astrion2);

/* --- 2. an existing profile is the user's — EXCEPT capabilities,
   which are hardware facts and heal by UNION (v0.85.5 — the .88
   circuit: pre-existing astrion/astrion2 profiles predated
   physical_back_home / physical_transport, so the unless-gates had
   nothing to read; only the freshly-planted rs90 behaved). Keymap,
   skin, style, fully: still never touched. Union never removes. --- */
ck("customised astrion keymap untouched",
  cfgA.remotes.astrion.keymap.F9 === "custom" &&
  Object.keys(cfgA.remotes.astrion.keymap).length === 1);
ck("astrion capabilities healed by union (kept its own, gained stock)",
  cfgA.remotes.astrion.capabilities.includes("touch") &&
  STOCK_REMOTE_PROFILES.astrion.capabilities.every(c =>
    cfgA.remotes.astrion.capabilities.includes(c)));
ck("astrion did NOT gain transport (v1 has no transport keys)",
  !cfgA.remotes.astrion.capabilities.includes("physical_transport"));
ck("default profile (not a stock id) untouched",
  Object.keys(cfgA.remotes.default.keymap).length === 0 &&
  cfgA.remotes.default.capabilities.length === 2);

/* the .88 shape verbatim: 2026-era astrion2, no new caps at all */
const cfgU = { remotes: { astrion2: {
  capabilities: ["physical_dpad", "physical_volume", "touch"],
  fully: true, keymap: { F1: "power" } } } };
healStockRemotes(cfgU);
ck("astrion2 gains physical_transport by union",
  cfgU.remotes.astrion2.capabilities.includes("physical_transport"));
ck("astrion2 gains physical_back_home by union",
  cfgU.remotes.astrion2.capabilities.includes("physical_back_home"));
ck("astrion2 keymap and fully untouched by the union",
  cfgU.remotes.astrion2.keymap.F1 === "power" &&
  cfgU.remotes.astrion2.fully === true);

/* --- 3. idempotent --- */
const before = JSON.stringify(cfgA);
healStockRemotes(cfgA);
ck("idempotent", JSON.stringify(cfgA) === before);

/* --- 4. no remotes object at all --- */
const cfgB = {};
healStockRemotes(cfgB);
ck("remotes object created and stocked",
  cfgB.remotes && !!cfgB.remotes.rs90 && !!cfgB.remotes.astrion);

/* the planted profile must be a COPY — mutating it must not reach the
   stock truth (the classic shared-reference trap) */
cfgB.remotes.rs90.keymap.F1 = "mutated";
ck("planted profile is a deep copy",
  STOCK_REMOTE_PROFILES.rs90.keymap.F1 !== "mutated");

console.log(JSON.stringify({
  planted: Object.keys(STOCK_REMOTE_PROFILES),
  ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
