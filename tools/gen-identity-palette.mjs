/* IDENTITY PALETTE GENERATOR (V2, 2026-09-02 — "Harmonium identity
   palette V2.html"). The canvas speaks oklch and the stock panel is
   Chromium 61, which cannot parse it ("why don't we just turn oklch
   into rgba" — Suresh), so the colour math runs HERE, once, and sRGB
   ships. V2 adds the BRAND TIER and the derived INK token:

   · Identity tier (8 slots) — assigned mnemonics; uniformity is the
     law. badge oklch(0.68 0.15 H), wash oklch(0.55 0.14 H). V1,
     unchanged. Reserved arcs 40°–110° (focus amber) and 170°–240°
     (gamut) apply to identity hues ONLY.
   · Brand tier (a catalogue) — recognised, not assigned; survival is
     the law. badge = the brand's own colour with L merely CLAMPED to
     0.46–0.86 and C to the gamut ceiling — a clamp, not a pin, and
     ACHROMATIC brands (C < 0.02: Sony black, Apple white, Peacock)
     ship raw, per the canvas's own specimens. wash = the identity
     formula at the brand hue (uniform weight under text and ring —
     the wash is the system, the badge is the brand). The amber
     reservation does NOT apply to a brand badge (canvas §3: Fire TV
     ships #ff9900 exactly; refusing Amazon its orange would be a
     worse product than the conflict it avoids).
   · Ink (-i) — every slot gets a third token: whichever of
     --accent-ink or white scores higher WCAG contrast against the
     badge. A measurement, never authored (canvas §4; crossover
     ≈ L 0.58; worst case YouTube 4.46:1, everything else ≥ 4.8).

   This generator WRITES IN PLACE (and still prints): the token block
   between the @identity-palette markers in src/styles/tokens.css,
   the class map between @identity-classes markers in
   src/styles/grid.css, and the slot list between @identity-slots
   markers in src/ui/tiles.js — one source of truth for all three.
   probe-identity-palette re-derives and byte-compares, so nothing
   can drift from the formula. */

import { readFileSync, writeFileSync } from "node:fs";

const SLOTS = [
  ["coral", 20], ["fern", 127], ["jade", 145], ["indigo", 272],
  ["violet", 299], ["orchid", 326], ["rose", 353], ["slate", 0],
];
const BADGE = { l: 0.68, c: 0.15 };
const WASH = { l: 0.55, c: 0.14 };

/* THE BRAND TABLE — name → source hex. The first fourteen are the
   canvas §3 tier (its table lists RESOLVED badges; shipping them as
   sources is exact because the clamp is idempotent). The rest are
   the §7 app catalogue's additions. Seven are Suresh's best reading
   pending brand-guideline confirmation (canvas §7 amber flags):
   peacock, paramount, max, fubo, espn, britbox, pbs. YouTube TV is
   NOT a slot — it references `youtube` (same brand colour by
   definition; the glyph separates them). */
const BRANDS = [
  ["firetv", "#ff9900"], ["appletv", "#ffffff"], ["googletv", "#4285f4"],
  ["samsung", "#2848c0"], ["lg", "#a50134"], ["sony", "#000000"],
  ["sonos", "#d8a158"], ["netflix", "#e50914"], ["spotify", "#1db954"],
  ["plex", "#e5a00d"], ["roku", "#7321b6"], ["shield", "#76b900"],
  ["disney", "#1541d4"], ["youtube", "#ff0001"],
  ["prime", "#00a8e1"], ["peacock", "#000000"], ["paramount", "#0064ff"],
  ["max", "#0231ec"], ["hulu", "#1de783"], ["fubo", "#fa4616"],
  ["espn", "#d2001f"], ["britbox", "#3545c0"], ["pbs", "#2b41cd"],
];
const BRAND_L_MIN = 0.46, BRAND_L_MAX = 0.86, ACHROMATIC_C = 0.02;

/* oklch → sRGB (Björn Ottosson's reference matrices) */
function oklchToSrgb(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const lin = [
    +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S,
  ];
  return lin.map((v) => {
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(g * 255)));
  });
}
const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function srgbToOklch(rgb) {
  const lin = rgb.map((v) => {
    const g = v / 255;
    return g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  });
  const L = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2];
  const M = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2];
  const S = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2];
  const l_ = Math.cbrt(L), m_ = Math.cbrt(M), s_ = Math.cbrt(S);
  const l = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/* in-gamut test + chroma ceiling at a given L/H (bisection) */
function inGamut(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const lin = [
    +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S,
  ];
  return lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}
function chromaCeiling(l, h) {
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(l, mid, h)) lo = mid; else hi = mid;
  }
  return lo;
}

/* WCAG relative luminance + contrast — the ink measurement */
function relLum(rgb) {
  const lin = rgb.map((v) => {
    const g = v / 255;
    return g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a, b) {
  const la = relLum(a), lb = relLum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* --accent-ink is read from tokens.css so the generator can never
   disagree with the theme about what "dark ink" means */
const TOKENS = "src/styles/tokens.css";
const tokensSrc = readFileSync(new URL("../" + TOKENS, import.meta.url), "utf8");
const inkMatch = tokensSrc.match(/--accent-ink:\s*(#[0-9a-fA-F]{6})/);
if (!inkMatch) throw new Error("--accent-ink not found in tokens.css");
const DARK_INK = inkMatch[1].toLowerCase();
const WHITE = "#ffffff";
function pickInk(badgeRgb) {
  return contrast(unhex(DARK_INK), badgeRgb) >= contrast(unhex(WHITE), badgeRgb)
    ? "var(--accent-ink)" : WHITE;
}

/* ---- resolve every slot to badge / wash / ink ---- */
function resolveIdentity(name, h) {
  const slate = name === "slate";
  const badge = oklchToSrgb(BADGE.l, slate ? 0 : BADGE.c, h);
  const wash = oklchToSrgb(WASH.l, slate ? 0 : WASH.c, h);
  return { badge, wash, note: `oklch(.68 ${slate ? 0 : BADGE.c} ${h})` };
}
function resolveBrand(name, srcHex) {
  const src = unhex(srcHex);
  const { l, c, h } = srgbToOklch(src);
  let badge;
  if (c < ACHROMATIC_C) {
    badge = src;               /* Sony black, Apple white — ship raw */
  } else {
    const l2 = Math.max(BRAND_L_MIN, Math.min(BRAND_L_MAX, l));
    const c2 = Math.min(c, chromaCeiling(l2, h));
    badge = oklchToSrgb(l2, c2, h);
  }
  /* the wash is THE SYSTEM: identity formula at the brand hue —
     an achromatic brand washes as slate, which is correct */
  const wash = c < ACHROMATIC_C
    ? oklchToSrgb(WASH.l, 0, 0)
    : oklchToSrgb(WASH.l, Math.min(WASH.c, chromaCeiling(WASH.l, h)), h);
  const moved = hex(badge).toLowerCase() !== srcHex.toLowerCase();
  return { badge, wash, note: `brand ${srcHex}${moved ? " clamped" : " exact"}` };
}

const rows = [];
for (const [name, h] of SLOTS) rows.push({ name, tier: "identity", ...resolveIdentity(name, h) });
for (const [name, src] of BRANDS) rows.push({ name, tier: "brand", ...resolveBrand(name, src) });

/* ---- emit the three blocks ---- */
let tokenBlock = "";
for (const r of rows) {
  const ink = pickInk(r.badge);
  tokenBlock += `    --id-${r.name}-b: ${hex(r.badge)};   /* ${r.note} */\n`;
  tokenBlock += `    --id-${r.name}-w: ${r.wash.join(", ")};\n`;
  tokenBlock += `    --id-${r.name}-i: ${ink};\n`;
}

let classBlock = "";
for (const r of rows) {
  classBlock += `  .tile.id-${r.name} { --tacc: var(--id-${r.name}-b); ` +
    `--idw: var(--id-${r.name}-w); --tink: var(--id-${r.name}-i); }\n`;
}

const slotList = rows.map((r) => `${r.name}: 1`).join(", ");
const slotsBlock = `const ID_SLOTS = { ${slotList} };\n`;

/* ---- write in place, between markers ---- */
function splice(path, beginMark, endMark, block) {
  const url = new URL("../" + path, import.meta.url);
  const src = readFileSync(url, "utf8");
  const b = src.indexOf(beginMark), e = src.indexOf(endMark);
  if (b < 0 || e < 0 || e < b) throw new Error(`markers not found in ${path}`);
  const head = src.slice(0, src.indexOf("\n", b) + 1);
  const tail = src.slice(src.lastIndexOf("\n", e) + 1);
  writeFileSync(url, head + block + tail);
  console.log(`wrote ${path}`);
}
splice(TOKENS, "@identity-palette-begin", "@identity-palette-end", tokenBlock);
splice("src/styles/grid.css", "@identity-classes-begin", "@identity-classes-end", classBlock);
splice("src/ui/tiles.js", "@identity-slots-begin", "@identity-slots-end", slotsBlock);
console.log(tokenBlock);
