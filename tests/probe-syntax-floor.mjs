/* SYNTAX FLOOR probe (2026-08-21 — a Sanytron user's virgin Astrion
   answered device-facts with com.android.webview 61.0.3163.98: the
   STOCK Astrion webview is Chromium 61, and that is the engine's
   promised floor. This probe fails the battery if post-61 syntax or
   runtime methods sneak in — it caught a bare `catch {`, four
   .flatMap sites and an Object.fromEntries on its first run.

   Two layers:
   1. acorn parse of every engine SCRIPT at ecmaVersion 2017 +
      object rest/spread (the Chromium-61 language level, approx:
      ES2017 shipped complete; object spread shipped in 60; the
      ES2018+ additions — optional catch binding, named groups,
      lookbehind — did NOT).  acorn has no "2017.5", so we parse at
      2018 and separately reject the 2018 features 61 lacks by
      walking the AST.
   2. a source grep for runtime methods/APIs newer than 61
      (flatMap/flat 69, fromEntries/matchAll 73, globalThis 71,
      allSettled 76, replaceAll 85, .at 92, ResizeObserver 64,
      AbortController 66, structuredClone 98).

   The STUDIO is exempt (it runs in a desktop browser). */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as acorn from "acorn";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errsEarly = [];
/* the build script owns the file list — read it from there */
const be = readFileSync(join(root, "build-engine.mjs"), "utf8");
/* SCRIPTS entries are repo-root-relative bare paths ("core/x.js",
   "widgets/y.js") resolved against src/ by the build script */
const files = [...be.matchAll(/["'`]((?:core|ui|widgets)\/[^"'`]+\.js)["'`]/g)]
  .map(m => "src/" + m[1]);
const uniq = [...new Set(files)];
if (uniq.length < 40)
  errsEarly.push("suspicious: only " + uniq.length + " engine files found in build-engine.mjs — pattern drift?");

const errs = errsEarly;
const bad61 = [];   // parsed OK at 2018 but uses a 2018 feature 61 lacks

function walk(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => walk(x, fn));
    else if (v && typeof v.type === "string") walk(v, fn);
  }
}

const METHOD_RX = /\.(flatMap|flat|matchAll|replaceAll|at)\s*\(|Object\.fromEntries|globalThis|Promise\.allSettled|ResizeObserver|AbortController|structuredClone|Promise\.any\b/;

for (const f of uniq) {
  let src;
  try { src = readFileSync(join(root, f), "utf8"); }
  catch (e) { errs.push(f + ": unreadable — " + e.message); continue; }

  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 2018, sourceType: "script" });
  } catch (e) {
    errs.push(f + ": does not parse at ES2018 — " + e.message);
    continue;
  }
  walk(ast, n => {
    if (n.type === "CatchClause" && n.param === null)
      bad61.push(f + ": bare `catch {` (optional catch binding, Chromium 66+)");
    if (n.type === "Literal" && n.regex) {
      const p = n.regex.pattern;
      if (/\(\?</.test(p) && !/\(\?<[=!]/.test(p))
        bad61.push(f + ": named capture group regex (Chromium 64+): " + p);
      if (/\(\?<[=!]/.test(p))
        bad61.push(f + ": lookbehind regex (Chromium 62+): " + p);
      if (n.regex.flags.includes("s"))
        bad61.push(f + ": dotAll /s regex flag (Chromium 62+)");
    }
  });

  /* strip block/line comments before the method grep so a comment
     MENTIONING flatMap (the floor notes do) can't trip it */
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const m = stripped.match(METHOD_RX);
  if (m) bad61.push(f + ": post-61 runtime usage: " + m[0].trim());
}

/* ---- 3. THE STYLESHEETS (2026-08-25). The probe covered JS only,
   which is how `aspect-ratio` (Chrome 88) reached a Now Playing card:
   on the stock Astrion it is simply ignored, so the art fell back to
   its natural aspect and the card could not hold a fixed height. CSS
   fails SILENTLY — no error, just a wrong-looking remote — so it needs
   the same floor. Engine styles only; the Studio is exempt. */
{
  const CSS_BANNED = [
    [/aspect-ratio\s*:/, "aspect-ratio (Chrome 88)"],
    [/color-mix\s*\(/, "color-mix() (111)"],
    [/:has\s*\(/, ":has() (105)"],
    [/backdrop-filter\s*:/, "backdrop-filter (76)"],
    [/[:,(\s]clamp\s*\(/, "clamp() (79)"],
    [/[:,(\s]min\s*\(/, "css min() (79)"],
    [/[:,(\s]max\s*\(/, "css max() (79)"],
    /* \b matches after a hyphen, so --track-inset: false-positived
       (2026-09-01) — require a non-ident char before the keyword */
    [/(^|[^-\w])inset\s*:/m, "inset shorthand (87)"],
    [/:is\s*\(/, ":is() (88)"],
    /* NO `gap` RULE: grid gap ships in 57 and is used correctly all
       over these files; only FLEX gap is post-61, and the two are
       indistinguishable without resolving each rule's display context.
       A check that cries wolf on every grid is worse than no check —
       the flex-gap convention stays a documented one (chrome.css). */
  ];
  /* the build script owns the stylesheet list too */
  const cssFiles = [...be.matchAll(/["'`](styles\/[^"'`]+\.css)["'`]/g)]
    .map(m => "src/" + m[1]);
  if (![...new Set(cssFiles)].length)
    errs.push("no stylesheets found in build-engine.mjs — pattern drift?");
  for (const f of [...new Set(cssFiles)]) {
    const raw = readFileSync(join(root, f), "utf8");
    /* strip comments — the floor is documented IN comments all over
       these files, and a warning about color-mix is not a use of it */
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [re, why] of CSS_BANNED)
      if (re.test(src)) errs.push(f + ": " + why);
  }
}

const all = errs.concat(bad61);

console.log(JSON.stringify({
  files: uniq.length,
  ok: all.length === 0,
  floor: "Chromium 61 (stock Astrion webview 61.0.3163.98)",
  errs: all,
}, null, 1));
process.exit(all.length === 0 ? 0 : 1);
