/* THE STOCK/USER PATH SPLIT, config side (v0.84.6). Ownership stopped
   being a guess about bytes and became POSITIONAL — /skins/stock/ is
   ours, /skins/user/ is theirs. This guards the three things that
   must hold for the migration to be safe:
     1. a PRE-SPLIT config (flat /skins/astrion.png — a name we DID
        ship flat) heals — geometry AND the image path move to stock/;
     2. a user photo is never claimed: not one under /skins/user/
        whatever its name, and NOT a flat /skins/rs90.png — no release
        ever shipped a flat rs90.png, so every one in the wild is a
        user's own photo (v0.85.3, the case that would have eaten
        beta RS90 skins);
     3. heal is idempotent once current.
   isStockSkinImage is shared by the healer and the Studio's skin lock,
   so this also pins the lock's behaviour. */
import { STOCK_SKINS, healStockSkins, isStockSkinImage } from "../studio-src/src/lib/stocklib.js";

const errs = [];
const ck = (name, cond) => { if (!cond) errs.push(name); };

/* --- 1. pre-split flat stock heals + repoints (astrion shipped flat) --- */
const cfgA = { remotes: { astrion: { skin: {
  gen: 0, image: "/local/harmonium/skins/astrion.png",
  screen: { x: 1, y: 1, w: 1, h: 1 }, buttons: [] } } } };
healStockSkins(cfgA);
const a = cfgA.remotes.astrion.skin;
ck("flat stock repointed into skins/stock/",
  a.image === "/local/harmonium/skins/stock/astrion.png");
ck("flat stock geometry healed", a.screen.w === STOCK_SKINS.astrion.screen.w);
ck("flat stock gen stamped", a.gen === STOCK_SKINS.astrion.gen);
ck("flat stock hotspots restored", a.buttons.length === STOCK_SKINS.astrion.buttons.length);

/* --- 1b. THE RS90 TRAP: flat rs90.png is a USER photo — we never
   shipped one flat. Their image, their geometry, their hotspots stay. --- */
const cfgA2 = { remotes: { rs90: { skin: {
  image: "/local/harmonium/skins/rs90.png",
  screen: { x: 9, y: 9, w: 9, h: 9 }, buttons: [{ btn: "up", x: 1, y: 1, w: 2, h: 2 }] } } } };
healStockSkins(cfgA2);
const a2 = cfgA2.remotes.rs90.skin;
ck("flat rs90.png (user photo) NOT claimed by heal",
  a2.image === "/local/harmonium/skins/rs90.png" && a2.screen.w === 9 &&
  a2.buttons.length === 1);

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
ck("ownership: flat astrion.png (shipped flat) is ours",
  isStockSkinImage("/local/harmonium/skins/astrion.png",
    "/local/harmonium/skins/stock/astrion.png") === true);
ck("ownership: flat rs90.png (NEVER shipped flat) is theirs",
  isStockSkinImage("/local/harmonium/skins/rs90.png", S) === false);
ck("ownership: unrelated photo is theirs",
  isStockSkinImage("/local/images/mine.png", S) === false);

/* every stock skin must now live under skins/stock/ */
for (const id of Object.keys(STOCK_SKINS))
  ck("STOCK_SKINS." + id + " points into skins/stock/",
    STOCK_SKINS[id].image.indexOf("/skins/stock/") >= 0);

console.log(JSON.stringify({ ok: errs.length === 0, errs }, null, 1));
if (errs.length) process.exit(1);
