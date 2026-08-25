/* THE STOCK/USER PATH SPLIT, config side (v0.84.6). Ownership stopped
   being a guess about bytes and became POSITIONAL — /skins/stock/ is
   ours, /skins/user/ is theirs. This guards the three things that
   must hold for the migration to be safe:
     1. a PRE-SPLIT config (flat /skins/rs90.png) heals — geometry AND
        the image path move to skins/stock/;
     2. a user photo is never claimed, and specifically a user photo
        NAMED rs90.png under /skins/user/ is not (the exact case the
        old basename test got wrong);
     3. heal is idempotent once current.
   isStockSkinImage is shared by the healer and the Studio's skin lock,
   so this also pins the lock's behaviour. */
import { STOCK_SKINS, healStockSkins, isStockSkinImage } from "../studio-src/src/lib/stocklib.js";

const errs = [];
const ck = (name, cond) => { if (!cond) errs.push(name); };

/* --- 1. pre-split flat stock heals + repoints --- */
const cfgA = { remotes: { rs90: { skin: {
  gen: 2, image: "/local/harmonium/skins/rs90.png",
  screen: { x: 1, y: 1, w: 1, h: 1 }, buttons: [] } } } };
healStockSkins(cfgA);
const a = cfgA.remotes.rs90.skin;
ck("flat stock repointed into skins/stock/",
  a.image === "/local/harmonium/skins/stock/rs90.png");
ck("flat stock geometry healed", a.screen.w === STOCK_SKINS.rs90.screen.w);
ck("flat stock gen stamped", a.gen === STOCK_SKINS.rs90.gen);
ck("flat stock hotspots restored", a.buttons.length === STOCK_SKINS.rs90.buttons.length);

/* --- 2a. a user photo elsewhere is theirs --- */
const cfgB = { remotes: { rs90: { skin: {
  gen: 0, image: "/local/images/my-remote.png",
  screen: { x: 5, y: 5, w: 5, h: 5 }, buttons: [] } } } };
healStockSkins(cfgB);
ck("user photo untouched", cfgB.remotes.rs90.skin.image === "/local/images/my-remote.png" &&
  cfgB.remotes.rs90.skin.screen.w === 5);

/* --- 2b. THE TRAP: a user photo NAMED like the stock one, in user/ --- */
const cfgC = { remotes: { rs90: { skin: {
  gen: 0, image: "/local/harmonium/skins/user/rs90.png",
  screen: { x: 7, y: 7, w: 7, h: 7 }, buttons: [{ btn: "mine", x: 1, y: 1, w: 1, h: 1 }] } } } };
healStockSkins(cfgC);
const c = cfgC.remotes.rs90.skin;
ck("user photo named rs90.png in user/ is NOT claimed",
  c.image === "/local/harmonium/skins/user/rs90.png" && c.screen.w === 7 &&
  c.buttons.length === 1);

/* --- 3. idempotent once current --- */
const cfgD = { remotes: { rs90: { skin: JSON.parse(JSON.stringify(STOCK_SKINS.rs90)) } } };
const before = JSON.stringify(cfgD);
healStockSkins(cfgD);
ck("idempotent on a current skin", JSON.stringify(cfgD) === before);

/* --- the shared ownership test itself --- */
const S = "/local/harmonium/skins/stock/rs90.png";
ck("ownership: stock path is ours", isStockSkinImage(S, S) === true);
ck("ownership: user path is theirs",
  isStockSkinImage("/local/harmonium/skins/user/rs90.png", S) === false);
ck("ownership: pre-split flat name is ours",
  isStockSkinImage("/local/harmonium/skins/rs90.png", S) === true);
ck("ownership: unrelated photo is theirs",
  isStockSkinImage("/local/images/mine.png", S) === false);

/* every stock skin must now live under skins/stock/ */
for (const id of Object.keys(STOCK_SKINS))
  ck("STOCK_SKINS." + id + " points into skins/stock/",
    STOCK_SKINS[id].image.indexOf("/skins/stock/") >= 0);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
